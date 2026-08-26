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
 *
 * 중간 자리가 비어 있으면 건너뛰고 그 위에 붙는다 — 그런데 조직도에 부문 책임도
 * 본부 운영책임도 없으면 사장까지 올라가 버린다. 그게 조용히 벌어지면 «왜 우리
 * 팀장 평가자가 사장이지»가 되므로, 어디서 비었는지를 `note`로 함께 돌려준다.
 */
export type EvaluatorPerson = {
  id: string;
  name: string;
  position: Position;
  /** 직급. 회장 · 부회장 · 사장이 모두 Position.CEO라서, 이 값으로 갈린다. */
  jobGrade?: string | null;
  teamId?: string | null;
  division?: string | null;
  businessUnit?: string | null;
};

export type EvaluatorTeam = {
  id: string;
  name?: string | null;
  division?: string | null;
  businessUnit?: string | null;
  leaderId?: string | null;
};

/** 한 사람의 1차·2차 평가자와, 조직도에서 비어 있어 건너뛴 자리. */
export type EvaluatorResult = {
  first: EvaluatorPerson | null;
  second: EvaluatorPerson | null;
  note: string | null;
};

const clean = (v: string | null | undefined) => (v ?? "").trim() || null;

/**
 * "정팀장 팀장" — 이름만으로는 누구인지 가릴 수 없어 직책을 붙인다.
 *
 * 회장 · 부회장 · 사장은 직책이 모두 CEO라 그것만으로는 «사장»이 되어 버린다.
 * 그 자리만 직급(`jobGrade`)을 쓴다. 아래 직책들은 직급이 «과장»처럼 급수라서
 * 여기서는 쓰지 않는다 — 지금 알고 싶은 건 누가 어느 자리에서 보느냐다.
 */
export function evaluatorLabel(person: EvaluatorPerson): string {
  const role =
    person.position === "CEO"
      ? (clean(person.jobGrade) ?? POSITION_LABEL.CEO)
      : POSITION_LABEL[person.position];
  return `${person.name} ${role}`;
}

/**
 * 평가 사슬의 맨 위는 **사장**이다.
 *
 * 회장 · 부회장 · 사장은 조직도에서 모두 같은 직책(`Position.CEO`)으로 들어오고
 * 실제 자리는 직급(`jobGrade`)에 적힌다. 그래서 CEO 아무나 집으면 이름순으로
 * 먼저 오는 사람이 걸린다 — 실제로 «오동률 운영책임의 평가자»가 부회장으로
 * 나오는 일이 있었다. 평가는 사장이 하므로 회장·부회장은 사슬에서 뺀다.
 *
 * 직급이 비어 있으면 사장으로 본다 — 한 사람뿐인 조직에서 직급을 안 적어 두는
 * 경우가 있고, 그때 사슬이 통째로 끊기는 것보다 낫다.
 */
const CEO_NOT_EVALUATING = ["회장", "부회장"];

function isEvaluatingCeo(p: EvaluatorPerson): boolean {
  if (p.position !== "CEO") return false;
  const grade = clean(p.jobGrade);
  return !grade || !CEO_NOT_EVALUATING.includes(grade);
}

export function buildEvaluatorMap(
  people: EvaluatorPerson[],
  teams: EvaluatorTeam[]
): Map<string, EvaluatorResult> {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const byId = new Map(people.map((p) => [p.id, p]));

  /**
   * 그 사람이 **속한** 조직. 팀에 있으면 팀의 부문·본부를 따른다 — 개인이
   * 들고 있는 값이 팀 이동 뒤에도 남아 있을 수 있어서 팀 쪽이 더 최신이다.
   */
  const belongsTo = (p: EvaluatorPerson) => {
    const team = p.teamId ? teamById.get(p.teamId) : undefined;
    return {
      team,
      division: clean(team?.division) ?? clean(p.division),
      businessUnit: clean(team?.businessUnit) ?? clean(p.businessUnit),
    };
  };

  /**
   * 그 사람이 **맡고 있는** 조직. 책임·운영책임은 팀에 매이지 않고 부문·본부를
   * 맡으므로 본인 인사카드의 값이 먼저다 — 어쩌다 팀에 소속돼 있다고 해서
   * 맡은 조직이 그 팀의 부문으로 바뀌면 엉뚱한 사람이 평가자가 된다.
   */
  const presidesOver = (p: EvaluatorPerson) => {
    const team = p.teamId ? teamById.get(p.teamId) : undefined;
    return {
      division: clean(p.division) ?? clean(team?.division),
      businessUnit: clean(p.businessUnit) ?? clean(team?.businessUnit),
    };
  };

  // 부문마다 책임 한 명, 본부마다 운영책임 한 명. 둘 이상이면 먼저 나온 사람을
  // 쓴다 — 이름순으로 들어오므로 화면을 새로 고쳐도 같은 사람이 나온다.
  const divisionHead = new Map<string, EvaluatorPerson>();
  const unitHead = new Map<string, EvaluatorPerson>();
  let ceo: EvaluatorPerson | null = null;
  for (const p of people) {
    const { division, businessUnit } = presidesOver(p);
    if (!ceo && isEvaluatingCeo(p)) ceo = p;
    if (p.position === "SENIOR_STAFF" && division && !divisionHead.has(division)) {
      divisionHead.set(division, p);
    }
    if (p.position === "OPERATIONS_HEAD" && businessUnit && !unitHead.has(businessUnit)) {
      unitHead.set(businessUnit, p);
    }
  }

  /*
    사다리의 각 칸에는 «그 칸을 채우는 직책»이 있다. 자기가 이미 그 칸 높이거나
    그 위면 «비었다»고 세지 않는다 — 운영책임에게 «부문 책임이 없다»고 알리는
    건 틀린 말이다. 운영책임의 다음 칸은 원래 사장이다.
  */
  const RANK: Record<Position, number> = {
    STAFF: 0,
    TEAM_LEADER: 1,
    SENIOR_STAFF: 2,
    OPERATIONS_HEAD: 3,
    CEO: 4,
  };

  const step = (p: EvaluatorPerson): { person: EvaluatorPerson | null; missing: string[] } => {
    const { team, division, businessUnit } = belongsTo(p);
    const mine = RANK[p.position] ?? 0;
    const missing: string[] = [];
    const rungs: { who: EvaluatorPerson | undefined; gap: string | null; rank: number }[] = [
      // 팀장은 자기 팀의 팀장이므로 이 칸에서 걸러지고 다음 칸으로 넘어간다.
      {
        who: team?.leaderId ? byId.get(team.leaderId) : undefined,
        gap: team ? `팀 「${team.name ?? "소속 팀"}」의 팀장` : null,
        rank: RANK.TEAM_LEADER,
      },
      {
        who: division ? divisionHead.get(division) : undefined,
        gap: division ? `부문 「${division}」의 책임` : null,
        rank: RANK.SENIOR_STAFF,
      },
      {
        who: businessUnit ? unitHead.get(businessUnit) : undefined,
        gap: businessUnit ? `본부 「${businessUnit}」의 운영책임` : null,
        rank: RANK.OPERATIONS_HEAD,
      },
      { who: ceo ?? undefined, gap: null, rank: RANK.CEO },
    ];
    for (const rung of rungs) {
      if (rung.who && rung.who.id !== p.id) return { person: rung.who, missing };
      // 자기 자신이라서 넘어간 자리와, 내 층 이하의 자리는 «비었다»고 하지 않는다.
      if (!rung.who && rung.gap && mine < rung.rank) missing.push(rung.gap);
    }
    return { person: null, missing };
  };

  const map = new Map<string, EvaluatorResult>();
  for (const p of people) {
    const first = step(p);
    const second = first.person ? step(first.person) : { person: null, missing: [] };
    /*
      사장이 1차 평가자로 나왔는데 중간에 빈 자리가 있었다면, 조직도에 그 자리가
      비어 있다는 뜻이다. 화면에 그 말을 적어야 «왜 우리 팀장 평가자가 사장이지»가
      «조직도에 부문 책임이 비어 있구나»로 읽힌다.
    */
    const note =
      first.person && first.person.position === "CEO" && first.missing.length > 0
        ? `조직도에 ${first.missing.join(", ")}이(가) 없어 사장으로 올라갔습니다`
        : !first.person && p.position !== "CEO"
          ? "조직도에서 평가자를 찾지 못했습니다 (사장이 등록되어 있는지 확인해 주세요)"
          : null;
    map.set(p.id, { first: first.person, second: second.person, note });
  }
  return map;
}
