import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { SearchableSelect } from "@/components/searchable-select";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { POSITION_LABEL } from "@/lib/permission-constants";
import { buildEvaluatorMap, evaluatorLabel } from "@/lib/evaluator";
import { formatKSTDate } from "@/lib/format-kst";
import {
  GOAL_AGREEMENT_BADGE_CLASS,
  GOAL_AGREEMENT_LABEL,
  GOAL_CYCLE_ORDER,
  allowsProgressInput,
  GOAL_CYCLE_STATUS_LABEL,
  GOAL_SCALES,
  GOAL_LEVEL_LABEL,
  GOAL_LEVEL_RAMP,
  GOAL_LEVEL_RAMP_BORDER,
  GOAL_PARENT_LEVEL,
  GOAL_STATUSES,
  GOAL_STATUS_LABEL,
  OTHER_GOAL_TITLE,
  OTHER_PARENT_VALUE,
  averageProgress,
  buildGoalTree,
  countsTowardProgress,
  flattenGoalTree,
  groupCyclesByYear,
  asAgreementStatus,
  canViewGoalRow,
  cycleLock,
  evalTargetState,
  isAutoCalculated,
  isOverdue,
  needsAgreement,
  ownerFlag,
  GOAL_TYPES,
  GOAL_TYPE_BADGE_CLASS,
  circledNumber,
  cyclePhaseLabel,
  keyResultLines,
  scaleValues,
  toDateInputValue,
  usesKeyResults,
  usesScales,
  usesDerivedWeight,
  usesWeightSubtotal,
  visibleGoalLevels,
  weightedProgress,
  type GoalCycleStatus,
  type GoalViewer,
  type GoalLevel,
  type GoalNode,
  type GoalStatus,
} from "@/lib/goals";
import {
  addGoalCheckIn,
  approveGoalAgreement,
  createGoal,
  createGoalCycle,
  deleteGoal,
  reopenGoalAgreement,
  requestGoalAgreement,
  returnGoalAgreement,
  seedCompanyGoalTemplate,
  setGoalExcluded,
  updateGoal,
} from "./actions";
import { CycleSelect } from "./cycle-select";
import { ActionForm } from "@/components/action-form";
import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = "force-dynamic";

/**
 * 탭에는 전사목표를 두지 않는다. 전사 목표는 어느 탭에서든 화면 위에 표로
 * 늘 떠 있고, 편집은 관리자 화면(조직 목표 관리)에서 하기 때문에 탭까지
 * 두면 같은 걸 세 군데서 보게 된다. 나머지 세 층 중 어디까지 보이는지는
 * 보는 사람의 직책이 정한다(visibleGoalLevels) — 팀원에게는 책임목표가
 * 뜨지 않는다.
 */
const TAB_TO_LEVEL: Record<string, GoalLevel> = {
  division: "DIVISION",
  team: "TEAM",
  individual: "INDIVIDUAL",
};

function tabsFor(levels: GoalLevel[]) {
  return [
    { key: "dashboard", label: "대시보드" },
    ...levels.map((level) => ({ key: level.toLowerCase(), label: GOAL_LEVEL_LABEL[level] })),
  ];
}

/** 대시보드에 달성률 요약 카드로 세우는 층. */
const DASHBOARD_LEVELS: GoalLevel[] = ["COMPANY", "DIVISION", "TEAM", "INDIVIDUAL"];

/**
 * 책임 목록의 기준 순서. 보고서에 쓰는 순서 그대로다 — 가나다순으로 늘어놓으면
 * 실제 조직을 아는 사람 눈에는 뒤죽박죽으로 보인다.
 *
 * 조직도에 팀이 달려 있지 않은 책임(사업개발 등)은 팀 목록에서 유추할 수가
 * 없어서 이 목록이 없으면 책임목표를 세울 자리 자체가 사라진다. 그래서 여기
 * 적힌 것은 조직도에 없더라도 항상 고를 수 있게 둔다. 조직도나 기존 목표에만
 * 있는 이름은 이 뒤에 가나다순으로 붙는다.
 */
const DIVISION_ORDER = [
  "제품기획마케팅",
  "영업고객관리",
  "기술연구",
  "생산",
  "재무경영관리",
  "사업개발",
  "기타부서",
];

/** 층 식별색. globals.css의 --color-goal-* 와 같은 값을 가리킨다. */
const LEVEL_COLOR: Record<GoalLevel, string> = {
  COMPANY: "var(--color-goal-1)",
  DIVISION: "var(--color-goal-2)",
  TEAM: "var(--color-goal-3)",
  INDIVIDUAL: "var(--color-goal-4)",
};

/**
 * 라벨 옆의 빨간 물음표. 마우스를 올리면 설명이 뜬다.
 *
 * 설명을 라벨에 괄호로 붙여 두면 칸 이름보다 안내문이 길어져서 정작 무슨
 * 칸인지가 안 읽힌다. 한 번 읽으면 그만인 이야기는 접어 두고, 필요할 때만
 * 꺼내 보게 한다. 자바스크립트 없이 CSS만으로 열고 닫아서 서버에서 그대로
 * 그려진다.
 */
function HelpMark({ text }: { text: string }) {
  return (
    <span className="group relative inline-block align-middle">
      <span
        role="img"
        aria-label={text}
        tabIndex={0}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-status-critical text-[10px] font-bold leading-none text-status-critical"
      >
        ?
      </span>
      <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-64 rounded-md bg-slate-800 px-3 py-2 text-[11px] font-normal leading-relaxed text-white shadow-lg group-focus-within:block group-hover:block">
        {text}
      </span>
    </span>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-slate-500";
const PRIMARY_BUTTON_CLASS =
  "rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark";
const CARD_CLASS = "rounded-xl border border-slate-200 bg-white shadow-sm";

/** 상태 배지 — 색만으로 뜻이 전달되지 않도록 항상 글자 라벨을 같이 둔다. */
const STATUS_BADGE_CLASS: Record<GoalStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-slate-100 text-slate-600",
  DONE: "bg-status-good/10 text-status-good",
  DROPPED: "bg-slate-100 text-slate-400 line-through",
};

/**
 * 달성률 막대. 채움은 브랜드 초록 한 색(크기 = 값), 트랙은 같은 초록의 옅은
 * 단계다. 값에 따라 색상을 바꾸면 막대 길이가 이미 보여주는 정보를 색으로
 * 한 번 더 칠하는 셈이라 쓰지 않는다. 지연 여부는 옆의 "지연" 배지가 맡는다.
 */
function Meter({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={`w-full overflow-hidden rounded-[4px] bg-brand-green-light ${
        size === "md" ? "h-2.5" : "h-1.5"
      }`}
    >
      <div
        className="h-full rounded-r-[4px] bg-brand-green"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/**
 * 달성률 도넛. 색은 그 목표가 어느 층인지를 나타내고(전사·책임·팀·개인),
 * 값은 호의 길이가 나타낸다. 트랙은 같은 색을 옅게 깐 것이라 층 색이 링 전체에
 * 유지된다. 값에 따라 색을 바꾸지는 않는다 — 호의 길이가 이미 값이다.
 */
function ProgressDonut({
  value,
  color,
  size = 132,
  stroke = 13,
}: {
  value: number;
  color: string;
  size?: number;
  stroke?: number;
}) {
  const v = Math.min(100, Math.max(0, value));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (v / 100) * circumference;
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`달성률 ${v}퍼센트`}
    >
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={color}
        strokeOpacity={0.15}
        strokeWidth={stroke}
      />
      {v > 0 && (
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      )}
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (GOAL_STATUSES as readonly string[]).includes(status)
    ? (status as GoalStatus)
    : "ACTIVE";
  if (s === "ACTIVE") return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASS[s]}`}>
      {GOAL_STATUS_LABEL[s]}
    </span>
  );
}

function OverdueBadge() {
  return (
    <span className="rounded bg-status-critical/10 px-1.5 py-0.5 text-[10px] font-medium text-status-critical">
      지연
    </span>
  );
}

/** 층 표시용 사각 마크. 글자에 색을 입히지 않고 이 마크가 층 식별을 맡는다. */
function LevelDot({ level }: { level: GoalLevel }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-[2px] ${GOAL_LEVEL_RAMP[level]}`}
      aria-hidden
    />
  );
}

/** 집계에서 빠져 있는 목표임을 알려주는 배지. */
function ExcludedBadge({ reason }: { reason: string | null }) {
  return (
    <span
      className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
      title={reason ?? undefined}
    >
      집계 제외{reason ? ` · ${reason}` : ""}
    </span>
  );
}

/** 개인목표 합의 단계 배지. */
function AgreementBadge({ status }: { status: string }) {
  const s = asAgreementStatus(status);
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${GOAL_AGREEMENT_BADGE_CLASS[s]}`}>
      {GOAL_AGREEMENT_LABEL[s]}
    </span>
  );
}

/** 담당자가 퇴사했거나 다른 팀으로 옮겼음을 알려주는 배지. */
function OwnerFlagBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-status-warning/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
      담당자 {label}
    </span>
  );
}

/**
 * 화면에 뿌릴 목표 이름. 자동으로 만들어지는 「기타」 자리는 예전에 만든
 * 줄이 «기타»라는 옛 이름으로 저장돼 있어서, 읽을 때 지금 이름으로 맞춘다 —
 * 저장된 값을 건드리지 않고도 화면이 한 가지 이름으로 읽힌다.
 */
function goalTitle(goal: { title: string; isOther?: boolean }): string {
  return goal.isOther ? OTHER_GOAL_TITLE : goal.title;
}

function scopeText(goal: GoalNode): string {
  if (goal.level === "COMPANY") return "전사";
  if (goal.level === "DIVISION") return goal.division ?? "책임 미지정";
  if (goal.level === "TEAM") return goal.team?.name ?? "팀 미지정";
  return goal.owner?.name ?? "담당자 미지정";
}

export default async function Evaluation2Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cycleId?: string; edit?: string }>;
}) {
  if (!(await checkModuleAccess("EVALUATION_V2"))) {
    return <NoModuleAccess title="평가2" />;
  }

  const params = await searchParams;

  const session = await auth();
  const isAdmin = session!.user.role === "ADMIN";

  // 보는 사람의 소속·직책. 어떤 탭이 뜨는지, 목록에 어느 조직의 목표가
  // 들어오는지가 여기서 갈린다.
  const me = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: {
      id: true,
      position: true,
      teamId: true,
      businessUnit: true,
      division: true,
      team: { select: { businessUnit: true, division: true } },
      ledTeams: { select: { id: true } },
    },
  });
  const viewer: GoalViewer = {
    id: session!.user.id,
    isAdmin,
    position: me?.position ?? "STAFF",
    teamId: me?.teamId ?? null,
    ledTeamIds: (me?.ledTeams ?? []).map((t) => t.id),
    division: me?.team?.division ?? me?.division ?? null,
    businessUnit: me?.team?.businessUnit ?? me?.businessUnit ?? null,
  };
  const myLevels = visibleGoalLevels(viewer);
  const TABS = tabsFor(myLevels);
  // 볼 수 없는 층을 URL로 직접 치고 들어와도 대시보드로 되돌린다.
  const tab = TABS.some((t) => t.key === params.tab) ? params.tab! : "dashboard";

  const cycles = await prisma.goalCycle.findMany({
    orderBy: GOAL_CYCLE_ORDER,
  });
  /**
   * 상단 배너의 인사평가 선택. 평가2에 처음 들어오면 아무것도 안 고른
   * "선택" 상태이고, 그때는 **어떤 목표도 보여주지 않는다**.
   *
   * 예전에는 오늘이 속한 사이클을 알아서 잡아 줬는데, 그러면 화면에 뜬 숫자가
   * 몇 년도 것인지 모르는 채로 읽게 된다. 2026과 2027이 나란히 열려 있는
   * 기간에는 특히 위험하다. 어느 해를 보는지는 사람이 고르게 한다.
   */
  const pickedCycle = params.cycleId
    ? (cycles.find((c) => c.id === params.cycleId) ?? null)
    : null;
  const selectedCycleId = pickedCycle?.id ?? "";
  const cycle = pickedCycle;
  /**
   * 목표를 실제로 담고 있는 사이클. 어떤 평가는 자기 목표를 갖지 않고 다른
   * 평가의 목표를 그대로 본다 — "2026년 상반기"와 "2026년 최종평가"가
   * "2026년 목표설정"의 목표를 함께 쓰는 식이다. 복사가 아니라 참조라서
   * 한쪽에서 진척을 올리면 다른 쪽에도 그대로 반영된다.
   */
  const goalCycleId = cycle?.sourceCycleId ?? cycle?.id ?? null;
  const sharedFrom = cycle?.sourceCycleId
    ? (cycles.find((c) => c.id === cycle.sourceCycleId) ?? null)
    : null;

  const [teams, people] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, division: true, businessUnit: true, leaderId: true },
    }),
    prisma.user.findMany({
      where: activePrismaWhere(),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        position: true,
        teamId: true,
        division: true,
        businessUnit: true,
        team: { select: { name: true } },
      },
    }),
  ]);

  const goals = goalCycleId
    ? await prisma.goal.findMany({
        where: { cycleId: goalCycleId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          level: true,
          parentId: true,
          title: true,
          description: true,
          isOther: true,
          division: true,
          teamId: true,
          ownerId: true,
          weight: true,
          metric: true,
          targetValue: true,
          currentValue: true,
          scaleS: true,
          scaleA: true,
          scaleB: true,
          scaleC: true,
          scaleD: true,
          formula: true,
          goalType: true,
          keyResults: true,
          progress: true,
          status: true,
          excluded: true,
          excludeReason: true,
          agreementStatus: true,
          agreementNote: true,
          agreedAt: true,
          agreedBy: { select: { id: true, name: true } },
          dueDate: true,
          sortOrder: true,
          team: { select: { id: true, name: true } },
          owner: {
            select: {
              id: true,
              name: true,
              teamId: true,
              terminationDate: true,
              hireDate: true,
            },
          },
        },
      })
    : [];

  // 이번 사이클에서 손으로 정해 둔 평가대상 지정. 규칙(입사일 기준일)보다 우선한다.
  const manualTargets = goalCycleId
    ? await prisma.goalCycleTarget.findMany({
        where: { cycleId: goalCycleId },
        select: { userId: true, included: true, reason: true },
      })
    : [];
  const manualByUser = new Map(manualTargets.map((t) => [t.userId, t]));

  /**
   * 담당자가 이번 평가 대상인지를 목표마다 붙인다. 저장하지 않고 여기서
   * 계산하는 이유는, 조직도에 사람이 드나들거나 기준일을 고쳐도 따로 반영을
   * 눌러줄 필요 없이 바로 맞아야 하기 때문이다.
   */
  const goalsWithTarget = goals.map((g) => {
    if (!g.ownerId) return g;
    const state = evalTargetState(
      { hireDate: g.owner?.hireDate ?? null },
      cycle,
      manualByUser.get(g.ownerId) ?? null
    );
    if (state.included) return g;
    return { ...g, targetExcluded: true, targetExcludeReason: state.reason };
  });

  // 잠금은 목표를 실제로 담고 있는 사이클을 따른다 — 서버 액션도 그 사이클로
  // 판단하므로, 여기서 다른 기준을 쓰면 눌리는데 저장은 안 되는 버튼이 생긴다.
  const lock = cycleLock(sharedFrom ?? cycle);
  /*
    달성률을 적을 수 있는 단계인가. **고른 평가**로 판단한다 — 목표는 대개
    「목표설정」에 한 벌만 있고 중간평가·최종평가가 그걸 빌려 보므로, 목표가
    저장된 사이클로 따지면 중간평가에서도 막혀 버린다.
  */
  const canWriteProgress = allowsProgressInput(cycle);
  const tree = buildGoalTree(goalsWithTarget);
  const allNodes = flattenGoalTree(tree);
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const byLevel = (level: GoalLevel) => allNodes.filter((n) => n.level === level);
  const companyGoals = byLevel("COMPANY");

  const divisions = Array.from(
    new Set([
      ...DIVISION_ORDER,
      ...teams.map((t) => t.division).filter((d): d is string => !!d),
      ...goals.map((g) => g.division).filter((d): d is string => !!d),
    ])
  ).sort((a, b) => {
    const ai = DIVISION_ORDER.indexOf(a);
    const bi = DIVISION_ORDER.indexOf(b);
    // 기준 순서에 없는 이름은 뒤로 밀고 자기들끼리 가나다순.
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const teamOptions = teams.map((t) => ({
    value: t.id,
    label: t.name,
    sublabel: t.division ?? undefined,
  }));
  /*
    사람을 고르는 칸은 «오동률 책임(재무경영관리)»처럼 이름 · 직책 · 소속을 함께
    보여 준다. 이름만 있으면 동명이인을 가릴 수 없고, 무엇보다 누구를 골라야
    하는지가 직책에서 읽힌다. 검색은 라벨을 훑으므로 «책임»이나 «팀장»으로도
    찾을 수 있다.
  */
  /*
    누가 누구를 평가하는지는 조직도에서 따라 올라가 계산한다(`buildEvaluatorMap`).
    사람마다 적어 두지 않는 이유는 평가대상 판정과 같다 — 팀장이 바뀌거나
    부서를 옮기면 평가자도 그날로 따라 바뀌어야 하는데, 적어 두면 누군가 다시
    눌러 주기 전까지 옛 사람이 남는다.
  */
  const evaluatorByPerson = buildEvaluatorMap(people, teams);

  const personOptions = people.map((p) => ({
    value: p.id,
    label: `${p.name} ${POSITION_LABEL[p.position]}`,
    sublabel: p.team?.name ? `(${p.team.name})` : p.division ? `(${p.division})` : undefined,
  }));

  // 조직도(본부 > 책임 > 팀)를 되짚는 표. 목표에는 팀만 붙어 있어서, 이 사람이
  // 볼 수 있는 범위인지 따지려면 팀에서 부문·본부로 거슬러 올라가야 한다.
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const unitByDivision = new Map<string, string>();
  for (const t of teams) {
    if (t.division && t.businessUnit && !unitByDivision.has(t.division)) {
      unitByDivision.set(t.division, t.businessUnit);
    }
  }
  const org = {
    teamDivision: (teamId: string) => teamById.get(teamId)?.division ?? null,
    teamUnit: (teamId: string) => teamById.get(teamId)?.businessUnit ?? null,
    divisionUnit: (division: string) => unitByDivision.get(division) ?? null,
  };
  /** 이 사람에게 목록으로 보여 줄 목표만 남긴다. */
  const visibleRows = (rows: GoalNode[]) => rows.filter((g) => canViewGoalRow(g, viewer, org));

  const editingGoal = params.edit ? nodeById.get(params.edit) ?? null : null;

  function buildHref(next: { tab?: string; edit?: string | null }) {
    const qs = new URLSearchParams();
    qs.set("tab", next.tab ?? tab);
    // 사용자가 실제로 고른 인사평가만 URL에 남긴다. 기본값으로 잡아둔 사이클을
    // 여기서 붙이면, 탭을 누르는 순간 "인사평가 선택" 상태가 돼 목표관리 화면이
    // 빈 평가 화면으로 바뀌어 버린다.
    if (selectedCycleId) qs.set("cycleId", selectedCycleId);
    const edit = next.edit === undefined ? undefined : next.edit;
    if (edit) qs.set("edit", edit);
    return `/platform/evaluation2?${qs.toString()}`;
  }

  const now = new Date();
  const counted = allNodes.filter(countsTowardProgress);
  const overallProgress =
    companyGoals.length > 0 ? weightedProgress(companyGoals) : averageProgress(counted);
  /*
    머리글의 건수는 «전사 목표»라는 제목 아래 붙으므로 전사목표만 센다.
    예전에는 네 층을 전부 세서, 전사목표 6건은 하나도 완료가 아닌데 «완료 1»이
    떴다 — 아래층 어딘가의 개인목표 한 건이었다. 옆의 «전사 종합 %»도 전사목표
    기준이라 이제 한 줄이 같은 것을 말한다.
  */
  const doneCount = companyGoals.filter((g) => g.status === "DONE" && !g.excluded).length;
  const excludedCount = companyGoals.filter((g) => g.excluded || g.targetExcluded).length;
  // 상위에 안 매달린 목표는 아무리 달성해도 전사 달성률을 못 움직인다.
  // 숫자가 안 오르는 가장 흔한 이유라 화면에 대놓고 알려준다.
  const unlinked = allNodes.filter(
    (g) =>
      GOAL_PARENT_LEVEL[g.level as GoalLevel] !== null && !g.parentId && canViewGoalRow(g, viewer, org)
  );
  const overdueCount = companyGoals.filter((g) => isOverdue(g, now) && !g.excluded).length;

  /**
   * 아래 안내문들은 **읽는 사람이 손댈 수 있는 것만** 센다.
   *
   * 전사 숫자를 그대로 띄우면 팀원 화면에 "합의 안 된 개인목표 12건" 같은 줄이
   * 뜨는데, 남의 목표라 할 수 있는 게 없다. 읽고 넘길 수밖에 없는 문장은
   * 안내가 아니라 화면을 먹는 글자다. 그래서 자기 범위(canViewGoalRow)로
   * 줄이고, 셀 게 없으면 줄 자체를 띄우지 않는다.
   */
  const myNodes = visibleRows(allNodes);

  // 담당자가 퇴사·부서이동했는데 아직 집계에 들어 있는 목표 — 빼는 건 관리자
  // 몫이라 관리자에게만 알린다.
  const needsReviewCount = myNodes.filter(
    (g) => !g.excluded && !g.targetExcluded && ownerFlag(g, now) && canExclude()
  ).length;

  // 합의 현황. 내가 승인해야 할 건과, 내 범위에서 아직 확정되지 않은 개인목표.
  const individualGoals = myNodes.filter(
    (g) => needsAgreement(g.level) && !g.excluded && !g.targetExcluded
  );
  const myTeamIdsForApproval = new Set(
    teams.filter((t) => t.leaderId === session!.user.id).map((t) => t.id)
  );
  const awaitingMyApproval = individualGoals.filter(
    (g) =>
      g.agreementStatus === "REQUESTED" &&
      (isAdmin || (g.teamId && myTeamIdsForApproval.has(g.teamId)))
  ).length;


  function canManage(goal: GoalNode): boolean {
    if (isAdmin) return true;
    if (goal.ownerId === session!.user.id) return true;
    const team = teams.find((t) => t.id === goal.teamId);
    return !!team && team.leaderId === session!.user.id;
  }

  /**
   * 집계 제외는 **관리자만**. 진척이 안 나오는 목표를 집계에서 빼면 팀·책임·
   * 전사 달성률이 조용히 올라가는데, 그 판단은 평가를 운영하는 쪽에서 한다.
   * 한때 팀장에게도 열어 뒀지만, 목표를 세우는 사람 손에 «내 숫자를 좋아
   * 보이게 하는 버튼»을 쥐여 주는 꼴이라 닫았다. 팀장·팀원 화면에는 수정과
   * 삭제만 남는다. 서버 액션(setGoalExcluded)도 같은 규칙으로 한 번 더 막는다.
   */
  function canExclude(): boolean {
    return isAdmin;
  }

  // ---- 상단 고정 전사목표 표 ---------------------------------------------

  /**
   * 화면 맨 위에 늘 붙어 있는 얇은 바. 탭·평가 연도(사이클)·종합 달성률만
   * 담아 높이를 최소로 줄인다 — 여기에 전사목표 표까지 붙여 두면 고정 영역이
   * 화면의 절반을 먹어서 아래 내용이 가려진다.
   */
  /**
   * 인사평가 선택 줄. 탭보다 위에 따로 둔다 — 어느 해를 보는지가 먼저이고,
   * 탭은 그 해 안에서 어느 층을 볼지의 문제다. 한 줄에 섞어 두면 둘이 같은
   * 무게로 보여서 순서가 읽히지 않는다.
   */
  function cycleBar() {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
        <span className="text-xs font-medium text-slate-500">인사평가</span>
        {cycles.length > 0 ? (
          <CycleSelect
            value={selectedCycleId}
            groups={[
              { label: null, options: [{ value: "", label: "선택" }] },
              ...groupCyclesByYear(cycles).map((g) => ({
                label: `${g.year}년`,
                options: g.items.map((c) => ({
                  value: c.id,
                  // 묶음 제목이 이미 "2026년"이라 안에서는 단계만 읽으면 된다.
                  label: `${cyclePhaseLabel(c)} (${
                    GOAL_CYCLE_STATUS_LABEL[c.status as GoalCycleStatus]
                  })`,
                })),
              })),
            ]}
          />
        ) : (
          <span className="text-xs text-slate-400">등록된 인사평가가 없습니다</span>
        )}

        {/*
          한 해의 목표는 「목표설정」에서 한 벌 세우고 중간평가·최종평가가 그것을
          이어서 본다. 앞 단계가 아직 마감되지 않았으면 그 말을 함께 적는다 —
          «이어받았다»는 말만 있으면 지금 보는 숫자가 확정된 것인지 아직 고치는
          중인 것인지 알 수 없다.
        */}
        {sharedFrom && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            「{sharedFrom.name}」의 목표를 이어받습니다{" "}
            {!sharedFrom.goalsLockedAt && (
              <span className="text-status-critical">· 아직 마감 전이라 내용이 바뀔 수 있습니다</span>
            )}
          </span>
        )}

        {isAdmin && (
          <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
            <Link
              href="/admin/org-goals"
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              조직 목표 관리
            </Link>
            <Link
              href="/admin/eval-targets"
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              평가대상자 관리
            </Link>
          </div>
        )}
      </div>
    );
  }

  /** 층 선택 탭. 고른 인사평가 안에서 어느 층을 볼지 정한다. */
  function tabBar() {
    return (
      <nav className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs shadow-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={buildHref({ tab: t.key })}
            className={`rounded-full px-3 py-1 transition-colors ${
              tab === t.key
                ? "bg-brand-green text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    );
  }

  function companyGoalBoard() {
    return (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
          <h1 className="text-sm font-bold whitespace-nowrap text-slate-900">
            {cycle ? `${cycle.year}년 전사 목표` : "전사 목표"}
          </h1>
          <div className="ml-auto flex items-center gap-3 whitespace-nowrap">
            <span className="text-[11px] text-slate-500">전사 종합</span>
            <span className="text-xl leading-none font-semibold tabular-nums text-slate-900">
              {overallProgress}
              <span className="ml-0.5 text-xs font-normal text-slate-400">%</span>
            </span>
            {/* 한 줄을 유지하려고 라벨과 값을 가로로 붙인다. */}
            <dl className="hidden items-center gap-2.5 text-xs text-slate-500 sm:flex">
              <div className="flex items-center gap-1">
                <dt>목표</dt>
                <dd className="font-semibold text-slate-800">{companyGoals.length}</dd>
              </div>
              <div className="flex items-center gap-1">
                <dt>완료</dt>
                <dd className="font-semibold text-slate-800">{doneCount}</dd>
              </div>
              <div className="flex items-center gap-1">
                <dt>지연</dt>
                <dd
                  className={`font-semibold ${
                    overdueCount > 0 ? "text-status-critical" : "text-slate-800"
                  }`}
                >
                  {overdueCount}
                </dd>
              </div>
              {excludedCount > 0 && (
                <div className="flex items-center gap-1">
                  <dt>제외</dt>
                  <dd className="font-semibold text-slate-400">{excludedCount}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* 표는 펼친 채로 연다. 자리가 아깝다 싶으면 머리글을 눌러 접는다. */}
        <details open>
          <summary className="flex cursor-pointer items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
            <span className="font-medium">전사 목표 {companyGoals.length}건</span>
            <span className="text-slate-400">· 눌러서 접기 / 펼치기</span>
          </summary>
        {companyGoals.length === 0 ? (
          <div className="border-t border-slate-200 px-5 py-6">
            <p className="text-sm text-slate-500">
              등록된 전사목표가 없습니다.
              {isAdmin && " 여기에 등록하면 이 자리에 고정되어 모두에게 보입니다."}
            </p>
            {isAdmin && cycle && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ActionForm
                  action={seedCompanyGoalTemplate.bind(null, goalCycleId ?? cycle.id)}
                  successMessage="조직 목표 양식을 넣었습니다."
                >
                  <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                    조직 단위별 목표 양식으로 채우기
                  </button>
                </ActionForm>
                <Link
                  href={buildHref({ tab: "company" })}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  하나씩 직접 등록
                </Link>
                <span className="text-xs text-slate-500">
                  제품기획마케팅 · 영업고객관리 · 기술연구 · 생산 · 재무경영관리 다섯 줄이 한 번에
                  들어갑니다. 내용은 등록 후 수정하세요.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-1.5 text-left text-xs font-semibold">목표</th>
                  <th className="w-56 px-4 py-1.5 text-left text-xs font-semibold">달성률</th>
                </tr>
              </thead>
              <tbody>
                {companyGoals.map((g, i) => {
                  return (
                    <tr
                      key={g.id}
                      className={`border-t border-slate-100 align-top ${
                        i % 2 === 1 ? "bg-slate-50/70" : ""
                      }`}
                    >
                      <td className="px-4 py-2">
                        {/*
                          전사목표 줄은 누르는 자리가 아니다. 한때 눌러서 «이
                          갈래만 보기»로 걸러 줬는데, 한 번 누르면 아직 아무것도
                          안 달린 책임목표가 나와 비어 보이고 다시 눌러야 원래
                          화면으로 돌아와서, 화면이 왜 바뀌었는지 알기 어려웠다.
                          아래 층과의 연결(달성률이 굴러 올라오는 것)은 그대로다.
                          전사목표를 고치는 일은 관리자 화면에서 한다.
                        */}
                        <div className="flex items-start gap-1.5">
                          {/* 구분 칸을 없앤 대신 순번만 남긴다. 표가 목표와 달성률
                              두 칸이라, 몇 번째 줄인지는 여기서 붙여 준다. */}
                          <span className="w-5 shrink-0 pt-0.5 text-xs text-slate-400">
                            {i + 1}.
                          </span>
                          <span className="font-medium text-slate-800">{goalTitle(g)}</span>
                        </div>
                        {/* 기타 자리에는 지표도 설명도 붙이지 않는다 — 담아 두는
                            칸이지 그 자체로 세운 목표가 아니다. */}
                        {!g.isOther && (g.metric || g.targetValue || g.description) && (
                          <p className="mt-0.5 pl-5 text-xs text-slate-500">
                            {[
                              g.metric,
                              g.targetValue ? `목표 ${g.targetValue}` : null,
                              g.description,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Meter value={g.rollupProgress} size="md" />
                          <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
                            {g.rollupProgress}%
                          </span>
                        </div>
                        {/*
                          막대와 % 말고는 지연 배지만 남긴다. "완료" 배지는 막대가
                          이미 100%로 말하고 있고, "하위 N건 가중평균"은 어차피
                          모든 전사목표가 그렇게 계산되는 값이라 줄마다 반복할
                          이유가 없다. 표는 목표와 달성률 두 칸이 전부다.
                        */}
                        {isOverdue(g, now) && (
                          <div className="mt-1">
                            <OverdueBadge />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
        )}

        {/*
          여기 남는 건 "지금 뭔가 어긋나 있고, 이렇게 고치면 된다"는 세 줄뿐이다.
          설명문·안내문 종류는 전부 뺐다 — 아무도 손댈 게 없는 문장이 표 아래
          붙어 있으면 읽히지도 않으면서 고정 영역만 먹는다. 세 줄 모두 읽는
          사람이 실제로 할 수 있는 일일 때만, 그 사람 범위의 건수로만 뜬다.
        */}
        {(unlinked.length > 0 || needsReviewCount > 0 || awaitingMyApproval > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-2.5">
            <div className="space-y-1 text-xs text-slate-500">
              {awaitingMyApproval > 0 && (
                <p className="font-medium text-brand-green-dark">
                  합의를 기다리는 개인목표 {awaitingMyApproval}건이 있습니다 — 개인목표 탭에서
                  승인하거나 되돌릴 수 있습니다.
                </p>
              )}
              {needsReviewCount > 0 && (
                <p className="text-amber-700">
                  담당자가 퇴사했거나 부서를 옮긴 목표 {needsReviewCount}건이 아직 집계에 들어
                  있습니다 — 해당 목표에서 「집계 제외」를 눌러 빼실 수 있습니다.
                </p>
              )}
              {unlinked.length > 0 && (
                <p className="text-status-critical">
                  상위 목표에 연결되지 않은 목표 {unlinked.length}건은 전사 달성률에 반영되지
                  않습니다 — 해당 목표를 열어 「상위 목표」를 지정해 주세요.
                </p>
              )}
            </div>
          </div>
        )}
        </details>
      </section>
    );
  }

  // ---- 한 줄 보드: 책임 · 팀 · 개인 ---------------------------------------

  function LevelSummaryCard({ level }: { level: GoalLevel }) {
    const nodes = byLevel(level);
    const counted = nodes.filter(countsTowardProgress);
    const done = nodes.filter((g) => g.status === "DONE" && !g.excluded).length;
    const overdue = nodes.filter((g) => isOverdue(g, now) && !g.excluded).length;
    // 전사 목표는 사이클 전체를 대표하는 값이라 가중평균, 나머지 층은 그 층에
    // 속한 목표들의 평균을 쓴다.
    const percent =
      level === "COMPANY"
        ? nodes.length > 0
          ? weightedProgress(nodes)
          : 0
        : averageProgress(nodes);

    const href =
      level === "COMPANY" ? "/admin/org-goals" : buildHref({ tab: level.toLowerCase() });
    const linkable = level !== "COMPANY" || isAdmin;

    const body = (
      <>
        <div className="flex items-center gap-2">
          <LevelDot level={level} />
          <h2 className="text-sm font-semibold text-slate-800">{GOAL_LEVEL_LABEL[level]}</h2>
        </div>

        <div className="relative mt-4 flex items-center justify-center">
          <ProgressDonut value={percent} color={LEVEL_COLOR[level]} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl leading-none font-semibold tabular-nums text-slate-900">
              {percent}
              <span className="ml-0.5 text-base font-normal text-slate-400">%</span>
            </span>
            <span className="mt-1 text-[11px] text-slate-500">
              {level === "COMPANY" ? "가중평균" : "평균 달성률"}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-1 border-t border-slate-100 pt-3 text-center">
          <div>
            <dt className="text-[11px] text-slate-500">전체</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-800">{counted.length}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">완료</dt>
            <dd className="text-lg font-semibold tabular-nums text-brand-green-dark">{done}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">지연</dt>
            <dd
              className={`text-lg font-semibold tabular-nums ${
                overdue > 0 ? "text-status-critical" : "text-slate-400"
              }`}
            >
              {overdue}
            </dd>
          </div>
        </dl>
      </>
    );

    const className = `${CARD_CLASS} flex flex-col p-5`;

    return linkable ? (
      <Link href={href} className={`${className} transition-colors hover:border-brand-green`}>
        {body}
      </Link>
    ) : (
      <div className={className}>{body}</div>
    );
  }

  function GoalFormFields({
    level,
    goal,
    parentOptions,
  }: {
    level: GoalLevel;
    goal?: GoalNode | null;
    parentOptions: GoalNode[];
  }) {
    const parentLevel = GOAL_PARENT_LEVEL[level];
    const isTeam = usesScales(level);
    const isOkr = usesKeyResults(level);
    const req = level !== "COMPANY";
    // 이 사이클이 속한 해의 말일. 마감일 기본값이다.
    const yearEnd = `${cycle?.year ?? new Date().getFullYear()}-12-31`;

    /*
      팀·책임자 칸은 **고를 수 있는 사람에게만** 띄운다.

      관리자가 아니면 서버가 어차피 로그인한 사람 기준으로 다시 정한다 —
      개인목표의 담당자는 본인, 팀목표의 팀은 본인이 이끄는 팀만 통과하고,
      수정할 때 소속은 관리자만 건드린다. 그러니 팀장·팀원에게 이 칸은
      골라도 결과가 안 바뀌는 장식이라 아예 없앴다.

      예외는 팀을 둘 이상 이끄는 팀장이다. 그때만 어느 팀 목표인지 사람만
      알기 때문에 팀 칸을 남긴다.
    */
    const showTeam =
      (level === "TEAM" || level === "INDIVIDUAL") &&
      (isAdmin || (level === "TEAM" && viewer.ledTeamIds.length > 1));
    const showOwner = isAdmin;
    const ownerLabel = level === "INDIVIDUAL" ? "담당자" : "책임자";

    /*
      이 목표를 누가 평가하게 되는지 폼에서 미리 보여 준다. 조직도에서 따라
      올라간 값이라 고르는 칸이 아니고, 목표를 세우는 사람이 «누가 이걸 볼
      것인가»를 알고 적도록 띄우는 줄이다. 아직 등록 전이라 담당자가 정해지지
      않았으면 로그인한 사람 기준으로 보여 준다 — 어차피 그 사람 목표가 된다.
    */
    const formOwnerId = goal?.ownerId ?? session!.user.id;
    const formEvaluator = evaluatorByPerson.get(formOwnerId) ?? null;
    const evaluatorLine = (
      <div className="md:col-span-2">
        <label className={LABEL_CLASS}>평가자</label>
        <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
          {formEvaluator
            ? `${evaluatorLabel(formEvaluator)} — 조직도에서 자동으로 정해집니다`
            : "조직도에서 평가자를 찾지 못했습니다 (팀장·책임이 지정되어 있는지 확인해 주세요)"}
        </p>
      </div>
    );
    const assignment =
      showTeam || showOwner ? (
        <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
          {showTeam && (
            <div>
              <label className={LABEL_CLASS}>팀</label>
              <SearchableSelect
                name="teamId"
                options={teamOptions}
                defaultValue={goal?.teamId ?? ""}
                placeholder="팀 검색"
                required
              />
            </div>
          )}
          {showOwner && (
            <div>
              <label className={LABEL_CLASS}>{ownerLabel}</label>
              <SearchableSelect
                name="ownerId"
                options={personOptions}
                defaultValue={goal?.ownerId ?? ""}
                placeholder="이름 검색"
                required={req}
              />
            </div>
          )}
        </div>
      ) : null;

    const title = (
      <div className={isTeam ? undefined : "md:col-span-2"}>
        {/* 팀목표는 사내 "팀 목표 설정" 양식의 칸 이름을 그대로 쓴다 — 화면과
            보고서에서 다른 말을 쓰면 옮겨 적을 때마다 짝을 맞춰야 한다. */}
        <label className={LABEL_CLASS}>
          {isTeam ? "핵심 업무 목표" : isOkr ? "Objective (목표)" : "목표명"}
        </label>
        <input name="title" defaultValue={goal?.title ?? ""} required className={INPUT_CLASS} />
      </div>
    );

    /*
      상위 목록에서 「기타」 묶음은 뺀다. 자동으로 만들어지는 자리라 "기타(책임
      미지정)" 같은 이름으로 목록에 끼어 있었는데, 바로 아래 「기타」 항목과
      결과가 똑같으면서 이름만 달라 어느 쪽을 고를지 망설이게 했다. 고르는 길은
      하나면 된다. 이미 기타에 매달린 목표를 고칠 때는 그 「기타」 항목이
      골라진 것으로 보여 준다.
    */
    const currentParent = goal?.parentId ? (nodeById.get(goal.parentId) ?? null) : null;
    const parentIsOther = !!currentParent?.isOther;
    /*
      지금 매달려 있는 상위가 내가 볼 수 있는 범위 밖일 수 있다 — 다른 부문의
      책임목표에 걸린 팀목표가 그렇다. 그때 목록에 그 항목이 없으면 select가
      빈 값이 되고, 필수 칸이라 저장 버튼이 아무 말 없이 안 먹는다. 카드에는
      이미 그 이름이 «상위: …»로 보이고 있으므로 목록에도 넣어 준다.
    */
    const parentChoices = parentOptions.filter((p) => !p.isOther);
    if (currentParent && !parentIsOther && !parentChoices.some((p) => p.id === currentParent.id)) {
      parentChoices.push(currentParent);
    }
    const parent = parentLevel && (
      <div className={isTeam ? "md:col-span-2" : undefined}>
        <label className={LABEL_CLASS}>상위 {GOAL_LEVEL_LABEL[parentLevel]}</label>
        <select
          name="parentId"
          defaultValue={parentIsOther ? OTHER_PARENT_VALUE : (goal?.parentId ?? "")}
          required
          className={INPUT_CLASS}
        >
          <option value="">선택</option>
          {parentChoices.map((p) => (
            <option key={p.id} value={p.id}>
              {/* 소속은 그게 어느 조직 목표인지 갈라 줄 때만 붙인다.
                  전사목표는 전부 "(전사)"가 되어 아무것도 구별해 주지
                  못하면서 제목만 길게 만든다. */}
              {p.level === "COMPANY" ? p.title : `${p.title} (${scopeText(p)})`}
            </option>
          ))}
          {/*
            위 층 어디에도 딱 붙지 않는 일을 담는 자리. 상위를 비워 두면
            아무리 달성해도 전사 달성률이 안 움직이므로, 층마다 「기타」
            한 칸을 두고 거기에 매단다(없으면 자동으로 만들어진다).
          */}
          <option value={OTHER_PARENT_VALUE}>기타 (딱 맞는 상위 목표가 없을 시)</option>
        </select>
      </div>
    );

    const metric = (
      <div>
        <label className={LABEL_CLASS}>{isTeam ? "성과지표(KPI)" : "측정지표"}</label>
        <input
          name="metric"
          defaultValue={goal?.metric ?? ""}
          placeholder="예: 신규 거래처 수"
          required={req}
          className={INPUT_CLASS}
        />
      </div>
    );

    const currentValue = (
      <div>
        <label className={LABEL_CLASS}>{isTeam ? "목표수준 · 현수준" : "현재수준"}</label>
        <input
          name="currentValue"
          defaultValue={goal?.currentValue ?? ""}
          placeholder="아직 없으면 0"
          required={req}
          className={INPUT_CLASS}
        />
      </div>
    );

    const targetValue = (
      <div>
        <label className={LABEL_CLASS}>{isTeam ? "목표수준 · 목표치" : "목표수준"}</label>
        <input
          name="targetValue"
          defaultValue={goal?.targetValue ?? ""}
          required={req}
          className={INPUT_CLASS}
        />
      </div>
    );

    const weight = (
      <div>
        <label className={LABEL_CLASS}>{isTeam || isOkr ? "가중치(비중, %)" : "가중치(%)"}</label>
        {usesDerivedWeight(level) ? (
          <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
            담당자 한 사람이 100씩, 그 합으로 자동 계산됩니다 (직접 입력하지 않습니다)
          </p>
        ) : (
        <input
          type="number"
          name="weight"
          min={0}
          max={100}
          step={1}
          defaultValue={goal?.weight ?? 0}
          required={req}
          className={INPUT_CLASS}
        />
        )}
      </div>
    );

    const scales = (
      <div className="md:col-span-2">
        {/* 등급별로 "어디까지 해야 그 등급인지"를 목표 세울 때 못박는다.
            연말에 가서 정하면 사람마다 다르게 읽는다. */}
        <label className={LABEL_CLASS}>
          평가척도 <HelpMark text="등급별로 «어디까지 해야 그 등급인지»를 목표 세울 때 적어 둡니다. 연말에 가서 정하면 사람마다 다르게 읽습니다. 예) S: 3천만원 이상 절감 / A: 2천만원 이상 절감" />
        </label>
        <div className="grid gap-2 sm:grid-cols-5">
          {GOAL_SCALES.map((sc) => (
            <div key={sc.field}>
              <div className="mb-1 rounded-t-md bg-slate-100 px-2 py-1 text-center text-xs font-semibold text-slate-700">
                {sc.grade}
                <span className="ml-0.5 font-normal text-slate-500">({sc.score})</span>
              </div>
              <textarea
                name={sc.field}
                rows={2}
                defaultValue={goal?.[sc.field] ?? ""}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-green focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>
    );

    const formula = (
      <div className="md:col-span-2">
        <label className={LABEL_CLASS}>산출식/방안</label>
        <input
          name="formula"
          defaultValue={goal?.formula ?? ""}
          placeholder="예: 절감액, 만족도Survey, 연내 최종 승인 보고서"
          className={INPUT_CLASS}
        />
      </div>
    );

    const status = (
      <div>
        <label className={LABEL_CLASS}>상태</label>
        <select name="status" defaultValue={goal?.status ?? "ACTIVE"} className={INPUT_CLASS}>
          {GOAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {GOAL_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    );

    const progress = (
      <div>
        <label className={LABEL_CLASS}>달성률(%)</label>
        {!canWriteProgress ? (
          <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
            목표설정 단계에서는 적지 않습니다 (중간평가·최종평가에서 입력)
          </p>
        ) : isAutoCalculated(level) ? (
          <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
            하위 목표에서 자동 계산됩니다 (직접 입력하지 않습니다)
          </p>
        ) : (
          <input
            type="number"
            name="progress"
            min={0}
            max={100}
            step={1}
            defaultValue={goal?.progress ?? 0}
            required
            className={INPUT_CLASS}
          />
        )}
      </div>
    );

    /*
      마감일은 그 해 12월 31일이 기본값이되 고칠 수 있다. 목표는 한 해
      단위로 세우고 연말에 결산하므로 열에 아홉은 12월 31일인데, 연중에
      끝나는 목표도 있으니 못박지는 않는다.
    */
    const dueDate = (
      <div>
        <label className={LABEL_CLASS}>마감일</label>
        <input
          type="date"
          name="dueDate"
          defaultValue={toDateInputValue(goal?.dueDate ?? null) || yearEnd}
          required={req}
          className={INPUT_CLASS}
        />
      </div>
    );

    const description = (
      <div className="md:col-span-2">
        <label className={LABEL_CLASS}>설명</label>
        <textarea
          name="description"
          rows={2}
          defaultValue={goal?.description ?? ""}
          className={INPUT_CLASS}
        />
      </div>
    );

    /*
      사내 「팀 목표 설정」 양식이 읽히는 차례 그대로 줄을 나눈다. 상위
      책임목표가 맨 위인 건 "무엇에 딸린 일인지"를 먼저 정하고 내용을 적는
      순서라서다 — 아래에 있으면 다 적고 나서야 상위를 고르게 된다.
    */
    if (isTeam) {
      const line = (key: string, children: ReactNode) => (
        <div key={key} className="grid gap-3 md:col-span-2 md:grid-cols-2">
          {children}
        </div>
      );
      return (
        <>
          {line("parent", parent)}
          {line("what", <>{title}{metric}</>)}
          {line("level", <>{currentValue}{targetValue}</>)}
          {line("weight", weight)}
          {line("scale", <>{scales}{formula}</>)}
          {line("progress", <>{status}{progress}</>)}
          {line("due", dueDate)}
          {line("evaluator", evaluatorLine)}
          {assignment}
          {line("desc", description)}
        </>
      );
    }

    return (
      <>
        {title}

        {isOkr && (
          <div>
            {/* 유형을 안 적게 하면 개인목표가 전부 업무목표로만 찬다. */}
            <label className={LABEL_CLASS}>목표 유형</label>
            <select
              name="goalType"
              defaultValue={goal?.goalType ?? "업무목표"}
              required
              className={INPUT_CLASS}
            >
              {GOAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}

        {isOkr && (
          <div className="md:col-span-2">
            <label className={LABEL_CLASS}>
              Key Results (핵심결과){" "}
              <span className="text-slate-400">— 한 줄에 하나씩. ① ② ③ 으로 번호가 붙습니다</span>
            </label>
            <textarea
              name="keyResults"
              rows={3}
              defaultValue={goal?.keyResults ?? ""}
              required
              placeholder={"타사 적정인원/팀 사례 분석\n적정 팀 구성 분석"}
              className={INPUT_CLASS}
            />
          </div>
        )}

        {parent}

        {level === "DIVISION" && (
          <div>
            <label className={LABEL_CLASS}>책임</label>
            <select
              name="division"
              defaultValue={goal?.division ?? ""}
              required
              className={INPUT_CLASS}
            >
              <option value="">선택</option>
              {divisions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {evaluatorLine}
        {assignment}

        {/*
          책임목표에는 가중치·측정지표를 두지 않는다. 책임목표는 아래 팀
          목표가 굴러 올라온 값이라 지표를 따로 적을 일이 없고, 가중치를 비우면
          가중평균이 형제끼리 동일가중으로 떨어져서 부문 간 비중이 저절로
          같아진다 — 지금은 그게 맞는 기본값이다.
        */}
        {level !== "DIVISION" && weight}
        {/*
          지표·목표수준·현재수준은 팀목표에만 있다. 책임목표는 아래 팀목표가
          굴러 올라온 값이고, 개인목표는 Key Results가 «무엇을 어디까지»를
          이미 적고 있어서(사내 「개인목표 설정」 양식) 같은 걸 두 번 적게 된다.
          여기 오는 층은 책임·개인뿐이므로 둘 다 띄우지 않는다.
        */}

        {progress}
        {status}
        {dueDate}
        {description}
      </>
    );
  }

  function GoalRowCard({ goal }: { goal: GoalNode }) {
    const level = goal.level as GoalLevel;
    const parent = goal.parentId ? nodeById.get(goal.parentId) : null;
    // 마감 상태를 여기서 한 번에 반영한다. 진척은 목표 확정 뒤에도 올리고,
    // 목표 내용·삭제·집계 제외는 확정되면 잠긴다.
    const canTouchProgress = canManage(goal) && lock.canEditProgress;
    const editable = canManage(goal) && lock.canEditGoals;
    const isEditing = editingGoal?.id === goal.id;
    const parentLevel = GOAL_PARENT_LEVEL[level];
    // 상위 목표 후보도 볼 수 있는 범위 안에서만 고르게 한다.
    const parentOptions = parentLevel ? visibleRows(byLevel(parentLevel)) : [];
    const flag = ownerFlag(goal, now);
    const agreement = asAgreementStatus(goal.agreementStatus);
    const evaluator = goal.ownerId ? (evaluatorByPerson.get(goal.ownerId) ?? null) : null;
    const isOwner = goal.ownerId === session!.user.id;
    const canApprove =
      isAdmin || teams.some((t) => t.id === goal.teamId && t.leaderId === session!.user.id);
    const agreementActions =
      needsAgreement(goal.level) && (isOwner || canApprove) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <span className="text-[11px] font-medium text-slate-500">합의</span>
          {isOwner && agreement !== "AGREED" && agreement !== "REQUESTED" && (
            <ActionForm
              action={requestGoalAgreement.bind(null, goal.id)}
              successMessage="팀장에게 합의를 요청했습니다."
            >
              <button
                type="submit"
                className="rounded-md bg-brand-green px-3 py-1 text-xs font-medium text-white hover:bg-brand-green-dark"
              >
                팀장에게 합의 요청
              </button>
            </ActionForm>
          )}
          {isOwner && agreement === "REQUESTED" && (
            <span className="text-[11px] text-slate-500">팀장 승인 대기 중입니다.</span>
          )}
          {canApprove && agreement === "REQUESTED" && (
            <ActionForm
              action={approveGoalAgreement.bind(null, goal.id)}
              successMessage="합의를 완료했습니다."
              className="flex items-center gap-1"
            >
              <input
                name="agreementNote"
                placeholder="합의 메모 (선택)"
                aria-label="합의 메모"
                className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                type="submit"
                className="rounded-md bg-brand-green px-3 py-1 text-xs font-medium text-white hover:bg-brand-green-dark"
              >
                합의 승인
              </button>
            </ActionForm>
          )}
          {canApprove && agreement === "REQUESTED" && (
            <ActionForm
              action={returnGoalAgreement.bind(null, goal.id)}
              successMessage="담당자에게 되돌렸습니다."
              className="flex items-center gap-1"
            >
              <input
                name="agreementNote"
                placeholder="되돌리는 사유"
                aria-label="되돌리는 사유"
                required
                className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                type="submit"
                className="rounded-md border border-red-200 px-3 py-1 text-xs text-status-critical hover:bg-red-50"
              >
                되돌리기
              </button>
            </ActionForm>
          )}
          {canApprove && agreement === "AGREED" && (
            <ActionForm
              action={reopenGoalAgreement.bind(null, goal.id)}
              successMessage="합의를 해제했습니다. 수정 후 다시 요청하면 됩니다."
            >
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-white"
              >
                합의 해제
              </button>
            </ActionForm>
          )}
          {isOwner && agreement === "AGREED" && !canApprove && (
            <span className="text-[11px] text-slate-500">
              합의 완료 — 고치려면 팀장에게 합의 해제를 요청하세요.
            </span>
          )}
        </div>
      ) : null;

    return (
      <div
        className={`${CARD_CLASS} border-l-2 p-4 ${GOAL_LEVEL_RAMP_BORDER[level]} ${
          goal.excluded || goal.targetExcluded ? "opacity-60" : ""
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <LevelDot level={level} />
          <span className="text-sm font-medium text-slate-800">{goalTitle(goal)}</span>
          {/*
            책임목표에는 부문 이름을 붙이지 않는다. 책임목표 탭은 그 자체가
            부문별 목록이라 «재무경영관리»가 줄마다 되풀이될 뿐이고, 정작 읽어야
            할 목표 이름 옆자리를 먹는다. 팀목표의 팀 이름과 개인목표의 담당자
            이름은 남긴다 — 여러 팀·여러 사람 것이 한 목록에 섞여 나오므로 그건
            누구 목표인지 가려 주는 유일한 표시다.
          */}
          {/*
            소속은 개인목표에만 붙인다 — 한 목록에 여러 사람 것이 섞여 나오므로
            누구 목표인지 가려 주는 유일한 표시다. 책임목표·팀목표는 그 탭 자체가
            부문별·팀별 목록이라 줄마다 같은 이름이 되풀이될 뿐이다.
          */}
          {level === "INDIVIDUAL" && (
            <span className="text-xs text-slate-500">{scopeText(goal)}</span>
          )}
          <StatusBadge status={goal.status} />
          {isOverdue(goal, now) && <OverdueBadge />}
          {needsAgreement(goal.level) && <AgreementBadge status={goal.agreementStatus} />}
          {goal.goalType && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                GOAL_TYPE_BADGE_CLASS[goal.goalType] ?? "bg-slate-100 text-slate-700"
              }`}
            >
              {goal.goalType}
            </span>
          )}
          {goal.excluded && <ExcludedBadge reason={goal.excludeReason} />}
          {!goal.excluded && goal.targetExcluded && (
            <ExcludedBadge reason={goal.targetExcludeReason ?? "평가대상 아님"} />
          )}
          {flag && !goal.excluded && !goal.targetExcluded && <OwnerFlagBadge label={flag.label} />}
          <span className="ml-auto flex items-center gap-2">
            {/*
              «왜 0%인지»는 숫자 바로 옆에 있어야 읽힌다. 아래 버튼 줄에 두면
              숫자와 설명이 멀어서 0%만 보고 «고장인가»가 된다. 0%가 아닐 때는
              설명할 것이 없으므로 띄우지 않는다.
            */}
            {isAutoCalculated(level) && goal.rollupProgress === 0 && (
              <span className="text-xs font-normal text-slate-500">하위 목표가 없어 0%입니다</span>
            )}
            <span className="text-sm font-semibold tabular-nums text-slate-700">
              {goal.rollupProgress}%
            </span>
          </span>
        </div>

        <div className="mt-2">
          <Meter value={goal.rollupProgress} size="md" />
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {parent && (
            <span>
              상위: {parent.title} ({GOAL_LEVEL_LABEL[parent.level as GoalLevel]})
            </span>
          )}
          {!parent && parentLevel && <span className="text-status-critical">상위 목표 미연결</span>}
          {/*
            팀목표는 굴려 올린 몫(사람 수 × 100)을, 개인목표는 **사람이 적어 넣은
            값 그대로**를 보여 준다. 개인목표에 펴 놓은 몫을 띄우면 30을 적었는데
            60으로 보여서 «내가 적은 게 아닌데»가 된다.
          */}
          {(usesDerivedWeight(level) ? Math.round(goal.rollupWeight) : goal.weight) > 0 && (
            <span>
              가중치 {usesDerivedWeight(level) ? Math.round(goal.rollupWeight) : goal.weight}%
            </span>
          )}
          {/*
            평가자는 조직도에서 따라 올라가 정한다 — 담당은 팀장, 팀장은 책임,
            책임은 운영책임. 목표를 세울 때 «누가 이걸 볼 것인가»가 보여야
            무엇을 어디까지 적을지 정할 수 있다.
          */}
          {evaluator && <span>평가자: {evaluatorLabel(evaluator)}</span>}
          {/*
            이 줄에는 «상위 목표»와 «가중치»만 둔다. 지표·목표수준·현수준·산출식·
            마감일·하위 건수까지 늘어놓으면 한 줄이 화면을 가로질러서, 정작 이
            목표가 무엇에 딸려 있고 얼마나 무거운지가 안 읽힌다. 자세한 값은
            «수정»을 눌러 폼에서 본다. 늦은 목표는 제목 옆 «지연» 배지가 알려 준다.
          */}
        </div>

        {/*
          Key Results. 양식과 같이 ① ② ③ 으로 번호를 붙여 늘어놓는다 — 목표
          제목만으로는 "무엇을 해냈다고 볼지"가 안 보인다.
        */}
        {usesKeyResults(level) && keyResultLines(goal.keyResults).length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
            {keyResultLines(goal.keyResults).map((line, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="shrink-0 text-slate-400">{circledNumber(i)}</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}

        {/*
          평가척도. 사내 양식과 같은 다섯 칸을 그대로 늘어놓는다 — 등급 기준은
          목표를 볼 때 같이 보여야 "이 정도면 몇 등급인가"를 매번 다시 묻지 않는다.
          한 칸도 안 채웠으면 빈 표를 띄우지 않는다.
        */}
        {usesScales(level) && scaleValues(goal).some((sc) => sc.value) && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed border-collapse text-xs">
              <thead>
                <tr>
                  {GOAL_SCALES.map((sc) => (
                    <th
                      key={sc.field}
                      className="border border-slate-200 bg-slate-100 px-2 py-1 font-semibold text-slate-700"
                    >
                      {sc.grade}
                      <span className="ml-0.5 font-normal text-slate-500">({sc.score})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {scaleValues(goal).map((sc) => (
                    <td
                      key={sc.field}
                      className="border border-slate-200 px-2 py-1.5 align-top text-slate-600"
                    >
                      {sc.value || <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {goal.description && <p className="mt-2 text-xs text-slate-600">{goal.description}</p>}

        {needsAgreement(goal.level) && goal.agreementNote && (
          <p
            className={`mt-2 rounded-md px-2 py-1 text-xs ${
              agreement === "RETURNED"
                ? "bg-status-critical/10 text-status-critical"
                : "bg-slate-50 text-slate-600"
            }`}
          >
            {agreement === "RETURNED" ? "되돌린 사유: " : "합의 메모: "}
            {goal.agreementNote}
          </p>
        )}
        {agreement === "AGREED" && goal.agreedAt && (
          <p className="mt-1 text-[11px] text-slate-400">
            {goal.agreedBy?.name ?? "팀장"} 합의 · {formatKSTDate(goal.agreedAt)}
          </p>
        )}

        {agreementActions}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canTouchProgress && canWriteProgress && !isAutoCalculated(level) && (
            <ActionForm
              action={addGoalCheckIn}
              successMessage="진척이 반영되었습니다."
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="goalId" value={goal.id} />
              <input type="hidden" name="viewCycleId" value={cycle?.id ?? ""} />
              <input
                type="number"
                name="progress"
                min={0}
                max={100}
                defaultValue={goal.progress}
                aria-label="달성률"
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
              <input
                name="currentValue"
                placeholder="현재수준"
                aria-label="현재수준"
                className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
              <input
                name="note"
                placeholder="진척 메모"
                aria-label="진척 메모"
                className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                type="submit"
                className="rounded-md bg-brand-green px-3 py-1 text-xs font-medium text-white hover:bg-brand-green-dark"
              >
                진척 반영
              </button>
            </ActionForm>
          )}
          {/*
            고치고 지우는 버튼은 오른쪽 끝에 모은다 — 왼쪽은 «지금 어떤 상태인가»
            (합의·진척)를 읽는 자리이고, 오른쪽은 «내가 무엇을 할 수 있나»를
            누르는 자리다. 섞여 있으면 읽는 도중에 버튼이 끼어든다.
          */}
          {editable && (
            <Link
              href={buildHref({ edit: isEditing ? null : goal.id })}
              className="ml-auto rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
            >
              {isEditing ? "수정 닫기" : "수정"}
            </Link>
          )}
          {canExclude() && lock.canEditProgress && (
            <ActionForm
              action={setGoalExcluded.bind(null, goal.id, !goal.excluded)}
              successMessage={goal.excluded ? "집계에 다시 포함했습니다." : "집계에서 제외했습니다."}
              className="flex items-center gap-1"
            >
              {!goal.excluded && (
                <input
                  name="excludeReason"
                  defaultValue={flag ? `담당자 ${flag.label}` : ""}
                  placeholder="제외 사유"
                  aria-label="집계 제외 사유"
                  className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
              )}
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
              >
                {goal.excluded ? "집계에 포함" : "집계 제외"}
              </button>
            </ActionForm>
          )}
          {editable && (
            <ActionForm action={deleteGoal.bind(null, goal.id)} successMessage="삭제되었습니다.">
              <button
                type="submit"
                className="rounded-md border border-red-200 px-3 py-1 text-xs text-status-critical hover:bg-red-50"
              >
                삭제
              </button>
            </ActionForm>
          )}
        </div>

        {isEditing && (
          <ActionForm
            action={updateGoal}
            successMessage="수정되었습니다."
            className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2"
          >
            <input type="hidden" name="goalId" value={goal.id} />
            {/* 지금 어느 평가를 통해 고치는 중인지. 달성률을 적을 수 있는
                단계인지가 여기서 갈린다 — 목표는 한 벌이고 중간·최종평가가
                그걸 빌려 보기 때문에 목표가 저장된 사이클만으로는 알 수 없다. */}
            <input type="hidden" name="viewCycleId" value={cycle?.id ?? ""} />
            <GoalFormFields level={level} goal={goal} parentOptions={parentOptions} />
            <div className="md:col-span-2">
              <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                저장
              </button>
            </div>
          </ActionForm>
        )}
      </div>
    );
  }

  function levelTab(level: GoalLevel) {
    const parentLevel = GOAL_PARENT_LEVEL[level];
    // 상위 목표 후보도 볼 수 있는 범위 안에서만 고르게 한다.
    const parentOptions = parentLevel ? visibleRows(byLevel(parentLevel)) : [];
    // 직책에 따라 볼 수 있는 조직 범위로 먼저 줄인다(관리자·사장은 전부).
    const rows = visibleRows(byLevel(level));

    /*
      사내 양식의 «소계». 사람이 적어 넣은 값(`weight`)으로 센다 — 화면이 집계에
      쓰는 몫(`rollupWeight`)은 사람마다 100으로 펴 놓은 값이라 그걸로 세면 늘
      100이 나와서 덜 채운 사람을 못 잡는다.

      소계는 **사람 단위**로만 뜻이 있다. 팀장이 팀원 다섯 명 것을 한 화면에서
      보면 다 더해 500%가 되는데, 거기에 «100%로 맞춰 주세요»를 붙이면 맞출 수
      없는 걸 맞추라는 말이 된다. 그래서 한 사람 것만 보고 있을 때는 그 사람의
      소계를, 여러 사람이 섞여 있을 때는 «아직 100%가 아닌 사람 몇 명»을 띄운다.
    */
    const weightByOwner = new Map<string, number>();
    for (const g of rows) {
      const key = g.ownerId ?? g.id;
      weightByOwner.set(key, (weightByOwner.get(key) ?? 0) + (g.weight > 0 ? g.weight : 0));
    }
    const owners = [...weightByOwner.values()];
    const weightSum = Math.round(owners[0] ?? 0);
    const ownersOffTarget = owners.filter((sum) => Math.round(sum) !== 100).length;

    const canCreate =
      lock.canEditGoals &&
      (isAdmin ||
        level === "INDIVIDUAL" ||
        (level === "TEAM" && teams.some((t) => t.leaderId === session!.user.id)));

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <LevelDot level={level} />
          <h2 className="text-lg font-semibold">{GOAL_LEVEL_LABEL[level]}</h2>
          <span className="text-sm text-slate-500">{rows.length}건</span>
          <span className="text-sm text-slate-500">평균 달성률 {averageProgress(rows)}%</span>
          {/*
            사내 양식의 "소계" 줄. 가중치 합이 100이어야 비중이 의도대로 먹는데,
            줄마다 숫자를 눈으로 더하게 두면 아무도 확인하지 않는다. 100이 아닐
            때만 눈에 띄게 표시한다.
          */}
          {usesWeightSubtotal(level) && rows.length > 0 && owners.length === 1 && (
            <span
              className={`text-sm ${
                weightSum === 100 ? "text-slate-500" : "font-medium text-status-critical"
              }`}
            >
              가중치 소계 {weightSum}%
              {weightSum !== 100 && " — 100%로 맞춰 주세요"}
            </span>
          )}
          {usesWeightSubtotal(level) && owners.length > 1 && ownersOffTarget > 0 && (
            <span className="text-sm font-medium text-status-critical">
              가중치 소계가 100%가 아닌 사람 {ownersOffTarget}명
            </span>
          )}
        </div>

        {canCreate && cycle && (
          <details className={`${CARD_CLASS} p-5`}>
            <summary className="cursor-pointer text-sm font-medium text-brand-green-dark">
              + {GOAL_LEVEL_LABEL[level]} 등록
            </summary>
            <ActionForm
              action={createGoal}
              successMessage="정상 등록되었습니다."
              className="mt-4 grid gap-3 md:grid-cols-2"
            >
              <input type="hidden" name="cycleId" value={goalCycleId ?? cycle.id} />
              <input type="hidden" name="viewCycleId" value={cycle.id} />
              <input type="hidden" name="level" value={level} />
              <GoalFormFields level={level} parentOptions={parentOptions} />
              <div className="md:col-span-2">
                <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                  등록
                </button>
              </div>
            </ActionForm>
          </details>
        )}

        {/* 양식 하단의 산식. 가중치를 왜 100%로 맞춰야 하는지가 이 한 줄로 읽힌다. */}
        {usesKeyResults(level) && rows.length > 0 && (
          <p className="text-xs text-slate-500">* 점수 = 가중치(비중) × 평가자 점수</p>
        )}

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            등록된 {GOAL_LEVEL_LABEL[level]}가 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((g) => (
              <GoalRowCard key={g.id} goal={g} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- 렌더 ---------------------------------------------------------------

  // 사이클이 없을 때 폼에 미리 채워둘 값. 상·하반기 중 오늘이 속한 쪽을
  // 기본으로 잡아서, 관리자가 날짜를 손으로 안 넣어도 바로 만들 수 있게 한다.
  const thisYear = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(now)
  );
  const firstHalf = Number(toDateInputValue(now).slice(5, 7)) <= 6;
  const defaultCycle = firstHalf
    ? { name: `${thisYear}년 상반기`, startDate: `${thisYear}-01-01`, endDate: `${thisYear}-06-30` }
    : { name: `${thisYear}년 하반기`, startDate: `${thisYear}-07-01`, endDate: `${thisYear}-12-31` };

  // 사이클이 하나도 없을 때만 이 첫 실행 화면을 보여준다. "아직 안 고른 것"과
  // "아예 없는 것"은 다르다 — 안 고른 상태는 아래 본문에서 선택을 안내한다.
  if (cycles.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">평가2 · 목표관리</h1>
        <div className={`${CARD_CLASS} p-5`}>
          <p className="text-sm text-slate-600">
            등록된 목표 사이클이 없습니다.{" "}
            {isAdmin
              ? "사이클을 하나 만들면 그 안에 전사 · 책임 · 팀 · 개인목표를 등록할 수 있습니다. 아래 값은 올해 기준으로 미리 채워뒀으니 그대로 만드셔도 됩니다."
              : "관리자가 사이클을 열면 목표를 등록할 수 있습니다."}
          </p>
          {isAdmin && (
            <ActionForm
              action={createGoalCycle}
              successMessage="목표 사이클을 만들었습니다."
              className="mt-4 grid gap-3 md:grid-cols-4"
            >
              <div className="md:col-span-2">
                <label className={LABEL_CLASS}>사이클명</label>
                <input
                  name="name"
                  required
                  defaultValue={defaultCycle.name}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>시작일</label>
                <input
                  type="date"
                  name="startDate"
                  required
                  defaultValue={defaultCycle.startDate}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>종료일</label>
                <input
                  type="date"
                  name="endDate"
                  required
                  defaultValue={defaultCycle.endDate}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="md:col-span-4">
                <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                  사이클 만들기
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  만들고 나면 상단 전사목표 표에서 「조직 단위별 목표 양식으로 채우기」 버튼으로
                  다섯 줄을 한 번에 넣을 수 있습니다.
                </p>
              </div>
            </ActionForm>
          )}
        </div>
      </div>
    );
  }

  const isDashboard = tab === "dashboard";

  return (
    // 배너 · 전사 목표 표 · 목록이 한 덩어리로 함께 스크롤된다.
    //
    // 한때는 위를 고정하고 목록만 안에서 굴렸는데, 그러면 "책임목표 0건" 같은
    // 목록 머리글이 고정된 표 밑으로 들어가 사라진다. 위를 얼려 둘수록 아래에서
    // 볼 수 있는 자리가 줄고, 그 자리를 벗어난 것은 어디로 갔는지 알 수 없게
    // 된다. 지금은 평범한 스크롤 한 벌만 있고, 화면 밖으로 나간 것은 위로
    // 올리면 그대로 돌아온다.
    <div className="flex flex-col gap-3">
      {/* 다른 사람이 목표를 고쳐도 이 화면이 알아서 최신 값을 받아온다. */}
      <AutoRefresh />

      {/* 인사평가 선택이 먼저, 층 선택 탭이 그 아래. */}
      {cycleBar()}
      {tabBar()}

      {/* 마감 안내 — 왜 수정 버튼이 사라졌는지 화면에서 바로 읽히게 한다. */}
      {lock.message && (
        <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">
            {cycle?.status === "CLOSED" ? "완료됨" : "목표 확정됨"}
          </span>
          <span className="ml-2">{lock.message}</span>
          {cycle?.goalsLockedAt && cycle.status !== "CLOSED" && (
            <span className="ml-2 text-xs text-slate-400">
              {formatKSTDate(cycle.goalsLockedAt)} 마감
            </span>
          )}
          {isAdmin && (
            <Link href="/admin/org-goals" className="ml-2 text-xs text-brand-green-dark underline">
              {cycle?.status === "CLOSED" ? "관리 화면에서 되돌리기" : "관리 화면에서 마감 해제"}
            </Link>
          )}
        </div>
      )}

      {!cycle ? (
        // 인사평가를 고르기 전에는 어느 탭이든 비워 둔다. 어느 해 숫자인지
        // 모르는 채로 목표를 읽게 두지 않는다.
        <section className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-24">
          <p className="text-base font-semibold text-slate-700">인사평가를 선택해 주세요</p>
          <p className="mt-1 text-sm text-slate-500">
            오른쪽 위 목록에서 연도를 고르면 그 해의 전사 · 책임 · 팀 · 개인 목표가 보입니다.
          </p>
          {cycles.length === 0 && (
            <p className="mt-4 text-xs text-slate-400">
              {isAdmin
                ? "아직 만들어진 인사평가가 없습니다 — 「조직 목표 관리」에서 먼저 만들어 주세요."
                : "아직 열린 인사평가가 없습니다. 관리자에게 문의해 주세요."}
            </p>
          )}
        </section>
      ) : (
        <>
          {/* 전사 목표 — 배너와 줄을 나눠 그 아래에 놓는다. 표는 접을 수 있다. */}
          {companyGoalBoard()}

          {isDashboard ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {DASHBOARD_LEVELS.map((level) => (
                <LevelSummaryCard key={level} level={level} />
              ))}
            </div>
          ) : (
            // key에 탭을 넣어 탭을 옮길 때마다 이 안을 새로 그린다. 안 그러면
            // React가 같은 자리의 등록 폼을 재사용해서, 개인목표에 쳐 넣던
            // 목표명이 팀목표 탭 입력칸에 그대로 남아 있는다.
            <div key={tab}>{levelTab(TAB_TO_LEVEL[tab])}</div>
          )}
        </>
      )}
    </div>
  );
}
