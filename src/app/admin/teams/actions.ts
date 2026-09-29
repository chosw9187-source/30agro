"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

export async function createTeam(formData: FormData) {
  await requireRole("ADMIN");
  const name = String(formData.get("name") ?? "").trim();
  const businessUnit = String(formData.get("businessUnit") ?? "").trim();
  const division = String(formData.get("division") ?? "").trim();
  if (!name) return;

  await prisma.team.create({
    data: {
      name,
      businessUnit: businessUnit || null,
      division: division || null,
    },
  });
  revalidatePath("/admin/teams");
  revalidatePath("/platform");
  revalidatePath("/platform/org-chart");
  revalidatePath("/platform/org-chart/[teamId]", "page");
}

export async function updateTeamHierarchy(teamId: string, formData: FormData) {
  await requireRole("ADMIN");
  const businessUnit = String(formData.get("businessUnit") ?? "").trim();
  const division = String(formData.get("division") ?? "").trim();

  await prisma.team.update({
    where: { id: teamId },
    data: {
      businessUnit: businessUnit || null,
      division: division || null,
    },
  });

  /*
    **소속 인원의 인사카드도 같이 맞춘다.**

    평가 사슬과 조직도는 팀에 속한 사람의 사업단위·본부를 「팀 값 → 없으면 개인
    카드 값」 순으로 읽는다. 그래서 팀의 본부를 비워도 개인 카드에 옛 값이 남아
    있으면 그 사람만 없어진 본부에 계속 매달려, 「부문 「재무경영관리본부」의
    책임이 없다」는 알림이 사라지지 않는다 — 실제로 그랬다. 팀의 자리가 곧 그
    팀원의 자리이므로 여기서 한 번에 맞춘다.

    **책임·운영책임·사장은 건드리지 않는다.** 그 사람들의 카드 값은 «속한 곳»이
    아니라 «맡은 곳»이라(`presidesOver`), 어쩌다 팀에 소속돼 있다고 팀 값으로
    덮으면 맡은 부문이 바뀌어 엉뚱한 사람이 평가자가 된다.
  */
  await prisma.user.updateMany({
    where: { teamId, position: { in: ["STAFF", "TEAM_LEADER"] } },
    data: {
      businessUnit: businessUnit || null,
      division: division || null,
    },
  });

  revalidatePath("/admin/teams");
  revalidatePath("/platform/org-chart");
  revalidatePath("/platform/org-chart/[teamId]", "page");
}

export async function toggleTeamActive(teamId: string, active: boolean) {
  await requireRole("ADMIN");
  await prisma.team.update({ where: { id: teamId }, data: { active } });

  revalidatePath("/admin/teams");
  revalidatePath("/platform");
  revalidatePath("/platform/org-chart");
  revalidatePath("/platform/org-chart/[teamId]", "page");
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
  revalidatePath("/platform/org-chart/[teamId]", "page");
}

export async function deleteTeam(teamId: string) {
  await requireRole("ADMIN");
  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath("/admin/teams");
  revalidatePath("/platform");
  revalidatePath("/platform/org-chart");
  revalidatePath("/platform/org-chart/[teamId]", "page");
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
  revalidatePath("/platform/org-chart/[teamId]", "page");
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
  revalidatePath("/platform/org-chart/[teamId]", "page");
}
