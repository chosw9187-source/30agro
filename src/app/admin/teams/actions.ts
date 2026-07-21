"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

export async function createTeam(formData: FormData) {
  await requireRole("ADMIN");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await prisma.team.create({ data: { name } });
  revalidatePath("/admin/teams");
}

export async function setTeamLeader(teamId: string, formData: FormData) {
  await requireRole("ADMIN");
  const leaderId = String(formData.get("leaderId") ?? "");

  await prisma.team.update({
    where: { id: teamId },
    data: { leaderId: leaderId || null },
  });
  revalidatePath("/admin/teams");
}

export async function deleteTeam(teamId: string) {
  await requireRole("ADMIN");
  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath("/admin/teams");
}
