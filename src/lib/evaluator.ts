import { POSITION_LABEL } from "@/lib/permission-constants";
import type { Position } from "@/generated/prisma/client";

/**
 * 평가자는 조직도에서 따라 올라간다.
 *
 *   담당(팀원)  → 본인 팀의 팀장
 *   팀장        → 그 팀이 속한 부문의 책임
 *   책임        → 그 부문이 속한 본부의 운영책임
 *   운영책임    → 사장
 *   사장        → 없음
 *
 * 사람마다 따로 적어 두지 않고 **볼 때 계산한다**. 평가대상 여부와 같은
 * 이유다 — 조직도가 바뀌면(팀장 교체, 부서 이동) 평가자도 그날로 따라 바뀌어야
 * 하는데, 적어 두면 누군가 다시 눌러 주기 전까지 옛 사람이 남는다.
 *
 * 자기 자신이 나오면 한 칸 더 올라간다. 팀장은 본인이 그 팀의 팀장이므로
 * 그냥 두면 «내가 나를 평가»가 된다.
 */
export type EvaluatorPerson = {
  id: string;
  name: string;
  position: Position;
  teamId?: string | null;
  division?: string | null;
  businessUnit?: string | null;
};

export type EvaluatorTeam = {
  id: string;
  division?: string | null;
  businessUnit?: string | null;
  leaderId?: string | null;
};

/** "정팀장 팀장" — 이름만으로는 누구인지 가릴 수 없어 직책을 붙인다. */
export function evaluatorLabel(person: EvaluatorPerson): string {
  return `${person.name} ${POSITION_LABEL[person.position]}`;
}

/**
 * 사람 id → 그 사람의 평가자. 한 번 만들어 두고 여러 목표에서 꺼내 쓴다
 * (사람마다 매번 조직도를 훑으면 목록 한 장에 수백 번을 뒤진다).
 */
export function buildEvaluatorMap(
  people: EvaluatorPerson[],
  teams: EvaluatorTeam[]
): Map<string, EvaluatorPerson> {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const byId = new Map(people.map((p) => [p.id, p]));

  const orgOf = (p: EvaluatorPerson) => {
    const team = p.teamId ? teamById.get(p.teamId) : undefined;
    return {
      team,
      division: team?.division ?? p.division ?? null,
      businessUnit: team?.businessUnit ?? p.businessUnit ?? null,
    };
  };

  // 부문마다 책임 한 명, 본부마다 운영책임 한 명. 둘 이상이면 먼저 나온 사람을
  // 쓴다 — 이름순으로 들어오므로 화면을 새로 고쳐도 같은 사람이 나온다.
  const divisionHead = new Map<string, EvaluatorPerson>();
  const unitHead = new Map<string, EvaluatorPerson>();
  let ceo: EvaluatorPerson | null = null;
  for (const p of people) {
    const { division, businessUnit } = orgOf(p);
    if (p.position === "CEO" && !ceo) ceo = p;
    if (p.position === "SENIOR_STAFF" && division && !divisionHead.has(division)) {
      divisionHead.set(division, p);
    }
    if (p.position === "OPERATIONS_HEAD" && businessUnit && !unitHead.has(businessUnit)) {
      unitHead.set(businessUnit, p);
    }
  }

  const map = new Map<string, EvaluatorPerson>();
  for (const p of people) {
    const { team, division, businessUnit } = orgOf(p);
    const ladder = [
      // 팀장은 자기 팀의 팀장이므로 이 칸에서 걸러지고 다음 칸으로 넘어간다.
      team?.leaderId ? byId.get(team.leaderId) : undefined,
      division ? divisionHead.get(division) : undefined,
      businessUnit ? unitHead.get(businessUnit) : undefined,
      ceo ?? undefined,
    ];
    const found = ladder.find((c): c is EvaluatorPerson => !!c && c.id !== p.id);
    if (found) map.set(p.id, found);
  }
  return map;
}
