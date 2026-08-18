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

export async function createSession(formData: FormData) {
  await requireRole("ADMIN");
  const programId = text(formData, "programId");
  const title = text(formData, "title");
  const startAt = parseKSTDateTime(formData.get("date"), formData.get("startTime"));
  const endAt = parseKSTDateTime(formData.get("date"), formData.get("endTime"));
  if (!programId || !title || !startAt || !endAt || endAt <= startAt) return;

  const required = Number(text(formData, "requiredInstructors") || "1");

  await prisma.onboardingSession.create({
    data: {
      programId,
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

export async function deleteSession(sessionId: string) {
  await requireRole("ADMIN");
  await prisma.onboardingSession.delete({ where: { id: sessionId } });
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

  const target = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    select: { id: true },
  });
  if (!target) return;

  const note = text(formData, "note") || null;

  await prisma.onboardingBooking.upsert({
    where: { sessionId_userId: { sessionId, userId: session.user.id } },
    create: { sessionId, userId: session.user.id, note },
    update: { note, status: "REQUESTED", adminNote: null },
  });
  revalidatePath(PATH);
}

/** 강사 본인이 자기 예약을 취소(삭제)한다. */
export async function cancelMyBooking(bookingId: string) {
  const session = await requireRole(...ALL_ROLES);
  await prisma.onboardingBooking.deleteMany({
    where: { id: bookingId, userId: session.user.id },
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
