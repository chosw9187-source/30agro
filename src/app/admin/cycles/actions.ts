"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createCycle(formData: FormData) {
  await requireRole("ADMIN");
  const name = String(formData.get("name") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!name || !templateId || !startDate || !endDate) return;

  const cycle = await prisma.evaluationCycle.create({
    data: {
      name,
      templateId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
  });
  revalidatePath("/admin/cycles");
  redirect(`/admin/cycles/${cycle.id}`);
}

export async function deleteCycle(cycleId: string) {
  await requireRole("ADMIN");
  await prisma.evaluationCycle.delete({ where: { id: cycleId } });
  revalidatePath("/admin/cycles");
  redirect("/admin/cycles");
}

export async function setCycleStatus(
  cycleId: string,
  status: "DRAFT" | "OPEN" | "CLOSED"
) {
  await requireRole("ADMIN");
  await prisma.evaluationCycle.update({
    where: { id: cycleId },
    data: { status },
  });
  revalidatePath(`/admin/cycles/${cycleId}`);
}

export async function toggleResultsReleased(cycleId: string) {
  await requireRole("ADMIN");
  const current = await prisma.evaluationCycle.findUniqueOrThrow({
    where: { id: cycleId },
  });
  await prisma.evaluationCycle.update({
    where: { id: cycleId },
    data: { resultsReleased: !current.resultsReleased },
  });
  revalidatePath(`/admin/cycles/${cycleId}`);
}

export async function assignPair(cycleId: string, formData: FormData) {
  await requireRole("ADMIN");
  const evaluatorId = String(formData.get("evaluatorId") ?? "");
  const evaluateeId = String(formData.get("evaluateeId") ?? "");
  if (!evaluatorId || !evaluateeId) return;

  const exists = await prisma.evaluation.findUnique({
    where: {
      cycleId_evaluatorId_evaluateeId: { cycleId, evaluatorId, evaluateeId },
    },
  });
  if (exists) return;

  await prisma.evaluation.create({
    data: { cycleId, evaluatorId, evaluateeId },
  });
  revalidatePath(`/admin/cycles/${cycleId}`);
}

export async function unassignPair(cycleId: string, evaluationId: string) {
  await requireRole("ADMIN");
  await prisma.evaluation.delete({ where: { id: evaluationId } });
  revalidatePath(`/admin/cycles/${cycleId}`);
}

export async function assignTeam(cycleId: string, teamId: string) {
  await requireRole("ADMIN");
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { members: true },
  });
  if (!team || !team.leaderId) return;

  const evaluatorId = team.leaderId;
  const evaluateeIds = team.members
    .map((m) => m.id)
    .filter((memberId) => memberId !== evaluatorId);

  for (const evaluateeId of evaluateeIds) {
    const exists = await prisma.evaluation.findUnique({
      where: {
        cycleId_evaluatorId_evaluateeId: { cycleId, evaluatorId, evaluateeId },
      },
    });
    if (exists) continue;

    await prisma.evaluation.create({
      data: { cycleId, evaluatorId, evaluateeId },
    });
  }

  revalidatePath(`/admin/cycles/${cycleId}`);
}
