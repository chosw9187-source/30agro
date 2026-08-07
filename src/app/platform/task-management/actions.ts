"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

const ALL_ROLES = ["ADMIN", "EVALUATOR", "EMPLOYEE"] as const;
const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];
const TASK_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
type TaskPriority = (typeof TASK_PRIORITIES)[number];

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
  const priorityRaw = String(formData.get("priority") ?? "MEDIUM");
  const priority = (TASK_PRIORITIES as readonly string[]).includes(priorityRaw)
    ? (priorityRaw as TaskPriority)
    : "MEDIUM";

  await prisma.task.create({
    data: {
      title,
      description: description || null,
      dueDate: parseDate(formData.get("dueDate")),
      assigneeId: assigneeId || null,
      teamId: teamId || null,
      priority,
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

export async function updateTaskPriority(taskId: string, priority: TaskPriority) {
  await requireRole(...ALL_ROLES);
  if (!TASK_PRIORITIES.includes(priority)) return;
  await prisma.task.update({ where: { id: taskId }, data: { priority } });
  revalidatePath(PATH);
}

export async function deleteTask(taskId: string) {
  await requireRole(...ALL_ROLES);
  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath(PATH);
}

export async function addSubtask(taskId: string, formData: FormData) {
  await requireRole(...ALL_ROLES);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  await prisma.subtask.create({ data: { taskId, title } });
  revalidatePath(PATH);
}

export async function toggleSubtask(subtaskId: string) {
  await requireRole(...ALL_ROLES);
  const subtask = await prisma.subtask.findUnique({ where: { id: subtaskId }, select: { done: true } });
  if (!subtask) return;
  await prisma.subtask.update({ where: { id: subtaskId }, data: { done: !subtask.done } });
  revalidatePath(PATH);
}

export async function deleteSubtask(subtaskId: string) {
  await requireRole(...ALL_ROLES);
  await prisma.subtask.delete({ where: { id: subtaskId } });
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
