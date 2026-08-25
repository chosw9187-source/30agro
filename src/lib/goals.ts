/**
 * 평가2(목표관리) 공용 로직 — 전사 → 책임 → 팀 → 개인 4단 캐스케이드의
 * 라벨·트리 구성·진척 롤업을 한군데 모아둔다. 화면(page.tsx)과 서버
 * 액션(actions.ts) 양쪽에서 같은 규칙을 써야 숫자가 어긋나지 않는다.
 */

export const GOAL_LEVELS = ["COMPANY", "DIVISION", "TEAM", "INDIVIDUAL"] as const;
export type GoalLevel = (typeof GOAL_LEVELS)[number];

export const GOAL_LEVEL_LABEL: Record<GoalLevel, string> = {
  COMPANY: "전사목표",
  DIVISION: "책임목표",
  TEAM: "팀목표",
  INDIVIDUAL: "개인목표",
};

/** 각 층이 매달리는 상위 층. 전사목표는 최상위라 부모가 없다. */
export const GOAL_PARENT_LEVEL: Record<GoalLevel, GoalLevel | null> = {
  COMPANY: null,
  DIVISION: "COMPANY",
  TEAM: "DIVISION",
  INDIVIDUAL: "TEAM",
};

export const GOAL_STATUSES = ["DRAFT", "ACTIVE", "DONE", "DROPPED"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  DRAFT: "작성중",
  ACTIVE: "진행중",
  DONE: "완료",
  DROPPED: "중단",
};

export const GOAL_STATUS_BADGE_CLASS: Record<GoalStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-blue-50 text-blue-700",
  DONE: "bg-brand-green-light text-brand-green-dark",
  DROPPED: "bg-slate-100 text-slate-400 line-through",
};

/** 개인목표 합의 단계 — 팀원이 세우고 팀장이 승인한다. */
export const GOAL_AGREEMENT_STATUSES = ["DRAFT", "REQUESTED", "AGREED", "RETURNED"] as const;
export type GoalAgreementStatus = (typeof GOAL_AGREEMENT_STATUSES)[number];

export const GOAL_AGREEMENT_LABEL: Record<GoalAgreementStatus, string> = {
  DRAFT: "작성중",
  REQUESTED: "합의요청",
  AGREED: "합의완료",
  RETURNED: "되돌림",
};

export const GOAL_AGREEMENT_BADGE_CLASS: Record<GoalAgreementStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  REQUESTED: "bg-status-warning/20 text-amber-900",
  AGREED: "bg-brand-green-light text-brand-green-dark",
  RETURNED: "bg-status-critical/10 text-status-critical",
};

/**
 * 합의가 필요한 목표인지. 개인목표만 팀원이 세워 팀장에게 올리는 구조이고,
 * 전사·책임·팀 목표는 관리자·팀장이 직접 세우는 값이라 합의 대상이 아니다.
 */
export function needsAgreement(level: string): boolean {
  return level === "INDIVIDUAL";
}

export function asAgreementStatus(value: string): GoalAgreementStatus {
  return (GOAL_AGREEMENT_STATUSES as readonly string[]).includes(value)
    ? (value as GoalAgreementStatus)
    : "DRAFT";
}

export const GOAL_CYCLE_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type GoalCycleStatus = (typeof GOAL_CYCLE_STATUSES)[number];

export const GOAL_CYCLE_STATUS_LABEL: Record<GoalCycleStatus, string> = {
  DRAFT: "준비중",
  OPEN: "진행중",
  // "종료"가 아니라 "완료" — 이 화면에서 쓰는 말이 그쪽이다.
  CLOSED: "완료",
};

/** 화면에서 다루는 목표 한 건의 최소 형태 — Prisma 조회 결과를 그대로 받는다. */
export type GoalRow = {
  id: string;
  level: string;
  parentId: string | null;
  title: string;
  description: string | null;
  division: string | null;
  teamId: string | null;
  ownerId: string | null;
  weight: number;
  metric: string | null;
  targetValue: string | null;
  currentValue: string | null;
  unit: string | null;
  scaleS?: string | null;
  scaleA?: string | null;
  scaleB?: string | null;
  scaleC?: string | null;
  scaleD?: string | null;
  formula?: string | null;
  goalType?: string | null;
  keyResults?: string | null;
  progress: number;
  status: string;
  excluded: boolean;
  excludeReason: string | null;
  /** "기타" 묶음 목표인지 — 위 층에 딱 붙지 않는 일을 모아 두는 자리. */
  isOther?: boolean;
  /**
   * 담당자가 이번 사이클 평가대상이 아니라서 빠지는 경우. 목표에 저장하는
   * 값이 아니라 조회할 때 계산해서 붙인다(evalTargetState) — 그래야 조직도가
   * 바뀌거나 기준일을 고치면 다시 반영을 눌러줄 필요 없이 바로 맞는다.
   */
  targetExcluded?: boolean;
  targetExcludeReason?: string | null;
  agreementStatus: string;
  agreementNote: string | null;
  agreedAt: Date | null;
  agreedBy?: { id: string; name: string } | null;
  dueDate: Date | null;
  sortOrder: number;
  team?: { id: string; name: string } | null;
  owner?: {
    id: string;
    name: string;
    teamId?: string | null;
    terminationDate?: Date | null;
  } | null;
};

export type GoalNode = GoalRow & {
  children: GoalNode[];
  /** 하위 목표까지 굴려 올린 달성률(%). 하위가 없으면 progress와 같다. */
  rollupProgress: number;
};

/**
 * 집계에 넣을 목표인지. 세 가지가 상위 달성률 계산에서 통째로 빠진다 —
 * 중단(DROPPED)된 목표, 목표 하나를 콕 집어 "집계 제외"한 것(excluded),
 * 그리고 담당자가 이번 사이클 평가대상이 아닌 것(targetExcluded). 화면에는
 * 흐리게 남겨서 왜 빠졌는지 볼 수 있게 한다.
 */
export function countsTowardProgress(g: {
  status: string;
  excluded?: boolean;
  targetExcluded?: boolean;
}) {
  return g.status !== "DROPPED" && !g.excluded && !g.targetExcluded;
}

/**
 * 이 층의 달성률을 하위 목표에서 자동으로 굴려 올리는지. 전사·책임·팀 목표는
 * 결국 팀원 각자의 개인목표가 얼마나 됐는지의 합이므로 직접 입력하지 않는다.
 * 개인목표만 사람이 실제 달성률을 적는 층이다.
 */
export function isAutoCalculated(level: string): boolean {
  return level !== "INDIVIDUAL";
}

/**
 * 하위가 없는 목표의 달성률. "완료"로 표시된 목표는 입력된 달성률과 무관하게
 * 100%로 본다 — 상태만 완료로 바꾸고 달성률 칸은 그대로 둔 경우가 흔한데,
 * 그때 완료 건수는 올라가는데 달성률은 0%에 머물러 "달성했는데 반영이 안
 * 된다"로 보인다. 완료면 100%가 사람이 기대하는 값이다.
 */
export function leafProgress(goal: { status: string; progress: number }): number {
  return goal.status === "DONE" ? 100 : goal.progress;
}

/**
 * 형제 목표들의 가중평균. 가중치를 아무도 넣지 않았으면(전부 0) 동일
 * 가중으로 떨어지게 해서, 가중치 입력 전에도 숫자가 0으로 죽지 않게 한다.
 * 상위 목표의 롤업과 전사 종합 달성률이 같은 규칙을 쓰도록 공유한다.
 */
export function weightedProgress(children: GoalNode[]): number {
  const counted = children.filter(countsTowardProgress);
  if (counted.length === 0) return 0;

  const totalWeight = counted.reduce((sum, c) => sum + (c.weight > 0 ? c.weight : 0), 0);
  if (totalWeight <= 0) {
    return Math.round(counted.reduce((sum, c) => sum + c.rollupProgress, 0) / counted.length);
  }
  const weighted = counted.reduce(
    (sum, c) => sum + c.rollupProgress * (c.weight > 0 ? c.weight : 0),
    0
  );
  return Math.round(weighted / totalWeight);
}

/**
 * 평평한 목표 목록을 parentId 기준 트리로 만든다. 부모가 이번 사이클
 * 목록에 없는(=아직 안 매달린) 목표는 그 층의 뿌리로 남겨 화면에서
 * 누락되지 않게 한다.
 */
export function buildGoalTree(rows: GoalRow[]): GoalNode[] {
  const byId = new Map<string, GoalNode>();
  for (const row of rows) {
    byId.set(row.id, { ...row, children: [], rollupProgress: leafProgress(row) });
  }

  const roots: GoalNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // 뿌리에는 전사목표와 "아직 상위에 안 매달린" 하위 목표가 섞여 들어오므로,
  // 층 순서를 먼저 태워야 트리 맨 위가 전사목표로 시작한다.
  const levelRank = (level: string) => {
    const i = (GOAL_LEVELS as readonly string[]).indexOf(level);
    return i < 0 ? GOAL_LEVELS.length : i;
  };
  const sortNodes = (nodes: GoalNode[]) => {
    nodes.sort(
      (a, b) =>
        levelRank(a.level) - levelRank(b.level) ||
        a.sortOrder - b.sortOrder ||
        a.title.localeCompare(b.title)
    );
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  const computeRollup = (node: GoalNode): number => {
    node.children.forEach(computeRollup);
    const counted = node.children.filter(countsTowardProgress);
    if (counted.length > 0) {
      node.rollupProgress = weightedProgress(node.children);
    } else if (isAutoCalculated(node.level)) {
      // 자동 계산 층인데 집계할 하위가 하나도 없으면 근거가 없는 값이라 0이다.
      // 여기서 입력값을 쓰면 아래는 비어 있는데 위만 100%인 표가 만들어진다.
      node.rollupProgress = 0;
    } else {
      node.rollupProgress = leafProgress(node);
    }
    return node.rollupProgress;
  };
  roots.forEach(computeRollup);

  return roots;
}

export function flattenGoalTree(nodes: GoalNode[]): GoalNode[] {
  return nodes.flatMap((n) => [n, ...flattenGoalTree(n.children)]);
}

/** 마감일이 지났는데 완료되지 않은 목표 = 지연. */
export function isOverdue(goal: { dueDate: Date | null; status: string }, now: Date) {
  if (!goal.dueDate) return false;
  if (goal.status === "DONE" || goal.status === "DROPPED") return false;
  return goal.dueDate.getTime() < now.getTime();
}

export function averageProgress(nodes: GoalNode[]): number {
  const counted = nodes.filter(countsTowardProgress);
  if (counted.length === 0) return 0;
  return Math.round(counted.reduce((s, n) => s + n.rollupProgress, 0) / counted.length);
}

export function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * 계층 서열 램프. 전사 → 개인으로 갈수록 옅어지는 같은 초록 한 색이라
 * 색만 봐도 위아래가 읽힌다. 층은 순서가 있는 값이므로 서로 다른 색상을
 * 쓰는 카테고리 팔레트를 쓰지 않는다.
 */
export const GOAL_LEVEL_RAMP: Record<GoalLevel, string> = {
  COMPANY: "bg-goal-1",
  DIVISION: "bg-goal-2",
  TEAM: "bg-goal-3",
  INDIVIDUAL: "bg-goal-4",
};

export const GOAL_LEVEL_RAMP_BORDER: Record<GoalLevel, string> = {
  COMPANY: "border-goal-1",
  DIVISION: "border-goal-2",
  TEAM: "border-goal-3",
  INDIVIDUAL: "border-goal-4",
};

/**
 * `<input type="date">`에 넣을 yyyy-mm-dd. 서버가 한국 밖 리전에서 돌아도
 * 날짜가 하루 밀리지 않도록 Asia/Seoul 기준으로 뽑는다.
 */
export function toDateInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * 담당자가 지금도 이 목표를 들고 있다고 보기 어려운 상태인지. 퇴사자이거나
 * 목표가 걸린 팀과 다른 팀으로 옮긴 경우를 잡아, 화면에서 "집계에서 빼시겠어요"
 * 라고 물어볼 수 있게 한다. 자동으로 빼지는 않는다 — 옮겼어도 그대로 들고
 * 가는 목표가 있어서, 빼는 판단은 사람이 한다.
 */
export function ownerFlag(
  goal: GoalRow,
  now = new Date()
): { kind: "RESIGNED" | "MOVED"; label: string } | null {
  const owner = goal.owner;
  if (!owner) return null;

  if (owner.terminationDate && owner.terminationDate <= now) {
    return { kind: "RESIGNED", label: "퇴사" };
  }
  if (goal.teamId && owner.teamId && owner.teamId !== goal.teamId) {
    return { kind: "MOVED", label: "부서이동" };
  }
  return null;
}

// ---- 보는 사람에 따른 범위 -----------------------------------------------

/** 평가2를 여는 사람. 직책과 소속만 있으면 무엇을 볼지 정할 수 있다. */
export type GoalViewer = {
  id: string;
  isAdmin: boolean;
  position: string;
  teamId: string | null;
  /** 본인이 팀장으로 있는 팀들(소속 팀과 다를 수 있다). */
  ledTeamIds: string[];
  division: string | null;
  businessUnit: string | null;
};

/**
 * 이 사람에게 보여 줄 층. 팀원(담당)은 책임목표를 보지 않는다 — 본부 단위
 * 목표는 팀원이 손댈 것도, 자기 성과와 이어지는 것도 아니라서 탭만 늘린다.
 * 팀장·책임·운영책임·사장·관리자는 네 층을 다 본다.
 */
export function visibleGoalLevels(viewer: { isAdmin: boolean; position: string }): GoalLevel[] {
  if (!viewer.isAdmin && viewer.position === "STAFF") return ["TEAM", "INDIVIDUAL"];
  return ["DIVISION", "TEAM", "INDIVIDUAL"];
}

/**
 * 목록에 이 목표를 보여 줄지. 대시보드의 층별 달성률은 조직 전체 숫자라
 * 누구에게나 그대로 두고, 목표 한 건 한 건이 나오는 **목록**에만 이 규칙을
 * 건다. 범위는 플랫폼이 이미 쓰는 인사카드 열람 상한과 같게 맞췄다:
 *
 *   관리자·사장  → 전부
 *   운영책임      → 본인 본부
 *   책임          → 본인 부문(책임)
 *   팀장          → 본인 팀(이끄는 팀 포함)
 *   담당(팀원)    → 본인 팀의 팀목표 + 본인 개인목표
 *
 * 소속 정보가 비어 있어 판단할 수 없는 목표는 감추지 않고 보여 준다. 데이터가
 * 덜 채워졌다는 이유로 목표가 사라지면 왜 안 보이는지 알 길이 없다.
 */
export function canViewGoalRow(
  goal: { level: string; division: string | null; teamId: string | null; ownerId: string | null },
  viewer: GoalViewer,
  org: {
    /** 팀이 속한 부문(책임). */
    teamDivision: (teamId: string) => string | null;
    /** 팀이 속한 본부. */
    teamUnit: (teamId: string) => string | null;
    /** 부문(책임)이 속한 본부. */
    divisionUnit: (division: string) => string | null;
  }
): boolean {
  if (viewer.isAdmin || viewer.position === "CEO") return true;

  const goalDivision = goal.division ?? (goal.teamId ? org.teamDivision(goal.teamId) : null);
  const goalUnit = goal.teamId
    ? org.teamUnit(goal.teamId)
    : goalDivision
      ? org.divisionUnit(goalDivision)
      : null;
  const myTeams = new Set([...(viewer.teamId ? [viewer.teamId] : []), ...viewer.ledTeamIds]);

  switch (viewer.position) {
    case "OPERATIONS_HEAD":
      if (!goalUnit || !viewer.businessUnit) return true;
      return goalUnit === viewer.businessUnit;
    case "SENIOR_STAFF":
      if (!goalDivision || !viewer.division) return true;
      return goalDivision === viewer.division;
    case "TEAM_LEADER":
      if (goal.level === "DIVISION") {
        if (!goalDivision || !viewer.division) return true;
        return goalDivision === viewer.division;
      }
      if (!goal.teamId) return true;
      return myTeams.has(goal.teamId);
    default: {
      // 담당(팀원) — 우리 팀의 팀목표와 내 개인목표까지.
      if (goal.level === "INDIVIDUAL") return goal.ownerId === viewer.id;
      if (!goal.teamId) return true;
      return myTeams.has(goal.teamId);
    }
  }
}

/**
 * 평가대상자 관리 화면이 건 집계 제외임을 표시하는 머리말. 담당자가 목표
 * 화면에서 손수 건 제외와 구분해야, 명단을 되돌릴 때 손으로 건 제외까지
 * 같이 풀려버리는 일이 없다.
 */
export const TARGET_EXCLUDE_TAG = "평가대상 제외";

// ---- 평가대상자 판정 -----------------------------------------------------

/** 이번 사이클에서 이 사람을 평가대상으로 볼지, 뺀다면 왜 빼는지. */
export type EvalTargetState = {
  included: boolean;
  reason: string | null;
  /** 규칙(입사일 기준일)으로 자동 판정된 것인지, 사람이 직접 정한 것인지. */
  source: "manual" | "hireCutoff" | "default";
};

/**
 * 평가대상 판정. 순서가 곧 규칙이다.
 *
 *   1. 사람이 직접 정한 게 있으면(GoalCycleTarget 행) 그게 이긴다 —
 *      기준일에 걸렸어도 관리자가 "이 사람은 넣는다"고 하면 넣는다.
 *   2. 없으면 입사일 기준일을 본다. 기준일 **이후** 입사면 뺀다.
 *      (기준일 당일 입사는 대상이다 — "6월 이후 입사자 제외"라고 하면
 *       6월 1일자로 들어온 사람은 보통 포함으로 읽힌다.)
 *   3. 그것도 아니면 대상이다. 아무것도 저장돼 있지 않은 사람이 기본으로
 *      대상이 되므로, 조직도에 새 입사자가 들어오면 그냥 잡힌다.
 */
export function evalTargetState(
  person: { hireDate?: Date | null },
  cycle: { hireCutoff?: Date | null } | null,
  manual?: { included: boolean; reason: string | null } | null
): EvalTargetState {
  if (manual) {
    return { included: manual.included, reason: manual.reason, source: "manual" };
  }
  const cutoff = cycle?.hireCutoff ?? null;
  if (cutoff && person.hireDate && person.hireDate > cutoff) {
    return {
      included: false,
      reason: `${formatCutoff(cutoff)} 이후 입사`,
      source: "hireCutoff",
    };
  }
  return { included: true, reason: null, source: "default" };
}

/** 기준일을 사유 문구에 넣을 yyyy-mm-dd 로. 서울 기준으로 뽑는다. */
function formatCutoff(d: Date): string {
  return toDateInputValue(d);
}

// ---- 마감(잠금) ----------------------------------------------------------

/** 사이클에 걸린 잠금 상태. */
export type CycleLock = {
  /** 목표 내용(제목·지표·가중치·담당·구조)을 고칠 수 있는가. */
  canEditGoals: boolean;
  /** 진척·합의를 올릴 수 있는가. */
  canEditProgress: boolean;
  /** 화면에 띄울 안내 문구. 잠긴 게 없으면 null. */
  message: string | null;
};

/**
 * 두 단계로 잠근다.
 *
 *   목표 확정(goalsLockedAt) — 목표 **내용**은 못 고치고 진척만 올린다.
 *     목표를 다 세워 합의까지 끝낸 뒤에 목표가 슬그머니 바뀌면 평가의 기준
 *     자체가 흔들리기 때문이다. 진척은 계속 올려야 하므로 같이 막지 않는다.
 *
 *   사이클 완료(status=CLOSED) — 진척까지 잠겨 완전 읽기 전용이 된다.
 *     평가가 끝난 뒤 숫자가 움직이면 이미 나간 결과와 화면이 어긋난다.
 *
 * 관리자도 예외가 아니다. 마감을 풀어야 고칠 수 있게 해야 "언제 무엇이
 * 바뀌었나"가 남는다.
 */
export function cycleLock(
  cycle: { status: string; goalsLockedAt?: Date | null } | null
): CycleLock {
  if (!cycle) return { canEditGoals: false, canEditProgress: false, message: null };
  if (cycle.status === "CLOSED") {
    return {
      canEditGoals: false,
      canEditProgress: false,
      message: "완료된 인사평가입니다 — 목표와 진척 모두 읽기 전용입니다.",
    };
  }
  if (cycle.goalsLockedAt) {
    return {
      canEditGoals: false,
      canEditProgress: true,
      message: "목표가 확정(마감)되었습니다 — 내용은 고칠 수 없고 진척만 올릴 수 있습니다.",
    };
  }
  return { canEditGoals: true, canEditProgress: true, message: null };
}

// ---- "기타" 묶음 ---------------------------------------------------------

/** 상위 목표 선택칸에서 "기타"를 고를 때 넘어오는 값. */
export const OTHER_PARENT_VALUE = "__OTHER__";

/** 자동으로 만들어지는 기타 목표의 이름. 층마다 하나씩 생긴다. */
export const OTHER_GOAL_TITLE = "기타";

/**
 * 새로 만드는 기타 목표에 줄 가중치. 형제들이 이미 가중치를 나눠 가지고 있으면
 * 그 평균을 준다.
 *
 * 0으로 두면 안 된다 — 가중평균은 가중치가 0인 목표를 분모에서도 빼기 때문에,
 * 기타에 담긴 일을 아무리 해내도 상위 달성률이 1%도 안 움직인다. "여기 담으면
 * 반영이 안 된다"는 건 이 기능을 만든 이유와 정반대다. 형제가 전부 0이면
 * 0으로 둬도 되는데, 그때는 가중평균이 동일가중으로 떨어져서 어차피 같이 센다.
 * 정확한 비중은 어차피 사람이 정할 값이라, 여기서는 "일단 세어지는" 값을 준다.
 */
export function defaultOtherWeight(siblings: { weight: number }[]): number {
  const positive = siblings.map((s) => s.weight).filter((w) => w > 0);
  if (positive.length === 0) return 0;
  return Math.round(positive.reduce((sum, w) => sum + w, 0) / positive.length);
}

/**
 * 인사평가 목록의 정렬 규칙. 화면마다 다른 순서로 보이면 "위에서 몇 번째"라는
 * 말이 통하지 않으므로 한 군데서 정해 모든 화면이 같이 쓴다.
 *
 * 관리자가 정한 순번이 먼저고, 아직 정하지 않은 것(0)은 연도·기간 역순으로
 * 떨어진다. 순번을 매기는 순간 0인 것들보다 앞으로 나온다.
 */
export const GOAL_CYCLE_ORDER: {
  sortOrder?: "asc" | "desc";
  year?: "asc" | "desc";
  startDate?: "asc" | "desc";
}[] = [{ sortOrder: "asc" }, { year: "desc" }, { startDate: "desc" }];

// ---- 평가척도 -------------------------------------------------------------

/**
 * 사내 "팀 목표 설정" 양식의 평가척도 다섯 등급. 괄호 안 숫자는 그 등급의
 * 환산점수다 — S를 110으로 두는 건 목표를 넘겨 달성한 경우를 인정하기
 * 위해서고, 그래서 100이 아니라 110에서 시작한다.
 *
 * `field`는 Goal에 저장되는 칸 이름이자 폼 input의 name이다. 등급을 늘리거나
 * 점수를 바꿀 일이 생기면 여기만 고치면 화면과 저장이 같이 따라온다.
 */
export const GOAL_SCALES = [
  { grade: "S", score: 110, field: "scaleS" },
  { grade: "A", score: 100, field: "scaleA" },
  { grade: "B", score: 90, field: "scaleB" },
  { grade: "C", score: 80, field: "scaleC" },
  { grade: "D", score: 70, field: "scaleD" },
] as const;

export type GoalScaleField = (typeof GOAL_SCALES)[number]["field"];

/** 목표 한 건의 평가척도를 등급 순서대로 꺼낸다. */
export function scaleValues(goal: Partial<Record<GoalScaleField, string | null>>) {
  return GOAL_SCALES.map((s) => ({ ...s, value: goal[s.field] ?? null }));
}

/**
 * 평가척도를 이 층에서 쓰는지. 팀목표가 사내 양식에서 등급 기준을 적는 층이다 —
 * 전사·책임 목표는 아래에서 굴러 올라온 값이라 등급 기준을 따로 두지 않는다.
 */
export function usesScales(level: string): boolean {
  return level === "TEAM";
}

// ---- 개인목표(OKR) --------------------------------------------------------

/**
 * 사내 "개인목표 설정" 양식의 목표 유형. 목표 앞 괄호에 들어가는 값이다.
 *
 * 세 가지를 나눠 둔 건 섞어 세우게 하려는 것이다 — 유형을 안 적게 하면 개인목표가
 * 전부 업무목표로만 차서, 개선과 자기계발이 목표 설정 단계에서 통째로 빠진다.
 */
export const GOAL_TYPES = ["업무목표", "개선목표", "자기계발목표"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

/** 목표 유형별 배지 색. 글자 라벨과 늘 같이 쓴다(색만으로 구분하지 않는다). */
export const GOAL_TYPE_BADGE_CLASS: Record<string, string> = {
  업무목표: "bg-slate-100 text-slate-700",
  개선목표: "bg-blue-50 text-blue-700",
  자기계발목표: "bg-violet-50 text-violet-700",
};

/** Key Results 줄 목록. 빈 줄은 버리고 앞뒤 공백을 턴다. */
export function keyResultLines(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** ① ② ③ … 양식과 같은 동그라미 숫자. 20을 넘으면 그냥 "21."로 적는다. */
export function circledNumber(i: number): string {
  const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  return i < circled.length ? circled[i] : `${i + 1}.`;
}

/**
 * Objective / Key Results 형태로 목표를 세우는 층. 사내 양식에서 이 구성을
 * 쓰는 건 개인목표뿐이다.
 */
export function usesKeyResults(level: string): boolean {
  return level === "INDIVIDUAL";
}

/**
 * 목록 머리글에 가중치 소계를 띄우는 층. 양식에 "소계 100%" 줄이 있는 곳,
 * 즉 팀목표와 개인목표다 — 비중을 나눠 갖는 층에서만 합계가 뜻을 가진다.
 */
export function usesWeightSubtotal(level: string): boolean {
  return level === "TEAM" || level === "INDIVIDUAL";
}
