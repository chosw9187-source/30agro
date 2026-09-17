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
      lockedAt: true,
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

/**
 * 점수를 받을 수 있는 상태인가 — 진행중이고 **아직 마감하지 않았을 때**다.
 *
 * 마감(`lockedAt`)은 목표 쪽의 「전체 마감」과 같은 자리다. 상태를 CLOSED로
 * 닫는 것과 나눠 둔 이유는 둘이 다른 일이기 때문이다 — 마감은 «제출 기한이
 * 끝났다»라서 인사팀이 「마감 해제」로 되돌리고, 완료는 «그 해 평가가 끝났다»다.
 */
export function competencyFormOpen(form: {
  status: string;
  lockedAt?: Date | null;
}): boolean {
  return form.status === "OPEN" && !form.lockedAt;
}

/**
 * 연도판의 상태 이름 — 목표 쪽 단계와 **같은 말**을 쓴다.
 *
 * 예전에는 「작성 중 · 평가 중 · 종료」였다. 같은 고르개에 「목표설정 (진행중)」과
 * 「역량평가 (평가 중)」이 나란히 뜨면 두 가지가 서로 다른 것처럼 읽힌다 — 같은
 * 한 해의 같은 진행 상태를 가리키는 말이라 이름도 같아야 한다.
 *
 * 「마감」은 `status`가 아니라 `lockedAt`에 적힌다(목표 쪽과 같다) — 그래서 이
 * 표만으로는 나오지 않고 `competencyFormStateLabel`이 합쳐 준다.
 */
export const COMPETENCY_FORM_STATUS_LABEL: Record<string, string> = {
  DRAFT: "준비중",
  OPEN: "진행중",
  CLOSED: "완료",
};

/**
 * 고르개에 적는 역량평가 상태 — 「준비중 · 진행중 · **마감** · 완료」.
 *
 * `status`만 읽으면 「전체 마감」을 누른 뒤에도 「진행중」으로 남는다. 마감은
 * status가 아니라 `lockedAt`을 찍는 일이라서다. 목표 쪽 `cycleStateLabel`과
 * 같은 규칙으로 읽는다 — 같은 고르개에 나란히 뜨는 값이라 한쪽만 다르면
 * 「(진행중)」이 두 가지 뜻을 갖는다.
 *
 * 완료가 마감을 이긴다. 완료된 양식은 마감도 되어 있는 것이 보통이고, 그때
 * 「마감」이라고 적으면 아직 점수를 받는 중으로 읽힌다.
 */
export function competencyFormStateLabel(form: {
  status: string;
  lockedAt?: Date | null;
}): string {
  if (form.status === "CLOSED") return COMPETENCY_FORM_STATUS_LABEL.CLOSED;
  if (form.lockedAt) return "마감";
  return COMPETENCY_FORM_STATUS_LABEL[form.status] ?? form.status;
}

export const COMPETENCY_SET_KIND_LABEL: Record<string, string> = {
  CORE_STAFF: "핵심가치 · 팀원용",
  CORE_LEADER: "핵심가치 · 팀장용",
  LEADERSHIP: "리더십역량 · 팀장용",
  JOB: "직무역량",
};
