/**
 * 역량평가 양식 — 사내 「20XX년 한국삼공 역량평가 양식」을 그대로 옮긴 것.
 *
 * 문항을 DB가 아니라 코드에 둔다. 이 양식은 인사팀이 정해서 내려주는 것이고,
 * 사람이 화면에서 문항을 만들거나 지우는 자리가 아니다. DB에 넣으면 관리 화면과
 * 권한을 한 벌 더 만들어야 하는데, 정작 고칠 일은 «해마다 인사팀이 파일을 새로
 * 준다» 한 가지뿐이다. 그때는 이 파일을 고친다.
 *
 * 대신 점수는 문항 **키**로 저장한다(`CompetencyScore.itemKey`). 질문 문장을
 * 열쇠로 쓰면 쉼표 하나 다듬는 순간 지난해 점수가 떨어져 나간다.
 */

/** 1~5 정수. 소수점은 받지 않는다 — 양식의 규칙이다. */
export const COMPETENCY_MIN = 1;
export const COMPETENCY_MAX = 5;

export type CompetencyScaleRow = {
  score: number;
  /** 「탁월」처럼 점수 옆에 붙는 이름. */
  label: string;
  /** 인사팀이 참고용으로 적어 둔 점수 환산 구간. 화면에서도 «참고용»으로 적는다. */
  points: string;
  definition: string;
};

/** 평가스케일 정의. 높은 점수가 위로 오게 둔다 — 양식과 같은 순서다. */
export const COMPETENCY_SCALE: CompetencyScaleRow[] = [
  {
    score: 5,
    label: "탁월",
    points: "110점 이상",
    definition:
      "매우 우수해 타인을 지도하는 수준으로 관련 행동이 익숙하게 항상 나타남",
  },
  {
    score: 4,
    label: "우수",
    points: "100 ~ 110점 미만",
    definition:
      "상당히 숙련되고 광범위하게 응용하며, 관련행동이 일관적으로 나타남",
  },
  {
    score: 3,
    label: "보통",
    points: "90 ~ 100점 미만",
    definition: "업무에 적용해 활용하며, 관련행동이 평소에 자주 나타남",
  },
  {
    score: 2,
    label: "미흡",
    points: "80 ~ 90점 미만",
    definition:
      "업무에 제한적으로 적용하며, 관련 행동이 나타나지만 일관적이지 않음",
  },
  {
    score: 1,
    label: "부족",
    points: "80점 미만",
    definition: "습득 및 학습을 하는 수준으로 관련 행동이 가끔 나타남",
  },
];

const SCALE_BY_SCORE = new Map(COMPETENCY_SCALE.map((r) => [r.score, r]));

/** 「4 (우수)」. 점수만 적어 두면 그 숫자가 무슨 뜻인지 표에서 읽히지 않는다. */
export function competencyScoreLabel(score: number): string {
  const row = SCALE_BY_SCORE.get(score);
  return row ? `${score} (${row.label})` : String(score);
}

/** 양식 맨 위의 ※ 안내. 화면에도 같이 둔다 — 평가하는 동안 읽어야 할 규칙이다. */
export const COMPETENCY_NOTES = [
  "본 평가는 한국삼공 구성원의 역량을 평가하고 피드백을 제공하여 각자의 강점은 강화하고 약점은 무력화하는 것을 초점으로 합니다.",
  "각 질문을 깊게 고민한 뒤 평가 스케일에 맞는 숫자를 고르시되, 가급적 행동을 근거로 하여 평가해 주시기 바랍니다.",
  "스케일은 정수로만 고릅니다 (소수점 불가).",
] as const;

/**
 * 역량평가를 **받는** 직책 — 담당과 팀장뿐이다.
 *
 * 평가 관계는 조직도를 따라 두 갈래로만 돈다: 담당은 그 팀의 팀장이, 팀장은
 * 부문의 책임(없으면 본부의 운영책임)이 평가한다. 그 위 — 책임·운영책임·사장 —
 * 는 역량평가 대상이 아니다.
 *
 * 직책으로 가른다. «1차 평가자가 있는 사람»으로 가르면 사슬이 위로 계속
 * 이어져서 운영책임도 사장에게 평가받는 대상이 되어 버린다.
 */
export const COMPETENCY_TARGET_POSITIONS = ["STAFF", "TEAM_LEADER"] as const;

export function isCompetencyTarget(position: string): boolean {
  return (COMPETENCY_TARGET_POSITIONS as readonly string[]).includes(position);
}

export type CompetencyItem = {
  /** 점수를 잇는 열쇠. 한 번 정하면 바꾸지 않는다. */
  key: string;
  /** 표 왼쪽 칸 — 「문제해결」. */
  area: string;
  /** 표 가운데 칸 — 질문 한 문장. */
  question: string;
};

/** 1. 핵심가치 — 직무와 무관하게 전 구성원이 같은 다섯 줄을 받는다. */
export const CORE_VALUE_ITEMS: CompetencyItem[] = [
  {
    key: "core.problem-solving",
    area: "문제해결",
    question:
      "문제에 직면했을 때 원인과 대책을 도출할 수 있으며, 주어진 도구와 자원을 활용하여, 부여된 과업의 누락, 동일문제 재발을 방지하는가?",
  },
  {
    key: "core.communication",
    area: "커뮤니케이션",
    question:
      "업무 수행에 필수적인 정보를 사전 공유하며, 중간 보고 등 업무관련자와 적시에 피드백을 주고받아, 차질없이 업무를 진행하는가?",
  },
  {
    key: "core.ethics",
    area: "윤리의식",
    question:
      "사내 내규와 조직 가치를 알고 있으며, 타 구성원에게 예의와 매너를 지키고, 조직분위기를 흐리는 등 업무 환경에 차질이 없도록 행동하는가?",
  },
  {
    key: "core.engagement",
    area: "조직몰입",
    question:
      "자신의 업무를 부서/팀의 방향성 및 맥락하에서 이해하고, 이러한 이해를 바탕으로 업무를 수행하는가?",
  },
  {
    key: "core.initiative",
    area: "능동적인 자세",
    question:
      "자신이 맡은 업무의 맥락과 요구사항을 체크하고, 부여된 업무에 책임감을 가지고 임하며, 중도에 포기하지 않는가?",
  },
];

/**
 * 2. 직무역량 — 직무마다 다섯 줄이 다르다. 열쇠는 **팀 이름**이다.
 *
 * 팀 id로 두면 환경(개발·운영)마다 값이 달라 코드에 박을 수 없다. 이름은 조직도에서
 * 사람이 읽는 값이라, 인사팀이 준 파일 이름(「…_인사팀.xlsx」)과 그대로 맞물린다.
 * 팀 이름이 바뀌면 여기도 같이 고쳐야 한다 — 문항이 없으면 화면이 그 사실을
 * 알려 준다(조용히 비워 두지 않는다).
 */
export const JOB_COMPETENCY_ITEMS: Record<string, CompetencyItem[]> = {
  인사팀: [
    {
      key: "job.hr.privacy",
      area: "인사정보 보안 및 개인정보보호",
      question:
        "인사 정보의 보안 및 개인정보 보호 정책과 절차를 엄격하게 준수하고 유지하는가?",
    },
    {
      key: "job.hr.diversity",
      area: "다양성 및 포용성",
      question:
        "조직 내 다양성을 존중하고 포용하여 다양한 배경을 가진 직원들을 지원하는가?",
    },
    {
      key: "job.hr.compliance",
      area: "업무 윤리 및 규정 준수",
      question:
        "직무 수행 시 윤리와 관련 규정을 엄격하게 준수하고 조직 내에서 준수를 촉진하는가?",
    },
    {
      key: "job.hr.change",
      area: "변화 관리",
      question:
        "조직 내 변화를 관리하고 관련 프로세스를 지원하여 조직의 변화를 원활하게 진행하는가?",
    },
    {
      key: "job.hr.strategy",
      area: "인사 전략 개발",
      question:
        "인사 전략을 수립하고 조직의 비즈니스 목표와 일치시켜 인사 프로그램을 개발하는가?",
    },
  ],
};

/** 이 사람이 받을 양식 두 묶음. 직무역량은 아직 안 받은 팀이 있어 빈 배열일 수 있다. */
export function competencyFormFor(teamName: string | null | undefined): {
  core: CompetencyItem[];
  job: CompetencyItem[];
} {
  return {
    core: CORE_VALUE_ITEMS,
    job: (teamName && JOB_COMPETENCY_ITEMS[teamName]) || [],
  };
}

/** 그 사람에게 실제로 뜨는 문항 전부 — 저장할 때 «이 키가 이 사람 것인가»를 따진다. */
export function competencyItemKeys(
  teamName: string | null | undefined
): Set<string> {
  const form = competencyFormFor(teamName);
  return new Set([...form.core, ...form.job].map((i) => i.key));
}

export type CompetencyScoreRow = {
  itemKey: string;
  selfScore: number | null;
  leadScore: number | null;
};

/**
 * 자기평가·팀장평가의 평균.
 *
 * **적은 칸만** 센다. 안 적은 칸을 0으로 채우면 열 문항 중 셋만 적힌 사람이
 * 1점대로 보인다 — 낮은 게 아니라 아직 안 한 것이다. 그래서 한 칸도 안 적혀
 * 있으면 평균은 0이 아니라 null이다.
 *
 * 소수 한 자리로 끊는다. 3.3333333333333335가 표에 박히면 그 줄을 읽을 수 없다.
 */
export function competencyAverage(rows: CompetencyScoreRow[]): {
  self: number | null;
  lead: number | null;
  /** 자기평가·팀장평가를 한 덩어리로 본 평균. 결과 화면의 「역량평가 점수」 자리다. */
  overall: number | null;
  selfCount: number;
  leadCount: number;
} {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const selfVals = rows
    .map((r) => r.selfScore)
    .filter((v): v is number => v != null);
  const leadVals = rows
    .map((r) => r.leadScore)
    .filter((v): v is number => v != null);
  const mean = (vals: number[]) =>
    vals.length > 0 ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  const both = [...selfVals, ...leadVals];
  return {
    self: mean(selfVals),
    lead: mean(leadVals),
    overall: mean(both),
    selfCount: selfVals.length,
    leadCount: leadVals.length,
  };
}

/** 폼에서 온 값을 1~5 정수로만 통과시킨다. 빈 값은 «아직 안 적음»이라 null이다. */
export function parseCompetencyScore(raw: unknown): number | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < COMPETENCY_MIN || n > COMPETENCY_MAX) {
    return null;
  }
  return n;
}
