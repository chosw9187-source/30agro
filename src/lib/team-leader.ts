import { prisma } from "@/lib/prisma";

/**
 * 팀에 새 팀장을 지정한다. 기존 팀장이 있고 새 팀장과 다르면, 자동 승격됐던
 * 평가자(EVALUATOR) 권한을 되돌려 놓는다 — 안 그러면 팀장이 바뀐 뒤에도
 * 이전 팀장이 계속 평가자 권한을 들고 있게 된다.
 */
export async function reassignTeamLeader(teamId: string, newLeaderId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { leaderId: true },
  });

  if (team?.leaderId && team.leaderId !== newLeaderId) {
    await prisma.user.updateMany({
      where: { id: team.leaderId, role: "EVALUATOR" },
      data: { role: "EMPLOYEE" },
    });
  }

  await prisma.team.update({ where: { id: teamId }, data: { leaderId: newLeaderId } });
  await prisma.user.updateMany({
    where: { id: newLeaderId, role: "EMPLOYEE" },
    data: { role: "EVALUATOR" },
  });
}

/** 퇴직 처리 시, 그 사람이 팀장으로 걸려있던 팀이 있으면 팀장 지정을 해제한다. */
export async function clearLeaderIfDeparting(userId: string) {
  await prisma.team.updateMany({
    where: { leaderId: userId },
    data: { leaderId: null },
  });
}
