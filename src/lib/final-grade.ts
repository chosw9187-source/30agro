/**
 * 최종등급 — **업무단위 안에서 몇 등이냐**로 정한다.
 *
 * 우리 회사 인사평가는 상대평가다. 「95점이면 S」 같은 점수 구간은 없고, 업무단위
 * (영업고객관리 · 재무경영관리 · 연구생산 · 제품사업) 안에서 종합점수 순위를 낸
 * 다음, 그 업무단위에 배정된 자리 수만큼 위에서부터 끊는다. 자리 수는 그 해
 * 업무단위의 **조직등급**이 정한다(`GradeQuota`).
 *
 * 그래서 이 파일에 점수 구간이 없다. 한 사람의 점수만 보고는 등급을 알 수 없고,
 * 같은 업무단위 사람들의 점수가 다 모여야 알 수 있다.
 */

/** 개인 등급 — 높은 쪽이 앞이다. 화면과 배분 계산이 이 순서를 그대로 쓴다. */
export const PERSON_GRADES = ["S", "A+", "A", "B", "C"] as const;
export type PersonGrade = (typeof PERSON_GRADES)[number];

/** 조직(업무단위) 등급. 개인과 같은 다섯 단계를 쓴다. */
export const ORG_GRADES = ["S", "A+", "A", "B", "C"] as const;
export type OrgGrade = (typeof ORG_GRADES)[number];

export function isPersonGrade(v: string): v is PersonGrade {
  return (PERSON_GRADES as readonly string[]).includes(v);
}

export function isOrgGrade(v: string): v is OrgGrade {
  return (ORG_GRADES as readonly string[]).includes(v);
}

/** 개인등급별 배분율(%). 합이 100이어야 한다. */
export type GradeRatios = Record<PersonGrade, number>;

export const EMPTY_RATIOS: GradeRatios = { S: 0, "A+": 0, A: 0, B: 0, C: 0 };

/**
 * 사내 「조직등급별 분포표」의 밑그림.
 *
 * 인사팀이 준 표의 숫자를 그대로 옮긴 것이다 — 조직등급이 낮아질수록 S 자리가
 * 줄고(40 → 20) 아래 등급 자리가 생긴다. 관리 화면에서 고칠 수 있게 두었으므로
 * 여기 값은 **첫 해의 출발점**일 뿐이다.
 *
 * A+ 칸이 0인 것은 받은 표의 가로 칸이 네 개(40/60/–/–)여서 S · A · B · C에만
 * 채웠기 때문이다. 개인등급을 다섯 단계로 쓰기로 했으니 A+ 자리의 실제 배분율은
 * 인사팀이 관리 화면에서 넣는다 — 여기서 임의로 나눠 두면 그 숫자가 근거 없이
 * 굳는다.
 */
export const DEFAULT_QUOTA_TABLE: Record<OrgGrade, GradeRatios> = {
  S: { S: 40, "A+": 0, A: 60, B: 0, C: 0 },
  "A+": { S: 35, "A+": 0, A: 60, B: 0, C: 5 },
  A: { S: 30, "A+": 0, A: 60, B: 5, C: 5 },
  B: { S: 25, "A+": 0, A: 60, B: 10, C: 5 },
  C: { S: 20, "A+": 0, A: 60, B: 10, C: 10 },
};

/** JSON 한 칸에 담긴 배분율을 읽는다. 깨져 있거나 없는 등급은 0으로 둔다. */
export function parseRatios(json: string | null | undefined): GradeRatios {
  const out: GradeRatios = { ...EMPTY_RATIOS };
  if (!json) return out;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    for (const g of PERSON_GRADES) {
      const v = Number(raw[g]);
      if (Number.isFinite(v) && v >= 0) out[g] = Math.round(v * 10) / 10;
    }
  } catch {
    // 못 읽으면 전부 0이다 — 0인 표로는 배분하지 않으므로 잘못된 등급이 나가지 않는다.
  }
  return out;
}

export function stringifyRatios(ratios: GradeRatios): string {
  return JSON.stringify(ratios);
}

export function ratioSum(ratios: GradeRatios): number {
  return Math.round(PERSON_GRADES.reduce((n, g) => n + ratios[g], 0) * 10) / 10;
}

export type GradeCandidate = {
  userId: string;
  /** 종합점수. 이 값이 없는 사람은 순위에 들어가지 않는다. */
  score: number;
};

export type GradeAssignment = {
  userId: string;
  grade: PersonGrade;
  /** 1부터. 같은 점수는 같은 순위다. */
  rank: number;
  /** 몇 명 중 몇 등인가 — 화면에 「3 / 21」로 적는다. */
  of: number;
  /**
   * 인사팀이 손으로 갈라야 하는 자리인가.
   *
   * 두 가지다. ① 동점자가 등급 경계를 넘는다 — 점수가 같은데 한 명은 S, 한 명은
   * A가 되는 자리라 표만으로는 정할 수 없다. ② 정원이 소수라 반올림으로 갈렸다
   * — 스물한 명에게 5%면 1.05자리이고, 그 0.05를 누구에게 주느냐는 표에 없다.
   */
  needsReview: boolean;
  reviewReason: string | null;
};

/**
 * 배분율을 **자리 수**로 바꾼다 — 최대잉여법.
 *
 * 배분율을 사람 수에 곱하면 정수로 떨어지지 않는다(21명 × 30% = 6.3자리).
 * 등급마다 따로 반올림하면 자리 합이 사람 수와 어긋나서, 아무 등급도 못 받는
 * 사람이 생기거나 정원이 남는다. 그래서 먼저 정수 부분만 나눠 주고, 남은 자리를
 * 소수 부분이 큰 등급 순으로 하나씩 얹는다.
 *
 * 표의 합이 100%가 아닐 때가 까다롭다. 남는 자리를 잉여 순서로 계속 나눠 주면
 * **높은 등급이 제 몫보다 커진다** — 합이 90%인 표로 21명을 나눴을 때 S가
 * 6.3자리인데 7명이 됐다. 그래서 잉여로 나눠 주는 몫은 «표가 말하는 만큼»
 * (사람 수 × 합 ÷ 100)까지로 끊고, 그래도 남는 사람은 표에 적힌 **맨 아래**
 * 등급에 얹는다. 표에 없는 몫을 위로 올려 주지 않는다.
 *
 * 관리 화면(등급·정원)과 결과지가 같은 함수를 쓴다 — 「6.3자리 → 6명」이라고
 * 적어 놓고 다른 수로 끊으면 그 안내가 거짓말이 된다.
 */
export function distributeSeats(
  headcount: number,
  ratios: GradeRatios,
): { exact: number[]; seats: number[] } {
  const exact = PERSON_GRADES.map((g) => (headcount * ratios[g]) / 100);
  const seats = exact.map((v) => Math.floor(v));
  if (headcount <= 0) return { exact, seats };

  const used = PERSON_GRADES.map((g, i) => (ratios[g] > 0 ? i : -1)).filter(
    (i) => i >= 0,
  );
  if (used.length === 0) return { exact, seats };

  // 표가 말하는 자리 수. 합이 100이면 사람 수와 같고, 100을 넘겨도 사람 수까지다.
  const allocatable = Math.min(
    headcount,
    Math.round((headcount * ratioSum(ratios)) / 100),
  );
  let left = allocatable - seats.reduce((a, b) => a + b, 0);
  const order = used
    .map((i) => ({ i, frac: exact[i] - Math.floor(exact[i]) }))
    // 소수가 큰 등급이 먼저. 같으면 높은 등급이 가져간다 — 사람에게 유리한 쪽이다.
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const r of order) {
    if (left <= 0) break;
    seats[r.i] += 1;
    left -= 1;
  }

  // 표에 적히지 않은 몫은 맨 아래 등급이 받는다.
  const surplus = headcount - seats.reduce((a, b) => a + b, 0);
  if (surplus > 0) seats[used[used.length - 1]] += surplus;

  return { exact, seats };
}

/**
 * 정원표대로 등급을 배분한다 — 순위대로 위에서부터 끊는다.
 *
 * 동점자는 같은 순위를 받는다. 같은 점수인데 등급이 갈리는 자리는 계산으로
 * 가르지 않고 `needsReview`로 표시해 인사팀에게 넘긴다 — 뒤에 있는 사람을 이름
 * 순서 같은 것으로 밀어내면, 그 사람은 자기가 왜 아래 등급인지 알 수 없다.
 */
export function assignGrades(
  candidates: GradeCandidate[],
  ratios: GradeRatios,
): GradeAssignment[] {
  const n = candidates.length;
  if (n === 0) return [];
  if (ratioSum(ratios) <= 0) return [];

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const { exact, seats } = distributeSeats(n, ratios);

  /** 반올림으로 자리 하나가 오간 등급 — 그 경계는 사람이 확인한다. */
  const roundedGrades = new Set<number>();
  exact.forEach((v, i) => {
    if (Math.abs(v - Math.round(v)) > 1e-9 && seats[i] > 0) {
      roundedGrades.add(i);
    }
  });

  const out: GradeAssignment[] = [];
  let cursor = 0;
  PERSON_GRADES.forEach((grade, gi) => {
    for (let k = 0; k < seats[gi]; k += 1) {
      const row = sorted[cursor];
      if (!row) return;
      // 동점자는 같은 순위. 1등이 둘이면 다음은 3등이다.
      const rank =
        cursor > 0 && sorted[cursor - 1].score === row.score
          ? out[cursor - 1].rank
          : cursor + 1;

      const tiedAcrossTop =
        cursor > 0 &&
        sorted[cursor - 1].score === row.score &&
        out[cursor - 1].grade !== grade;
      const tiedAcrossBottom =
        k === seats[gi] - 1 &&
        cursor + 1 < sorted.length &&
        sorted[cursor + 1].score === row.score;

      const reason = tiedAcrossTop
        ? "동점자와 등급이 갈립니다"
        : tiedAcrossBottom
          ? "바로 아래 사람과 동점입니다"
          : roundedGrades.has(gi)
            ? "정원이 소수라 반올림으로 갈렸습니다"
            : null;

      out.push({
        userId: row.userId,
        grade,
        rank,
        of: n,
        needsReview: reason !== null,
        reviewReason: reason,
      });
      cursor += 1;
    }
  });

  return out;
}

/** 이론 정원 — 관리 화면에 「6.3자리 → 6명」처럼 적어 준다. */
export function theoreticalSeats(
  headcount: number,
  ratios: GradeRatios,
): Record<PersonGrade, { exact: number; seats: number }> {
  const { exact, seats } = distributeSeats(headcount, ratios);
  const out = {} as Record<PersonGrade, { exact: number; seats: number }>;
  PERSON_GRADES.forEach((g, i) => {
    out[g] = { exact: Math.round(exact[i] * 100) / 100, seats: seats[i] };
  });
  return out;
}

/**
 * 등급 딱지 색.
 *
 * 다섯 등급에 다섯 색을 주지 않는다 — 글자(S · A+ · A · B · C)가 늘 함께
 * 있으므로 색이 «어느 등급인가»를 혼자 떠맡을 필요가 없고, 오히려 비슷한 초록
 * 두 개를 나란히 두면 S와 A+를 눈으로 가르려다 실패한다. 색은 **방향**만
 * 말한다: 위쪽은 초록, 가운데(전체의 60%가 앉는 A)는 무채색, 아래쪽은 호박색.
 *
 * 빨강은 쓰지 않는다. 이 앱에서 빨강은 «지연 · 미입력»처럼 잘못됐다는 뜻이고,
 * C는 잘못된 것이 아니라 낮은 것이다.
 */
export const PERSON_GRADE_CLASS: Record<PersonGrade, string> = {
  S: "bg-brand-green text-white",
  "A+": "border border-brand-green/30 bg-brand-green-light text-brand-green-dark",
  A: "border border-slate-300 bg-slate-100 text-slate-700",
  B: "border border-amber-300 bg-amber-100 text-amber-800",
  C: "bg-amber-500 text-white",
};
