import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/avatar";
import { buildEvaluatorMap, evaluatorLabel } from "@/lib/evaluator";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { POSITION_LABEL } from "@/lib/permission-constants";

/**
 * 화면 맨 위에 붙는 **본인 띠** — 사진 · 성명 · 직위 · 사번 · 소속 · 1·2차 평가자.
 *
 * 원래는 개인목표 양식의 「1. 기본사항」 표였다. 종이 양식에서는 매번 손으로
 * 채우던 여섯 칸인데, 여기 있는 값은 하나도 사람이 다시 적을 것이 아니다 —
 * 사진·소속은 인사카드와 조직도에서, 1·2차 평가자는 조직도를 따라 올라가
 * 계산한다. 그래서 표가 아니라 «읽기만 하는 띠»다.
 *
 * 이 띠가 평가2 안이 아니라 **셸**에 있는 이유: 어느 화면에 있든 «지금 누구의
 * 화면인가»가 먼저 읽혀야 한다. 목표설정에서만 보이던 시절에는 조직도나
 * 인사카드로 넘어가는 순간 사라져서, 남의 자료를 보는 중인지 내 화면인지가
 * 흐려졌다. 머리글 바로 아래에 붙이고 스크롤해도 따라오게 둔다.
 *
 * 사진은 인사카드의 것을 그대로 쓴다(`/api/employees/[id]/photo`) — 직원정보
 * 조회·조직도가 보는 사진과 같은 한 장이라, 인사팀이 사진을 바꾸면 여기도 같이
 * 바뀐다. 사진이 없으면 회사 로고 자리표가 대신 든다.
 *
 * 사진 자체(Bytes)는 무거우니 «있는지»만 센다. 실제 그림은 위 API가 내려 준다.
 */
export async function EvaluateeBanner({ userId }: { userId: string }) {
  const [teams, people, photoCount] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, division: true, businessUnit: true, leaderId: true },
    }),
    prisma.user.findMany({
      where: activePrismaWhere(),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        position: true,
        jobGrade: true,
        teamId: true,
        employeeNumber: true,
        division: true,
        businessUnit: true,
        team: { select: { name: true } },
      },
    }),
    prisma.user.count({ where: { id: userId, photo: { not: null } } }),
  ]);

  const me = people.find((p) => p.id === userId) ?? null;
  // 퇴사자·미등록 계정처럼 조직도에 없는 사람에게는 띠를 그리지 않는다. 빈 칸만
  // 남은 띠는 자리만 먹고 아무것도 알려 주지 않는다.
  if (!me) return null;

  const myTeam = teams.find((t) => t.id === me.teamId) ?? null;
  // 소속은 «사번 / 본부 / 팀» 한 줄로 읽는다. 비어 있는 값은 자리를 남기지 않는다.
  const scope = [
    me.employeeNumber,
    myTeam?.businessUnit ?? me.businessUnit,
    myTeam?.name ?? me.team?.name,
  ]
    .filter(Boolean)
    .join(" / ");

  const chain = buildEvaluatorMap(people, teams).get(userId) ?? null;

  return (
    // 셸이 데스크톱에서는 <main>만 굴리므로(md:overflow-hidden) 이 띠는 가만히
    // 있어도 화면에 남는다. 모바일은 문서 전체가 굴러서 머리글째 올라가 버리니,
    // 거기서만 sticky로 붙여 둔다.
    <section className="sticky top-0 z-20 md:static">
      <div className="flex items-center gap-3 bg-[linear-gradient(100deg,#0f3d22_0%,#17643a_45%,#2a9455_100%)] px-4 py-2.5 text-white sm:gap-4 sm:py-4 md:px-8">
        <Avatar
          userId={me.id}
          name={me.name}
          hasPhoto={photoCount > 0}
          className="h-10 w-10 border-2 border-white/85 sm:h-14 sm:w-14"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold tracking-tight sm:text-xl">
            {me.name}
            <span className="ml-2 text-xs font-semibold text-white/85 sm:text-sm">
              {POSITION_LABEL[me.position]}
            </span>
          </p>
          {scope && <p className="mt-0.5 truncate text-xs text-white/90 sm:text-sm">{scope}</p>}
          <p className="mt-0.5 truncate text-[11px] text-white/75 sm:text-xs">
            1차 평가자{" "}
            <b className="font-bold text-white">
              {chain?.first ? evaluatorLabel(chain.first) : "미지정"}
            </b>{" "}
            · 2차 평가자{" "}
            <b className="font-bold text-white">
              {chain?.second ? evaluatorLabel(chain.second) : "미지정"}
            </b>
          </p>
        </div>
      </div>
    </section>
  );
}
