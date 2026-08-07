"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

const ALL_ROLES = ["ADMIN", "EVALUATOR", "EMPLOYEE"] as const;
const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

function parseDate(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const PATH = "/platform/task-management";

export async function createTask(formData: FormData) {
  const session = await requireRole(...ALL_ROLES);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const assigneeId = String(formData.get("assigneeId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  await prisma.task.create({
    data: {
      title,
      description: description || null,
      dueDate: parseDate(formData.get("dueDate")),
      assigneeId: assigneeId || null,
      teamId: teamId || null,
      createdById: session.user.id,
    },
  });
  revalidatePath(PATH);
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  await requireRole(...ALL_ROLES);
  if (!TASK_STATUSES.includes(status)) return;
  await prisma.task.update({ where: { id: taskId }, data: { status } });
  revalidatePath(PATH);
}

export async function deleteTask(taskId: string) {
  await requireRole(...ALL_ROLES);
  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath(PATH);
}

export async function createSopDocument(formData: FormData) {
  const session = await requireRole(...ALL_ROLES);
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title || !content) return;

  const category = String(formData.get("category") ?? "").trim();

  await prisma.sopDocument.create({
    data: {
      title,
      content,
      category: category || null,
      createdById: session.user.id,
    },
  });
  revalidatePath(PATH);
}

export async function deleteSopDocument(id: string) {
  await requireRole(...ALL_ROLES);
  await prisma.sopDocument.delete({ where: { id } });
  revalidatePath(PATH);
}

export async function createWorkLogEntry(formData: FormData) {
  const session = await requireRole(...ALL_ROLES);
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  const date = parseDate(formData.get("date")) ?? new Date();

  await prisma.workLogEntry.create({
    data: {
      userId: session.user.id,
      date,
      content,
    },
  });
  revalidatePath(PATH);
}

export async function deleteWorkLogEntry(id: string) {
  const session = await requireRole(...ALL_ROLES);
  await prisma.workLogEntry.deleteMany({ where: { id, userId: session.user.id } });
  revalidatePath(PATH);
}
