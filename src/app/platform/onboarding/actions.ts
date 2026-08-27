"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { notifyUser, notifyUsers } from "@/lib/notifications";
import {
  durationMinutes,
  formatDuration,
  formatSessionDay,
  formatSessionTimeRange,
  isActiveInstructor,
  parseKSTDateTime,
} from "@/lib/onboarding";

const ALL_ROLES = ["ADMIN", "EVALUATOR", "EMPLOYEE"] as const;
const PATH = "/platform/onboarding";
const LINK_PROGRAM = `${PATH}?tab=program`;
const LINK_FINAL = `${PATH}?tab=final`;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * 잘못된 입력은 조용히 무시하지 말고 던진다 — 폼은 ActionForm으로 감싸져
 * 있어서, 던진 메시지가 그대로 사용자에게 알림으로 보인다.
 */
function fail(message: string): never {
  throw new Error(message);
}

function parseDateOnly(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** "10월 19일 (월) 10:00 ~ 12:00" — 알림 문구에 쓰는 일시. */
function whenLabel(startAt: Date, endAt: Date) {
  return `${formatSessionDay(startAt)} ${formatSessionTimeRange(startAt, endAt)}`;
}

/** 재직 중인 임직원인지. 폼에서 고르는 값이지만 얼마든지 바꿔 보낼 수 있다. */
async function assertEmployeeExists(userId: string) {
  const found = await prisma.user.findFirst({
    where: { id: userId, ...activePrismaWhere() },
    select: { id: true },
  });
  if (!found) fail("존재하지 않는 임직원 입니다");
}

async function adminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", ...activePrismaWhere() },
    select: { id: true },
  });
  return admins.map((a) => a.id);
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

export async function updateProgram(programId: string, formData: FormData) {
  await requireRole("ADMIN");
  const name = text(formData, "name");
  if (!name) fail("프로그램명을 입력해 주세요.");

  const startDate = parseDateOnly(formData.get("startDate"));
  const endDate = parseDateOnly(formData.get("endDate"));
  if (startDate && endDate && endDate < startDate) fail("종료일이 시작일보다 빠릅니다.");

  await prisma.onboardingProgram.update({
    where: { id: programId },
    data: { name, description: text(formData, "description") || null, startDate, endDate },
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

/* ------------------------------------------------------------- 일정 편성 */

/**
 * 강사가 시간을 옮길 때 지켜야 하는 틀. 관리자가 잡아 둔 최소·최대 강의
 * 시간과 기수 기간을 벗어나면 되돌린다 — 화면에서 막는 것과 별개로 여기서도
 * 봐야 직접 요청을 걸러낼 수 있다.
 */
async function assertWithinFrame(
  session: { minMinutes: number; maxMinutes: number | null; programId: string },
  startAt: Date,
  endAt: Date
) {
  if (endAt <= startAt) fail("종료 시간이 시작 시간보다 빠르거나 같습니다.");

  const minutes = durationMinutes(startAt, endAt);
  if (minutes < session.minMinutes) {
    fail(`이 교육은 최소 ${formatDuration(session.minMinutes)} 이상이어야 합니다. (지금 ${formatDuration(minutes)})`);
  }
  if (session.maxMinutes && minutes > session.maxMinutes) {
    fail(`이 교육은 최대 ${formatDuration(session.maxMinutes)}까지만 가능합니다. (지금 ${formatDuration(minutes)})`);
  }

  const program = await prisma.onboardingProgram.findUnique({
    where: { id: session.programId },
    select: { startDate: true, endDate: true },
  });
  if (program?.startDate && startAt < program.startDate) {
    fail("기수 시작일보다 앞선 날짜에는 잡을 수 없습니다.");
  }
  if (program?.endDate) {
    // 종료일은 그 날 하루 전체를 포함해야 한다(자정 기준으로 저장되므로).
    const endOfLastDay = new Date(program.endDate.getTime() + 24 * 60 * 60 * 1000);
    if (endAt > endOfLastDay) fail("기수 종료일 이후로는 잡을 수 없습니다.");
  }
}

/** 한 강사가 같은 시간에 두 강의를 맡지 않도록. 쉬는 시간은 강사가 없다. */
async function assertNoInstructorOverlap(
  instructorId: string,
  startAt: Date,
  endAt: Date,
  exceptSessionId: string
) {
  const clash = await prisma.onboardingSession.findFirst({
    where: {
      instructorId,
      id: { not: exceptSessionId },
      // 경계가 맞닿는 경우(12:00 종료 / 12:00 시작)는 겹침이 아니다.
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { title: true, startAt: true, endAt: true },
  });
  if (clash) {
    fail(`같은 시간에 "${clash.title}" (${whenLabel(clash.startAt, clash.endAt)}) 강의가 이미 있습니다.`);
  }
}

/**
 * 관리자가 시간표 한 칸을 만든다. 강의는 담당 강사를 지정해 두면 그 강사가
 * [교육 프로그램 관리]에서 시간을 조정한다. 쉬는 시간은 조정할 사람이 없어
 * 만들자마자 확정 상태로 둔다.
 */
export async function createSession(formData: FormData) {
  const session = await requireRole("ADMIN");

  const programId = text(formData, "programId");
  const title = text(formData, "title");
  const isBreak = text(formData, "kind") === "BREAK";
  const startAt = parseKSTDateTime(formData.get("date"), formData.get("startTime"));
  const endAt = parseKSTDateTime(formData.get("date"), formData.get("endTime"));

  if (!programId) fail("기수를 먼저 선택해 주세요.");
  if (!title) fail(isBreak ? "쉬는 시간 이름을 입력해 주세요." : "과정명을 입력해 주세요.");
  if (!startAt || !endAt) fail("날짜와 시간을 올바르게 입력해 주세요.");
  if (endAt <= startAt) fail("종료 시간이 시작 시간보다 빠르거나 같습니다.");

  const minMinutes = isBreak ? 0 : positiveInt(text(formData, "minMinutes"), 30);
  const maxRaw = text(formData, "maxMinutes");
  const maxMinutes = isBreak || !maxRaw ? null : positiveInt(maxRaw, 0) || null;
  if (maxMinutes && maxMinutes < minMinutes) fail("최대 강의 시간이 최소 강의 시간보다 짧습니다.");

  const instructorId = isBreak ? null : text(formData, "instructorId") || null;
  if (instructorId && !(await isActiveInstructor(instructorId))) {
    fail("강사 명단에 없는 사람입니다. [일정 관리 · 강사 명단]에 먼저 등록해 주세요.");
  }

  const created = await prisma.onboardingSession.create({
    data: {
      programId,
      kind: isBreak ? "BREAK" : "LECTURE",
      // 쉬는 시간은 조율할 사람이 없으므로 바로 확정본에 실린다.
      status: isBreak ? "CONFIRMED" : "PLANNED",
      confirmedAt: isBreak ? new Date() : null,
      title,
      description: text(formData, "description") || null,
      location: text(formData, "location") || null,
      startAt,
      endAt,
      minMinutes,
      maxMinutes,
      instructorId,
      createdById: session.user.id,
    },
  });

  if (instructorId) {
    await notifyUser(
      instructorId,
      "ONBOARDING_BOOKING_REQUESTED",
      `[온보딩] "${created.title}" 강의가 배정되었습니다. 세부일정을 확인해 주세요.`,
      undefined,
      LINK_PROGRAM
    );
  }
  revalidatePath(PATH);
}

/** 관리자가 틀을 고친다(과정명·장소·담당 강사·최소 시간 등). */
export async function updateSession(sessionId: string, formData: FormData) {
  await requireRole("ADMIN");

  const target = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    select: { kind: true, programId: true, instructorId: true, title: true },
  });
  if (!target) fail("일정을 찾을 수 없습니다.");

  const title = text(formData, "title");
  const startAt = parseKSTDateTime(formData.get("date"), formData.get("startTime"));
  const endAt = parseKSTDateTime(formData.get("date"), formData.get("endTime"));
  if (!title) fail("과정명을 입력해 주세요.");
  if (!startAt || !endAt) fail("날짜와 시간을 올바르게 입력해 주세요.");
  if (endAt <= startAt) fail("종료 시간이 시작 시간보다 빠르거나 같습니다.");

  const isBreak = target.kind === "BREAK";
  const minMinutes = isBreak ? 0 : positiveInt(text(formData, "minMinutes"), 30);
  const maxRaw = text(formData, "maxMinutes");
  const maxMinutes = isBreak || !maxRaw ? null : positiveInt(maxRaw, 0) || null;
  if (maxMinutes && maxMinutes < minMinutes) fail("최대 강의 시간이 최소 강의 시간보다 짧습니다.");

  const instructorId = isBreak ? null : text(formData, "instructorId") || null;
  if (instructorId && !(await isActiveInstructor(instructorId))) {
    fail("강사 명단에 없는 사람입니다. [일정 관리 · 강사 명단]에 먼저 등록해 주세요.");
  }

  await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      title,
      description: text(formData, "description") || null,
      location: text(formData, "location") || null,
      startAt,
      endAt,
      minMinutes,
      maxMinutes,
      instructorId,
    },
  });

  // 새로 배정된 강사에게만 알린다 — 같은 사람에게 반복해서 보내지 않는다.
  if (instructorId && instructorId !== target.instructorId) {
    await notifyUser(
      instructorId,
      "ONBOARDING_BOOKING_REQUESTED",
      `[온보딩] "${title}" 강의가 배정되었습니다. 세부일정을 확인해 주세요.`,
      undefined,
      LINK_PROGRAM
    );
  }
  revalidatePath(PATH);
}

export async function deleteSession(sessionId: string) {
  await requireRole("ADMIN");
  await prisma.onboardingSession.delete({ where: { id: sessionId } });
  revalidatePath(PATH);
}

/* ------------------------------------------------- 강사의 세부일정 조정 */

/** 이 사람이 이 칸을 고칠 수 있는지 — 배정된 강사 본인이고 아직 확정 전. */
async function requireOwnPlannedSession(sessionId: string, userId: string) {
  const target = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
      instructorId: true,
      programId: true,
      minMinutes: true,
      maxMinutes: true,
    },
  });
  if (!target) fail("일정을 찾을 수 없습니다.");
  if (target.kind === "BREAK") fail("쉬는 시간은 관리자만 수정할 수 있습니다.");
  if (target.instructorId !== userId) fail("본인에게 배정된 강의만 수정할 수 있습니다.");
  if (target.status === "CONFIRMED") fail("이미 확정된 강의입니다. 변경이 필요하면 관리자에게 요청해 주세요.");
  return target;
}

/**
 * 강사가 세부일정(날짜·시간)과 비고를 정한다. 버튼에 따라 두 가지로 갈린다 —
 * [저장]은 적어 둔 것만 보관하고, [관리자에게 전송]은 승인 대기 상태로 올린다.
 * 날짜만 먼저 잡아 두고 의견은 나중에 붙이는 경우가 있어 둘을 나눴다.
 */
export async function saveSessionDetail(sessionId: string, formData: FormData) {
  const session = await requireRole(...ALL_ROLES);
  if (!(await isActiveInstructor(session.user.id))) fail("지정된 강사만 사용할 수 있습니다.");

  const target = await requireOwnPlannedSession(sessionId, session.user.id);

  const startAt = parseKSTDateTime(formData.get("date"), formData.get("startTime"));
  const endAt = parseKSTDateTime(formData.get("date"), formData.get("endTime"));
  if (!startAt || !endAt) fail("날짜와 시간을 올바르게 입력해 주세요.");

  await assertWithinFrame(target, startAt, endAt);
  await assertNoInstructorOverlap(session.user.id, startAt, endAt, sessionId);

  const submitting = text(formData, "intent") === "submit";

  const updated = await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      startAt,
      endAt,
      instructorNote: text(formData, "instructorNote") || null,
      ...(submitting ? { status: "SUBMITTED" as const, submittedAt: new Date() } : {}),
    },
    select: { title: true, startAt: true, endAt: true, instructorNote: true },
  });

  if (submitting) {
    await notifyUsers(
      await adminIds(),
      "ONBOARDING_BOOKING_REQUESTED",
      `[온보딩] ${session.user.name}님이 "${updated.title}" 강의 시간 선택을 확정하였습니다 — ${whenLabel(
        updated.startAt,
        updated.endAt
      )}${updated.instructorNote ? ` (${updated.instructorNote})` : ""}`,
      LINK_PROGRAM
    );
  }
  revalidatePath(PATH);
}

/* --------------------------------------------------------- 관리자 확정 */

/** 관리자가 확정한다 — 이때부터 [최종 스케줄]에 나타난다. */
export async function confirmSession(sessionId: string) {
  await requireRole("ADMIN");
  const target = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    select: { title: true, startAt: true, endAt: true, instructorId: true, programId: true, status: true },
  });
  if (!target) fail("일정을 찾을 수 없습니다.");
  if (target.status === "CONFIRMED") fail("이미 확정된 일정입니다.");

  await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });

  const trainees = await prisma.onboardingTrainee.findMany({
    where: { programId: target.programId },
    select: { userId: true },
  });
  const message = `[온보딩] "${target.title}" 일정이 확정되었습니다 — ${whenLabel(target.startAt, target.endAt)}`;
  await notifyUsers(
    [...new Set([...(target.instructorId ? [target.instructorId] : []), ...trainees.map((t) => t.userId)])],
    "ONBOARDING_SCHEDULE_CHANGED",
    message,
    LINK_FINAL
  );
  revalidatePath(PATH);
}

/** 확정을 되돌린다 — 강사가 다시 시간을 조정할 수 있는 상태로. */
export async function unconfirmSession(sessionId: string) {
  await requireRole("ADMIN");
  const target = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    select: { title: true, instructorId: true, kind: true },
  });
  if (!target) fail("일정을 찾을 수 없습니다.");
  if (target.kind === "BREAK") fail("쉬는 시간은 확정 해제 대상이 아닙니다.");

  await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: { status: "PLANNED", confirmedAt: null, submittedAt: null },
  });

  if (target.instructorId) {
    await notifyUser(
      target.instructorId,
      "ONBOARDING_BOOKING_DECIDED",
      `[온보딩] "${target.title}" 강의 확정이 해제되었습니다. 시간을 다시 조정해 주세요.`,
      undefined,
      LINK_PROGRAM
    );
  }
  revalidatePath(PATH);
}

/* ---------------------------------------------------------------- 강사 */

export async function assignInstructor(formData: FormData) {
  const session = await requireRole("ADMIN");
  const userId = text(formData, "userId");
  if (!userId) fail("직원을 선택해 주세요.");
  await assertEmployeeExists(userId);

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

export async function removeInstructor(instructorId: string) {
  await requireRole("ADMIN");
  const target = await prisma.onboardingInstructor.findUnique({
    where: { id: instructorId },
    select: { userId: true },
  });
  if (!target) fail("강사를 찾을 수 없습니다.");

  const assigned = await prisma.onboardingSession.count({ where: { instructorId: target.userId } });
  if (assigned > 0) {
    fail(`이 강사에게 배정된 강의가 ${assigned}건 있습니다. 먼저 다른 강사로 바꾸거나 일정을 지워 주세요.`);
  }

  await prisma.onboardingInstructor.delete({ where: { id: instructorId } });
  revalidatePath(PATH);
}

/* ---------------------------------------------------------------- 교육생 */

export async function addTrainee(formData: FormData) {
  const session = await requireRole("ADMIN");
  const programId = text(formData, "programId");
  const userId = text(formData, "userId");
  if (!programId) fail("기수를 먼저 선택해 주세요.");
  if (!userId) fail("직원을 선택해 주세요.");
  await assertEmployeeExists(userId);

  await prisma.onboardingTrainee.upsert({
    where: { programId_userId: { programId, userId } },
    create: { programId, userId, note: text(formData, "note") || null, addedById: session.user.id },
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
    await prisma.onboardingTrainee.createMany({
      data: matched.map((userId) => ({ programId, userId, addedById: session.user.id })),
      skipDuplicates: true,
    });
  }
  revalidatePath(PATH);

  const problems = [
    unmatched.length ? `존재하지 않는 임직원 입니다: ${unmatched.join(", ")}` : "",
    ambiguous.length ? `이름이 겹쳐 사번이 필요합니다: ${ambiguous.join(", ")}` : "",
  ].filter(Boolean);
  if (problems.length > 0) {
    // 한 명도 못 넣었으면 "0명 등록했습니다"를 앞에 붙일 이유가 없다.
    fail(matched.length > 0 ? `${matched.length}명 등록했습니다. ${problems.join(" / ")}` : problems.join(" / "));
  }
}

/**
 * 한 교육의 참석 대상을 지정한다. 아무도 체크하지 않으면 지정을 모두 지워
 * "기수 전원 대상"으로 되돌린다 — 사람마다 듣는 프로그램이 다르므로, 일부만
 * 듣는 교육에는 명단을 넣는다.
 */
export async function setSessionAudience(sessionId: string, formData: FormData) {
  await requireRole("ADMIN");

  const target = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    select: { programId: true },
  });
  if (!target) fail("일정을 찾을 수 없습니다.");

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
