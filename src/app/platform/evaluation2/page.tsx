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
import { CollapseAllButton } from "./collapse-all";
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
  goalHalf,
  groupByHalf,
  HALF_UNSET,
  GOAL_HALVES,
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
  cyclePhaseLabel,
  cyclePhaseRank,
  cycleYear,
  divisionOptions,
  evalPeriodLabel,
  maxScore,
  usesEvaluation,
  keyResultLines,
  scaleValues,
  toDateInputValue,
  usesKeyResults,
  usesScales,
  usesDerivedWeight,
  usesFixedActiveStatus,
  usesHalf,
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
  approveGoalAgreement,
  createGoal,
  createGoalYear,
  deleteGoal,
  lockGoalSetting,
  reopenGoalAgreement,
  requestGoalAgreement,
  saveGoalSheetDuty,
  unlockGoalSetting,
  returnGoalAgreement,
  seedCompanyGoalTemplate,
  setGoalDropped,
  setGoalEvalDone,
  setGoalExcluded,
  updateGoal,
} from "./actions";
import { YearPhaseSelect } from "./cycle-select";
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
  company: "COMPANY",
  team: "TEAM",
  individual: "INDIVIDUAL",
};

function tabsFor(levels: GoalLevel[]) {
  return [
    { key: "dashboard", label: "대시보드" },
    ...levels.map((level) => ({ key: level.toLowerCase(), label: GOAL_LEVEL_LABEL[level] })),
  ];
}

/**
 * 대시보드에 달성률 요약 카드로 세우는 층.
 *
 * 팀목표와 개인목표 둘뿐이다. 전사·책임 달성률은 아래 두 층이 굴러 올라온
 * 결과라 같은 숫자를 네 번 읽는 셈이고, 전사목표는 바로 아래 표가 목표별로
 * 자세히 적고 있다. 두 장만 남기니 카드를 크게 키워 «내 팀과 내 목표가 지금
 * 어디까지 왔나»가 화면을 열자마자 읽힌다.
 */
const DASHBOARD_LEVELS: GoalLevel[] = ["TEAM", "INDIVIDUAL"];

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
/**
 * 옆 글씨에 물어보는 자리. 크기를 `em`으로 잡아 **붙어 있는 글자와 같이** 커지고
 * 작아진다 — 고정 크기로 두면 작은 라벨 옆에서 혼자 커서 눈에 먼저 걸린다.
 * 평소에는 옅은 붉은 알약이고, 손을 얹으면 붉게 차면서 설명이 뜬다.
 */
function HelpMark({ text }: { text: string }) {
  return (
    <span className="group relative ml-0.5 inline-block align-middle">
      <span
        role="img"
        aria-label={text}
        tabIndex={0}
        className="inline-flex h-[1.15em] w-[1.15em] cursor-help items-center justify-center rounded-full bg-status-critical/10 text-[0.72em] font-bold leading-none text-status-critical ring-1 ring-status-critical/40 transition-colors hover:bg-status-critical hover:text-white group-focus-within:bg-status-critical group-focus-within:text-white"
      >
        ?
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-72 -translate-x-1/2 rounded-lg bg-slate-800 px-3 py-2 text-[11px] leading-relaxed font-normal text-white shadow-lg ring-1 ring-slate-900/10 group-focus-within:block group-hover:block">
        {text}
      </span>
    </span>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
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
/**
 * 상반기·하반기 묶음의 색. 제목 글씨만 굵게 해서는 목표가 여러 건 쌓이면 어디서
 * 반기가 갈리는지 안 보인다 — 묶음마다 테두리를 두르고 바탕색을 달리해서, 스크롤
 * 중에도 «지금 하반기 것을 보는 중»이 한눈에 읽히게 한다.
 */
const HALF_TONE: Record<string, { border: string; panel: string; head: string; text: string; badge: string }> = {
  상반기: {
    border: "border-brand-green/30",
    panel: "bg-brand-green-light/40",
    head: "bg-brand-green-light",
    text: "text-brand-green-dark",
    badge: "bg-brand-green text-white",
  },
  하반기: {
    border: "border-goal-3/30",
    panel: "bg-amber-50/60",
    head: "bg-amber-100/70",
    text: "text-goal-3",
    badge: "bg-goal-3 text-white",
  },
  [HALF_UNSET]: {
    border: "border-slate-200",
    panel: "bg-slate-50",
    head: "bg-slate-100",
    text: "text-slate-600",
    badge: "bg-slate-400 text-white",
  },
};

function goalTitle(goal: { title: string; isOther?: boolean }): string {
  return goal.isOther ? OTHER_GOAL_TITLE : goal.title;
}

export default async function Evaluation2Page({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    cycleId?: string;
    edit?: string;
    year?: string;
    phase?: string;
  }>;
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
  /*
    무엇을 볼지는 두 가지로 정해진다 — **연도**와 그 해의 **목표**다.

    목표 자리에는 세 단계(목표설정·중간평가·최종평가)와 「목표진행현황」이 있다.
    진행현황은 사이클이 아니라 **보기**다: 그 해에서 가장 앞선 단계의 목표를
    읽기 전용으로 펼쳐, 전사부터 내 목표까지 지금 얼마나 굴러갔는지만 본다.
    평가2를 눌렀을 때 처음 뜨는 화면이 이것이다 — 대부분은 무엇을 고치러
    오는 게 아니라 «지금 어디까지 왔나»를 보러 온다.

    예전 주소(cycleId=…)로 들어와도 읽는다. 그 사이클의 해와 단계로 옮겨 준다.
  */
  const legacyCycle = params.cycleId
    ? (cycles.find((c) => c.id === params.cycleId) ?? null)
    : null;

  const years = Array.from(new Set(cycles.map((c) => cycleYear(c)))).sort((a, b) => b - a);
  const todayYear = new Date().getFullYear();
  const selectedYear = legacyCycle
    ? cycleYear(legacyCycle)
    : params.year && years.includes(Number(params.year))
      ? Number(params.year)
      : (years.find((y) => y === todayYear) ?? years[0] ?? todayYear);

  const yearCycles = cycles
    .filter((c) => cycleYear(c) === selectedYear)
    .sort((a, b) => cyclePhaseRank(a) - cyclePhaseRank(b));

  const PROGRESS_PHASE = "progress";
  const phaseKey = (c: { name: string; year: number }) => String(cyclePhaseRank(c));
  const selectedPhase = legacyCycle
    ? phaseKey(legacyCycle)
    : (params.phase ?? PROGRESS_PHASE);
  const progressView = selectedPhase === PROGRESS_PHASE;

  /*
    진행현황이 읽을 사이클 — 그 해에서 **자기 목표를 가진 가장 앞선 단계**다.
    마감할 때마다 다음 단계가 목표를 복사해 가므로, 가장 앞선 단계가 곧 지금
    쓰이고 있는 목표다. 아직 아무 단계도 마감하지 않았으면 목표설정이 그것이다.
  */
  const goalCounts = await prisma.goal.groupBy({
    by: ["cycleId"],
    _count: { _all: true },
  });
  const countByCycle = new Map(goalCounts.map((g) => [g.cycleId, g._count._all]));
  const progressCycle =
    [...yearCycles].reverse().find((c) => (countByCycle.get(c.id) ?? 0) > 0) ??
    yearCycles[0] ??
    null;

  const cycle = progressView
    ? progressCycle
    : (yearCycles.find((c) => phaseKey(c) === selectedPhase) ?? null);
  const selectedCycleId = cycle?.id ?? "";
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
        jobGrade: true,
        teamId: true,
        employeeNumber: true,
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
          half: true,
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
          evalDoneAt: true,
          selfScore: true,
          firstProgress: true,
          selfComment: true,
          firstScore: true,
          firstComment: true,
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

  /*
    잠금은 **지금 보고 있는 단계**를 따른다. 목표는 「목표설정」에 한 벌 있고
    중간평가·최종평가가 그걸 빌려 보는데, 목표가 저장된 사이클로만 따지면
    목표설정을 마감하는 순간 중간평가에서도 목표를 못 고친다. 한 해를 굴리다
    보면 목표가 바뀌고, 중간평가는 그걸 반영하는 자리이기도 하다. 그래서
    목표설정을 마감하면 목표설정 화면에서만 잠기고, 중간평가 화면은 열려 있다 —
    중간평가까지 마감하면 그때 잠긴다. 서버 액션도 같은 기준으로 판단한다
    (`actingLock`) — 아니면 눌리는데 저장은 안 되는 버튼이 생긴다.
  */
  /*
    진행현황은 «보는» 자리라 아무것도 고치지 못한다. 등록·수정·삭제·평가 단추는
    모두 이 잠금을 보고 뜨므로, 여기서 한 번 닫으면 화면 전체가 읽기 전용이 된다.
  */
  const lock = progressView
    ? { canEditGoals: false, canEditProgress: false, message: null }
    : cycleLock(cycle);
  /*
    달성률을 적을 수 있는 단계인가. **고른 평가**로 판단한다 — 목표는 대개
    「목표설정」에 한 벌만 있고 중간평가·최종평가가 그걸 빌려 보므로, 목표가
    저장된 사이클로 따지면 중간평가에서도 막혀 버린다.
  */
  const canWriteProgress = allowsProgressInput(cycle);
  /*
    달성률을 **화면에 띄우는** 단계인가. 적을 수 있는 단계와 같게 둔다 —
    목표설정에서는 아무도 진척을 올릴 수 없어 모든 숫자가 0이고, 0%짜리 도넛과
    «평균 달성률 0%»가 화면을 덮으면 정작 봐야 할 «무엇을 세웠나»가 안 읽힌다.
    진행 막대는 남긴다: 목표 제목과 아래 줄을 갈라 주는 선 노릇을 한다.
  */
  const showsProgress = progressView || canWriteProgress;
  /*
    앞 단계에서 목표를 이어받는 평가(중간평가·최종평가)인데 그 앞 단계가 아직
    마감되지 않았으면 목록을 열지 않는다 — 평가하는 동안 목표가 바뀌면 그 점수가
    무엇을 기준으로 매겨진 것인지 남지 않는다.
  */
  const waitingForSource = !!sharedFrom && !sharedFrom.goalsLockedAt;
  /*
    마감하면 무엇이 이어받는지 — 같은 해의 뒤 단계(중간평가·최종평가)다. 마감은
    돌이키기 어려운 일처럼 느껴지므로, 무슨 일이 일어나는지를 누르기 전에 적어
    둔다. 이 목표를 이미 이어받고 있는 단계와, 마감할 때 이어 붙일 단계를 함께
    센다(`linkFollowUpCycles`).
  */
  const followUps = cycle
    ? cycles.filter(
        (c) =>
          c.id !== cycle.id &&
          cycleYear(c) === cycleYear(cycle) &&
          cyclePhaseRank(c) > cyclePhaseRank(cycle)
      )
    : [];
  const tree = buildGoalTree(goalsWithTarget);
  const allNodes = flattenGoalTree(tree);
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  /*
    목록에 늘어놓는 순서는 **저장된 순서**를 그대로 따른다 — 관리자가 정한
    sortOrder, 그다음 등록한 차례다. 트리를 훑은 순서로 늘어놓으면 상위 목표를
    따라 뒤섞이고, 같은 자리에 놓인 것끼리는 이름순으로 갈려서 «방금 등록한
    목표»가 예전에 적어 둔 목표들 사이에 끼어 들어간다. 새로 적은 것은 늘 맨
    아래에 있어야 어디에 붙었는지 찾지 않는다.
  */
  const goalOrder = new Map(goals.map((g, i) => [g.id, i]));
  const byLevel = (level: GoalLevel) =>
    allNodes
      .filter((n) => n.level === level)
      .sort((a, b) => (goalOrder.get(a.id) ?? 0) - (goalOrder.get(b.id) ?? 0));
  const companyGoals = byLevel("COMPANY");

  const divisions = divisionOptions([
    ...teams.map((t) => t.division),
    ...goals.map((g) => g.division),
  ]);

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

  /*
    개인목표 목록 맨 위의 「1. 기본사항」 — 사내 개인목표 설정 양식의 첫 표를
    그대로 옮긴 것이다. **로그인한 사람 기준**이고, 조직도와 인사카드에서 끌어올
    수 있는 값은 전부 자동으로 채운다. 사람이 다시 적을 이유가 없는 값이다.

    1차 평가자는 조직도에서 한 칸 위, 2차 평가자는 그 위 한 칸이다 — 담당이면
    팀장·책임, 팀장이면 책임·운영책임 순으로 붙는다.
  */
  const myDuty = goalCycleId
    ? (
        await prisma.goalSheetInfo.findUnique({
          where: { cycleId_userId: { cycleId: goalCycleId, userId: session!.user.id } },
          select: { duty: true },
        })
      )?.duty ?? ""
    : "";
  const mySelf = people.find((p) => p.id === session!.user.id) ?? null;
  const myEval = evaluatorByPerson.get(session!.user.id) ?? null;
  const myEvaluator = myEval?.first ?? null;
  const mySecondEvaluator = myEval?.second ?? null;

  const personOptions = people.map((p) => ({
    value: p.id,
    label: `${p.name} ${POSITION_LABEL[p.position]}`,
    sublabel: p.team?.name ? `(${p.team.name})` : p.division ? `(${p.division})` : undefined,
  }));

  // 조직도(본부 > 책임 > 팀)를 되짚는 표. 목표에는 팀만 붙어 있어서, 이 사람이
  // 볼 수 있는 범위인지 따지려면 팀에서 부문·본부로 거슬러 올라가야 한다.
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const personById = new Map(people.map((p) => [p.id, p]));
  /**
   * 이 목표로 평가받는 사람 — 「피평가자」.
   *
   * 개인목표는 그 목표의 주인이다. 팀목표는 **그 팀의 팀장**이다: 팀목표는
   * 인사팀 관리자가 대신 등록해 주기도 해서, 등록한 사람을 피평가자로 삼으면
   * 관리자의 평가자(사장)가 그 팀목표에 붙어 버린다. 실제로 «팀장의 1차
   * 평가자가 사장으로 나온다»는 말이 여기서 나왔다. 팀에 팀장이 비어 있을
   * 때만 등록자로 물러선다.
   */
  const goalSubject = (goal: GoalNode) => {
    if (goal.level === "TEAM") {
      const leaderId = goal.teamId ? teamById.get(goal.teamId)?.leaderId : null;
      const leader = leaderId ? personById.get(leaderId) : null;
      if (leader) return leader;
    }
    return (goal.ownerId ? personById.get(goal.ownerId) : null) ?? null;
  };
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
    qs.set("year", String(selectedYear));
    qs.set("phase", selectedPhase);
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
  const doneCount = companyGoals.filter((g) => g.rollupStatus === "DONE" && !g.excluded).length;
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
        <span className="text-xs font-medium text-slate-500">연도 · 목표</span>
        {cycles.length > 0 ? (
          <YearPhaseSelect
            years={years.map((y) => ({ value: String(y), label: `${y}년` }))}
            year={String(selectedYear)}
            phases={[
              /*
                진행현황이 맨 위이자 기본값이다. 평가2에 들어오는 사람 대부분은
                무엇을 고치러 오는 게 아니라 «지금 어디까지 왔나»를 보러 온다.
              */
              { value: PROGRESS_PHASE, label: "목표진행현황" },
              ...yearCycles.map((c) => ({
                value: phaseKey(c),
                label: `${cyclePhaseLabel(c)} (${
                  GOAL_CYCLE_STATUS_LABEL[c.status as GoalCycleStatus]
                })`,
              })),
            ]}
            phase={selectedPhase}
          />
        ) : (
          <span className="text-xs text-slate-400">등록된 인사평가가 없습니다</span>
        )}
        {/* 진행현황은 «보는» 자리다 — 어느 단계의 목표를 읽고 있는지는 적어 준다. */}
        {progressView && cycle && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            「{cyclePhaseLabel(cycle)}」의 목표를 읽는 중입니다 · 여기서는 고칠 수 없습니다
          </span>
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
            {/* 해는 이름을 먼저 믿는다 — 「2026년 중간평가」인데 기간이 2028년으로
                들어가 있으면 표 머리에 «2028년»이 뜬다(`cycleYear`). */}
            {cycle ? `${cycleYear(cycle)}년 전사 목표` : "전사 목표"}
          </h1>
          <div className="ml-auto flex items-center gap-3 whitespace-nowrap">
            {showsProgress && (
              <>
                <span className="text-[11px] text-slate-500">전사 종합</span>
                <span className="text-xl leading-none font-semibold tabular-nums text-slate-900">
                  {overallProgress}
                  <span className="ml-0.5 text-xs font-normal text-slate-400">%</span>
                </span>
              </>
            )}
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
                  {showsProgress && (
                    <th className="w-56 px-4 py-1.5 text-left text-xs font-semibold">달성률</th>
                  )}
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
                      {showsProgress && (
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
                      )}
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

  /**
   * 사내 「개인목표 설정」 양식의 «1. 기본사항» 표.
   *
   * 사람이 다시 적을 값이 하나도 없다 — 성명·직위·사번·소속은 인사카드에서,
   * 1·2차 평가자는 조직도에서, 면담일정은 그 해의 평가 단계에서 끌어온다.
   * 종이 양식에서는 매번 손으로 채우던 칸이라, 여기서 자동으로 채워 두면
   * 목표를 세우는 사람은 목표만 적으면 된다.
   *
   * 담당업무만 비어 있다 — 사람마다 적어 두는 자리가 아직 없다(직군 `jobFamily`는
   * «인사 기획/보상평가» 같은 담당업무와 다른 값이라 대신 쓰지 않는다).
   */
  function BasicInfoTable() {
    const cellHead = "bg-slate-100 px-3 py-1.5 text-left font-medium text-slate-600 whitespace-nowrap";
    const cellBody = "px-3 py-1.5 text-slate-800";
    const person = (p: typeof mySelf) =>
      p ? { name: p.name, position: POSITION_LABEL[p.position] } : { name: "-", position: "-" };
    const first = person(myEvaluator as typeof mySelf);
    const second = person(mySecondEvaluator as typeof mySelf);

    return (
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <h3 className="border-b border-slate-200 bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white">
          1. 기본사항
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-xs">
            <tbody>
              <tr className="border-b border-slate-100">
                {/* «본인»이 아니라 «피평가자» — 평가자와 짝이 맞는 말이라야
                    누가 누구를 보는지가 표 한 장에서 읽힌다. */}
                <th rowSpan={3} className={`${cellHead} w-24 text-center align-middle`}>
                  피평가자
                </th>
                <th className={`${cellHead} w-20`}>성명</th>
                <td className={`${cellBody} w-40`}>{mySelf?.name ?? "-"}</td>
                <th className={`${cellHead} w-24`}>소속팀</th>
                <td className={cellBody}>{mySelf?.team?.name ?? "-"}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <th className={cellHead}>직위</th>
                <td className={cellBody}>{mySelf ? POSITION_LABEL[mySelf.position] : "-"}</td>
                <th className={cellHead}>사번</th>
                <td className={cellBody}>{mySelf?.employeeNumber ?? "-"}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <th className={cellHead}>담당업무</th>
                <td className={cellBody} colSpan={3}>
                  {/*
                    담당업무는 자동으로 끌어오지 않는다 — 그 해 자기가 무엇을
                    맡았는지 적는 문장이라 인사카드에 두면 매번 인사팀을 거쳐야
                    한다. 여기서 바로 적고 저장한다.
                  */}
                  <ActionForm
                    action={saveGoalSheetDuty}
                    successMessage="담당업무를 저장했습니다."
                    className="flex items-center gap-1.5"
                  >
                    <input type="hidden" name="cycleId" value={cycle?.id ?? ""} />
                    <input
                      name="duty"
                      defaultValue={myDuty}
                      placeholder="예: 인사 기획/보상평가"
                      aria-label="담당업무"
                      className="w-full max-w-md rounded border border-slate-300 px-2 py-1 text-xs focus:border-brand-green focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="shrink-0 rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                    >
                      저장
                    </button>
                  </ActionForm>
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <th className={`${cellHead} text-center`}>1차 평가자</th>
                <th className={cellHead}>성명</th>
                <td className={cellBody}>{first.name}</td>
                <th className={cellHead}>직위</th>
                <td className={cellBody}>{first.position}</td>
              </tr>
              <tr>
                <th className={`${cellHead} text-center`}>2차 평가자</th>
                <th className={cellHead}>성명</th>
                <td className={cellBody}>{second.name}</td>
                <th className={cellHead}>직위</th>
                <td className={cellBody}>{second.position}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </section>
    );
  }

  function LevelSummaryCard({ level }: { level: GoalLevel }) {
    /*
      요약 카드도 **그 사람이 볼 수 있는 범위**만 센다. 목록에서는 남의 개인목표를
      가려 놓고 여기서 전사 건수와 평균을 띄우면, 가려 놓은 것을 숫자로 흘리는
      셈이다. 담당은 자기 것, 팀장은 자기 팀, 관리자는 전부 — 아래 탭에서 실제로
      열리는 목록과 같은 범위여야 두 화면이 한 이야기를 한다.
    */
    const nodes = visibleRows(byLevel(level));
    const counted = nodes.filter(countsTowardProgress);
    const done = nodes.filter((g) => g.rollupStatus === "DONE" && !g.excluded).length;
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
          <h2 className="text-base font-semibold text-slate-800">{GOAL_LEVEL_LABEL[level]}</h2>
        </div>

        {showsProgress && (
          <div className="relative mt-5 flex items-center justify-center">
            <ProgressDonut value={percent} color={LEVEL_COLOR[level]} size={188} stroke={18} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl leading-none font-semibold tabular-nums text-slate-900">
                {percent}
                <span className="ml-0.5 text-xl font-normal text-slate-400">%</span>
              </span>
              <span className="mt-1.5 text-xs text-slate-500">
                {level === "COMPANY" ? "가중평균" : "평균 달성률"}
              </span>
            </div>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-3 gap-1 border-t border-slate-100 pt-4 text-center">
          <div>
            <dt className="text-xs text-slate-500">전체</dt>
            <dd className="text-2xl font-semibold tabular-nums text-slate-800">{counted.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">완료</dt>
            <dd className="text-2xl font-semibold tabular-nums text-brand-green-dark">{done}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">지연</dt>
            <dd
              className={`text-2xl font-semibold tabular-nums ${
                overdue > 0 ? "text-status-critical" : "text-slate-400"
              }`}
            >
              {overdue}
            </dd>
          </div>
        </dl>
      </>
    );

    const className = `${CARD_CLASS} flex flex-col p-6`;

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
    /*
      개인목표에는 팀 칸이 없다 — 사람을 고르면 그 사람의 팀이 따라온다(서버에서
      `teamOfOwner`). 두 칸을 다 고르게 하면 사람과 팀이 어긋난 목표가 생긴다.
      팀목표는 팀 자체가 목표의 주인이라 팀을 고른다.
    */
    const showTeam =
      level === "TEAM" && (isAdmin || viewer.ledTeamIds.length > 1);
    const showOwner = isAdmin;
    // 「담당자」가 아니라 「피평가자」다 — 이 목표로 평가받는 사람이고, 위의
    // 평가자와 짝이 맞는 말이라야 누가 누구를 보는지가 한 번에 읽힌다.
    const ownerLabel = level === "INDIVIDUAL" ? "피평가자" : "책임자";

    /*
      이 목표를 누가 평가하게 되는지 폼에서 미리 보여 준다. 조직도에서 따라
      올라간 값이라 고르는 칸이 아니고, 목표를 세우는 사람이 «누가 이걸 볼
      것인가»를 알고 적도록 띄우는 줄이다. 아직 등록 전이라 담당자가 정해지지
      않았으면 로그인한 사람 기준으로 보여 준다 — 어차피 그 사람 목표가 된다.
    */
    /*
      이 줄은 팀목표 폼에만 붙는다. 팀목표의 피평가자는 **그 팀의 팀장**이므로
      «등록하는 사람»이 아니라 팀장을 기준으로 잡는다 — 관리자가 대신 등록해도
      평가는 팀장이 받는다. 팀을 아직 고르지 않았으면 누구인지 알 수 없다.
    */
    const formTeamId =
      goal?.teamId ?? (viewer.ledTeamIds.length === 1 ? viewer.ledTeamIds[0] : null);
    const formSubjectId = formTeamId ? (teamById.get(formTeamId)?.leaderId ?? null) : null;
    const formEval = formSubjectId ? (evaluatorByPerson.get(formSubjectId) ?? null) : null;
    const evaluatorLine = (
      <div className="md:col-span-2">
        <label className={LABEL_CLASS}>1차 평가자</label>
        <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
          {!formSubjectId
            ? "팀을 고르면 그 팀의 팀장을 기준으로 자동으로 정해집니다"
            : formEval?.first
              ? `${evaluatorLabel(formEval.first)} — 조직도에서 자동으로 정해집니다`
              : "조직도에서 1차 평가자를 찾지 못했습니다 (팀장·책임이 지정되어 있는지 확인해 주세요)"}
          {formEval?.note ? ` · ${formEval.note}` : ""}
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
              <label className={LABEL_CLASS}>
                {ownerLabel}
                {level === "INDIVIDUAL" && (
                  <span className="ml-1 font-normal text-slate-400">
                    — 누구의 목표로 등록할지 고릅니다 (팀은 따라옵니다)
                  </span>
                )}
              </label>
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

    /*
      한 해 목표를 상반기·하반기로 갈라 세운다. 목록도 이 값으로 묶이므로,
      «지금 무엇을 세우는 중인지»가 등록할 때부터 정해져 있어야 한다.
      전사·책임 목표는 한 해 단위라 이 칸이 없다.
    */
    const half = usesHalf(level) ? (
      <div>
        <label className={LABEL_CLASS}>목표 구분</label>
        <select
          name="half"
          defaultValue={goal?.half ?? GOAL_HALVES[0]}
          required
          className={INPUT_CLASS}
        >
          {GOAL_HALVES.map((h) => (
            <option key={h} value={h}>
              {h} 목표
            </option>
          ))}
        </select>
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
              {/* 소속(팀·부문)은 붙이지 않는다 — 고를 수 있는 상위 목표는 이미
                  내가 볼 수 있는 범위로 좁혀져 있어서, 줄마다 «(인사팀)»이
                  되풀이될 뿐 무엇을 고르는지에는 보태는 게 없다. */}
              {p.title}
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

    /*
      자동 계산 층(전사·책임·팀)에서는 «완료»를 고를 수 없다. 달성률이 아래에서
      굴러 올라오는데 상태만 손으로 완료로 두면 «0%인데 완료»가 된다. 완료는
      딸린 목표가 다 차면 저절로 붙는다. «중단»은 남긴다 — 그 목표를 접었다는
      사람의 판단이라 아래에서 뒤집을 수 있는 값이 아니다.
    */
    const statusChoices = GOAL_STATUSES.filter(
      (v) => !(isAutoCalculated(level) && v === "DONE")
    );
    /*
      목표설정 단계의 팀·개인 목표는 상태를 고르지 않는다 — 전부 «진행중»이다.
      목표를 세우는 자리에서 작성중/진행중/중단을 고르게 하면 같은 시점에 세운
      목표가 사람마다 다른 상태로 남아 목록이 들쭉날쭉해진다. 무엇이 끝났고
      무엇이 접혔는지는 중간평가·최종평가에서 갈린다.
    */
    const status = usesFixedActiveStatus(level, cycle) ? (
      <div>
        <label className={LABEL_CLASS}>상태</label>
        <input type="hidden" name="status" value="ACTIVE" />
        <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
          진행중 — 목표설정 단계에서는 모두 진행중입니다
        </p>
      </div>
    ) : (
      <div>
        <label className={LABEL_CLASS}>상태</label>
        <select name="status" defaultValue={goal?.status ?? "ACTIVE"} className={INPUT_CLASS}>
          {statusChoices.map((s) => (
            <option key={s} value={s}>
              {GOAL_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {isAutoCalculated(level) && (
          <p className="mt-1 text-[11px] text-slate-400">
            «완료»는 딸린 목표가 모두 달성되면 저절로 붙습니다
          </p>
        )}
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
    /*
      사내 양식이 읽히는 차례대로 줄을 나눈다. 한 줄은 화면에서 2열이고, 한 칸만
      든 줄은 왼쪽 절반만 쓴다. 상위 목표가 맨 위인 건 «무엇에 딸린 일인지»를
      먼저 정하고 내용을 적는 순서라서다 — 아래에 있으면 다 적고 나서야 상위를
      고르게 된다.
    */
    /*
      사내 「개인목표 평가(상반기)」 표를 폼 맨 위로 옮긴 칸들이다. 목표를 세우는
      화면(목표설정)에는 없고 중간평가·최종평가에서만 뜬다 — 아직 하지 않은 일에
      점수를 매길 자리는 없다.

      누가 무엇을 적는지는 조직도가 정한다: 위 칸(달성률·본인 점수·본인 사유)은
      피평가자가, 아래 칸(1차 평가점수·사유)은 그 사람의 1차 평가자가 적는다.
      남의 칸은 값이 보이되 잠긴다 — 감춰 두면 «상대가 뭐라고 적었는지»를 보려고
      서로 물어보게 된다. 서버도 같은 기준으로 한 번 더 가린다.
    */
    const showEval = usesEvaluation(level, cycle) && !!goal;
    const period = evalPeriodLabel(cycle);
    const evalSubjectId = goal?.ownerId ?? session!.user.id;
    const evalResult = evaluatorByPerson.get(evalSubjectId) ?? null;
    const evalFirst = evalResult?.first ?? null;
    const evalNote = evalResult?.note ?? null;
    const canWriteSelf = isAdmin || evalSubjectId === session!.user.id;
    const canWriteFirst = isAdmin || (!!evalFirst && evalFirst.id === session!.user.id);
    // 내용(제목·가중치·상위)을 고칠 수 있는 사람. 평가만 하는 사람은 못 고친다.
    const canEditContent = !goal || canManage(goal);
    /*
      점수 상한은 가중치의 110%다 — 가중치 30짜리 목표는 33점이 최고다. 상한이
      없으면 가중치 10짜리에 100점을 적어 두고 «다 했다»가 되어 비중을 나눠 놓은
      뜻이 사라진다. 가중치를 아직 안 적었으면 막지 않는다.
    */
    const scoreCeiling = goal && goal.weight > 0 ? maxScore(goal.weight) : undefined;
    const scoreHelp =
      `점수는 가중치의 110%까지입니다.` +
      (scoreCeiling
        ? ` 이 목표는 가중치 ${goal!.weight}%라 최대 ${scoreCeiling}점입니다.`
        : ` 가중치 30%짜리 목표라면 최대 33점입니다.`) +
      ` 가중치가 그 목표의 몫이고, 아주 잘했을 때(평가척도 S) 그 몫의 110%까지 인정합니다.`;

    const evalBlock = showEval ? (
      <div className="flex flex-col gap-2 md:col-span-2">
        <p className="text-xs font-semibold text-slate-700">
          개인목표 평가{period && ` (${period})`}
        </p>

        <div className="rounded-lg border border-brand-green/40 bg-brand-green-light/50 p-3">
          <p className="mb-2 block text-xs font-semibold text-brand-green-dark">피평가자(본인)</p>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className={LABEL_CLASS}>달성률(%)</label>
              <input
                type="number"
                name="progress"
                min={0}
                max={100}
                step={1}
                defaultValue={goal?.progress ?? 0}
                disabled={!canEditContent}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>
                본인 평가점수
                <HelpMark text={scoreHelp} />
              </label>
              <input
                type="number"
                name="selfScore"
                min={0}
                max={scoreCeiling}
                step={1}
                defaultValue={goal?.selfScore ?? ""}
                disabled={!canWriteSelf}
                placeholder={scoreCeiling ? `0 ~ ${scoreCeiling}` : "예: 33"}
                className={INPUT_CLASS}
              />
            </div>
            <div className="md:col-span-2">
              <label className={LABEL_CLASS}>본인 평가사유</label>
              <textarea
                name="selfComment"
                rows={2}
                defaultValue={goal?.selfComment ?? ""}
                disabled={!canWriteSelf}
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-goal-3/40 bg-amber-50/70 p-3">
          <p className="mb-2 block text-xs font-semibold text-goal-3">
            1차 평가자{evalFirst ? `(${POSITION_LABEL[evalFirst.position]})` : ""}
          </p>
          {/*
            사슬이 팀장을 건너뛰었으면 왜 건너뛰었는지 적는다 — 대개 그 팀에
            팀장이 지정돼 있지 않아서다. 이 말이 없으면 «왜 우리 팀장이 아니지»가
            화면만 보고는 풀리지 않는다.
          */}
          {evalNote && <p className="mb-2 text-[11px] text-status-critical">{evalNote}</p>}
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className={LABEL_CLASS}>
                달성률(%)
                <HelpMark text="1차 평가자가 본 달성률입니다. 여기에 적으면 이 값이 그 목표의 달성률이 되어 팀·책임·전사 목표로 굴러 올라갑니다. 비워 두면 본인이 적은 달성률을 그대로 씁니다." />
              </label>
              <input
                type="number"
                name="firstProgress"
                min={0}
                max={100}
                step={1}
                defaultValue={goal?.firstProgress ?? ""}
                disabled={!canWriteFirst}
                placeholder={`본인 ${goal?.progress ?? 0}%`}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>
                {period && `${period} `}평가점수
                <HelpMark text={scoreHelp} />
              </label>
              <input
                type="number"
                name="firstScore"
                min={0}
                max={scoreCeiling}
                step={1}
                defaultValue={goal?.firstScore ?? ""}
                disabled={!canWriteFirst}
                placeholder={scoreCeiling ? `0 ~ ${scoreCeiling}` : "예: 33"}
                className={INPUT_CLASS}
              />
            </div>
            <div className="md:col-span-2">
              <label className={LABEL_CLASS}>{period && `${period} `}평가사유</label>
              <textarea
                name="firstComment"
                rows={2}
                defaultValue={goal?.firstComment ?? ""}
                disabled={!canWriteFirst}
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </div>
      </div>
    ) : null;

    const line = (key: string, children: ReactNode) => (
      <div key={key} className="grid gap-3 md:col-span-2 md:grid-cols-2">
        {children}
      </div>
    );

    if (isTeam) {
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

    const goalType = (
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
    );

    const keyResults = (
      <div className="md:col-span-2">
        <label className={LABEL_CLASS}>Key Results (핵심결과)</label>
        <textarea
          name="keyResults"
          rows={3}
          defaultValue={goal?.keyResults ?? ""}
          required
          placeholder={"타사 적정인원/팀 사례 분석\n적정 팀 구성 분석"}
          className={INPUT_CLASS}
        />
      </div>
    );

    /*
      사내 「개인목표 설정」 양식이 읽히는 차례. 팀·책임자 칸은 여기 없다 —
      한 사람의 팀·피평가자·평가자는 목표마다 달라지지 않으므로 목록 맨 위
      「기본정보」에 한 번만 적는다. 관리자만 남의 목표를 대신 등록할 수 있어서
      그 경우에만 배정 칸이 맨 아래에 붙는다.
    */
    if (isOkr) {
      return (
        <>
          {evalBlock}
          {/*
            평가만 하는 사람에게는 목표 내용 칸을 통째로 잠근다. `contents`라
            fieldset 자체는 자리를 차지하지 않아 격자가 그대로 유지된다.
          */}
          <fieldset disabled={!canEditContent} className="contents">
            {line("parent", parent)}
            {line("kind", <>{half}{goalType}</>)}
            {line("objective", title)}
            {line("kr", keyResults)}
            {/* 달성률은 평가 칸으로 올라갔다 — 같은 칸을 두 번 두지 않는다. */}
            {line("weight", showEval ? weight : <>{weight}{progress}</>)}
            {line("state", <>{status}{dueDate}</>)}
            {line("desc", description)}
            {assignment}
          </fieldset>
        </>
      );
    }

    // 책임목표 — 아래 팀목표가 굴러 올라온 값이라 지표·목표수준·가중치가 없다.
    return (
      <>
        {line("title", title)}
        {line("parent", parent)}
        {line(
          "division",
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
        {line("state", <>{status}{dueDate}</>)}
        {line("progress", progress)}
        {assignment}
        {line("desc", description)}
      </>
    );
  }

  function GoalRowCard({ goal }: { goal: GoalNode }) {
    const level = goal.level as GoalLevel;
    const parent = goal.parentId ? nodeById.get(goal.parentId) : null;
    // 마감 상태를 여기서 한 번에 반영한다. 진척은 목표 확정 뒤에도 올리고,
    // 목표 내용·삭제·집계 제외는 확정되면 잠긴다.
    // 전사목표는 「조직 목표 관리」에서만 고친다 — 아래 참조.
    const editable = canManage(goal) && lock.canEditGoals && level !== "COMPANY";
    const isEditing = editingGoal?.id === goal.id;
    const parentLevel = GOAL_PARENT_LEVEL[level];
    // 상위 목표 후보도 볼 수 있는 범위 안에서만 고르게 한다.
    const parentOptions = parentLevel ? visibleRows(byLevel(parentLevel)) : [];
    const flag = ownerFlag(goal, now);
    const agreement = asAgreementStatus(goal.agreementStatus);
    /*
      팀목표는 굴려 올린 몫을, 나머지 층은 사람이 적어 넣은 값을 보여 준다.
      어느 쪽이든 정수로 끊는다 — 33.333333333333336%가 줄에 박히면 그 줄을
      읽을 수가 없다.
    */
    const shownWeight = Math.round(usesDerivedWeight(level) ? goal.rollupWeight : goal.weight);
    /*
      평가를 여는 자리. 목표를 관리하는 사람(본인·팀장·관리자)뿐 아니라 조직도가
      정한 1차 평가자에게도 띄운다 — 팀장의 개인목표를 평가하는 건 책임·운영책임인데,
      그 사람은 그 팀의 팀장이 아니라 「수정」이 뜨지 않는다.
    */
    const evalPeriod = evalPeriodLabel(cycle);
    const subject = goalSubject(goal);
    const subjectEval = subject ? (evaluatorByPerson.get(subject.id) ?? null) : null;
    const evaluator = subjectEval?.first ?? null;
    const evalDone = !!goal.evalDoneAt;
    // 평가완료는 1차 평가자와 관리자만 누른다 — 피평가자가 스스로 «다 됐다»고
    // 할 수 있으면 그 표시가 아무것도 뜻하지 않는다.
    const canFinishEval = isAdmin || evaluator?.id === session!.user.id;
    const showEvalEntry =
      usesEvaluation(level, cycle) &&
      lock.canEditGoals &&
      !isEditing &&
      (canManage(goal) || evaluator?.id === session!.user.id);
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

    /*
      목표 한 건이 제목·달성률·Key Results·평가척도·버튼까지 달고 있어서, 다섯
      건만 쌓여도 한 화면에 안 들어온다. **처음에는 접어 둔다** — 목록은 «무엇이
      몇 %인지»를 훑는 자리이고, 손댈 카드만 펴면 된다. 접어도 머리글 한 줄(제목 ·
      상위 · 가중치 · 피평가자 · 달성률)은 남는다: 그게 목록을 훑는 이유다.
      고치는 중인 카드는 접히면 안 되므로 그때만 펼쳐 둔다.
    */
    return (
      <details
        data-goal-card
        open={isEditing || undefined}
        className={`group ${CARD_CLASS} border-l-2 p-4 ${GOAL_LEVEL_RAMP_BORDER[level]} ${
          goal.excluded || goal.targetExcluded ? "opacity-60" : ""
        }`}
      >
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center gap-2">
          {/* 접힘 표시. 눌러서 펼치는 자리라는 걸 알려 주는 유일한 표시다. */}
          <span className="select-none text-[10px] text-slate-400 group-open:hidden">▶</span>
          <span className="hidden select-none text-[10px] text-slate-400 group-open:inline">▼</span>
          <LevelDot level={level} />
          <span className="text-sm font-medium text-slate-800">{goalTitle(goal)}</span>
          {/*
            책임목표에는 부문 이름을 붙이지 않는다. 책임목표 탭은 그 자체가
            부문별 목록이라 «재무경영관리»가 줄마다 되풀이될 뿐이고, 정작 읽어야
            할 목표 이름 옆자리를 먹는다. 팀목표의 팀 이름과 개인목표의 담당자
            이름은 남긴다 — 여러 팀·여러 사람 것이 한 목록에 섞여 나오므로 그건
            누구 목표인지 가려 주는 유일한 표시다.
          */}
          <StatusBadge status={goal.rollupStatus} />
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
          {/*
            «상위 · 가중치 · 피평가자»는 제목 옆에 붙인다. 아래 줄로 내려 두면 한
            카드가 두 줄이 되어, 목록을 훑을 때 눈이 줄마다 두 번 꺾인다. 이 줄에
            더 넣지 않는다 — 지표·목표수준·마감일까지 늘어놓으면 정작 목표 이름이
            밀린다. 자세한 값은 카드를 펴서 본다.
          */}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal text-slate-500">
            {parent && (
              <span>
                상위: {parent.title} ({GOAL_LEVEL_LABEL[parent.level as GoalLevel]})
              </span>
            )}
            {!parent && parentLevel && (
              <span className="text-status-critical">상위 목표 미연결</span>
            )}
            {shownWeight > 0 && <span>가중치 {shownWeight}%</span>}
            {level === "INDIVIDUAL" && subject && <span>피평가자: {evaluatorLabel(subject)}</span>}
            {level === "TEAM" && evaluator && <span>1차 평가자: {evaluatorLabel(evaluator)}</span>}
            {/*
              사슬이 사장까지 올라갔다면 조직도 어딘가가 비어 있다는 뜻이다.
            */}
            {level === "TEAM" && subjectEval?.note && (
              <span className="text-status-critical">{subjectEval.note}</span>
            )}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {/*
              «왜 0%인지»는 숫자 바로 옆에 있어야 읽힌다. 아래 버튼 줄에 두면
              숫자와 설명이 멀어서 0%만 보고 «고장인가»가 된다. 0%가 아닐 때는
              설명할 것이 없으므로 띄우지 않는다.
            */}
            {/*
              0%인 까닭은 «하위가 없어서»일 때만 적는다. 하위가 붙어 있는데
              아직 아무도 진척을 안 올려서 0인 경우(목표설정 단계에는 늘 그렇다)
              까지 «하위 목표가 없어»라고 적으면, 방금 연결한 개인목표가 안
              붙은 줄 알고 다시 연결하러 가게 된다.
            */}
            {isAutoCalculated(level) && goal.rollupCounted === 0 && (
              <span className="text-xs font-normal text-slate-500">
                {goal.children.length === 0
                  ? showsProgress
                    ? "하위 목표가 없어 0%입니다"
                    : "하위 목표가 없습니다"
                  : showsProgress
                    ? "집계할 하위 목표가 없어 0%입니다"
                    : "집계할 하위 목표가 없습니다"}
              </span>
            )}
            {showsProgress && (
              <span className="text-sm font-semibold tabular-nums text-slate-700">
                {goal.rollupProgress}%
              </span>
            )}
          </span>
        </div>

        {/*
          목표설정 단계에서는 값이 아니라 **선**이다. 달성률을 안 띄우는 단계인데
          막대만 차 있으면 «무슨 수치지»가 되고, 숫자가 없어 확인할 길도 없다.
          빈 막대로 두어 제목과 아래 줄을 갈라 주는 선 노릇만 하게 한다.
        */}
        <div className="mt-2">
          <Meter value={showsProgress ? goal.rollupProgress : 0} size="md" />
        </div>
        </summary>

        <div>
        {/*
          Key Results. 적은 줄을 그대로 늘어놓는다 — 번호(① ② ③)를 붙이지
          않는다. 공통 양식이 아니라 사람마다 적는 방식이 달라서, 화면이 멋대로
          번호를 붙이면 «1) 2)»로 적은 사람 것이 «① 1) …»로 겹쳐 읽힌다.
        */}
        {usesKeyResults(level) && keyResultLines(goal.keyResults).length > 0 && (
          <div className="mt-2">
            {/* ① ② 만 늘어놓으면 이게 무슨 목록인지가 안 읽힌다. */}
            <p className="text-[11px] font-medium text-slate-500">Key Results (핵심결과)</p>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
              {keyResultLines(goal.keyResults).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
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
        {needsAgreement(goal.level) && agreement === "AGREED" && goal.agreedAt && (
          <p className="mt-1 text-[11px] text-slate-400">
            {goal.agreedBy?.name ?? "팀장"} 합의 · {formatKSTDate(goal.agreedAt)}
          </p>
        )}

        {agreementActions}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/*
            달성률·현재수준·메모를 이 줄에서 바로 받던 자리다. 이제 그 값들은
            평가 칸(폼 맨 위)에서 사유와 같이 적는다 — 숫자만 툭 올려 두면
            «왜 그 숫자인지»가 아무 데도 남지 않는다. 대신 그 자리에 평가를 여는
            자리를 둔다. 「수정」과 같은 폼을 연다.
          */}
          {showEvalEntry && (
            <Link
              href={buildHref({ edit: goal.id })}
              className={`rounded-md border px-3 py-1 text-xs font-medium ${
                evalDone
                  ? "border-status-critical bg-status-critical/10 text-status-critical hover:bg-status-critical hover:text-white"
                  : "border-brand-green bg-brand-green-light text-brand-green-dark hover:bg-brand-green hover:text-white"
              }`}
            >
              {evalPeriod && `${evalPeriod} `}평가{evalDone && " 완료"}
            </Link>
          )}
          {/*
            누르는 버튼은 오른쪽 끝에 한 덩어리로 모은다 — 왼쪽은 «지금 어떤
            상태인가»(합의·진척)를 읽는 자리이고, 오른쪽은 «내가 무엇을 할 수
            있나»를 누르는 자리다. 섞여 있으면 읽는 도중에 버튼이 끼어든다.
            버튼마다 ml-auto를 붙이면 어떤 버튼이 보이느냐에 따라 줄이 갈라지므로
            묶음 하나에만 붙인다.
          */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
          {/*
            펼쳐진 폼을 닫는 자리는 폼 아래 «저장» 옆이다 — 다 고치고 손이 가
            있는 곳이 거기다. 이 오른쪽 위 줄에서 «수정 닫기»를 찾으려면 긴 폼을
            거슬러 올라가야 했다. 그래서 여기는 여는 자리만 남긴다.
          */}
          {editable && !isEditing && (
            <Link
              href={buildHref({ edit: goal.id })}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
            >
              수정
            </Link>
          )}
          {/*
            중단 처리 — 연중에 접은 목표를 남겨 두면 «달성 못 한 목표»로 계속
            세어져 팀 달성률을 끌어내린다. 목표를 확정(마감)한 뒤에도 눌러야
            하므로 내용 잠금이 아니라 진척 잠금을 따른다. 목표설정 단계에는
            띄우지 않는다 — 아직 시작도 안 한 목표를 접을 일은 없다.
          */}
          {isAdmin && canWriteProgress && lock.canEditProgress && (
            <ActionForm
              action={setGoalDropped.bind(null, goal.id, goal.status !== "DROPPED")}
              successMessage={
                goal.status === "DROPPED" ? "중단을 해제했습니다." : "중단 처리했습니다."
              }

            >
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
              >
                {goal.status === "DROPPED" ? "중단 해제" : "중단 처리"}
              </button>
            </ActionForm>
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
              {/* 어느 단계를 통해 지우는 중인지 — 잠금 판단이 여기서 갈린다. */}
              <input type="hidden" name="viewCycleId" value={cycle?.id ?? ""} />
              <button
                type="submit"
                className="rounded-md border border-red-200 px-3 py-1 text-xs text-status-critical hover:bg-red-50"
              >
                삭제
              </button>
            </ActionForm>
          )}
          </div>
        </div>

        {/*
          고침 폼. 저장하면 스스로 닫힌다(`successHref`) — 다 고치고 저장을
          눌렀는데 긴 폼이 그대로 펼쳐져 있으면 저장이 됐는지도 헷갈리고,
          목록으로 돌아오려면 «수정 닫기»를 또 찾아 눌러야 한다.
        */}
        {isEditing && (
          <ActionForm
            action={updateGoal}
            successMessage="수정되었습니다."
            successHref={buildHref({ edit: null })}
            className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2"
          >
            <input type="hidden" name="goalId" value={goal.id} />
            {/* 지금 어느 평가를 통해 고치는 중인지. 달성률을 적을 수 있는
                단계인지가 여기서 갈린다 — 목표는 한 벌이고 중간·최종평가가
                그걸 빌려 보기 때문에 목표가 저장된 사이클만으로는 알 수 없다. */}
            <input type="hidden" name="viewCycleId" value={cycle?.id ?? ""} />
            <GoalFormFields level={level} goal={goal} parentOptions={parentOptions} />
            <div className="flex flex-wrap items-center gap-2 md:col-span-2">
              <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                저장
              </button>
              {/* 저장과 나란히, 같은 모양으로 — 고친 손이 그 자리에 있다. */}
              <Link href={buildHref({ edit: null })} className={PRIMARY_BUTTON_CLASS}>
                닫기
              </Link>
              {/*
                평가완료는 저장과 다른 일이라 색을 달리한다 — 저장은 적은 것을
                남기는 일이고, 이건 «이 평가는 여기서 끝»이라고 못을 박는 일이다.
                폼 안에 폼을 넣을 수 없어서 아래에 따로 둔 폼을 `form` 속성으로
                잇는다.
              */}
              {usesEvaluation(level, cycle) && canFinishEval && (
                <button
                  type="submit"
                  form={`evaldone-${goal.id}`}
                  className={`rounded-md px-4 py-2 text-sm font-medium ${
                    evalDone
                      ? "border border-status-critical text-status-critical hover:bg-red-50"
                      : "bg-goal-3 text-white hover:brightness-95"
                  }`}
                >
                  {evalDone ? "평가완료 취소" : "평가완료"}
                </button>
              )}
            </div>
          </ActionForm>
        )}
        {/*
          위 폼의 «평가완료» 단추가 눌러 보내는 폼. 폼끼리 겹칠 수 없어 밖에 둔다.
          누르고 나면 폼은 닫는다 — 결과는 목록의 붉은 «완료»로 읽힌다.
        */}
        {isEditing && usesEvaluation(level, cycle) && canFinishEval && (
          <ActionForm
            id={`evaldone-${goal.id}`}
            action={setGoalEvalDone.bind(null, goal.id, !evalDone)}
            successMessage={evalDone ? "평가완료를 취소했습니다." : "평가를 완료했습니다."}
            successHref={buildHref({ edit: null })}
            className="hidden"
          >
            <input type="hidden" name="viewCycleId" value={cycle?.id ?? ""} />
          </ActionForm>
        )}
        </div>
      </details>
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
    /*
      소계의 단위는 «한 사람의 한 반기»다. 상반기 100% + 하반기 100%가 제대로
      세운 것인데 한 덩어리로 더하면 200%가 되고, 거기에 «100%로 맞춰 주세요»가
      붙으면 맞출 수 없는 걸 맞추라는 말이 된다.
    */
    const buckets = new Map<string, { ownerKey: string; half: string; sum: number }>();
    for (const g of rows) {
      const ownerKey = g.ownerId ?? g.id;
      const half = usesHalf(level) ? goalHalf(g) : "";
      const key = `${ownerKey}|${half}`;
      const bucket = buckets.get(key) ?? { ownerKey, half, sum: 0 };
      bucket.sum += g.weight > 0 ? g.weight : 0;
      buckets.set(key, bucket);
    }
    const halfRank = (half: string) =>
      half === GOAL_HALVES[0] ? 0 : half === GOAL_HALVES[1] ? 1 : 2;
    const subtotals = [...buckets.values()].sort((a, b) => halfRank(a.half) - halfRank(b.half));
    const ownerCount = new Set(subtotals.map((b) => b.ownerKey)).size;
    const ownersOffTarget = new Set(
      subtotals.filter((b) => Math.round(b.sum) !== 100).map((b) => b.ownerKey)
    ).size;

    /*
      전사목표는 이 탭에서 만들지 않는다. 한 벌뿐인 회사 목표를 세 군데(조직 목표
      관리·상단 표·이 탭)에서 고칠 수 있게 두면 어디서 고친 것이 진짜인지가
      흐려진다. 여기서는 굴러 올라온 달성률을 읽기만 한다.
    */
    const canCreate =
      lock.canEditGoals &&
      level !== "COMPANY" &&
      (isAdmin ||
        level === "INDIVIDUAL" ||
        (level === "TEAM" && teams.some((t) => t.leaderId === session!.user.id)));

    return (
      <div data-goal-list className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <LevelDot level={level} />
          <h2 className="text-lg font-semibold">{GOAL_LEVEL_LABEL[level]}</h2>
          <span className="text-sm text-slate-500">{rows.length}건</span>
          {showsProgress && (
            <span className="text-sm text-slate-500">평균 달성률 {averageProgress(rows)}%</span>
          )}
          {/*
            사내 양식의 "소계" 줄. 가중치 합이 100이어야 비중이 의도대로 먹는데,
            줄마다 숫자를 눈으로 더하게 두면 아무도 확인하지 않는다. 100이 아닐
            때만 눈에 띄게 표시한다.
          */}
          {usesWeightSubtotal(level) &&
            rows.length > 0 &&
            ownerCount === 1 &&
            subtotals.map((bucket) => {
              const sum = Math.round(bucket.sum);
              return (
                <span
                  key={bucket.half}
                  className={`text-sm ${
                    sum === 100 ? "text-slate-500" : "font-medium text-status-critical"
                  }`}
                >
                  {bucket.half ? `${bucket.half} ` : ""}가중치 소계 {sum}%
                  {sum !== 100 && " — 100%로 맞춰 주세요"}
                </span>
              );
            })}
          {usesWeightSubtotal(level) && ownerCount > 1 && ownersOffTarget > 0 && (
            <span className="text-sm font-medium text-status-critical">
              가중치 소계가 100%가 아닌 사람 {ownersOffTarget}명
            </span>
          )}
          {/* 목록을 훑을 때는 머리글만 보면 된다 — 한 번에 접는 자리. */}
          {rows.length > 0 && (
            <span className="ml-auto">
              <CollapseAllButton />
            </span>
          )}
        </div>

        {/*
          기본정보 — 팀·피평가자·평가자는 목표마다 달라지지 않는다. 목표를 세울
          때마다 같은 세 칸을 다시 고르게 하면 등록이 느려지기만 하고, 카드마다
          되풀이하면 정작 목표 내용이 밀린다. 그래서 목록 맨 위에 한 번만 적는다.
          **로그인한 사람 기준**이다 — 팀장·관리자가 남의 목표를 함께 볼 때는
          아래 카드마다 누구 목표인지 이름이 붙는다.
        */}
        {level === "INDIVIDUAL" && <BasicInfoTable />}

        {/*
          전사목표를 고치는 자리는 「조직 목표 관리」 한 곳이다. 여기서는 아래
          층에서 굴러 올라온 달성률을 읽는다 — 어디서 고쳐야 하는지는 적어 준다.
        */}
        {level === "COMPANY" && isAdmin && (
          <p className="text-xs text-slate-500">
            전사목표를 세우고 고치는 자리는{" "}
            <Link href="/admin/org-goals" className="text-brand-green-dark underline">
              조직 목표 관리
            </Link>
            입니다. 여기서는 아래 층에서 굴러 올라온 달성률을 봅니다.
          </p>
        )}

        {canCreate && cycle && (
          <details className={`${CARD_CLASS} p-5`}>
            <summary className="cursor-pointer text-sm font-medium text-brand-green-dark">
              + {GOAL_LEVEL_LABEL[level]} 등록
            </summary>
            <ActionForm
              action={createGoal}
              successMessage="정상 등록되었습니다."
              collapseOnSuccess
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
        ) : usesHalf(level) ? (
          /*
            팀·개인 목표는 상반기와 하반기를 갈라 놓는다. 한 덩어리로 늘어놓으면
            «지금 상반기 것을 보는 중인가»가 줄마다 헷갈리고, 반기 목표 수를 세려면
            눈으로 골라내야 한다. 아직 반기를 정하지 않은 예전 목표는 맨 아래
            «미지정»으로 모인다 — 숨기면 어디로 갔는지 알 수 없다.
          */
          <div className="flex flex-col gap-6">
            {groupByHalf(rows).map((group) => {
              const tone = HALF_TONE[group.half] ?? HALF_TONE[HALF_UNSET];
              return (
                <section
                  key={group.half}
                  className={`overflow-hidden rounded-xl border ${tone.border} ${tone.panel}`}
                >
                  <header
                    className={`flex flex-wrap items-center gap-2 border-b ${tone.border} ${tone.head} px-4 py-2.5`}
                  >
                    <h3 className={`text-sm font-semibold ${tone.text}`}>
                      {group.half === HALF_UNSET ? "구분 미지정" : `${group.half} 목표`}
                    </h3>
                    <span
                      className={`rounded-full ${tone.badge} px-2 py-0.5 text-[11px] font-medium tabular-nums`}
                    >
                      {group.items.length}건
                    </span>
                    {showsProgress && (
                      <span className="text-xs text-slate-600">
                        평균 달성률 {averageProgress(group.items)}%
                      </span>
                    )}
                  </header>
                  <div className="flex flex-col gap-3 p-3">
                    {group.items.map((g) => (
                      <GoalRowCard key={g.id} goal={g} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
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

  // 사이클이 하나도 없을 때 폼에 미리 채워둘 연도. 한 해의 평가는 세 단계가
  // 한 벌이라 연도만 넣으면 되고, 기간은 서버가 상·하반기로 나눠 넣는다.
  const thisYear = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(now)
  );

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
              ? "연도를 넣으면 목표설정 · 중간평가 · 최종평가 세 단계가 한 번에 만들어집니다. 그 안에 전사 · 책임 · 팀 · 개인목표를 등록합니다."
              : "관리자가 사이클을 열면 목표를 등록할 수 있습니다."}
          </p>
          {isAdmin && (
            <ActionForm
              action={createGoalYear}
              successMessage="그 해의 세 단계를 만들었습니다."
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <div>
                <label className={LABEL_CLASS}>연도</label>
                <input
                  type="number"
                  name="year"
                  required
                  min={2000}
                  max={2999}
                  defaultValue={thisYear}
                  className={`${INPUT_CLASS} w-32`}
                />
              </div>
              <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                목표설정 · 중간평가 · 최종평가 만들기
              </button>
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
          {/*
            마감을 푸는 자리는 마감 안내 바로 옆이다 — «왜 못 고치지»를 읽은 그
            자리에서 풀 수 있어야 한다. 관리 화면까지 건너가게 하면 그 사이에
            무엇을 하러 갔는지를 잊는다.
          */}
          {isAdmin && cycle?.status !== "CLOSED" && cycle?.goalsLockedAt && (
            <ActionForm
              action={unlockGoalSetting.bind(null, cycle.id)}
              successMessage="마감을 풀었습니다. 다시 목표를 고칠 수 있습니다."
              confirmMessage="마감을 풀면 이 평가의 목표를 다시 고칠 수 있게 됩니다. 진행할까요?"
              className="ml-2 inline-block align-middle"
            >
              <button
                type="submit"
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                마감 해제
              </button>
            </ActionForm>
          )}
          {isAdmin && cycle?.status === "CLOSED" && (
            <Link href="/admin/org-goals" className="ml-2 text-xs text-brand-green-dark underline">
              관리 화면에서 되돌리기
            </Link>
          )}
        </div>
      )}

      {/*
        전체 마감. 목표를 다 세우고 나면 «이 목표로 평가한다»고 못을 박는 자리가
        있어야 한다. 마감 전에는 누구든 목표를 고칠 수 있어서, 평가하는 도중에
        목표가 바뀌면 그 점수가 무엇을 기준으로 매겨진 것인지 남지 않는다.
        관리자에게만 보인다. 목표를 빌려다 보는 단계(중간평가·최종평가)에는
        띄우지 않는다 — 마감할 것은 원본 한 벌뿐이다.
      */}
      {isAdmin &&
        cycle &&
        !progressView &&
        !waitingForSource &&
        !cycle.goalsLockedAt &&
        cycle.status !== "CLOSED" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm font-medium text-slate-800">목표 마감</span>
          <span className="text-xs text-slate-500">
            마감하면 <b className="font-medium">이 단계에서는</b> 관리자를 포함해 아무도 목표를 고칠
            수 없습니다
            {!sharedFrom &&
              followUps.length > 0 &&
              ` — 「${followUps.map((c) => c.name).join("」 · 「")}」가 이 목표를 그대로 이어받고, 거기서는 계속 고칠 수 있습니다`}
            . 마감을 풀면 다시 고칠 수 있습니다.
          </span>
          <ActionForm
            action={lockGoalSetting.bind(null, cycle.id)}
            successMessage="목표를 마감했습니다."
            confirmMessage="이 평가의 목표를 전체 마감할까요? 마감하면 아무도 목표를 고칠 수 없습니다."
            className="ml-auto"
          >
            <button
              type="submit"
              className="rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
            >
              전체 마감
            </button>
          </ActionForm>
        </div>
      )}

      {!cycle ? (
        // 인사평가를 고르기 전에는 어느 탭이든 비워 둔다. 어느 해 숫자인지
        // 모르는 채로 목표를 읽게 두지 않는다.
        <section className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-24">
          <p className="text-base font-semibold text-slate-700">
            {selectedYear}년에 만들어진 인사평가가 없습니다
          </p>
          <p className="mt-1 text-sm text-slate-500">
            왼쪽 위에서 다른 연도를 고르면 그 해의 전사 · 책임 · 팀 · 개인 목표가 보입니다.
          </p>
          {cycles.length === 0 && (
            <p className="mt-4 text-xs text-slate-400">
              {isAdmin
                ? "아직 만들어진 인사평가가 없습니다 — 「조직 목표 관리」에서 먼저 만들어 주세요."
                : "아직 열린 인사평가가 없습니다. 관리자에게 문의해 주세요."}
            </p>
          )}
        </section>
      ) : waitingForSource ? (
        /*
          중간평가·최종평가는 앞 단계에서 확정된 목표를 이어받아 평가하는
          자리다. 목표설정이 아직 마감되지 않았는데 열어 두면, 평가하는 동안
          목표가 바뀔 수 있어서 «무엇을 기준으로 매긴 점수인지»가 남지 않는다.
          그래서 앞 단계를 마감하기 전까지는 목록을 열지 않고 무엇을 해야 하는지만
          적는다 — 그냥 비워 두면 화면이 고장 난 것처럼 보인다.
        */
        <section className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center">
          <p className="text-base font-semibold text-slate-700">
            「{sharedFrom!.name}」이 아직 마감되지 않았습니다
          </p>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            이 평가는 「{sharedFrom!.name}」에서 확정된 목표를 그대로 이어받습니다. 목표를
            마감하면 그 내용이 여기에 그대로 뜹니다.
          </p>
          {isAdmin ? (
            <Link
              href="/admin/org-goals"
              className="mt-5 rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
            >
              조직 목표 관리에서 목표 마감하기
            </Link>
          ) : (
            <p className="mt-4 text-xs text-slate-400">
              목표 마감은 관리자가 합니다. 인사팀에 문의해 주세요.
            </p>
          )}
        </section>
      ) : (
        <>
          {/*
            첫 화면은 «내 팀과 내 목표»부터 읽는다. 전사 목표 표를 맨 위에 두면
            화면을 열 때마다 회사 목표 여섯 줄을 지나야 자기 숫자에 닿는다.
            다른 탭에서는 상위 목표를 참고하며 목표를 세우므로 표가 먼저다.
          */}
          {!isDashboard && companyGoalBoard()}

          {isDashboard ? (
            /*
              층별 요약 카드는 «얼마나 굴러갔나»를 보는 자리다. 목표설정에서는
              달성률이 없어 전체·완료·지연이 «N · 0 · 0»으로만 남는데, 건수는
              탭 머리글이 이미 적고 있어 같은 말을 두 번 하는 칸이 된다.
              중간평가·최종평가에서만 띄운다.
            */
            <>
              {showsProgress && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {DASHBOARD_LEVELS.map((level) => (
                    <LevelSummaryCard key={level} level={level} />
                  ))}
                </div>
              )}
              {companyGoalBoard()}
            </>
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
