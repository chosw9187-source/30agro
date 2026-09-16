import { prisma } from "@/lib/prisma";

/**
 * 그 해의 역량평가 양식을 통째로 읽는다 — 묶음 · 문항 · 배정까지 한 번에.
 *
 * 쪼개서 읽지 않는 이유는 이 셋이 늘 같이 쓰이기 때문이다. «이 사람에게 어느
 * 문항이 뜨는가»는 배정을 보고 묶음을 골라 문항을 꺼내는 한 동작이라, 따로
 * 읽으면 화면과 저장이 서로 다른 시점의 양식을 볼 수 있다.
 *
 * 양식이 아직 없는 해에는 null이다 — 화면이 «만들어 주세요»라고 안내한다.
 */
export async function loadCompetencyForm(year: number) {
  return prisma.competencyForm.findUnique({
    where: { year },
    select: {
      id: true,
      year: true,
      status: true,
      sets: {
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          kind: true,
          name: true,
          sortOrder: true,
          items: {
            orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
            select: { id: true, key: true, area: true, question: true },
          },
        },
      },
      assignments: {
        select: { id: true, setId: true, teamId: true, userId: true },
      },
      targets: {
        select: {
          id: true,
          teamId: true,
          userId: true,
          included: true,
          reason: true,
        },
      },
    },
  });
}

export type LoadedCompetencyForm = NonNullable<
  Awaited<ReturnType<typeof loadCompetencyForm>>
>;

/**
 * 문항을 고칠 수 있는 상태인가.
 *
 * **종료된 양식만 잠근다.** 평가 중에도 고칠 수 있게 둔 것은, 질문이 바뀌면 바로
 * 고쳐야 하기 때문이다 — 잠가 두면 「작성 중으로 되돌리기」를 먼저 누르게 되고,
 * 그 한 단계 때문에 «고칠 수 없는 화면»으로 읽힌다.
 *
 * 대신 평가 중에 고치면 이미 매긴 점수와 어긋날 수 있다는 것을 화면이 알려 준다.
 * 종료한 양식은 그 해 성적의 근거라서 잠근다.
 */
export function competencyFormEditable(status: string): boolean {
  return status !== "CLOSED";
}

/** 점수를 받을 수 있는 상태인가. */
export function competencyFormOpen(status: string): boolean {
  return status === "OPEN";
}

/**
 * 연도판의 상태 이름 — 목표 쪽 단계와 **같은 말**을 쓴다.
 *
 * 예전에는 「작성 중 · 평가 중 · 종료」였다. 같은 고르개에 「목표설정 (진행중)」과
 * 「역량평가 (평가 중)」이 나란히 뜨면 두 가지가 서로 다른 것처럼 읽힌다 — 같은
 * 한 해의 같은 진행 상태를 가리키는 말이라 이름도 같아야 한다.
 *
 * 「마감」은 없다. 목표 쪽의 마감은 «목표 내용은 확정하고 진척은 계속 올린다»는
 * 중간 상태(`goalsLockedAt`)인데, 역량평가에는 그런 자리가 없다 — 문항은 종료
 * 전까지 고칠 수 있고, 종료하면 점수까지 함께 잠긴다.
 */
export const COMPETENCY_FORM_STATUS_LABEL: Record<string, string> = {
  DRAFT: "준비중",
  OPEN: "진행중",
  CLOSED: "완료",
};

export const COMPETENCY_SET_KIND_LABEL: Record<string, string> = {
  CORE_STAFF: "핵심가치 · 팀원용",
  CORE_LEADER: "핵심가치 · 팀장용",
  LEADERSHIP: "리더십역량 · 팀장용",
  JOB: "직무역량",
};
