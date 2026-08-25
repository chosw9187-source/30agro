"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import {
  BOOKING_STATUSES,
  formatSessionDay,
  formatSessionTimeRange,
  isActiveInstructor,
  parseKSTDateTime,
  type BookingStatus,
} from "@/lib/onboarding";
import { notifyUser, notifyUsers } from "@/lib/notifications";
import { activePrismaWhere } from "@/lib/hr-analytics";

const ALL_ROLES = ["ADMIN", "EVALUATOR", "EMPLOYEE"] as const;
const PATH = "/platform/onboarding";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * 잘못된 입력은 조용히 무시하지 말고 던진다 — 폼은 ActionForm으로 감싸져
 * 있어서, 던진 메시지가 그대로 사용자에게 알림으로 보인다. 예전처럼 그냥
 * return하면 눌러도 아무 일이 없어 버튼이 고장 난 것처럼 보였다.
 */
function fail(message: string): never {
  throw new Error(message);
}

/** 알림에서 눌렀을 때 돌아올 화면. */
const LINK_SCHEDULE = `${PATH}?tab=schedule`;
const LINK_FINAL = `${PATH}?tab=final`;

/** "10월 19일 (월) 10:00 ~ 12:00" — 알림 문구에 쓰는 일시. */
function whenLabel(startAt: Date, endAt: Date) {
  return `${formatSessionDay(startAt)} ${formatSessionTimeRange(startAt, endAt)}`;
}

/** 관리자 전원 — 강사가 신청했을 때 알릴 대상. */
async function adminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", ...activePrismaWhere() },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/**
 * 한 강사가 같은 시간에 두 강의를 맡는 것을 막는다. 확정(CONFIRMED)된 강의만
 * 본다 — 신청 단계에서는 여러 시간대에 걸쳐 두는 것이 정상이고, 그중 무엇을
 * 확정할지는 관리자가 고른다.
 *
 * `exceptSessionId`는 자기 자신을 비교 대상에서 빼기 위한 것(같은 강의를
 * 다시 확정하는 경우).
 */
async function assertNoInstructorOverlap(
  userId: string,
  startAt: Date,
  endAt: Date,
  exceptSessionId?: string
) {
  // 겹침 = 시작이 상대 종료보다 앞이고, 종료가 상대 시작보다 뒤. 경계가 맞닿는
  // 경우(앞 강의 12:00 종료 / 다음 12:00 시작)는 겹치지 않는 것으로 둔다.
  const clash = await prisma.onboardingBooking.findFirst({
    where: {
      userId,
      status: "CONFIRMED",
      session: {
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    },
    select: { session: { select: { title: true, startAt: true, endAt: true } } },
  });
  if (clash) {
    fail(
      `이미 ${whenLabel(clash.session.startAt, clash.session.endAt)}에 "${clash.session.title}" 강의가 확정되어 있어 시간이 겹칩니다.`
    );
  }
}

function parseDateOnly(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ---------------------------------------------------------------- 프로그램 */

export async function createProgram(formData: FormData) {
  const session = await requireRole("ADMIN");
  const name = text(formData, "name");
  if (!name) fail("프로그램명을 입력해 주세요.");

  const startDate = parseDateOnly(formData.get("startDate"));
  const endDate = parseDateOnly(formData.get("endDate"));
  if (startDate && endDate && endDate < startDate) fail("종료일이 시작일보다 빠릅니다.");

  await prisma.onboardingProgram.create({
    data: {
      name,
      description: text(formData, "description") || null,
      startDate,
      endDate,
      createdById: session.user.id,
    },
  });
  revalidatePath(PATH);
}

export async function toggleProgramActive(programId: string) {
  await requireRole("ADMIN");
  const program = await prisma.onboardingProgram.findUnique({
    where: { id: programId },
    select: { active: true },
  });
  if (!program) fail("프로그램을 찾을 수 없습니다.");

  await prisma.onboardingProgram.update({
    where: { id: programId },
    data: { active: !program.active },
  });
  revalidatePath(PATH);
}

export async function deleteProgram(programId: string) {
  await requireRole("ADMIN");
  await prisma.onboardingProgram.delete({ where: { id: programId } });
  revalidatePath(PATH);
}

/* -------------------------------------------------------------- 온보딩 일정 */

/**
 * 교육 일정(시간대) 등록. 관리자뿐 아니라 지정된 강사도 온보딩 일정 달력에서
 * 날짜를 눌러 직접 등록한다 — 강사가 "이 시간에 이 교육을 하겠다"고 잡는
 * 것이므로, 강사가 만든 일정에는 본인 예약(신청)을 함께 넣어 준다.
 * 관리자가 만든 일정은 빈 시간대로 남아 다른 강사가 예약할 수 있다.
 */
export async function createSession(formData: FormData) {
  const session = await requireRole(...ALL_ROLES);
  const isAdmin = session.user.role === "ADMIN";
  const asInstructor = await isActiveInstructor(session.user.id);
  if (!isAdmin && !asInstructor) fail("지정된 강사만 교육일정을 등록할 수 있습니다.");

  const programId = text(formData, "programId");
  const title = text(formData, "title");
  const startAt = parseKSTDateTime(formData.get("date"), formData.get("startTime"));
  const endAt = parseKSTDateTime(formData.get("date"), formData.get("endTime"));
  if (!programId) fail("기수를 먼저 선택해 주세요.");
  if (!title) fail("과정명을 입력해 주세요.");
  if (!startAt || !endAt) fail("날짜와 시간을 올바르게 입력해 주세요.");
  if (endAt <= startAt) fail("종료 시간이 시작 시간보다 빠르거나 같습니다.");

  // 강사가 스스로 잡는 시간대라면, 본인이 이미 확정된 강의와 겹치는지 먼저
  // 본다 — 등록과 동시에 본인 예약이 걸리므로 여기서 걸러야 한다.
  if (asInstructor) await assertNoInstructorOverlap(session.user.id, startAt, endAt);

  const required = Number(text(formData, "requiredInstructors") || "1");

  const created = await prisma.onboardingSession.create({
    data: {
      programId,
      title,
      description: text(formData, "description") || null,
      location: text(formData, "location") || null,
      startAt,
      endAt,
      requiredInstructors: Number.isFinite(required) && required > 0 ? Math.floor(required) : 1,
      createdById: session.user.id,
    },
  });

  if (asInstructor) {
    await prisma.onboardingBooking.create({
      data: {
        sessionId: created.id,
        userId: session.user.id,
        note: text(formData, "note") || null,
      },
    });
  }
  revalidatePath(PATH);
}

export async function updateSession(sessionId: string, formData: FormData) {
  await requireRole("ADMIN");
  const title = text(formData, "title");
  const startAt = parseKSTDateTime(formData.get("date"), formData.get("startTime"));
  const endAt = parseKSTDateTime(formData.get("date"), formData.get("endTime"));
  if (!title) fail("과정명을 입력해 주세요.");
  if (!startAt || !endAt) fail("날짜와 시간을 올바르게 입력해 주세요.");
  if (endAt <= startAt) fail("종료 시간이 시작 시간보다 빠르거나 같습니다.");

  const required = Number(text(formData, "requiredInstructors") || "1");

  const before = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    select: { startAt: true, endAt: true, location: true, programId: true },
  });
  if (!before) fail("일정을 찾을 수 없습니다.");

  const updated = await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      title,
      description: text(formData, "description") || null,
      location: text(formData, "location") || null,
      startAt,
      endAt,
      requiredInstructors: Number.isFinite(required) && required > 0 ? Math.floor(required) : 1,
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      location: true,
      programId: true,
      bookings: { where: { status: "CONFIRMED" }, select: { userId: true } },
    },
  });

  // 시간이나 장소가 바뀌면 이미 확정된 강사와 그 기수 교육생에게 알린다 —
  // 달력을 다시 열어보지 않으면 바뀐 줄 모른 채 옛 시간에 나타나게 된다.
  const moved =
    before.startAt.getTime() !== updated.startAt.getTime() ||
    before.endAt.getTime() !== updated.endAt.getTime() ||
    before.location !== updated.location;
  if (moved) {
    const trainees = await prisma.onboardingTrainee.findMany({
      where: { programId: updated.programId },
      select: { userId: true },
    });
    const message = `[온보딩] ${updated.title} 일정이 ${whenLabel(updated.startAt, updated.endAt)}${
      updated.location ? ` · ${updated.location}` : ""
    }(으)로 변경되었습니다.`;
    await notifyUsers(
      [...new Set([...updated.bookings.map((b) => b.userId), ...trainees.map((t) => t.userId)])],
      "ONBOARDING_SCHEDULE_CHANGED",
      message,
      LINK_FINAL
    );
  }
  revalidatePath(PATH);
}

/**
 * 일정 삭제. 관리자는 전부, 강사는 본인이 올린 일정만 — 잘못 잡은 시간대를
 * 스스로 치울 수 있어야 하되 남의 일정까지 지울 수는 없어야 한다.
 */
export async function deleteSession(sessionId: string) {
  const session = await requireRole(...ALL_ROLES);
  if (session.user.role === "ADMIN") {
    await prisma.onboardingSession.delete({ where: { id: sessionId } });
  } else {
    await prisma.onboardingSession.deleteMany({
      where: { id: sessionId, createdById: session.user.id },
    });
  }
  revalidatePath(PATH);
}

/* ---------------------------------------------------------------- 강사 지정 */

export async function assignInstructor(formData: FormData) {
  const session = await requireRole("ADMIN");
  const userId = text(formData, "userId");
  if (!userId) fail("직원을 선택해 주세요.");

  const specialty = text(formData, "specialty") || null;
  const note = text(formData, "note") || null;

  // 해제했던 강사를 다시 지정하는 경우가 있어 upsert — 재지정 시 다시 활성으로.
  await prisma.onboardingInstructor.upsert({
    where: { userId },
    create: { userId, specialty, note, assignedById: session.user.id },
    update: { specialty, note, active: true, assignedById: session.user.id },
  });
  revalidatePath(PATH);
}

export async function toggleInstructorActive(instructorId: string) {
  await requireRole("ADMIN");
  const instructor = await prisma.onboardingInstructor.findUnique({
    where: { id: instructorId },
    select: { active: true },
  });
  if (!instructor) fail("강사를 찾을 수 없습니다.");

  await prisma.onboardingInstructor.update({
    where: { id: instructorId },
    data: { active: !instructor.active },
  });
  revalidatePath(PATH);
}

export async function removeInstructor(instructorId: string) {
  await requireRole("ADMIN");
  await prisma.onboardingInstructor.delete({ where: { id: instructorId } });
  revalidatePath(PATH);
}

/* ------------------------------------------------------------------ 예약 */

/**
 * 강사 본인이 세션에 예약을 넣는다. 지정된 강사만 가능하며, 이미 확정된
 * 세션이라도 신청 자체는 막지 않는다 — 정원이 찼는지는 화면에 표시하고,
 * 최종 확정은 관리자가 조율해서 결정한다.
 */
export async function bookSession(sessionId: string, formData: FormData) {
  const session = await requireRole(...ALL_ROLES);
  if (!(await isActiveInstructor(session.user.id))) fail("지정된 강사만 예약할 수 있습니다.");

  // 이미 끝난 시간대에는 예약을 받지 않는다 — 화면에서 버튼을 감추는 것과
  // 별개로 여기서도 막아야 직접 요청을 걸러낼 수 있다.
  const target = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    select: {
      title: true,
      startAt: true,
      endAt: true,
      requiredInstructors: true,
      bookings: { where: { status: "CONFIRMED" }, select: { userId: true } },
    },
  });
  if (!target) fail("일정을 찾을 수 없습니다.");
  if (target.endAt <= new Date()) fail("이미 끝난 교육에는 예약할 수 없습니다.");

  // 정원이 이미 확정으로 다 찼으면 더 받지 않는다. 화면에도 "강사 확정"으로
  // 뜨는 상태라, 신청을 받아 두면 강사는 기다리다 헛수고를 하게 된다.
  const alreadyMine = target.bookings.some((b) => b.userId === session.user.id);
  if (!alreadyMine && target.bookings.length >= target.requiredInstructors) {
    fail(`이 교육은 필요한 강사 ${target.requiredInstructors}명이 이미 확정되었습니다.`);
  }

  await assertNoInstructorOverlap(session.user.id, target.startAt, target.endAt, sessionId);

  const note = text(formData, "note") || null;

  await prisma.onboardingBooking.upsert({
    where: { sessionId_userId: { sessionId, userId: session.user.id } },
    create: { sessionId, userId: session.user.id, note },
    update: { note, status: "REQUESTED", adminNote: null },
  });

  await notifyUsers(
    await adminIds(),
    "ONBOARDING_BOOKING_REQUESTED",
    `[온보딩] ${session.user.name}님이 ${whenLabel(target.startAt, target.endAt)} "${target.title}" 강의를 신청했습니다.`,
    LINK_SCHEDULE
  );
  revalidatePath(PATH);
}

/**
 * 강사 본인이 자기 예약을 취소(삭제)한다. 이미 진행된 강의는 누가 했는지가
 * 기록으로 남아야 하므로 본인 취소는 시작 전까지만 — 그 뒤로는 관리자만
 * (deleteBooking으로) 지울 수 있다.
 */
export async function cancelMyBooking(bookingId: string) {
  const session = await requireRole(...ALL_ROLES);
  const { count } = await prisma.onboardingBooking.deleteMany({
    where: {
      id: bookingId,
      userId: session.user.id,
      session: { endAt: { gt: new Date() } },
    },
  });
  if (count === 0) fail("이미 끝난 강의는 취소할 수 없습니다. 관리자에게 문의해 주세요.");
  revalidatePath(PATH);
}

/** 관리자가 신청을 확정/반려 처리한다. */
export async function setBookingStatus(bookingId: string, status: BookingStatus, formData?: FormData) {
  await requireRole("ADMIN");
  if (!BOOKING_STATUSES.includes(status)) fail("알 수 없는 상태입니다.");

  const booking = await prisma.onboardingBooking.findUnique({
    where: { id: bookingId },
    select: {
      userId: true,
      session: {
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          requiredInstructors: true,
          bookings: { where: { status: "CONFIRMED" }, select: { id: true, userId: true } },
        },
      },
    },
  });
  if (!booking) fail("예약을 찾을 수 없습니다.");

  const { session: target } = booking;
  if (status === "CONFIRMED") {
    const others = target.bookings.filter((b) => b.id !== bookingId);
    if (others.length >= target.requiredInstructors) {
      fail(`이미 필요한 강사 ${target.requiredInstructors}명이 확정되어 있습니다. 필요 강사 수를 늘리거나 기존 확정을 먼저 해제해 주세요.`);
    }
    // 확정하는 순간 그 강사의 다른 확정 강의와 겹치면 안 된다.
    await assertNoInstructorOverlap(booking.userId, target.startAt, target.endAt, target.id);
  }

  const adminNote = formData ? text(formData, "adminNote") : "";

  await prisma.onboardingBooking.update({
    where: { id: bookingId },
    data: { status, ...(formData ? { adminNote: adminNote || null } : {}) },
  });

  const label = status === "CONFIRMED" ? "확정" : status === "DECLINED" ? "반려" : "신청";
  await notifyUser(
    booking.userId,
    "ONBOARDING_BOOKING_DECIDED",
    `[온보딩] ${whenLabel(target.startAt, target.endAt)} "${target.title}" 강의가 ${label}되었습니다.${
      adminNote ? ` (${adminNote})` : ""
    }`,
    undefined,
    `${PATH}?tab=my`
  );
  revalidatePath(PATH);
}

export async function deleteBooking(bookingId: string) {
  await requireRole("ADMIN");
  await prisma.onboardingBooking.delete({ where: { id: bookingId } });
  revalidatePath(PATH);
}

/* ---------------------------------------------------------------- 교육생 */

/**
 * 기수에 교육생을 등록한다. 같은 사람을 두 번 넣어도 명단이 중복되지 않도록
 * (programId, userId) 유니크에 기대어 조용히 넘긴다 — 명단을 여러 명이
 * 나눠 입력하는 상황에서 중복 등록이 에러로 튀면 오히려 성가시다.
 */
export async function addTrainee(formData: FormData) {
  const session = await requireRole("ADMIN");
  const programId = text(formData, "programId");
  const userId = text(formData, "userId");
  if (!programId) fail("기수를 먼저 선택해 주세요.");
  if (!userId) fail("직원을 선택해 주세요.");

  await prisma.onboardingTrainee.upsert({
    where: { programId_userId: { programId, userId } },
    create: {
      programId,
      userId,
      note: text(formData, "note") || null,
      addedById: session.user.id,
    },
    update: { note: text(formData, "note") || null },
  });
  revalidatePath(PATH);
}

export async function removeTrainee(traineeId: string) {
  await requireRole("ADMIN");
  await prisma.onboardingTrainee.delete({ where: { id: traineeId } });
  revalidatePath(PATH);
}

/**
 * 사번이나 이름을 여러 줄(또는 쉼표로) 붙여넣어 교육생을 한 번에 등록한다.
 * 신입 20명을 한 명씩 검색해 넣는 건 현실적이지 않다.
 *
 * 찾지 못했거나 이름이 겹쳐 특정할 수 없는 줄은 그대로 돌려준다 — 조용히
 * 빼먹으면 명단이 비는데도 아무도 모른 채 넘어간다.
 */
export async function addTraineesBulk(formData: FormData) {
  const session = await requireRole("ADMIN");
  const programId = text(formData, "programId");
  if (!programId) fail("기수를 먼저 선택해 주세요.");

  const tokens = [
    ...new Set(
      text(formData, "entries")
        .split(/[\n,\t;]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    ),
  ];
  if (tokens.length === 0) fail("사번이나 이름을 한 줄에 하나씩 붙여넣어 주세요.");

  const candidates = await prisma.user.findMany({
    where: { ...activePrismaWhere(), OR: [{ employeeNumber: { in: tokens } }, { name: { in: tokens } }] },
    select: { id: true, name: true, employeeNumber: true },
  });

  const matched: string[] = [];
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  for (const token of tokens) {
    const byNumber = candidates.filter((c) => c.employeeNumber === token);
    const hits = byNumber.length > 0 ? byNumber : candidates.filter((c) => c.name === token);
    if (hits.length === 0) unmatched.push(token);
    else if (hits.length > 1) ambiguous.push(token);
    else matched.push(hits[0].id);
  }

  if (matched.length > 0) {
    // 이미 명단에 있는 사람은 건너뛴다 — 명단을 나눠 붙여넣다 보면 겹친다.
    await prisma.onboardingTrainee.createMany({
      data: matched.map((userId) => ({ programId, userId, addedById: session.user.id })),
      skipDuplicates: true,
    });
  }
  revalidatePath(PATH);

  const problems = [
    unmatched.length ? `찾을 수 없음: ${unmatched.join(", ")}` : "",
    ambiguous.length ? `이름이 겹쳐 사번이 필요함: ${ambiguous.join(", ")}` : "",
  ].filter(Boolean);
  if (problems.length > 0) {
    fail(`${matched.length}명 등록했습니다. ${problems.join(" / ")}`);
  }
}

/**
 * 한 교육의 참석 대상을 지정한다. 아무도 체크하지 않으면 지정을 모두 지워
 * "기수 전원 대상"으로 되돌린다 — 전원 대상이 기본값이므로 별도의 플래그를
 * 두지 않고 명단이 비었는지로 구분한다.
 *
 * 넘어온 교육생이 정말 이 교육이 속한 기수의 명단인지 다시 확인한다. 폼은
 * 관리자만 보지만, 값 자체는 얼마든지 바꿔 보낼 수 있기 때문.
 */
export async function setSessionAudience(sessionId: string, formData: FormData) {
  await requireRole("ADMIN");

  const target = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    select: { programId: true },
  });
  if (!target) return;

  const requested = formData.getAll("traineeIds").map((v) => String(v));
  const valid = requested.length
    ? await prisma.onboardingTrainee.findMany({
        where: { id: { in: requested }, programId: target.programId },
        select: { id: true },
      })
    : [];

  await prisma.$transaction([
    prisma.onboardingSessionAttendee.deleteMany({ where: { sessionId } }),
    ...(valid.length
      ? [
          prisma.onboardingSessionAttendee.createMany({
            data: valid.map((t) => ({ sessionId, traineeId: t.id })),
          }),
        ]
      : []),
  ]);
  revalidatePath(PATH);
}
