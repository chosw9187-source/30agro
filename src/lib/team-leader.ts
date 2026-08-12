import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * 팀에 새 팀장을 지정한다. 기존 팀장이 있고 새 팀장과 다르면, 자동 승격됐던
 * 평가자(EVALUATOR) 권한을 되돌려 놓는다 — 안 그러면 팀장이 바뀐 뒤에도
 * 이전 팀장이 계속 평가자 권한을 들고 있게 된다.
 *
 * db로 트랜잭션 클라이언트를 넘기면 그 트랜잭션 안에서만 실행된다 —
 * ERP 반영의 "테스트 반영(실제 저장 안 함)" 모드가 끝에서 롤백해도
 * 이 함수가 만든 변경이 트랜잭션 밖으로 새어나가지 않도록 하기 위함.
 */
export async function reassignTeamLeader(db: Db, teamId: string, newLeaderId: string) {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { leaderId: true },
  });

  if (team?.leaderId && team.leaderId !== newLeaderId) {
    await db.user.updateMany({
      where: { id: team.leaderId, role: "EVALUATOR" },
      data: { role: "EMPLOYEE" },
    });
  }

  await db.team.update({ where: { id: teamId }, data: { leaderId: newLeaderId } });
  await db.user.updateMany({
    where: { id: newLeaderId, role: "EMPLOYEE" },
    data: { role: "EVALUATOR" },
  });
}

/** 퇴직 처리 시, 그 사람이 팀장으로 걸려있던 팀이 있으면 팀장 지정을 해제한다. */
export async function clearLeaderIfDeparting(db: Db, userId: string) {
  await db.team.updateMany({
    where: { leaderId: userId },
    data: { leaderId: null },
  });
}
