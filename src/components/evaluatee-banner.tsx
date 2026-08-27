import Link from "next/link";
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
    // 셸이 데스크톱에서는 <main>만 굴리므로(md:overflow-hidden) 이 띠는 가만히
    // 있어도 화면에 남는다. 모바일은 문서 전체가 굴러서 머리글째 올라가 버리니,
    // 거기서만 sticky로 붙여 둔다. 서랍 메뉴(z-40)보다는 아래여야 메뉴를 열었을 때
    // 띠가 그 위로 삐져나오지 않는다.
    <section className="sticky top-0 z-20 shrink-0 md:static">
      {/*
        크기를 rem이 아니라 px로 못 박는다. 이 앱은 화면 폭에 따라 기준 글자
        크기를 16 → 21.3px로 키우는데, 띠까지 같이 커지면 PC에서 화면 위쪽
        140px을 먹어 왼쪽 메뉴의 «로그아웃»이 아래로 밀려난다. 늘 떠 있는
        자리라서 크기는 한 벌로 고정한다.
      */}
      <div className="flex items-center gap-2.5 bg-[linear-gradient(100deg,#0f3d22_0%,#17643a_45%,#2a9455_100%)] px-3 py-2 text-white sm:gap-3.5 sm:px-6">
        {/*
          띠가 이 화면의 머리글 노릇까지 한다 — 위에 있던 흰 로고 줄은 접었다.
          그 줄에 있던 두 가지를 여기로 옮긴다: 왼쪽의 서랍 메뉴 단추(휴대폰
          전용)와 오른쪽의 「관리자에게 문의하기」.
        */}
        <label
          htmlFor="mobile-nav-toggle"
          aria-label="메뉴 열기"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border border-white/45 text-base text-white md:hidden"
        >
          ☰
        </label>
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
            <p className="mt-[3px] truncate text-[11px] leading-tight text-white/90 sm:text-[12.5px]">
              {scope}
            </p>
          )}
          {/*
            평가자 줄만 좁은 화면에서 두 줄로 접힌다. 한 줄로 우겨넣으면 «2차
            평가자»가 말줄임에 먹혀서, 정작 알아야 할 이름이 사라진다.
          */}
          <p className="mt-[3px] text-[10.5px] leading-snug break-keep text-white/75 sm:truncate sm:text-[11.5px]">
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
        <Link
          href="/platform/support"
          className="shrink-0 rounded border border-white/45 px-2.5 py-1.5 text-[11px] whitespace-nowrap text-white hover:bg-white/15 sm:px-3 sm:text-[12.5px]"
        >
          <span className="hidden sm:inline">관리자에게 문의하기</span>
          <span className="sm:hidden">문의</span>
        </Link>
      </div>
    </section>
  );
}
