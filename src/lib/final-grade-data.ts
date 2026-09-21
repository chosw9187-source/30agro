import { prisma } from "@/lib/prisma";
import { evaluatesHalfHere } from "@/lib/goals";
import { competencyAverage } from "@/lib/competency";
import { competencyScore100, overallScore } from "@/lib/competency-result";
import {
  assignGrades,
  parseRatios,
  ratioSum,
  type GradeAssignment,
  type GradeRatios,
  type PersonGrade,
} from "@/lib/final-grade";

/**
 * 등급을 매기려면 한 사람이 아니라 **업무단위 사람 전부**의 점수가 필요하다.
 *
 * 상대평가라서 그렇다 — 결과지 한 장을 그리는 데도 같은 업무단위 사람들의 점수가
 * 다 모여야 «몇 등»이 나온다. 그 모으는 일을 결과지 화면에서 하지 않고 여기에
 * 두는 이유는, 관리 화면(등급·정원)도 같은 숫자를 봐야 하기 때문이다. 두 곳에서
 * 따로 세면 결과지의 등급과 관리 화면의 등급이 다르게 나온다.
 */

export type ScorePair = {
  performance: number | null;
  competency: number | null;
  /** 운영(책임) 가산점. 없으면 0이다. */
  bonus: number;
  bonusNote: string | null;
  /** 성과 60% + 역량 40% + 가산점. 한쪽이라도 비면 null. */
  total: number | null;
};

/** 성과점수를 이루는 목표 한 줄. 결과지의 「성과평가 상세」 표가 이것을 그린다. */
export type PerfRow = {
  cycleId: string;
  ownerId: string | null;
  title: string;
  weight: number;
  firstScore: number | null;
  firstProgress: number | null;
  progress: number;
  half: string | null;
  excluded: boolean;
  excludeReason: string | null;
};

export type PerfResult = {
  /** 점수의 합. 한 칸도 안 적혀 있으면 null이다(0이 아니다). */
  score: number | null;
  /** 집계에 든 목표들 — 목표 하나당 한 줄. */
  goals: PerfRow[];
  /** 집계에서 빠진 그 반기의 목표들. 세지 않고 화면에만 적는다. */
  dropped: PerfRow[];
  weightSum: number;
  filled: number;
};

/**
 * 성과점수 — **그 해 그 사람의 개인목표 중, 성과평가(최종)이 매기는 반기의 것**을
 * 모아 1차 평가자가 매긴 점수를 더한다.
 *
 * 결과지와 HR REPORT가 **같은 이 함수**를 쓴다. 두 화면이 각자 세던 때에는 한쪽이
 * 96점, 다른 쪽이 비어 있는 일이 실제로 있었고, 어느 쪽이 맞는지 아무도 몰랐다.
 *
 * 규칙이 세 겹이다.
 *   ① 그 해 **네 단계를 한꺼번에** 읽는다. 성과평가(최종)이 앞 단계의 목표를
 *      이어받으면 자기 id로는 0건이고, 개인목표를 등록하는 자리는 성과평가(중간)
 *      하나라 목표설정에는 개인목표가 없다 — 한 사이클만 보면 0건이 된다.
 *   ② 같은 목표(담당 + 목표명)는 **한 줄만** 센다. 점수가 적힌 줄이 이기고, 둘 다
 *      적혀 있으면 뒤 단계가 이긴다(성과평가(최종)에서 매긴 것이 그 해 성적이다).
 *   ③ **그 단계가 매기는 반기만** 센다. 사내 양식이 「개인목표 평가(상반기)」와
 *      「(하반기)」 두 장이고 가중치 합이 장마다 100%라, 섞어 더하면 200%가 된다.
 */
export async function loadPerformanceScores(
  userIds: string[],
  cycleIds: string[],
  finalCycle: { name: string } | null,
  rank: (cycleId: string) => number,
): Promise<Map<string, PerfResult>> {
  const out = new Map<string, PerfResult>();
  if (userIds.length === 0 || cycleIds.length === 0) return out;

  const rows = await prisma.goal.findMany({
    where: {
      cycleId: { in: cycleIds },
      level: "INDIVIDUAL",
      ownerId: { in: userIds },
    },
    select: {
      cycleId: true,
      ownerId: true,
      title: true,
      weight: true,
      firstScore: true,
      firstProgress: true,
      progress: true,
      half: true,
      excluded: true,
      excludeReason: true,
    },
  });

  const here = (r: PerfRow) =>
    !finalCycle || evaluatesHalfHere({ half: r.half }, finalCycle);

  for (const id of userIds) {
    const mine = rows.filter((r) => r.ownerId === id && here(r));
    const best = new Map<string, PerfRow>();
    for (const row of mine) {
      if (row.excluded) continue;
      const key = row.title.trim();
      const kept = best.get(key);
      if (!kept) {
        best.set(key, row);
        continue;
      }
      const wins =
        (row.firstScore != null && kept.firstScore == null) ||
        (row.firstScore != null &&
          kept.firstScore != null &&
          rank(row.cycleId) > rank(kept.cycleId)) ||
        (row.firstScore == null &&
          kept.firstScore == null &&
          rank(row.cycleId) > rank(kept.cycleId));
      if (wins) best.set(key, row);
    }
    const goals = [...best.values()];
    const filled = goals.filter((g) => g.firstScore != null);
    out.set(id, {
      goals,
      dropped: mine.filter((r) => r.excluded),
      weightSum: Math.round(
        goals.reduce((n, g) => n + (g.weight > 0 ? g.weight : 0), 0),
      ),
      filled: filled.length,
      score:
        filled.length > 0
          ? Math.round(
              filled.reduce((n, g) => n + (g.firstScore ?? 0), 0) * 10,
            ) / 10
          : null,
    });
  }
  return out;
}

/** 그 해 운영(책임) 가산점. 줄이 없으면 0점이다. */
export async function loadBonuses(
  year: number,
  userIds: string[],
): Promise<Map<string, { points: number; note: string | null }>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.gradeBonus.findMany({
    where: { year, userId: { in: userIds } },
    select: { userId: true, points: true, note: true },
  });
  return new Map(
    rows.map((r) => [r.userId, { points: r.points, note: r.note }]),
  );
}

/**
 * 사람마다 성과 · 역량 · 종합점수.
 *
 * 성과점수는 최종평가에서 목표마다 1차 평가자가 매긴 점수의 합이고, 역량점수는
 * 자기평가·팀장평가 평균 × 20이다. 결과지의 셈과 같은 함수를 쓴다 — 두 화면이
 * 다른 숫자를 보이면 어느 쪽이 맞는지 아무도 모른다.
 *
 * 한쪽이라도 비어 있으면 종합점수는 null이고, 그런 사람은 순위에 들어가지 않는다.
 * 아직 평가가 안 끝난 사람을 0점으로 세워 두면 그 사람이 정원 한 자리를 깔고
 * 앉아 다른 사람의 등급이 밀린다.
 */
export async function loadUnitScores(
  year: number,
  userIds: string[],
  cycles: { id: string; name: string }[],
  finalCycle: { name: string } | null,
  rank: (cycleId: string) => number,
): Promise<Map<string, ScorePair>> {
  const out = new Map<string, ScorePair>();
  if (userIds.length === 0) return out;

  const [perfByUser, bonuses] = await Promise.all([
    loadPerformanceScores(
      userIds,
      cycles.map((c) => c.id),
      finalCycle,
      rank,
    ),
    loadBonuses(year, userIds),
  ]);

  const reviews = await prisma.competencyReview.findMany({
    where: { year, userId: { in: userIds } },
    select: {
      userId: true,
      competencyScores: {
        select: { itemKey: true, selfScore: true, leadScore: true },
      },
    },
  });

  const comp = new Map<string, number>();
  for (const r of reviews) {
    const avg = competencyAverage(r.competencyScores);
    // 끊지 않은 평균으로 환산한다 — 결과지와 한 점도 다르면 안 된다.
    const score = competencyScore100(avg.overallExact);
    if (score != null) comp.set(r.userId, score);
  }

  for (const id of userIds) {
    const p = perfByUser.get(id)?.score ?? null;
    const c = comp.get(id) ?? null;
    const b = bonuses.get(id);
    const base = overallScore(p, c);
    out.set(id, {
      performance: p,
      competency: c,
      bonus: b?.points ?? 0,
      bonusNote: b?.note ?? null,
      /*
        가산점은 **종합점수가 나온 뒤에** 더한다. 성과·역량 중 하나라도 비어 있으면
        종합점수는 null이고, 그때 가산점만 남겨 두면 «2점»이 순위에 들어가 평가를
        아직 안 받은 사람이 자리를 깔고 앉는다.
      */
      total:
        base == null ? null : Math.round((base + (b?.points ?? 0)) * 10) / 10,
    });
  }
  return out;
}

/**
 * 그 해 **라인별** 조직등급. 열쇠는 그 라인 운영책임의 userId다(`unitKey`).
 * 줄이 없으면 아직 등급을 배분하지 않는다.
 */
export async function loadUnitPlans(
  year: number,
): Promise<Map<string, string | null>> {
  const rows = await prisma.gradeUnitPlan.findMany({
    where: { year },
    select: { unitKey: true, orgGrade: true },
  });
  return new Map(rows.map((r) => [r.unitKey, r.orgGrade]));
}

/** 그 해 조직등급별 분포표. */
export async function loadQuotaTable(
  year: number,
): Promise<Map<string, GradeRatios>> {
  const rows = await prisma.gradeQuota.findMany({
    where: { year },
    select: { orgGrade: true, ratios: true },
  });
  return new Map(rows.map((r) => [r.orgGrade, parseRatios(r.ratios)]));
}

export type FixedGrade = {
  grade: string;
  note: string | null;
  fixedByName: string | null;
};

/** 인사팀이 직접 확정한 등급. 계산값을 덮어쓴다. */
export async function loadFixedGrades(
  year: number,
  userIds: string[],
): Promise<Map<string, FixedGrade>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.finalGrade.findMany({
    where: { year, userId: { in: userIds } },
    select: {
      userId: true,
      grade: true,
      note: true,
      fixedBy: { select: { name: true } },
    },
  });
  return new Map(
    rows.map((r) => [
      r.userId,
      { grade: r.grade, note: r.note, fixedByName: r.fixedBy?.name ?? null },
    ]),
  );
}

export type ResolvedGrade = GradeAssignment & {
  /** 인사팀이 손으로 정한 등급인가. */
  fixed: boolean;
  fixedNote: string | null;
  /** 손으로 정했을 때, 표대로였다면 나왔을 등급. 다르면 화면에 나란히 적는다. */
  computed: PersonGrade | null;
};

/**
 * 한 업무단위의 등급을 정한다 — 순위 → 정원 배분 → 인사팀 확정.
 *
 * 세 단계의 순서가 중요하다. 인사팀 확정은 **마지막**에 얹는다: 먼저 표대로
 * 계산해 두어야 «표대로였다면 A였는데 인사팀이 S로 정했다»를 화면에 적을 수 있고,
 * 그 차이가 보여야 확정에 근거를 요구할 수 있다.
 */
export function resolveUnitGrades(
  candidates: { userId: string; total: number | null }[],
  ratios: GradeRatios | null,
  fixed: Map<string, FixedGrade>,
): Map<string, ResolvedGrade> {
  const out = new Map<string, ResolvedGrade>();
  const scored = candidates.filter(
    (c): c is { userId: string; total: number } => c.total != null,
  );

  /*
    합이 100%가 아닌 표로는 등급을 매기지 않는다.

    반쯤 채운 표로도 계산은 되지만(남는 몫은 맨 아래 등급이 받는다), 그렇게 나온
    등급은 인사팀이 정한 것이 아니라 «아직 다 안 적은 표»가 정한 것이다. 관리
    화면은 그런 줄을 빨갛게 표시하면서 결과지에는 등급이 떠 있으면, 어느 쪽을
    믿어야 하는지 알 수 없다 — 두 화면이 같은 규칙을 쓰도록 여기서 막는다.
  */
  const usable = ratios && ratioSum(ratios) === 100 ? ratios : null;
  const computed = usable
    ? assignGrades(
        scored.map((c) => ({ userId: c.userId, score: c.total })),
        usable,
      )
    : [];
  const byUser = new Map(computed.map((a) => [a.userId, a]));

  // 순위는 정원과 상관없이 매긴다 — 조직등급이 아직 없어도 «몇 등»은 보여 준다.
  const sorted = [...scored].sort((a, b) => b.total - a.total);
  const rankOf = new Map<string, number>();
  sorted.forEach((row, i) => {
    rankOf.set(
      row.userId,
      i > 0 && sorted[i - 1].total === row.total
        ? (rankOf.get(sorted[i - 1].userId) ?? i + 1)
        : i + 1,
    );
  });

  for (const row of sorted) {
    const calc = byUser.get(row.userId) ?? null;
    const hand = fixed.get(row.userId);
    const rank = rankOf.get(row.userId) ?? 0;

    if (hand) {
      out.set(row.userId, {
        userId: row.userId,
        grade: hand.grade as PersonGrade,
        rank,
        of: sorted.length,
        needsReview: false,
        reviewReason: null,
        fixed: true,
        fixedNote: hand.note,
        computed: calc?.grade ?? null,
      });
      continue;
    }
    if (!calc) continue;
    out.set(row.userId, {
      ...calc,
      rank,
      of: sorted.length,
      fixed: false,
      fixedNote: null,
      computed: calc.grade,
    });
  }

  return out;
}
