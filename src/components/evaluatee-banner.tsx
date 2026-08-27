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
 * 자리는 로고 줄 바로 아래, 본문보다는 위다 — 넓은 화면이든 손에 쥔 화면이든
 * 같다. 스크롤해도 따라 올라오지 않게 위에 붙여 둔다. 페이지가 아니라 셸에 두는
 * 이유는 그 자리 때문이다 — 페이지 안에서는 로고 줄 밑에 붙을 수가 없다.
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
      select: {
        id: true,
        name: true,
        division: true,
        businessUnit: true,
        leaderId: true,
      },
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
    // 셸은 <main>만 굴리므로(overflow-hidden) 이 띠는 가만히 있어도 화면에
    // 남는다 — 따로 붙여 둘 것이 없다.
    <section className="shrink-0">
      {/*
        크기를 rem이 아니라 px로 못 박는다. 이 앱은 화면 폭에 따라 기준 글자
        크기를 16 → 21.3px로 키우는데, 띠까지 같이 커지면 PC에서 화면 위쪽
        140px을 먹어 왼쪽 메뉴의 «로그아웃»이 아래로 밀려난다. 늘 떠 있는
        자리라서 크기는 한 벌로 고정한다.

        위아래 여백은 py-2에서 키웠다 — 세 줄이 위아래로 눌려 답답해 보였다.
        그래도 PC 96px로, 위에서 말한 140px 한계 안에 둔다.
      */}
      <div className="flex items-center gap-2.5 bg-[linear-gradient(100deg,#0f3d22_0%,#17643a_45%,#2a9455_100%)] px-3 py-3.5 text-white sm:gap-3.5 sm:px-6 sm:py-4">
        <Avatar
          userId={me.id}
          name={me.name}
          hasPhoto={photoCount > 0}
          className="h-[40px] w-[40px] border-2 border-white/85 sm:h-[52px] sm:w-[52px]"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-tight font-bold tracking-tight sm:text-[18px]">
            {me.name}
            <span className="ml-2 text-[11px] font-semibold text-white/85 sm:text-[12.5px]">
              {POSITION_LABEL[me.position]}
            </span>
          </p>
          {scope && (
            <p className="mt-[5px] truncate text-[11px] leading-tight text-white/90 sm:text-[12.5px]">
              {scope}
            </p>
          )}
          {/*
            평가자 줄만 좁은 화면에서 두 줄로 접힌다. 한 줄로 우겨넣으면 «2차
            평가자»가 말줄임에 먹혀서, 정작 알아야 할 이름이 사라진다.
          */}
          <p className="mt-[5px] text-[10.5px] leading-snug break-keep text-white/75 sm:truncate sm:text-[11.5px]">
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
