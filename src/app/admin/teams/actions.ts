"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

export async function createTeam(formData: FormData) {
  await requireRole("ADMIN");
  const name = String(formData.get("name") ?? "").trim();
  const division = String(formData.get("division") ?? "").trim();
  if (!name) return;

  await prisma.team.create({ data: { name, division: division || null } });
  revalidatePath("/admin/teams");
  revalidatePath("/platform");
  revalidatePath("/platform/org-chart");
}

export async function updateTeamDivision(teamId: string, formData: FormData) {
  await requireRole("ADMIN");
  const division = String(formData.get("division") ?? "").trim();

  await prisma.team.update({
    where: { id: teamId },
    data: { division: division || null },
  });

  revalidatePath("/admin/teams");
  revalidatePath("/platform/org-chart");
}

export async function setTeamLeader(teamId: string, formData: FormData) {
  await requireRole("ADMIN");
  const leaderId = String(formData.get("leaderId") ?? "");

  await prisma.team.update({
    where: { id: teamId },
    data: { leaderId: leaderId || null },
  });

  if (leaderId) {
    await prisma.user.updateMany({
      where: { id: leaderId, role: "EMPLOYEE" },
      data: { role: "EVALUATOR" },
    });
  }

  revalidatePath("/admin/teams");
  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/org-chart");
}

export async function deleteTeam(teamId: string) {
  await requireRole("ADMIN");
  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath("/admin/teams");
  revalidatePath("/platform");
  revalidatePath("/platform/org-chart");
}

export async function addTeamMember(teamId: string, formData: FormData) {
  await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: { teamId },
  });

  revalidatePath("/admin/teams");
  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/org-chart");
}

export async function removeTeamMember(teamId: string, userId: string) {
  await requireRole("ADMIN");
  await prisma.user.updateMany({
    where: { id: userId, teamId },
    data: { teamId: null },
  });

  revalidatePath("/admin/teams");
  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/org-chart");
}
