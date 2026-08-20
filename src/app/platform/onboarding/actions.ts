"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { BOOKING_STATUSES, isActiveInstructor, parseKSTDateTime, type BookingStatus } from "@/lib/onboarding";

const ALL_ROLES = ["ADMIN", "EVALUATOR", "EMPLOYEE"] as const;
const PATH = "/platform/onboarding";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
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
  if (!name) return;

  await prisma.onboardingProgram.create({
    data: {
      name,
      description: text(formData, "description") || null,
      startDate: parseDateOnly(formData.get("startDate")),
      endDate: parseDateOnly(formData.get("endDate")),
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
  if (!program) return;

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
  if (!isAdmin && !asInstructor) return;

  const programId = text(formData, "programId");
  const title = text(formData, "title");
  const startAt = parseKSTDateTime(formData.get("date"), formData.get("startTime"));
  const endAt = parseKSTDateTime(formData.get("date"), formData.get("endTime"));
  if (!programId || !title || !startAt || !endAt || endAt <= startAt) return;

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
  if (!title || !startAt || !endAt || endAt <= startAt) return;

  const required = Number(text(formData, "requiredInstructors") || "1");

  await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      title,
      description: text(formData, "description") || null,
      location: text(formData, "location") || null,
      startAt,
      endAt,
      requiredInstructors: Number.isFinite(required) && required > 0 ? Math.floor(required) : 1,
    },
  });
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
  if (!userId) return;

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
  if (!instructor) return;

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
  if (!(await isActiveInstructor(session.user.id))) return;

  // 이미 끝난 시간대에는 예약을 받지 않는다 — 화면에서 버튼을 감추는 것과
  // 별개로 여기서도 막아야 직접 요청을 걸러낼 수 있다.
  const target = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    select: { endAt: true },
  });
  if (!target || target.endAt <= new Date()) return;

  const note = text(formData, "note") || null;

  await prisma.onboardingBooking.upsert({
    where: { sessionId_userId: { sessionId, userId: session.user.id } },
    create: { sessionId, userId: session.user.id, note },
    update: { note, status: "REQUESTED", adminNote: null },
  });
  revalidatePath(PATH);
}

/**
 * 강사 본인이 자기 예약을 취소(삭제)한다. 이미 진행된 강의는 누가 했는지가
 * 기록으로 남아야 하므로 본인 취소는 시작 전까지만 — 그 뒤로는 관리자만
 * (deleteBooking으로) 지울 수 있다.
 */
export async function cancelMyBooking(bookingId: string) {
  const session = await requireRole(...ALL_ROLES);
  await prisma.onboardingBooking.deleteMany({
    where: {
      id: bookingId,
      userId: session.user.id,
      session: { endAt: { gt: new Date() } },
    },
  });
  revalidatePath(PATH);
}

/** 관리자가 신청을 확정/반려 처리한다. */
export async function setBookingStatus(bookingId: string, status: BookingStatus, formData?: FormData) {
  await requireRole("ADMIN");
  if (!BOOKING_STATUSES.includes(status)) return;

  const adminNote = formData ? text(formData, "adminNote") : "";

  await prisma.onboardingBooking.update({
    where: { id: bookingId },
    data: { status, ...(formData ? { adminNote: adminNote || null } : {}) },
  });
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
  if (!programId || !userId) return;

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
