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

export const GOAL_CYCLE_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type GoalCycleStatus = (typeof GOAL_CYCLE_STATUSES)[number];

export const GOAL_CYCLE_STATUS_LABEL: Record<GoalCycleStatus, string> = {
  DRAFT: "준비중",
  OPEN: "진행중",
  CLOSED: "종료",
};

/** 화면에서 다루는 목표 한 건의 최소 형태 — Prisma 조회 결과를 그대로 받는다. */
export type GoalRow = {
  id: string;
  level: string;
  parentId: string | null;
  category: string | null;
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
  progress: number;
  status: string;
  excluded: boolean;
  excludeReason: string | null;
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
 * 집계에 넣을 목표인지. 중단(DROPPED)된 목표와 "집계 제외"로 표시한 목표
 * (담당자 퇴사·부서이동 등)는 상위 달성률 계산에서 통째로 빠진다. 화면에는
 * 흐리게 남겨서 왜 빠졌는지 볼 수 있게 한다.
 */
export function countsTowardProgress(g: { status: string; excluded?: boolean }) {
  return g.status !== "DROPPED" && !g.excluded;
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
