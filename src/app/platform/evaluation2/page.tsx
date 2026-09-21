import { Fragment } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { SearchableSelect } from "@/components/searchable-select";
import { activePrismaWhere, isEvalPopulation } from "@/lib/hr-analytics";
import { POSITION_LABEL } from "@/lib/permission-constants";
import {
  buildDivisionLineMap,
  buildEvaluatorMap,
  buildUnitHeadMap,
  evaluatorLabel,
} from "@/lib/evaluator";
import { CollapseAllButton } from "./collapse-all";
import { formatKSTDate } from "@/lib/format-kst";
import {
  GOAL_AGREEMENT_BADGE_CLASS,
  GOAL_AGREEMENT_LABEL,
  GOAL_CYCLE_ORDER,
  allowsProgressInput,
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
  ownerAverageProgress,
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
  cycleTitle,
  cycleStateLabel,
  cyclePhaseRank,
  cycleYear,
  divisionOptions,
  evalPeriodLabel,
  maxScore,
  usesEvaluation,
  PROGRESS_MAX,
  locksGoalDefinition,
  GOAL_DEFINITION_LABEL,
  keyResultLines,
  scaleValues,
  toDateInputValue,
  usesKeyResults,
  usesScales,
  usesDerivedWeight,
  usesFixedActiveStatus,
  usesStatusField,
  usesDueDateField,
  usesHalf,
  currentGoalHalf,
  inGoalHalf,
  evaluatesHalfHere,
  evalStageNameForHalf,
  FINAL_PHASE_LABEL,
  MID_PHASE_LABEL,
  usesWeightSubtotal,
  visibleGoalLevels,
  weightedProgress,
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
  lockCompetencyForm,
  lockGoalSetting,
  reopenGoalAgreement,
  requestGoalAgreement,
  unlockCompetencyForm,
  unlockGoalSetting,
  returnGoalAgreement,
  seedCompanyGoalTemplate,
  setGoalDropped,
  setGoalEvalDone,
  setGradeBonus,
  setGoalExcluded,
  updateGoal,
  saveCompetencyScores,
} from "./actions";
import {
  ORG_GRADES,
  PERSON_GRADES,
  PERSON_GRADE_CLASS,
  type GradeRatios,
} from "@/lib/final-grade";
import { InstantSelect } from "@/components/instant-select";
import { setFinalGrade, setUnitOrgGrade } from "@/app/admin/grade/actions";
import {
  loadFixedGrades,
  loadQuotaTable,
  loadUnitPlans,
  loadPerformanceScores,
  loadUnitScores,
  resolveUnitGrades,
  type PerfResult,
} from "@/lib/final-grade-data";
import {
  COMPETENCY_MAX,
  COMPETENCY_NOTES,
  COMPETENCY_SCALE,
  competencyAverage,
  competencyScoreLabel,
  isCompetencyTarget,
  pickCompetencySets,
  competencyExcluded,
  type CompetencyItem,
} from "@/lib/competency";
import {
  CompetencyRadar,
  type CompetencyRadarAxis,
} from "@/components/competency-radar";
import {
  PERFORMANCE_WEIGHT,
  COMPETENCY_WEIGHT,
  competencyScore100,
  overallScore,
  buildResultRow,
  strengthsAndWeaknesses,
  gapNote,
  type CompetencyResultRow,
} from "@/lib/competency-result";
import {
  loadCompetencyForm,
  competencyFormOpen,
  competencyFormStateLabel,
} from "@/lib/competency-form";
import { YearPhaseSelect, ParamSelect } from "./cycle-select";
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

/** 탭 한 줄의 색 — 목표 층은 브랜드 초록 하나로 쓴다. */
const TAB_CLASS = {
  on: "bg-brand-green text-white",
  off: "border border-slate-300 text-slate-600 hover:bg-slate-50",
};

/**
 * 그 단계에서 볼 수 있는 층 탭.
 *
 * 단계마다 볼 것이 다르다.
 *   - 목표진행현황: 대시보드 + 전사목표. «지금 어디까지 왔나»를 훑는 자리라
 *     층별 목록이 아니라 요약과 회사 목표를 읽는다.
 *   - 목표설정 · 중간평가 · 최종평가: 전사 · 팀 · 개인목표. 대시보드는 두지
 *     않는다 — 이 단계들은 목표를 세우고 매기는 자리이고, 요약은 진행현황이 맡는다.
 *
 * 평가결과와 HR REPORT는 탭에서 뺐다. 그 둘은 «어느 층을 보나»가 아니라 «한 해의
 * 결과»라서 단계와 나란히 놓이는 것이 맞다 — 단계 고르개로 옮겼다. 탭에 두었더니
 * 단계를 바꿔도 같은 화면이 남아 있어서 눌러도 안 넘어가는 것처럼 읽혔다.
 *
 * 실제로 보이는 층은 보는 사람의 직책이 정한다(`visibleGoalLevels`) — 팀원에게는
 * 전사목표가 뜨지 않는다.
 */
const PROGRESS_TAB_LEVELS: GoalLevel[] = ["COMPANY"];
const STAGE_TAB_LEVELS: GoalLevel[] = ["COMPANY", "TEAM", "INDIVIDUAL"];

function tabsFor(levels: GoalLevel[], progressView: boolean) {
  const allowed = progressView ? PROGRESS_TAB_LEVELS : STAGE_TAB_LEVELS;
  const levelTabs = levels
    .filter((level) => allowed.includes(level))
    .map((level) => ({
      key: level.toLowerCase(),
      label: GOAL_LEVEL_LABEL[level],
    }));
  return progressView
    ? [{ key: "dashboard", label: "대시보드" }, ...levelTabs]
    : levelTabs;
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
    <span className="relative ml-0.5 inline-block align-middle">
      {/*
        설명은 **물음표 위에 있을 때만** 뜬다. 붙어야 할 대상은 물음표 하나뿐이라
        `peer`로 그 표시에 직접 건다 — `group`으로 감싸 두었더니 목표 카드가
        `group`이라, 카드 아무 데나 스쳐도 그 카드 안 설명이 전부 펼쳐졌다.

        키보드로 온 경우(`focus-visible`)에만 함께 띄운다. 그냥 `focus`로 걸면
        마우스로 한 번 누른 뒤 설명이 계속 남아 화면을 가린다.
      */}
      <span
        role="img"
        aria-label={text}
        tabIndex={0}
        className="peer inline-flex h-[1.15em] w-[1.15em] cursor-help items-center justify-center rounded-full bg-status-critical/10 text-[0.72em] font-bold leading-none text-status-critical ring-1 ring-status-critical/40 transition-colors hover:bg-status-critical hover:text-white focus-visible:bg-status-critical focus-visible:text-white focus-visible:outline-none"
      >
        ?
      </span>
      {/*
        설명은 물음표의 **오른쪽으로** 펼친다. 물음표를 가운데 두고 좌우로
        벌리면(left-1/2 + -translate-x-1/2) 왼쪽 칸에 붙은 물음표에서는 설명의
        절반이 본문 바깥으로 나가고, 화면은 가로로 넘치는 것을 잘라내므로
        (globals.css의 html overflow-x) 첫 글자들이 통째로 잘려 나간다.
        오른쪽으로만 펼치면 물음표가 왼쪽 끝에 있어도 글이 온전히 남는다.

        물음표는 모두 칸 이름 옆, 카드 왼쪽·가운데에 있어서 오른쪽은 늘
        자리가 남는다. 손에 쥔 화면에서만 남는 자리가 좁아 폭을 줄인다 —
        줄이지 않으면 이번에는 오른쪽이 잘린다.
      */}
      <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden w-52 max-w-[calc(100vw-2.5rem)] rounded-lg sm:w-72 bg-slate-800 px-3 py-2 text-[11px] leading-relaxed font-normal text-white shadow-lg ring-1 ring-slate-900/10 peer-hover:block peer-focus-visible:block">
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
/** 절 머리 — 왼쪽에 색 막대를 세워 절의 시작을 눈에 걸리게 한다. 결과지와 HR
    REPORT가 같은 모양을 쓴다. */
function sectionHead(title: string, hint: string) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <span className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-goal-4" aria-hidden="true" />
        <h2 className="text-base font-bold whitespace-nowrap text-slate-900">
          {title}
        </h2>
      </span>
      <span className="text-xs break-keep text-slate-500">{hint}</span>
    </div>
  );
}

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
  className,
}: {
  value: number;
  color: string;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  /*
    호는 100%에서 멈춘다 — 링을 한 바퀴 넘겨 그으면 겹친 부분이 어디까지가
    값인지 알 수 없다. 달성률은 110%까지 올라가므로(`PROGRESS_MAX`) 읽어 주는
    값과 그리는 값을 따로 둔다: 가운데 숫자와 아리아 라벨은 실제 값이다.
  */
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
      className={className}
      role="img"
      aria-label={`달성률 ${Math.max(0, Math.round(value))}퍼센트`}
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
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASS[s]}`}
    >
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
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${GOAL_AGREEMENT_BADGE_CLASS[s]}`}
    >
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
const HALF_TONE: Record<
  string,
  { border: string; panel: string; head: string; text: string; badge: string }
> = {
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

/**
 * 그 층의 «평균 달성률». 개인목표만 사람 단위로 굴린다(`ownerAverageProgress`).
 *
 * 개인목표는 사람마다 가중치 합이 100%가 되게 나눠 놓은 값이라, 여러 사람의
 * 목표를 한 줄로 늘어놓고 평균하면 20%짜리 목표와 60%짜리 목표가 같은 무게로
 * 들어간다. 사람 단위로 한 번 굴리면 손으로 세는 값과 맞는다 — 다섯 목표가
 * 20%씩일 때 «1~4번 100% · 5번 90%»는 98%다.
 *
 * 나머지 층은 그대로 둔다. 전사·책임·팀목표의 달성률은 이미 아래에서 가중치로
 * 굴려 올린 값이고, 그 층에서는 목표 하나가 사람 하나가 아니라 조직 하나다.
 */
function levelAverage(level: GoalLevel, nodes: GoalNode[]): number {
  return level === "INDIVIDUAL"
    ? ownerAverageProgress(nodes)
    : averageProgress(nodes);
}

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
    /** 역량평가에서 누구 것을 볼지. 비면 본인. */
    who?: string;
    /** HR REPORT — 어느 운영책임 라인을 볼지. 비면 전체. */
    unit?: string;
    /** HR REPORT — 그 라인 안에서 어느 책임(부문) 라인만 볼지. 비면 전체. */
    dept?: string;
    /** HR REPORT의 섹터. 「scores」(평가 점수 관리) · 「exec」(임원진 REPORT). */
    rtab?: string;
    /** HR REPORT 표를 책임별로 묶을지. 「flat」이면 라인 전체를 한 줄로 세운다. */
    rgroup?: string;
    /** HR REPORT 표의 정렬. 「칸-방향」(예: perf-desc). */
    rsort?: string;
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

  const years = Array.from(new Set(cycles.map((c) => cycleYear(c)))).sort(
    (a, b) => b - a,
  );
  const todayYear = new Date().getFullYear();
  const selectedYear = legacyCycle
    ? cycleYear(legacyCycle)
    : params.year && years.includes(Number(params.year))
      ? Number(params.year)
      : (years.find((y) => y === todayYear) ?? years[0] ?? todayYear);

  const yearCycles = cycles
    .filter((c) => cycleYear(c) === selectedYear)
    .sort((a, b) => cyclePhaseRank(a) - cyclePhaseRank(b));

  /*
    진행 띠에 쓸 **내** 개인목표 현황. 단계마다 «회사가 그 단계를 열었나»와
    «내가 그 단계에서 할 일을 끝냈나»는 다른 이야기라, 사이클 상태만 보고
    그리면 남의 진도를 내 진도처럼 읽게 된다. 그래서 그 해의 단계들에서 내가
    가진 개인목표와 평가완료 수를 함께 센다.
  */
  const myYearGoals = await prisma.goal.findMany({
    where: {
      cycleId: { in: yearCycles.map((c) => c.id) },
      level: "INDIVIDUAL",
      ownerId: session!.user.id,
    },
    select: { cycleId: true, evalDoneAt: true },
  });
  const myStageStat = new Map<string, { total: number; done: number }>();
  for (const g of myYearGoals) {
    const cur = myStageStat.get(g.cycleId) ?? { total: 0, done: 0 };
    cur.total += 1;
    if (g.evalDoneAt) cur.done += 1;
    myStageStat.set(g.cycleId, cur);
  }

  const PROGRESS_PHASE = "progress";
  /*
    역량평가는 목표(GoalCycle)가 아니라 **다른 축**이다 — 목표를 몇 % 했나가
    아니라 어떤 역량을 어느 수준으로 갖췄나를 본다. 그래서 사이클이 없고,
    단계 고르개에만 「최종평가」 다음 자리로 끼워 둔다. 진행 띠가 그리는
    순서(… 최종평가 → 역량평가 → 종료)와 고르개의 순서가 같아야, 띠가
    «다음은 여기»를 가리키는 안내판 노릇을 한다.
  */
  const COMPETENCY_PHASE = "competency";
  /*
    평가결과와 HR REPORT도 사이클이 없는 «다른 축»이다 — 한 해의 결과를 읽는
    자리라 목표설정·중간평가·최종평가와 나란히 고르는 것이 맞다. 탭에 두었을
    때는 단계를 바꿔도 같은 화면이 남아서 눌러도 안 넘어가는 것처럼 읽혔다.
  */
  const RESULT_PHASE = "result";
  const REPORT_PHASE = "hrreport";
  const phaseKey = (c: { name: string; year: number }) =>
    String(cyclePhaseRank(c));
  const selectedPhase = legacyCycle
    ? phaseKey(legacyCycle)
    : (params.phase ?? PROGRESS_PHASE);
  const progressView = selectedPhase === PROGRESS_PHASE;
  const competencyView = selectedPhase === COMPETENCY_PHASE;
  const resultView = selectedPhase === RESULT_PHASE;
  const reportView = selectedPhase === REPORT_PHASE && isAdmin;
  /** 사이클(목표) 없이 도는 단계 — 탭 줄도, 목표 목록도 띄우지 않는다. */
  const offCycleView = competencyView || resultView || reportView;

  /*
    층 탭은 단계가 정한다(`tabsFor`). 볼 수 없는 층이나 이 단계에 없는 탭을
    주소로 직접 치고 들어와도 그 단계의 첫 탭으로 되돌린다 — 목표진행현황은
    대시보드, 평가 단계들은 전사목표다.
  */
  const TABS = tabsFor(myLevels, progressView);
  const tab = TABS.some((t) => t.key === params.tab)
    ? params.tab!
    : (TABS[0]?.key ?? "dashboard");

  /*
    진행현황이 읽을 사이클 — 그 해에서 **자기 목표를 가진 가장 앞선 단계**다.
    마감할 때마다 다음 단계가 목표를 복사해 가므로, 가장 앞선 단계가 곧 지금
    쓰이고 있는 목표다. 아직 아무 단계도 마감하지 않았으면 목표설정이 그것이다.
  */
  const goalCounts = await prisma.goal.groupBy({
    by: ["cycleId"],
    _count: { _all: true },
  });
  const countByCycle = new Map(
    goalCounts.map((g) => [g.cycleId, g._count._all]),
  );
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
      select: {
        id: true,
        name: true,
        division: true,
        businessUnit: true,
        leaderId: true,
      },
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
        /* 인사평가 모수를 가리는 값 — 정규직인가, 계약직 예외 팀인가. */
        employmentType: true,
        hiddenFromDirectory: true,
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
      manualByUser.get(g.ownerId) ?? null,
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
    마감 카드를 띄우는 화면인가. 위쪽 마감 안내 줄이 이 카드와 같은 말을 하므로,
    카드가 뜨는 화면에서는 그 줄을 띄우지 않는다 — 둘 다 뜨면 마감을 누른 순간
    안내 줄이 새로 생겨서 카드가 한 칸 아래로 밀린다.
  */
  const lockCardShown =
    isAdmin && !!cycle && !progressView && !offCycleView && !waitingForSource;
  /*
    평가 단계가 **자기 목표를 따로 갖고 있는가**.

    이 앱의 기본은 «목표 한 벌을 단계들이 함께 본다»다(`sourceCycleId`) — 그래야
    최종평가에서 고친 값이 중간평가에도 그대로 있다. 그런데 관리 화면에는 목표를
    다른 사이클로 베껴 오는 자리도 있어서(「목표 복사」), 그걸 쓰면 단계마다 목표가
    **따로** 생긴다. 그때부터 같은 상반기 목표가 중간평가와 최종평가에서 서로 다른
    값으로 굴러가는데, 화면에는 아무 표시가 없어서 왜 다른지 알 수 없었다.

    목표설정은 원본이니 «따로 있다»가 정상이라 세지 않는다.
  */
  const ownGoalsInStage =
    !!cycle &&
    !cycle.sourceCycleId &&
    cyclePhaseRank(cycle) >= 2 &&
    (countByCycle.get(cycle.id) ?? 0) > 0;
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
          cyclePhaseRank(c) > cyclePhaseRank(cycle),
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

  /** 사람 → 그 사람의 팀. 팀장이 고를 수 있는 피평가자를 가리는 데 쓴다. */
  const teamIdOfPerson = new Map(people.map((p) => [p.id, p.teamId ?? null]));
  const personOptions = people.map((p) => ({
    value: p.id,
    label: `${p.name} ${POSITION_LABEL[p.position]}`,
    sublabel: p.team?.name
      ? `(${p.team.name})`
      : p.division
        ? `(${p.division})`
        : undefined,
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
  const visibleRows = (rows: GoalNode[]) =>
    rows.filter((g) => canViewGoalRow(g, viewer, org));

  /*
    ── 역량평가 ─────────────────────────────────────────────────────────────
    필요한 것만 그때 읽는다. 다른 단계(목표설정·중간평가…)에서는 이 쿼리가
    돌지 않는다.
  */
  /**
   * 역량평가 화면에 뜨는 사람 — **평가 관계에 있는 사람만**이다.
   *
   * 역량평가는 조직도를 따라 두 갈래로만 돈다: 담당은 그 팀의 팀장이, 팀장은
   * 부문의 책임(없으면 본부의 운영책임)이 평가한다. 그래서 목록에 필요한 것은
   * «내 것»과 «내가 1차 평가자인 사람» 둘뿐이다. 관리자는 인사팀 몫으로 전원을
   * 본다.
   *
   * 목표의 범위 규칙(부문·본부까지 훑는 `canViewGoalRow`)은 쓰지 않는다. 그
   * 규칙을 대면 팀장의 목록에 사장까지 들어오고, 평가할 일도 없는 사람의 점수를
   * 열어 보게 된다.
   */
  /*
    역량평가 화면과 「평가결과」 결과지는 같은 데이터를 본다 — 그 해 양식, 그
    사람의 점수, 팀장 코멘트. 그래서 읽는 조건도 하나로 묶는다. 다른 단계·탭에서는
    이 쿼리가 돌지 않는다.
  */
  const personView = competencyView || resultView;
  const competencyFormEarly = personView
    ? await loadCompetencyForm(selectedYear)
    : null;
  /**
   * 인사평가 모수 — **정규직 + 영업관리팀 계약직**, 그중 담당·팀장, 인사팀이
   * 빼 두지 않은 사람.
   *
   * 세 화면(역량평가 · 평가결과 · HR REPORT)이 같은 모수를 봐야 등급 정원이
   * 어긋나지 않는다. 고용형태를 여기서 거르기 전에는 평가2가 계약직·기능직까지
   * 세어, 「평가대상자 관리」와 사람 수가 달랐다.
   */
  const inEvalPopulation = (p: (typeof people)[number]) =>
    isEvalPopulation(p) &&
    isCompetencyTarget(p.position) &&
    !(
      competencyFormEarly &&
      competencyExcluded(p, competencyFormEarly.targets).excluded
    );

  const competencyPeople = personView
    ? people.filter((p) => {
        // 정규직(+영업관리팀 계약직)만 센다.
        if (!isEvalPopulation(p)) return false;
        // 담당·팀장만 평가받는다. 책임·운영책임·사장은 대상이 아니다.
        if (!isCompetencyTarget(p.position)) return false;
        /*
          인사팀이 「평가 제외」로 빼 둔 사람·팀은 목록에 아예 오지 않는다
          (비서실처럼 시스템 밖에서 따로 처리하는 조직). 빼 둔 사람이 목록에
          남아 있으면 평가자가 «왜 점수가 안 들어가지»를 겪는다.
        */
        if (
          competencyFormEarly &&
          competencyExcluded(p, competencyFormEarly.targets).excluded
        ) {
          return false;
        }
        if (isAdmin) return true;
        if (p.id === session!.user.id) return true;
        return evaluatorByPerson.get(p.id)?.first?.id === session!.user.id;
      })
    : [];
  const competencyTarget = personView
    ? (competencyPeople.find((p) => p.id === params.who) ??
      competencyPeople.find((p) => p.id === session!.user.id) ??
      competencyPeople[0] ??
      null)
    : null;
  const competencyForm = competencyFormEarly;
  const competencyReview =
    personView && competencyTarget
      ? await prisma.competencyReview.findUnique({
          where: {
            year_userId: { year: selectedYear, userId: competencyTarget.id },
          },
          select: { leadComment: true },
        })
      : null;
  const competencyScores =
    personView && competencyTarget
      ? await prisma.competencyScore.findMany({
          where: {
            review: { year: selectedYear, userId: competencyTarget.id },
          },
          select: {
            itemKey: true,
            selfScore: true,
            leadScore: true,
            leadBy: { select: { name: true } },
            updatedAt: true,
          },
        })
      : [];

  /*
    성과평가 점수 — 그 해 **최종평가**에서 목표마다 1차 평가자가 매긴 점수의 합.
    가중치 합이 100이므로 합이 곧 100점 자리 점수다(상한은 가중치의 110%라
    110점까지 나올 수 있다). 「성과평가 = 최종평가」라 다른 단계는 보지 않는다.
  */
  const finalCycle = yearCycles.find((c) => cyclePhaseRank(c) === 3) ?? null;
  /*
    성과점수는 결과지·HR REPORT·등급 관리가 **같은 함수**에서 읽는다
    (`loadPerformanceScores`). 두 화면이 각자 세던 때에는 한쪽이 96점, 다른 쪽이
    비어 있는 일이 실제로 있었고 어느 쪽이 맞는지 아무도 몰랐다. 규칙(그 해 네
    단계를 한꺼번에 · 목표 하나당 한 줄 · 그 단계가 매기는 반기만)은 그 함수에
    적어 두었다.
  */
  const rankOfCycle = (cycleId: string) => {
    const c = yearCycles.find((x) => x.id === cycleId);
    return c ? cyclePhaseRank(c) : 0;
  };
  const perfByTarget: Map<string, PerfResult> =
    personView && competencyTarget
      ? await loadPerformanceScores(
          [competencyTarget.id],
          yearCycles.map((c) => c.id),
          finalCycle,
          rankOfCycle,
        )
      : new Map();
  const targetPerf = competencyTarget
    ? (perfByTarget.get(competencyTarget.id) ?? null)
    : null;
  const performanceGoals = targetPerf?.goals ?? [];

  /*
    성과점수가 비었을 때 **어디를 봐야 하는지**를 화면에 적는다.

    그 해 단계마다 그 사람의 개인목표가 몇 건 있고 그중 몇 건에 점수가 적혀
    있는지 세기만 한다. 한 줄이면 «목표가 아예 없는 것»과 «목표는 있는데 점수가
    비어 있는 것»이 갈리고, 어느 단계를 열어야 하는지도 같이 읽힌다 — 「0건
    평가됨」은 그 둘을 구별해 주지 않아서, 다음에 무엇을 눌러야 하는지 알 수
    없었다. 집계에서 빼 둔 목표(`excluded`)까지 세는 것도 일부러다: 그 때문에
    0건이 된 경우를 이 줄이 드러낸다.
  */
  const goalSpots =
    personView && competencyTarget
      ? await prisma.goal.findMany({
          where: { level: "INDIVIDUAL", ownerId: competencyTarget.id },
          select: { cycleId: true, firstScore: true, excluded: true },
        })
      : [];
  /*
    그 해 밖에 있는 목표도 함께 알려 준다.

    결과지는 연도를 따로 고르는 화면이라, 목표를 2027년 단계에 등록해 놓고
    2026년 결과지를 보고 있으면 «어느 단계에도 없습니다»가 뜬다 — 그 말만으로는
    목표를 잘못 등록한 것인지 연도를 잘못 고른 것인지 알 수 없다. 어느 해 어느
    단계에 몇 건 있는지 적어 주면 둘이 바로 갈린다.
  */
  /*
    개인목표가 **한 건도** 없을 때 남는 두 가지를 가려낸다.

    ① 같은 이름의 다른 계정에 달려 있다. 사람이 두 줄로 들어와 있으면(예전
       가져온 줄과 지금 쓰는 줄) 화면에서는 같은 「박성훈 담당」인데 목표는 한쪽에,
       결과지가 고른 사람은 다른 쪽이 된다. 이름만 같고 id가 다르면 어떤 쿼리로도
       만나지 않는다.
    ② 개인목표가 아니라 **팀목표**다. 팀의 일을 팀장이 아니라 담당 이름으로
       적어 두면 목록에서는 그 사람 일로 보이지만, 성과점수는 개인목표만 센다
       (가중치 합이 100이 되는 층이 거기다).

    둘 다 «없다»는 말로는 구별되지 않아서 사람이 다음에 무엇을 해야 할지 알 수
    없었다. 개인목표가 있을 때는 이 쿼리를 돌리지 않는다.
  */
  const lookAlike =
    personView && competencyTarget && goalSpots.length === 0
      ? await prisma.goal.findMany({
          where: {
            OR: [
              { ownerId: competencyTarget.id },
              {
                level: "INDIVIDUAL",
                owner: { name: competencyTarget.name },
              },
            ],
          },
          select: {
            level: true,
            ownerId: true,
            owner: { select: { name: true, email: true } },
          },
        })
      : [];
  /*
    **같은 팀에서 개인목표를 가진 사람들.** 이름으로 찾는 것만으로는 부족하다 —
    동명이인을 「박성훈(인사)」처럼 한쪽만 고쳐 두면 이름이 더는 같지 않아서
    이름으로는 만나지 않는데, 목표는 여전히 다른 쪽 계정에 달려 있다. 그때 결과지는
    «개인목표가 한 건도 없다»고만 말하고, 사람은 눈앞의 화면에서 그 목표를 보고
    있으니 믿을 수가 없다.

    그래서 «이 팀에서 개인목표를 가진 사람은 누구누구인가»를 그대로 적는다. 목록에
    비슷한 이름이 하나 더 있으면 그것이 답이고, 없으면 정말 목표가 없는 것이다.
  */
  const teamOwners =
    personView && competencyTarget?.teamId && goalSpots.length === 0
      ? await prisma.goal.groupBy({
          by: ["ownerId"],
          where: {
            level: "INDIVIDUAL",
            teamId: competencyTarget.teamId,
            ownerId: { not: null },
          },
          _count: { _all: true },
        })
      : [];
  const teamOwnerNames = await (async () => {
    if (teamOwners.length === 0) return "";
    const ids = teamOwners
      .map((r) => r.ownerId)
      .filter((id): id is string => !!id);
    const people = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(people.map((u) => [u.id, u.name]));
    return teamOwners
      .map((r) => `${nameOf.get(r.ownerId!) ?? "?"} ${r._count._all}건`)
      .join(" · ");
  })();

  const sameName = lookAlike.filter(
    (g) => g.level === "INDIVIDUAL" && g.ownerId !== competencyTarget?.id,
  );
  const otherLevels = lookAlike.filter(
    (g) => g.ownerId === competencyTarget?.id && g.level !== "INDIVIDUAL",
  );

  const cycleById = new Map(cycles.map((c) => [c.id, c]));
  const elsewhere = (() => {
    const inYear = new Set(yearCycles.map((c) => c.id));
    const byCycle = new Map<string, number>();
    for (const g of goalSpots) {
      if (inYear.has(g.cycleId)) continue;
      byCycle.set(g.cycleId, (byCycle.get(g.cycleId) ?? 0) + 1);
    }
    return [...byCycle.entries()]
      .map(([id, n]) => {
        const c = cycleById.get(id);
        return c ? `${cycleTitle(c)} ${n}건` : null;
      })
      .filter(Boolean)
      .join(" · ");
  })();

  /*
    최종등급 — **상대평가**라서 그 사람만 봐서는 알 수 없다.

    같은 **운영책임 라인**에서 평가를 끝낸 사람 전부의 종합점수를 모아 순위를
    내고, 그 라인의 조직등급에 배정된 정원만큼 위에서부터 끊는다. 결과지 한 장을
    그리는 데 라인 사람 전부를 읽는 것이 무거워 보이지만, 상대평가에서 «몇 등»은
    그것 말고 나올 길이 없다. 「평가결과」에서만 읽는다.

    사슬에 운영책임이 없는 사람은 등급을 매기지 않는다 — 어느 정원에서 몇 등인지
    말할 수 없기 때문이다. 화면이 «운영책임 미지정»이라고 알린다.
  */
  /*
    등급을 매기는 **묶음은 «운영책임 라인»**이다 — 오동률 이사가 인사 · 구매 ·
    경영지원 · 재경 · 경영기획을 맡으면 그 다섯 팀이 한 묶음이다.

    예전에는 업무단위 이름으로 묶었는데, 이름이 비어 있거나 팀마다 다르게 적혀
    있으면 사람들이 「업무단위 미지정」 한 덩어리로 몰려 상대평가의 묶음이 뜻을
    잃었다. 실제로 회사가 굴러가는 단위는 «누가 그 라인을 맡는가»라서 사람으로
    묶는다(`buildUnitHeadMap`). 열쇠는 그 운영책임의 id다.
  */
  const unitHeadByPerson = buildUnitHeadMap(people, teams);
  const NO_UNIT = "__no_head__";
  const unitOf = (p: { id: string }) =>
    unitHeadByPerson.get(p.id)?.id ?? NO_UNIT;
  /** 「오동률 운영책임」 — 화면에 적는 묶음 이름. */
  const unitLabel = (key: string) => {
    if (key === NO_UNIT) return "운영책임 미지정";
    const head = people.find((p) => p.id === key);
    return head ? `${head.name} ${POSITION_LABEL[head.position]}` : "운영책임";
  };
  /*
    한 칸 더 잘게 — **책임(부문) 라인**. 운영책임 라인은 백 명이 넘어 화면에서
    한눈에 읽히지 않는다. 조직도에서 팀 위에 있는 부문을 그대로 따라가 「누구
    책임 라인」으로 묶는다(`buildDivisionHeadMap`).

    보기를 좁히는 데만 쓴다 — 등급은 운영책임 라인에서 매긴 값을 그대로 보여
    준다. 작은 묶음에서 순위를 다시 내면 같은 사람이 화면마다 다른 등급을 받는다.
  */
  const deptLineByPerson = buildDivisionLineMap(people, teams);
  const NO_DEPT = "__no_dept__";
  /** 묶는 열쇠는 **부문 이름**이다 — 책임이 아직 없는 부문도 조직도대로 갈린다. */
  const deptOf = (p: { id: string }) =>
    deptLineByPerson.get(p.id)?.key ?? NO_DEPT;
  const deptHeadByKey = new Map<string, string>();
  for (const line of deptLineByPerson.values()) {
    if (line?.head && !deptHeadByKey.has(line.key)) {
      deptHeadByKey.set(
        line.key,
        `${line.head.name} ${POSITION_LABEL[line.head.position]}`,
      );
    }
  }
  /** 「박은희 책임 · 생산」 — 책임이 없으면 부문 이름만 적는다. */
  const deptLabel = (key: string) => {
    if (key === NO_DEPT) return "부문 미지정";
    const head = deptHeadByKey.get(key);
    return head ? `${head} · ${key}` : key;
  };
  const gradeView = resultView && !!competencyTarget;
  const targetUnit = competencyTarget ? unitOf(competencyTarget) : null;
  /*
    정원의 «모집단»은 역량평가 대상과 같게 둔다 — 담당·팀장이고 평가에서 빠지지
    않은 사람. 여기가 어긋나면(예: 책임까지 세면) 사람 수가 달라져 정원이 통째로
    밀린다.
  */
  const unitPeople =
    gradeView && targetUnit
      ? people.filter((p) => inEvalPopulation(p) && unitOf(p) === targetUnit)
      : [];
  const [unitScores, unitPlans, quotaTable, fixedGrades] = gradeView
    ? await Promise.all([
        loadUnitScores(
          selectedYear,
          unitPeople.map((p) => p.id),
          yearCycles,
          finalCycle,
          rankOfCycle,
        ),
        loadUnitPlans(selectedYear),
        loadQuotaTable(selectedYear),
        loadFixedGrades(
          selectedYear,
          unitPeople.map((p) => p.id),
        ),
      ])
    : [new Map(), new Map(), new Map(), new Map()];
  const unitOrgGrade = targetUnit ? (unitPlans.get(targetUnit) ?? null) : null;
  const unitRatios: GradeRatios | null = unitOrgGrade
    ? (quotaTable.get(unitOrgGrade) ?? null)
    : null;
  const unitGrades = resolveUnitGrades(
    unitPeople.map((p) => ({
      userId: p.id,
      total: unitScores.get(p.id)?.total ?? null,
    })),
    unitRatios,
    fixedGrades,
  );
  const targetGrade = competencyTarget
    ? (unitGrades.get(competencyTarget.id) ?? null)
    : null;

  /*
    HR REPORT — **전체 인원을 한 표로** 읽는 자리.

    결과지는 사람 한 장이라 «누가 몇 등인지»가 안 보인다. 여기서는 그 해 평가
    대상 전부를 **운영책임 라인**별로 묶어 성과 · 역량 · 가산점 · 최종점수 · 등급을
    한 줄씩 놓는다. 점수는 결과지와 **같은 함수**에서 읽으므로(`loadUnitScores`) 두 화면이
    다른 숫자를 보일 수 없다.

    등급은 라인마다 따로 매긴다 — 상대평가라 «그 라인 안에서 몇 등»이고, 라인을
    섞어 순위를 내면 정원표가 뜻을 잃는다.
  */
  const reportPeople = reportView ? people.filter(inEvalPopulation) : [];
  const [reportScores, reportPlans, reportQuota, reportFixed] = reportView
    ? await Promise.all([
        loadUnitScores(
          selectedYear,
          reportPeople.map((p) => p.id),
          yearCycles,
          finalCycle,
          rankOfCycle,
        ),
        loadUnitPlans(selectedYear),
        loadQuotaTable(selectedYear),
        loadFixedGrades(
          selectedYear,
          reportPeople.map((p) => p.id),
        ),
      ])
    : [new Map(), new Map(), new Map(), new Map()];
  /** 라인 → 그 라인 사람들 · 조직등급 · 정원 · 등급 결과. */
  const reportUnits = (() => {
    const byUnit = new Map<string, typeof reportPeople>();
    for (const p of reportPeople) {
      const u = unitOf(p);
      byUnit.set(u, [...(byUnit.get(u) ?? []), p]);
    }
    return (
      [...byUnit.entries()]
        /* 「운영책임 미지정」은 이름순 가운데에 끼면 사람 라인들 사이에 섞여
           읽힌다. 조직도에 자리가 없는 사람들이라 늘 맨 아래에 둔다. */
        .sort(([a], [b]) =>
          a === NO_UNIT
            ? 1
            : b === NO_UNIT
              ? -1
              : unitLabel(a).localeCompare(unitLabel(b)),
        )
        .map(([unit, members]) => {
          const orgGrade = reportPlans.get(unit) ?? null;
          const ratios: GradeRatios | null = orgGrade
            ? (reportQuota.get(orgGrade) ?? null)
            : null;
          const grades = resolveUnitGrades(
            members.map((p) => ({
              userId: p.id,
              total: reportScores.get(p.id)?.total ?? null,
            })),
            ratios,
            reportFixed,
          );
          // 점수 높은 순으로 세운다 — 등급이 위에서부터 끊기는 순서와 같다.
          const rows = [...members].sort(
            (a, b) =>
              (reportScores.get(b.id)?.total ?? -1) -
              (reportScores.get(a.id)?.total ?? -1),
          );
          return { unit, orgGrade, ratios, grades, rows };
        })
    );
  })();

  const editingGoal = params.edit ? (nodeById.get(params.edit) ?? null) : null;

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
  /*
    대시보드가 앞세울 반기. 상반기 평가를 완료했거나 7월이 지났으면 하반기다
    (`currentGoalHalf`) — 반기마다 목표를 따로 세우므로 둘을 한 덩어리로 세면
    «개인목표 10건»과 «두 반기를 섞은 평균»이 나온다.
  */
  const shownHalf = currentGoalHalf(yearCycles, now);
  /*
    고르개에 적을 역량평가 상태. 양식 전체(`loadCompetencyForm`)는 문항·배정까지
    끌어오는 무거운 조회라, 이름에 붙일 상태 한 칸만 따로 읽는다 — 이 고르개는
    어느 단계에서든 늘 뜨기 때문이다. 그 해 양식이 없으면 「미개설」이다.
  */
  const competencyFormState = await prisma.competencyForm.findUnique({
    where: { year: selectedYear },
    select: { status: true, lockedAt: true },
  });
  const counted = allNodes.filter(countsTowardProgress);
  const overallProgress =
    companyGoals.length > 0
      ? weightedProgress(companyGoals)
      : averageProgress(counted);
  /*
    머리글의 건수는 «전사 목표»라는 제목 아래 붙으므로 전사목표만 센다.
    예전에는 네 층을 전부 세서, 전사목표 6건은 하나도 완료가 아닌데 «완료 1»이
    떴다 — 아래층 어딘가의 개인목표 한 건이었다. 옆의 «전사 종합 %»도 전사목표
    기준이라 이제 한 줄이 같은 것을 말한다.
  */
  const doneCount = companyGoals.filter(
    (g) => g.rollupStatus === "DONE" && !g.excluded,
  ).length;
  const excludedCount = companyGoals.filter(
    (g) => g.excluded || g.targetExcluded,
  ).length;
  // 상위에 안 매달린 목표는 아무리 달성해도 전사 달성률을 못 움직인다.
  // 숫자가 안 오르는 가장 흔한 이유라 화면에 대놓고 알려준다.
  const unlinked = allNodes.filter(
    (g) =>
      GOAL_PARENT_LEVEL[g.level as GoalLevel] !== null &&
      !g.parentId &&
      canViewGoalRow(g, viewer, org),
  );
  const overdueCount = companyGoals.filter(
    (g) => isOverdue(g, now) && !g.excluded,
  ).length;

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
    (g) =>
      !g.excluded && !g.targetExcluded && ownerFlag(g, now) && canExclude(),
  ).length;

  // 합의 현황. 내가 승인해야 할 건과, 내 범위에서 아직 확정되지 않은 개인목표.
  const individualGoals = myNodes.filter(
    (g) => needsAgreement(g.level) && !g.excluded && !g.targetExcluded,
  );
  const myTeamIdsForApproval = new Set(
    teams.filter((t) => t.leaderId === session!.user.id).map((t) => t.id),
  );
  const awaitingMyApproval = individualGoals.filter(
    (g) =>
      g.agreementStatus === "REQUESTED" &&
      (isAdmin || (g.teamId && myTeamIdsForApproval.has(g.teamId))),
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-1 shadow-sm">
        <span className="text-xs font-medium text-slate-500">
          연도 · 인사평가
        </span>
        {cycles.length > 0 ? (
          <YearPhaseSelect
            years={years.map((y) => ({ value: String(y), label: `${y}년` }))}
            year={String(selectedYear)}
            groups={[
              {
                /*
                  한 해의 인사평가가 흘러가는 차례 그대로다 — 진행현황을 맨 위이자
                  기본값으로 둔다. 평가2에 들어오는 사람 대부분은 무엇을 고치러
                  오는 게 아니라 «지금 어디까지 왔나»를 보러 온다.

                  역량평가도 이 묶음에 든다. 사이클(목표)이 없는 화면이지만 «올해
                  치러야 하는 평가» 한 가지이고, 진행 띠가 그리는 차례도 최종평가
                  다음이 역량평가다. 아래 묶음은 평가가 끝난 **뒤에** 읽는 자리다.
                */
                label: "인사평가",
                options: [
                  { value: PROGRESS_PHASE, label: "목표진행현황" },
                  ...yearCycles.map((c) => ({
                    value: phaseKey(c),
                    label: `${cyclePhaseLabel(c)} (${cycleStateLabel(c)})`,
                  })),
                  {
                    value: COMPETENCY_PHASE,
                    label: `역량평가 (${
                      competencyFormState
                        ? competencyFormStateLabel(competencyFormState)
                        : "미개설"
                    })`,
                  },
                ],
              },
              {
                /* 다 치른 뒤에 읽는 자리 둘. 사람 한 장(평가결과)과 조직 전체(HR REPORT). */
                label: "결과",
                options: [
                  { value: RESULT_PHASE, label: "평가결과" },
                  ...(isAdmin
                    ? [{ value: REPORT_PHASE, label: "HR REPORT" }]
                    : []),
                ],
              },
            ]}
            phase={selectedPhase}
            /*
              결과 쪽 단계를 고르면 고르개에 색이 든다 — 평가결과는 보라(결과지와
              같은 색), HR REPORT는 진회색, 역량평가는 브랜드 초록이다. 한 칸짜리
              고르개에서 «지금 무엇을 보는 중인가»를 말할 수 있는 자리가 거기뿐이다.
            */
            toneClass={
              resultView
                ? "border-goal-4 bg-goal-4/10 font-semibold text-goal-4"
                : reportView
                  ? "border-slate-500 bg-slate-100 font-semibold text-slate-700"
                  : competencyView
                    ? "border-brand-green bg-brand-green-light font-semibold text-brand-green-dark"
                    : ""
            }
          />
        ) : (
          <span className="text-xs text-slate-400">
            등록된 인사평가가 없습니다
          </span>
        )}
        {/* 진행현황은 «보는» 자리다 — 어느 단계의 목표를 읽고 있는지는 적어 준다. */}
        {progressView && cycle && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            「{cyclePhaseLabel(cycle)}」의 목표를 읽는 중입니다 · 여기서는 고칠
            수 없습니다
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
            「{cycleTitle(sharedFrom)}」의 목표를 이어받습니다{" "}
            {!sharedFrom.goalsLockedAt && (
              <span className="text-status-critical">
                · 아직 마감 전이라 내용이 바뀔 수 있습니다
              </span>
            )}
          </span>
        )}
        {/*
          이어받지 않고 자기 목표를 따로 가진 단계에는 그 말을 적는다. 이어받는
          쪽만 표시하고 있었더니, 단계마다 목표가 따로 있는 경우에 «같은 상반기
          목표인데 중간평가와 최종평가의 값이 다르다»는 것을 화면만 보고는 알
          수 없었다.
        */}
        {ownGoalsInStage && (
          <span className="rounded-full bg-status-critical/10 px-2 py-0.5 text-[11px] break-keep text-status-critical">
            이 단계에 목표가 <b className="font-semibold">따로</b> 있습니다 —
            다른 단계와 값이 따로 갑니다
            {isAdmin &&
              " · 「조직 목표 관리」의 목표 공유에서 이어받게 바꿀 수 있습니다"}
          </span>
        )}

        {isAdmin && (
          <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
            <Link
              href="/admin/org-goals"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs sm:py-1 text-slate-600 hover:bg-slate-50"
            >
              조직 목표 관리
            </Link>
            <Link
              href="/admin/eval-targets"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs sm:py-1 text-slate-600 hover:bg-slate-50"
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
      <nav className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs shadow-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={buildHref({ tab: t.key })}
            className={`rounded-full px-3 py-1.5 transition-colors sm:py-0.5 ${
              tab === t.key ? TAB_CLASS.on : TAB_CLASS.off
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    );
  }

  /**
   * 역량평가 — 사내 「한국삼공 역량평가 양식」 한 장을 그대로 옮긴 화면.
   *
   * 목표 화면과 다른 점이 둘 있다. 하나는 **사람 단위**라는 것 — 목표는 여러
   * 사람 것을 한 목록에 늘어놓지만, 역량평가는 한 사람이 표 두 개·열 문항이라
   * 여럿을 한 화면에 쌓으면 아무것도 안 읽힌다. 그래서 위에서 사람을 고른다.
   * 다른 하나는 **한 번에 저장**이라는 것 — 엑셀에서 하던 대로 표를 다 채우고
   * 아래의 저장을 한 번 누른다.
   */
  function competencyBoard() {
    if (!competencyTarget) {
      return comingUp("역량평가", null, [
        "역량평가는 담당과 팀장을 대상으로 합니다 — 담당은 그 팀의 팀장이, 팀장은 부문의 책임(없으면 본부의 운영책임)이 평가합니다.",
        "본인이 대상이 아니고, 평가할 사람도 배정되어 있지 않습니다. 조직도의 팀장·책임 지정을 확인해 주세요.",
      ]);
    }

    const target = competencyTarget;
    if (!competencyForm) {
      return comingUp("역량평가", null, [
        `${selectedYear}년 역량평가 양식이 아직 없습니다.`,
        isAdmin
          ? "관리 → 「역량평가 문항」에서 양식을 만들고 「사내 양식으로 채우기」를 누르면 시작됩니다."
          : "인사팀이 양식을 올리면 여기에 문항이 뜹니다.",
      ]);
    }
    const picked = pickCompetencySets(
      { position: target.position, teamId: target.teamId, id: target.id },
      competencyForm.sets,
      competencyForm.assignments,
    );
    const form = {
      core: picked.core?.items ?? [],
      job: picked.job?.items ?? [],
    };
    const saved = new Map(competencyScores.map((s) => [s.itemKey, s]));
    const rows = [...form.core, ...form.job].map((i) => ({
      itemKey: i.key,
      selfScore: saved.get(i.key)?.selfScore ?? null,
      leadScore: saved.get(i.key)?.leadScore ?? null,
    }));
    const avg = competencyAverage(rows);
    const itemCount = rows.length;

    const chain = evaluatorByPerson.get(target.id) ?? null;
    const isSelf = target.id === session!.user.id;
    const isFirstEvaluator =
      !!chain?.first && chain.first.id === session!.user.id;
    /*
      자기평가는 본인만, 팀장평가는 조직도가 정한 1차 평가자만 적는다(관리자는
      둘 다). 남의 칸은 잠가 둔다 — 잠긴 칸은 브라우저가 값을 보내지 않고,
      서버도 같은 기준으로 한 번 더 가른다.
    */
    /* 양식이 「평가 중」일 때만 점수를 받는다 — 작성 중인 문항에 점수를 남기면
       문항이 바뀌는 순간 그 점수가 무엇에 대한 것인지 사라진다. */
    const formOpen = competencyFormOpen(competencyForm);
    const canWriteSelf = (isAdmin || isSelf) && formOpen;
    const canWriteLead = (isAdmin || isFirstEvaluator) && formOpen;
    const canWrite = (canWriteSelf || canWriteLead) && itemCount > 0;

    const scoreSelectClass =
      "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums focus:border-brand-green focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

    const scoreCell = (
      item: CompetencyItem,
      who: "self" | "lead",
      value: number | null,
      enabled: boolean,
    ) => (
      <td className="px-2 py-1.5 align-middle">
        <select
          /*
            저장한 뒤 서버가 준 새 점수가 칸에 그대로 보여야 한다. `defaultValue`는
            처음 그려질 때만 먹으므로, 저장 → 갱신 후에도 React가 같은 select를
            재사용하면서 칸이 «–»로 비어 보였다(평균만 바뀌어서 저장이 안 된 것처럼
            읽혔다). 값을 열쇠에 넣어 두면 값이 달라질 때만 칸을 다시 그린다.
          */
          key={`${who}:${item.key}:${value ?? ""}`}
          name={`${who}:${item.key}`}
          defaultValue={value == null ? "" : String(value)}
          disabled={!enabled}
          aria-label={`${item.area} ${who === "self" ? "자기평가" : "팀장평가"}`}
          className={scoreSelectClass}
        >
          <option value="">–</option>
          {COMPETENCY_SCALE.map((r) => (
            <option key={r.score} value={r.score}>
              {competencyScoreLabel(r.score)}
            </option>
          ))}
        </select>
      </td>
    );

    const itemTable = (
      heading: string,
      items: CompetencyItem[],
      emptyNote?: string,
    ) => (
      <section className={CARD_CLASS}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
          <h2 className="text-sm font-bold text-slate-900">{heading}</h2>
          <span className="text-xs text-slate-500">{items.length}문항</span>
        </div>
        {items.length === 0 ? (
          <p className="border-t border-slate-100 px-4 py-6 text-center text-sm break-keep text-slate-500">
            {emptyNote}
          </p>
        ) : (
          <div className="overflow-x-auto">
            {/* 네 칸(영역·질문·자기평가·팀장평가)이 들어가야 표로 읽힌다. 좁은
                화면에서는 이 상자만 옆으로 굴린다 — 본문이 흔들리지 않게. */}
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="w-36 px-3 py-1 text-left text-xs font-semibold">
                    영역
                  </th>
                  <th className="px-3 py-1 text-left text-xs font-semibold">
                    질문
                  </th>
                  <th className="w-28 px-2 py-1 text-left text-xs font-semibold">
                    자기평가
                  </th>
                  <th className="w-28 px-2 py-1 text-left text-xs font-semibold">
                    팀장평가
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const row = saved.get(item.key);
                  return (
                    <tr
                      key={item.key}
                      className={`border-t border-slate-100 align-middle ${
                        i % 2 === 1 ? "bg-slate-50/70" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5 text-xs font-medium break-keep text-slate-800">
                        {item.area}
                      </td>
                      <td className="px-3 py-1.5 text-xs leading-relaxed break-keep text-slate-600">
                        {item.question}
                      </td>
                      {scoreCell(
                        item,
                        "self",
                        row?.selfScore ?? null,
                        canWriteSelf,
                      )}
                      {scoreCell(
                        item,
                        "lead",
                        row?.leadScore ?? null,
                        canWriteLead,
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );

    return (
      <div className="flex flex-col gap-2">
        {/* 누구 것을 보는 중인가. 남의 것을 채우다 엉뚱한 사람에게 적는 일이
            없도록, 이름과 소속을 고르개 옆에 그대로 적어 둔다. */}
        <section
          className={`${CARD_CLASS} flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2`}
        >
          <span className="text-xs font-medium text-slate-500">피평가자</span>
          {competencyPeople.length > 1 ? (
            <ParamSelect
              param="who"
              value={target.id}
              ariaLabel="역량평가 피평가자 선택"
              options={competencyPeople.map((p) => ({
                value: p.id,
                label: `${p.name} ${POSITION_LABEL[p.position]}${
                  p.team?.name ? ` (${p.team.name})` : ""
                }`,
              }))}
            />
          ) : (
            <span className="text-sm font-semibold text-slate-900">
              {target.name} {POSITION_LABEL[target.position]}
            </span>
          )}
          <span className="text-xs text-slate-500">
            {selectedYear}년 양식{" "}
            <b className="font-medium text-slate-700">
              {competencyFormStateLabel(competencyForm)}
            </b>{" "}
            · 1차 평가자{" "}
            <b className="font-medium text-slate-700">
              {chain?.first ? evaluatorLabel(chain.first) : "미지정"}
            </b>
          </span>
          {/* 평균은 적은 칸만 세어 낸다. 결과 화면이 쓸 숫자와 같은 값이라,
              여기서 먼저 보여 주면 «내 역량 점수»가 어디서 나온 것인지 읽힌다. */}
          <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs whitespace-nowrap">
            <span className="text-slate-500">
              자기평가 평균{" "}
              <b className="text-sm font-semibold tabular-nums text-goal-4">
                {avg.self ?? "–"}
              </b>
              <span className="ml-1 text-slate-400">
                {avg.selfCount}/{itemCount}
              </span>
            </span>
            <span className="text-slate-500">
              팀장평가 평균{" "}
              <b className="text-sm font-semibold tabular-nums text-goal-4">
                {avg.lead ?? "–"}
              </b>
              <span className="ml-1 text-slate-400">
                {avg.leadCount}/{itemCount}
              </span>
            </span>
          </span>
        </section>

        {/* 평가스케일 정의 — 점수를 고르는 동안 계속 참조하는 표라 펼쳐 두고,
            다 외운 사람은 접을 수 있게 한다. */}
        <details className={CARD_CLASS} open>
          <summary className="cursor-pointer list-none px-4 py-2 text-sm font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
            평가스케일 정의
            <span className="ml-2 text-xs font-normal text-slate-400">
              눌러서 접기 / 펼치기
            </span>
          </summary>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="w-24 px-3 py-1 text-left text-xs font-semibold">
                    스케일
                  </th>
                  <th className="w-36 px-3 py-1 text-left text-xs font-semibold">
                    점수환산 (참고용)
                  </th>
                  <th className="px-3 py-1 text-left text-xs font-semibold">
                    정의
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPETENCY_SCALE.map((r, i) => (
                  <tr
                    key={r.score}
                    className={`border-t border-slate-100 ${
                      i % 2 === 1 ? "bg-slate-50/70" : ""
                    }`}
                  >
                    <td className="px-3 py-1 text-xs font-semibold whitespace-nowrap text-slate-800">
                      {r.score} ({r.label})
                    </td>
                    <td className="px-3 py-1 text-xs whitespace-nowrap text-slate-600">
                      {r.points}
                    </td>
                    <td className="px-3 py-1 text-xs break-keep text-slate-600">
                      {r.definition}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-1 border-t border-slate-100 px-4 py-2">
            {COMPETENCY_NOTES.map((note) => (
              <li key={note} className="text-[11px] break-keep text-slate-500">
                ※ {note}
              </li>
            ))}
          </ul>
        </details>

        {/* 쓸 수 없는 사람에게는 왜 칸이 잠겼는지 적는다 — 잠긴 칸만 보면
            고장인 줄 안다. */}
        {!canWrite && itemCount > 0 && (
          <p className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm break-keep text-slate-600">
            읽기 전용입니다. 자기평가는 본인이, 팀장평가는 1차 평가자
            {chain?.first ? `(${evaluatorLabel(chain.first)})` : ""}가 적습니다.
          </p>
        )}

        <ActionForm
          action={saveCompetencyScores}
          successMessage="역량평가를 저장했습니다."
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="year" value={selectedYear} />
          <input type="hidden" name="userId" value={target.id} />

          {itemTable(
            picked.core
              ? `1. 핵심가치 · ${picked.core.kind === "CORE_LEADER" ? "팀장용" : "팀원용"}`
              : "1. 핵심가치",
            form.core,
            `${target.position === "TEAM_LEADER" ? "팀장용" : "팀원용"} 핵심가치 문항이 아직 등록되지 않았습니다.`,
          )}
          {/*
            둘째 묶음은 직책에 따라 다른 것이 온다 — 담당은 직무역량(직무마다
            다름), 팀장은 리더십역량(전사 한 벌). 표제에 그 이름을 그대로 쓴다.
          */}
          {itemTable(
            picked.job
              ? picked.job.kind === "LEADERSHIP"
                ? "2. 리더십역량"
                : `2. 직무역량 · ${picked.job.name}`
              : target.position === "TEAM_LEADER"
                ? "2. 리더십역량"
                : "2. 직무역량",
            form.job,
            target.position === "TEAM_LEADER"
              ? "리더십역량 문항이 아직 등록되지 않았습니다 — 관리 → 「역량평가 문항」에서 채워 주세요."
              : `${target.name} 님의 직무가 아직 배정되지 않았습니다 — 관리 → 「역량평가 문항」에서 팀 기본 직무나 사람별 직무를 정해 주세요.`,
          )}

          {/*
            양식 맨 아래의 「전체 코멘트」. 점수 열 칸으로는 «왜 이 점수인지»가
            남지 않아서 사내 양식이 이 칸을 따로 뒀다. 팀장평가자만 적고, 피평가자
            본인은 읽는다 — 적어 준 말을 못 보면 피드백이 아니다.
          */}
          <section className={CARD_CLASS}>
            <div className="flex flex-wrap items-baseline gap-x-2 px-4 py-2">
              <h2 className="text-sm font-bold text-slate-900">전체 코멘트</h2>
              <span className="text-xs text-slate-500">
                1차 평가자만 작성합니다
              </span>
            </div>
            <div className="border-t border-slate-100 px-4 py-3">
              <textarea
                key={`leadComment:${competencyReview?.leadComment ?? ""}`}
                name="leadComment"
                rows={3}
                defaultValue={competencyReview?.leadComment ?? ""}
                disabled={!canWriteLead}
                placeholder={
                  canWriteLead
                    ? "점수를 그렇게 준 이유, 격려·감사·교정하고 싶은 점을 적어 주세요."
                    : "1차 평가자가 적으면 여기에 보입니다."
                }
                className={INPUT_CLASS}
              />
            </div>
          </section>

          {canWrite && (
            <div
              className={`${CARD_CLASS} flex flex-wrap items-center gap-3 px-4 py-3`}
            >
              <span className="text-xs break-keep text-slate-500">
                {canWriteSelf && canWriteLead
                  ? "자기평가와 팀장평가 모두 적을 수 있습니다."
                  : canWriteSelf
                    ? "자기평가 칸만 적습니다. 팀장평가는 1차 평가자가 적습니다."
                    : "팀장평가 칸만 적습니다. 자기평가는 본인이 적습니다."}{" "}
                비워 두면 «아직 안 적음»으로 남고 평균에서 빠집니다.
              </span>
              <button
                type="submit"
                className={`ml-auto ${PRIMARY_BUTTON_CLASS}`}
              >
                저장
              </button>
            </div>
          )}
        </ActionForm>
      </div>
    );
  }

  /**
   * 「평가결과」 — 사내 「인사평가 결과지」 한 장.
   *
   * 세 토막이다: ① 결과 요약(성과·역량·종합과 강점·약점) ② 역량별 결과(방사형
   * 차트와 표) ③ 주관적 서술(팀장의 코멘트). 종이 양식을 그대로 옮긴 것이라
   * 순서와 이름을 바꾸지 않았다 — 인사팀과 직원이 이미 이 순서로 읽는다.
   *
   * 숫자는 하나도 사람이 다시 적지 않는다. 성과는 최종평가의 목표별 점수 합이고,
   * 역량은 자기평가·팀장평가의 평균이며, 종합은 그 둘을 정해진 몫으로 섞은 값이다.
   */
  function resultBoard() {
    /*
      해를 고르는 칸은 여기 두지 않는다. 「평가결과」가 단계 고르개로 올라간 뒤로는
      화면 맨 위 「연도 · 인사평가」 줄이 해를 고르는 자리이고, 결과지 머리에 같은
      고르개를 또 두면 나란히 두 개가 뜬다.
    */
    if (!competencyTarget) {
      return (
        <div className="flex flex-col gap-2">
          {comingUp("평가결과", null, [
            "결과지는 담당과 팀장에게 나옵니다 — 담당은 그 팀의 팀장이, 팀장은 부문의 책임이 평가합니다.",
            "본인이 대상이 아니고, 볼 수 있는 사람도 없습니다.",
          ])}
        </div>
      );
    }

    const target = competencyTarget;

    const picked = competencyForm
      ? pickCompetencySets(
          { position: target.position, teamId: target.teamId, id: target.id },
          competencyForm.sets,
          competencyForm.assignments,
        )
      : { core: null, job: null };
    const saved = new Map(competencyScores.map((s) => [s.itemKey, s]));
    const groupOf = (kind: string) =>
      kind === "JOB"
        ? "직무역량"
        : kind === "LEADERSHIP"
          ? "리더십역량"
          : "핵심가치";
    const rows: CompetencyResultRow[] = [picked.core, picked.job]
      .filter((set): set is NonNullable<typeof set> => !!set)
      .flatMap((set) =>
        set.items.map((item) =>
          buildResultRow(
            { itemKey: item.key, group: groupOf(set.kind), area: item.area },
            saved.get(item.key)?.selfScore ?? null,
            saved.get(item.key)?.leadScore ?? null,
          ),
        ),
      );

    const compAvg = competencyAverage(
      rows.map((r) => ({
        itemKey: r.itemKey,
        selfScore: r.self,
        leadScore: r.lead,
      })),
    );
    const compScore = competencyScore100(compAvg.overallExact);

    /*
      성과평가 점수 — 최종평가에서 목표마다 1차 평가자가 매긴 점수의 합. 한 칸도
      안 적혀 있으면 null이다(0이 아니다) — 0점과 «아직 안 매김»은 다른 말이다.
    */
    const perfFilledCount = targetPerf?.filled ?? 0;
    const perfScore = targetPerf?.score ?? null;
    /*
      종합점수는 HR REPORT가 매긴 값을 그대로 쓴다(`loadUnitScores`) — 가산점까지
      더한 숫자다. 여기서 다시 세면 두 화면이 다른 총점을 보일 수 있고, 등급은
      HR REPORT 쪽 값으로 매겨지므로 «점수는 90.8인데 등급은 92.8 기준»이 된다.
    */
    const targetScores = competencyTarget
      ? (unitScores.get(competencyTarget.id) ?? null)
      : null;
    const targetBonus = targetScores?.bonus ?? 0;
    /*
      점수의 합이 100점 자리가 되는 근거는 **가중치 합이 100**이라는 것뿐이다.
      가중치가 120이면 점수도 120점대로 나오고, 그 숫자로 등급을 매기면 가중치를
      덜 채운 사람과 나란히 놓을 수 없다. 그래서 합을 옆에 적고, 100이 아니면
      눈에 걸리게 한다 — 목록의 「가중치 소계」 경고와 같은 기준이다.
    */
    const perfWeightSum = targetPerf?.weightSum ?? 0;
    const perfWeightOff = performanceGoals.length > 0 && perfWeightSum !== 100;
    /*
      집계에서 빠진 그 반기의 목표. 가중치 합이 100%가 아닌 까닭이 거의 언제나
      이것이라, 표 아래에 흐리게 붙여 둔다.
    */
    const perfDropped = targetPerf?.dropped ?? [];
    const base = overallScore(perfScore, compScore);
    const total = targetScores?.total ?? base;

    const { strengths, weaknesses, relativelyLow } =
      strengthsAndWeaknesses(rows);
    const axes: CompetencyRadarAxis[] = rows.map((r) => ({
      label: r.area,
      self: r.self,
      lead: r.lead,
    }));

    const chain = evaluatorByPerson.get(target.id) ?? null;

    /*
      점수 한 칸. 숫자를 크게 두는 이유는 이 세 칸이 결과지에서 제일 먼저 읽혀야
      하는 것이기 때문이다 — 나머지는 이 숫자가 어디서 나왔는지에 대한 설명이다.

      숫자 아래에 100점 자리를 채우는 눈금을 깐다. 「86」이라는 숫자만으로는
      높은지 낮은지 가늠하는 데 한 번 더 생각이 필요한데, 눈금은 그걸 보는 즉시
      알려 준다. 눈금은 값을 대신하지 않고 옆에 거들 뿐이라 이름도 달지 않는다.

      `hero`는 종합점수 칸이다. 셋 중 하나만 색을 채워 둔다 — 셋 다 강조하면
      아무것도 강조되지 않는다.
    */
    const scoreCell = (
      label: string,
      value: number | null,
      note: string,
      hero = false,
      warn: string | null = null,
      badge: ReactNode = null,
    ) => (
      <div
        className={`flex flex-col gap-1 px-4 py-4 ${
          hero ? "bg-goal-4 text-white" : ""
        }`}
      >
        <span
          className={`text-xs font-semibold tracking-wide ${
            hero ? "text-white/80" : "text-slate-500"
          }`}
        >
          {label}
        </span>
        <span className="flex items-baseline gap-1">
          <span
            className={`text-[2.5rem] leading-none font-bold tabular-nums ${
              value == null
                ? hero
                  ? "text-white/40"
                  : "text-slate-300"
                : hero
                  ? "text-white"
                  : "text-slate-900"
            }`}
          >
            {value ?? "–"}
          </span>
          <span
            className={`text-sm font-medium ${
              hero ? "text-white/70" : "text-slate-400"
            }`}
          >
            점
          </span>
          {badge}
        </span>
        {/* 눈금 — 100점을 채운 만큼. 100을 넘는 값은 눈금이 꽉 찬 것으로 둔다. */}
        <span
          className={`mt-0.5 block h-1.5 w-full overflow-hidden rounded-full ${
            hero ? "bg-white/25" : "bg-slate-100"
          }`}
          aria-hidden="true"
        >
          {value != null && (
            <span
              className={`block h-full rounded-full ${
                hero ? "bg-white" : "bg-goal-4/70"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            />
          )}
        </span>
        <span
          className={`text-[11px] break-keep ${
            hero ? "text-white/75" : "text-slate-500"
          }`}
        >
          {note}
        </span>
        {warn && (
          <span
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium break-keep ${
              hero
                ? "bg-white/15 text-white"
                : "bg-status-critical/10 text-status-critical"
            }`}
          >
            {warn}
          </span>
        )}
      </div>
    );

    /*
      강점·약점 딱지. 강점은 브랜드 초록, 약점은 호박색이다 — 빨강은 쓰지 않는다:
      이 앱에서 빨강은 «지연·미입력» 같은 «잘못됐다»는 뜻이고, 본인이 받는
      결과지에서 약점이 그렇게 읽히면 안 된다. 표의 「1:1 미팅 추천」 딱지와 같은
      색을 써서 «챙겨 볼 자리»라는 뜻을 맞춰 둔다.
    */
    const pickList = (
      list: CompetencyResultRow[],
      empty: string,
      tone: "good" | "watch" | "plain" = "plain",
    ) => {
      const cls =
        tone === "good"
          ? "border-brand-green/30 bg-brand-green-light text-brand-green-dark"
          : tone === "watch"
            ? "border-amber-300/60 bg-amber-50 text-amber-800"
            : "border-slate-200 bg-slate-50 text-slate-700";
      const numCls =
        tone === "good"
          ? "bg-brand-green/15"
          : tone === "watch"
            ? "bg-amber-200/60"
            : "bg-slate-200/70";
      return list.length === 0 ? (
        <span className="text-sm text-slate-400">{empty}</span>
      ) : (
        <span className="flex flex-wrap gap-1.5">
          {list.map((r) => (
            <span
              key={r.itemKey}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-medium break-keep ${cls}`}
            >
              {r.area}
              <span
                className={`rounded px-1 text-xs font-semibold tabular-nums ${numCls}`}
              >
                {r.avg}
              </span>
            </span>
          ))}
        </span>
      );
    };

    /*
      최종등급 딱지 — 종합점수 바로 옆에 붙인다.

      점수와 등급은 한 덩어리로 읽힌다. 「85점」만 있으면 그게 좋은 것인지 알 수
      없고, 「A」만 있으면 어디서 나온 등급인지 알 수 없다. 색을 채운 칸 안이라
      딱지는 흰 바탕에 보라 글자로 둔다 — 등급색을 그대로 얹으면 보라 위에서
      색끼리 싸운다. 등급마다 다른 색은 관리 화면의 명단에서 쓴다.

      아직 등급이 없는 이유는 세 가지고, 그 이유를 딱지 자리에 그대로 적는다 —
      비어 있으면 «고장났나»로 읽힌다.
    */
    const gradeBadge =
      targetGrade != null ? (
        <span className="ml-1.5 inline-flex items-baseline gap-1 rounded-lg bg-white px-2.5 py-1 leading-none">
          <span className="text-xl font-bold text-goal-4">
            {targetGrade.grade}
          </span>
          <span className="text-[11px] font-medium text-goal-4/70">등급</span>
        </span>
      ) : (
        /*
          등급이 없을 때는 «등급 미정»만 적는다. 예전에는 «조직등급 미지정»·
          «정원 미입력»처럼 까닭을 이 자리에 적었는데, 종합점수 옆은 사람이 제
          점수를 읽는 자리라 인사팀의 준비 상태가 끼어들 곳이 아니다 — 그 까닭은
          아래 「최종등급」 줄과 HR REPORT에 그대로 적혀 있다.
        */
        <span className="ml-1.5 rounded-lg bg-white/15 px-2 py-1 text-[11px] font-medium break-keep text-white">
          등급 미정
        </span>
      );

    /** 등급이 어디서 나왔는지 — 업무단위 · 순위 · 정원. 근거 없는 등급은 두지 않는다. */
    const gradeBasis = (() => {
      const bits: string[] = [];
      bits.push(
        targetUnit && targetUnit !== NO_UNIT
          ? unitLabel(targetUnit)
          : "운영책임 미지정",
      );
      if (targetGrade) {
        bits.push(`${targetGrade.of}명 중 ${targetGrade.rank}위`);
      } else if (total == null) {
        bits.push("성과·역량이 모두 있어야 순위가 나옵니다");
      }
      if (unitOrgGrade) {
        bits.push(
          `조직등급 ${unitOrgGrade} · 정원 ${PERSON_GRADES.filter(
            (g) => (unitRatios?.[g] ?? 0) > 0,
          )
            .map((g) => `${g} ${unitRatios![g]}%`)
            .join(" · ")}`,
        );
      } else if (targetUnit) {
        bits.push("조직등급이 아직 없습니다 — 관리 → 등급·정원에서 고릅니다");
      }
      return bits.join(" · ");
    })();

    return (
      <div className="flex flex-col gap-2">
        {/*
          머리 — 어느 해, 누구의 결과지인가. 위에 색 띠를 한 줄 둘러 이 화면이
          목록이 아니라 «한 장의 결과지»로 읽히게 한다. 고르개의 평가결과와 같은 색이다.
        */}
        <section
          className={`${CARD_CLASS} flex flex-wrap items-center gap-x-3 gap-y-2 border-t-4 border-t-goal-4 px-4 py-2.5`}
        >
          <h1 className="text-base font-bold whitespace-nowrap text-slate-900">
            {selectedYear}년 인사평가 결과지
          </h1>
          <span className="text-xs font-medium text-slate-500">피평가자</span>
          {competencyPeople.length > 1 ? (
            <ParamSelect
              param="who"
              value={target.id}
              ariaLabel="결과지 피평가자 선택"
              options={competencyPeople.map((p) => ({
                value: p.id,
                label: `${p.name} ${POSITION_LABEL[p.position]}${
                  p.team?.name ? ` (${p.team.name})` : ""
                }`,
              }))}
            />
          ) : (
            <span className="text-sm font-semibold text-slate-900">
              {target.name} {POSITION_LABEL[target.position]}
            </span>
          )}
          <span className="text-xs break-keep text-slate-500">
            {target.team?.name ?? "무소속"} · 1차 평가자{" "}
            <b className="font-medium text-slate-700">
              {chain?.first ? evaluatorLabel(chain.first) : "미지정"}
            </b>
          </span>
        </section>

        {/* 1. 결과 요약 */}
        <section className={CARD_CLASS}>
          {/*
            절 머리 오른쪽 끝에 최종등급을 세운다 — 결과지를 열어 가장 먼저 찾는
            것이 그것이고, 아래 「최종등급」 줄까지 내려가야 보이면 한 번 더
            찾아야 한다. 아래 줄은 근거(순위 · 정원 · 확정 사유)를 맡는다.
          */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 flex-1">
              {sectionHead(
                "1. 결과 요약",
                `성과 ${Math.round(PERFORMANCE_WEIGHT * 100)}% + 역량 ${Math.round(
                  COMPETENCY_WEIGHT * 100,
                )}%${
                  targetBonus
                    ? ` ${targetBonus > 0 ? "+" : "−"} 가산점 ${Math.abs(targetBonus)}점`
                    : ""
                } = 종합점수`,
              )}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5 px-4">
              <span className="text-xs font-semibold text-slate-500">
                최종등급
              </span>
              {targetGrade ? (
                <span
                  className={`rounded-lg px-2.5 py-1 text-base leading-none font-bold ${
                    PERSON_GRADE_CLASS[targetGrade.grade] ??
                    "bg-slate-500 text-white"
                  }`}
                >
                  {targetGrade.grade}
                </span>
              ) : (
                <span className="text-sm text-slate-400">미정</span>
              )}
            </span>
          </div>
          {/* 종합점수 칸을 넓게 둔다 — 셋 중 하나만 크면 어느 것이 결론인지 보인다. */}
          <div className="grid divide-y divide-slate-100 border-t border-slate-100 sm:grid-cols-[1fr_1fr_1.15fr] sm:divide-x sm:divide-y-0">
            {scoreCell(
              "성과평가",
              perfScore,
              finalCycle
                ? `${cycleTitle(finalCycle)}의 ${
                    evalPeriodLabel(finalCycle) || "그 단계"
                  } 목표 ${performanceGoals.length}건 중 ${perfFilledCount}건 평가됨 · 가중치 합 ${perfWeightSum}%`
                : `${selectedYear}년 성과평가가 없습니다`,
              false,
              /*
                점수가 비었을 때는 «왜»를 먼저 말한다. 가중치 경고는 점수가
                있을 때만 뜻이 있다 — 둘을 같이 띄우면 정작 눌러야 할 자리가
                덜 읽힌다.
              */
              perfScore == null
                ? goalSpots.length === 0
                  ? [
                      "이 사람 이름으로 된 개인목표가 한 건도 없습니다",
                      sameName.length > 0
                        ? `같은 이름의 다른 계정(${[
                            ...new Set(
                              sameName.map(
                                (g) => g.owner?.email ?? g.ownerId ?? "?",
                              ),
                            ),
                          ].join(
                            " · ",
                          )})에 개인목표 ${sameName.length}건이 달려 있습니다 — 계정이 두 개인지 확인해 주세요`
                        : null,
                      otherLevels.length > 0
                        ? `이 사람이 책임자인 ${[
                            ...new Set(
                              otherLevels.map(
                                (g) =>
                                  GOAL_LEVEL_LABEL[g.level as GoalLevel] ??
                                  g.level,
                              ),
                            ),
                          ].join(
                            " · ",
                          )}는 ${otherLevels.length}건 있습니다 — 성과점수는 개인목표만 셉니다`
                        : null,
                      teamOwnerNames
                        ? `같은 팀에서 개인목표를 가진 사람 — ${teamOwnerNames}. 한 사람에게 몰려 있으면 팀장이 팀원 목표를 자기 이름으로 적어 둔 것입니다 — 「${MID_PHASE_LABEL}」의 개인목표 탭에서 그 목표를 열어 「피평가자」를 사람별로 바꿔 주세요`
                        : null,
                      sameName.length === 0 &&
                      otherLevels.length === 0 &&
                      !teamOwnerNames
                        ? `「${MID_PHASE_LABEL}」의 개인목표 탭에서 등록해 주세요`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(". ")
                  : !yearCycles.some((c) =>
                        goalSpots.some((g) => g.cycleId === c.id),
                      )
                    ? `${selectedYear}년에는 이 사람의 개인목표가 없습니다 — ${elsewhere}에 있습니다. 위에서 연도를 바꿔 주세요`
                    : `단계별 개인목표 — ${yearCycles
                        .map((c) => {
                          const rows = goalSpots.filter(
                            (g) => g.cycleId === c.id,
                          );
                          if (rows.length === 0) return null;
                          const scored = rows.filter(
                            (g) => g.firstScore != null,
                          ).length;
                          const off = rows.filter((g) => g.excluded).length;
                          return `${cyclePhaseLabel(c)} ${rows.length}건(점수 ${scored}건${
                            off > 0 ? ` · 집계 제외 ${off}건` : ""
                          })`;
                        })
                        .filter(Boolean)
                        .join(" · ")}`
                : perfWeightOff
                  ? `가중치 합이 ${perfWeightSum}%입니다 — 100%가 아니면 점수를 다른 사람과 나란히 놓을 수 없습니다${
                      perfDropped.length > 0
                        ? `. 「집계 제외」한 목표 ${perfDropped.length}건(가중치 ${Math.round(
                            perfDropped.reduce((n, g) => n + g.weight, 0),
                          )}%)이 빠져 있습니다 — 아래 「성과평가 상세」에서 확인해 주세요`
                        : ""
                    }`
                  : null,
            )}
            {scoreCell(
              "역량평가",
              compScore,
              /*
                «다 더하면 몇 점»을 그대로 적는다. 예전에는 「평균 4.2 × 20」처럼
                적었는데, 평균은 화면용으로 끊은 값이라 그 곱셈이 실제 점수와
                맞지 않았다(스무 칸 합 83 → 4.15 × 20 = 83인데 4.2 × 20 = 84).
                합과 만점은 정수라 사람이 칸을 더해 그대로 맞춰 볼 수 있다.
              */
              compAvg.count === 0
                ? "아직 점수가 없습니다"
                : `자기·팀장 ${compAvg.count}칸 합 ${compAvg.sum}점 / 만점 ${
                    compAvg.count * COMPETENCY_MAX
                  }점 · 자기 평균 ${compAvg.self ?? "–"} / 팀장 평균 ${
                    compAvg.lead ?? "–"
                  }`,
            )}
            {scoreCell(
              "종합점수",
              total,
              total == null
                ? "성과·역량이 모두 있어야 나옵니다"
                : `${perfScore} × ${Math.round(PERFORMANCE_WEIGHT * 100)}% + ${compScore} × ${Math.round(COMPETENCY_WEIGHT * 100)}%${
                    targetBonus
                      ? ` ${targetBonus > 0 ? "+" : "−"} 가산점 ${Math.abs(targetBonus)}`
                      : ""
                  }`,
              true,
              null,
              gradeBadge,
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3">
            {/*
              등급 줄 — 상대평가라 «몇 등 / 몇 명»과 정원이 같이 있어야 등급이
              설명된다. 반올림으로 갈린 자리는 인사팀이 직접 확정하므로 그렇다고
              적어 둔다.
            */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-24 shrink-0 text-xs font-semibold text-slate-500">
                등급 근거
              </span>
              {targetGrade?.fixed && (
                <span className="rounded-md bg-goal-4/10 px-1.5 py-0.5 text-[11px] font-medium text-goal-4">
                  인사팀 확정
                  {targetGrade.computed &&
                    targetGrade.computed !== targetGrade.grade &&
                    ` · 표대로는 ${targetGrade.computed}`}
                </span>
              )}
              {targetGrade?.needsReview && (
                <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium break-keep text-amber-800">
                  반올림 확인 · {targetGrade.reviewReason}
                </span>
              )}
              <span className="text-[11px] break-keep text-slate-500">
                {gradeBasis}
              </span>
            </div>
            {targetGrade?.fixedNote && (
              <p className="pl-24 text-[11px] break-keep text-slate-500">
                확정 사유 · {targetGrade.fixedNote}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-24 shrink-0 text-xs font-semibold text-slate-500">
                주요 강점 역량
              </span>
              {pickList(
                strengths,
                "평균 3점을 넘는 역량이 아직 없습니다",
                "good",
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-24 shrink-0 text-xs font-semibold text-slate-500">
                주요 약점 역량
              </span>
              {weaknesses.length > 0 ? (
                pickList(weaknesses, "", "watch")
              ) : relativelyLow.length > 0 ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-400">
                    3점 미만 역량 없음
                  </span>
                  <span className="text-xs text-slate-400">
                    · 상대적으로 낮은 역량
                  </span>
                  {pickList(relativelyLow, "", "watch")}
                </span>
              ) : (
                <span className="text-sm text-slate-400">해당 없음</span>
              )}
            </div>
            {/*
              규칙을 화면에 적어 둔다 — 왜 이 역량이 강점으로 뽑혔는지 결과지만
              보고는 알 수 없다. 사내 양식에 적힌 문장 그대로다.
            */}
            <p className="text-[11px] break-keep text-slate-400">
              자기평가와 팀장평가의 평균이 3점을 넘으면 강점, 3점 미만이면
              약점으로 봅니다. 두 점수 차이가 2점 이상 벌어진 역량은
              강점·약점에서 뺍니다.
            </p>
          </div>
        </section>

        {/* 2. 역량별 결과 */}
        <section className={CARD_CLASS}>
          {sectionHead(
            "2. 역량별 결과",
            "자기평가와 팀장평가가 전체적으로 맞는지는 왼쪽 방사형 차트의 두 모양이 포개지는지로 봅니다.",
          )}
          {rows.length === 0 ? (
            <p className="border-t border-slate-100 px-4 py-8 text-center text-sm break-keep text-slate-500">
              {selectedYear}년 역량평가 양식이나 배정이 아직 없습니다 — 목표
              고르개에서 「역량평가」를 열어 확인해 주세요.
            </p>
          ) : (
            <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-[minmax(0,38%)_minmax(0,1fr)]">
              {/* 표가 길어 칸이 위아래로 남는다 — 차트를 가운데 세워 균형을 맞춘다. */}
              <CompetencyRadar axes={axes} className="self-center" />
              {/*
                `min-w-0` — 이 칸이 표의 최소 너비(520px)만큼 벌어지지 않게
                막는다. 안쪽 스크롤 상자가 격자 칸 자신이었을 때는 저절로 0이
                됐지만, 한 겹 감싸는 순간 이 칸이 내용만큼 벌어져서 휴대폰에서
                페이지 전체가 옆으로 165px 밀렸다.
              */}
              <div className="min-w-0">
                {/*
                  표는 차트와 나란히 서지만 대충 거드는 자리가 아니다 — 값을
                  읽는 것은 여기서만 된다. 그래서 글자를 줄이지 않고(본문 크기),
                  줄 높이를 손가락 하나만큼 주고, 머리를 색으로 채워 어느 칸이
                  무엇인지 한 번에 보이게 한다.
                */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-goal-4 text-white">
                      <tr>
                        <th className="w-20 px-2 py-2.5 text-left text-xs font-semibold whitespace-nowrap">
                          구분
                        </th>
                        {/* 역량 이름이 두 줄로 접히지 않을 만큼은 쥐고 있게 한다. */}
                        <th className="min-w-[8rem] px-3 py-2.5 text-left text-xs font-semibold">
                          역량 영역
                        </th>
                        <th className="w-16 px-2 py-2.5 text-right text-xs font-semibold whitespace-nowrap">
                          자기
                        </th>
                        <th className="w-16 px-2 py-2.5 text-right text-xs font-semibold whitespace-nowrap">
                          팀장
                        </th>
                        <th className="w-24 px-2 py-2.5 text-right text-xs font-semibold whitespace-nowrap">
                          평균
                        </th>
                        <th className="w-28 px-2 py-2.5 text-right text-xs font-semibold whitespace-nowrap">
                          차이
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const note = gapNote(r.gap);
                        const prevGroup = i > 0 ? rows[i - 1].group : null;
                        const newGroup = r.group !== prevGroup;
                        return (
                          <tr
                            key={r.itemKey}
                            className={`${
                              newGroup
                                ? "border-t-2 border-slate-300"
                                : "border-t border-slate-100"
                            } ${i % 2 === 1 ? "bg-slate-50/70" : ""}`}
                          >
                            <td className="px-2 py-2.5 align-middle whitespace-nowrap">
                              {newGroup && (
                                <span className="rounded-md bg-goal-4/10 px-1.5 py-0.5 text-xs font-semibold text-goal-4">
                                  {r.group}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-sm font-medium break-keep text-slate-900">
                              {r.area}
                            </td>
                            <td className="px-2 py-2.5 text-right text-sm tabular-nums text-slate-600">
                              {r.self ?? "–"}
                            </td>
                            <td className="px-2 py-2.5 text-right text-sm tabular-nums text-slate-600">
                              {r.lead ?? "–"}
                            </td>
                            {/* 평균은 이 표의 결론이다 — 숫자를 한 급 키우고 눈금을 붙인다. */}
                            <td className="px-2 py-2.5 align-middle">
                              <span className="flex items-center justify-end gap-2">
                                {r.avg != null && (
                                  <span
                                    className="hidden h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-slate-200 sm:block"
                                    aria-hidden="true"
                                  >
                                    <span
                                      className="block h-full rounded-full bg-goal-4"
                                      style={{
                                        width: `${(r.avg / COMPETENCY_MAX) * 100}%`,
                                      }}
                                    />
                                  </span>
                                )}
                                <span
                                  className={`text-base leading-none font-bold tabular-nums ${
                                    r.avg == null
                                      ? "text-slate-300"
                                      : "text-slate-900"
                                  }`}
                                >
                                  {r.avg ?? "–"}
                                </span>
                              </span>
                            </td>
                            <td className="px-2 py-2.5 text-right whitespace-nowrap">
                              <span className="text-sm tabular-nums text-slate-600">
                                {r.gap == null
                                  ? "–"
                                  : r.gap > 0
                                    ? `+${r.gap}`
                                    : r.gap}
                              </span>
                              {note && (
                                <span className="ml-1.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                                  {note}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] break-keep text-slate-400">
                  차이는 팀장평가 − 자기평가입니다. 자기평가가 팀장보다 1점 이상
                  높으면 셀프 피드백을, 팀장이 2점 이상 높으면 팀장과의 1:1
                  미팅을 권합니다.
                </p>
              </div>
            </div>
          )}
        </section>

        {/*
          3. 성과평가 상세 — **합이 어디서 나왔는지** 목표별로 펼친다.

          성과평가 칸에는 합계 한 숫자만 떠 있어서, 손으로 센 값과 다르면 어느
          목표가 다른지 알 수 없었다(94와 96의 2점 차이가 그랬다). 목표마다
          가중치·달성률·점수를 나란히 두면 그 줄을 찾는 데 한 번만 보면 된다.
          만점도 적는다 — 점수 상한은 가중치의 110%라(`maxScore`) 22점이 20점
          만점을 넘은 것이 아니라는 게 그 자리에서 읽혀야 한다.
        */}
        {performanceGoals.length > 0 && (
          <section className={CARD_CLASS}>
            {sectionHead(
              "3. 성과평가 상세",
              `${
                finalCycle ? cycleTitle(finalCycle) : "성과평가"
              }에서 1차 평가자가 매긴 점수`,
            )}
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-4 py-1.5 font-medium">목표</th>
                    <th className="px-3 py-1.5 text-right font-medium">
                      가중치
                    </th>
                    <th className="px-3 py-1.5 text-right font-medium">
                      달성률
                    </th>
                    <th className="px-3 py-1.5 text-right font-medium">점수</th>
                    <th className="px-4 py-1.5 text-right font-medium">만점</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceGoals.map((g) => (
                    <tr key={g.title} className="border-t border-slate-100">
                      <td className="px-4 py-1.5 break-keep text-slate-800">
                        {g.title}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                        {Math.round(g.weight)}%
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                        {g.firstProgress ?? g.progress ?? "–"}%
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right font-semibold tabular-nums ${
                          g.firstScore == null
                            ? "text-status-critical"
                            : "text-slate-900"
                        }`}
                      >
                        {g.firstScore ?? "미입력"}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-slate-400">
                        {maxScore(g.weight)}
                      </td>
                    </tr>
                  ))}
                  {/*
                    집계에서 빼 둔 줄. 세지 않으므로 합계 위에 흐리게 붙인다 —
                    «다섯 건인데 왜 네 건만 세지는가»는 이 줄을 보면 끝난다.
                  */}
                  {perfDropped.map((g) => (
                    <tr
                      key={`off-${g.title}`}
                      className="border-t border-slate-100 bg-slate-50/60 text-slate-400"
                    >
                      <td className="px-4 py-1.5 break-keep">
                        {g.title}
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          집계 제외
                          {g.excludeReason ? ` · ${g.excludeReason}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {Math.round(g.weight)}%
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {g.firstProgress ?? g.progress ?? "–"}%
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {g.firstScore ?? "–"}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">
                        세지 않음
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="px-4 py-1.5 font-medium text-slate-800">
                      합계
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums text-slate-700">
                      {perfWeightSum}%
                    </td>
                    <td className="px-3 py-1.5" />
                    <td className="px-3 py-1.5 text-right text-base font-bold tabular-nums text-slate-900">
                      {perfScore ?? "–"}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-slate-400">
                      {performanceGoals.reduce(
                        (n, g) => n + maxScore(g.weight),
                        0,
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 px-4 py-2 text-xs break-keep text-slate-500">
              성과점수는 이 합계입니다 — 달성률에서 자동으로 계산하지 않고, 1차
              평가자가 「하반기 평가점수」 칸에 적은 값을 그대로 더합니다.
              손으로 센 값과 다르면 그 줄의 점수 칸을 확인해 주세요.
            </p>
          </section>
        )}

        {/* 4. 주관적 서술 */}
        <section className={CARD_CLASS}>
          {sectionHead("4. 주관적 서술", "팀장의 코멘트")}
          <div className="border-t border-slate-100 px-4 py-3">
            {competencyReview?.leadComment ? (
              <p className="text-sm leading-relaxed break-keep whitespace-pre-wrap text-slate-700">
                {competencyReview.leadComment}
              </p>
            ) : (
              <p className="text-sm break-keep text-slate-400">
                아직 코멘트가 없습니다 — 1차 평가자가 「역량평가」 화면의 「전체
                코멘트」에 적으면 여기에 그대로 실립니다.
              </p>
            )}
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-center text-xs break-keep text-slate-500">
            {selectedYear}년 한국삼공의 구성원으로서 역량과 성장을 보여주신
            당신에게 감사드리며, 한 해 동안 고생하셨습니다.
          </p>
        </section>
      </div>
    );
  }

  /*
    HR REPORT 화면. 관리자 전용이다(고르개 자체가 관리자에게만 뜬다).

    탭을 하나 두고 시작한다 — 「평가 점수 관리」. 지금은 한 장뿐이지만 조직 분포·
    평가자 성향 같은 장이 이어 붙을 자리라, 처음부터 탭 줄을 세워 두어야 나중에
    화면이 통째로 바뀌지 않는다.

    한 줄에 «이름 · 부서 · 1차 평가자 · 성과(60%) · 역량(40%) · 가산점 · 최종점수 ·
    등급»을 놓는다. 적는 칸은 둘뿐이다 — 가산점과 등급 확정. 나머지는 목표·문항에서
    굴러 온 값이라, 손대는 자리를 좁혀 두어야 무엇을 고쳤는지 알 수 있다.
  */
  function reportBoard() {
    const cell = "px-3 py-1.5 text-right tabular-nums";
    const rtab = params.rtab === "exec" ? "exec" : "scores";
    /* 책임별로 묶어 볼지. 라인 전체를 점수순으로 한 줄로 세워 보고 싶을 때가
       있어 끌 수 있게 둔다 — 묶어 놓으면 정렬이 묶음 안에서만 돈다. */
    const grouped = params.rgroup !== "flat";
    /* 고른 라인이 지금 목록에 없으면(해가 바뀌어 사람이 빠졌다든가) 조용히
       «전체»로 돌아간다 — 빈 화면을 두고 «왜 아무도 없지»가 되는 것보다 낫다. */
    const pickedUnit = reportUnits.some((u) => u.unit === params.unit)
      ? params.unit!
      : "";
    const [rKey, rDir] = (params.rsort ?? "total-desc").split("-");
    const rDesc = rDir === "desc";

    const unitsShown = pickedUnit
      ? reportUnits.filter((u) => u.unit === pickedUnit)
      : reportUnits;
    /* 책임 고르개는 **고른 운영책임 라인 안에서만** 채운다. 라인을 바꾸면 주소에
       남아 있던 책임이 그 라인에 없을 수 있어, 없으면 전체로 본다. */
    const deptCount = new Map<string, number>();
    for (const u of unitsShown) {
      for (const p of u.rows) {
        const d = deptOf(p);
        deptCount.set(d, (deptCount.get(d) ?? 0) + 1);
      }
    }
    const deptKeys = [...deptCount.keys()].sort((a, b) =>
      a === NO_DEPT
        ? 1
        : b === NO_DEPT
          ? -1
          : deptLabel(a).localeCompare(deptLabel(b)),
    );
    const pickedDept =
      params.dept && deptCount.has(params.dept) ? params.dept : "";
    /** 모수 전체의 책임 라인 수 — 머리글에 적는다(고른 라인과 상관없이). */
    const allDeptKeys = [...new Set(reportPeople.map((p) => deptOf(p)))];
    /*
      화면에 그릴 라인. 책임을 골랐으면 그 사람들만 남기되 **등급은 건드리지
      않는다**(`u.grades`) — 등급은 운영책임 라인 안에서 매겨진 값이고, 보기를
      좁혔다고 순위를 다시 내면 같은 사람이 화면마다 다른 등급을 받는다.
    */
    const shown = unitsShown
      .map((u) => ({
        ...u,
        rows: pickedDept
          ? u.rows.filter((p) => deptOf(p) === pickedDept)
          : u.rows,
      }))
      .filter((u) => u.rows.length > 0);

    /** 이 화면 안에서 움직이는 주소 — 고른 섹터·라인·책임·정렬을 들고 다닌다. */
    const reportHref = (over: Record<string, string>) => {
      const qs = new URLSearchParams();
      qs.set("year", String(selectedYear));
      qs.set("phase", selectedPhase);
      if (pickedUnit) qs.set("unit", pickedUnit);
      if (pickedDept) qs.set("dept", pickedDept);
      if (rtab === "exec") qs.set("rtab", "exec");
      if (!grouped) qs.set("rgroup", "flat");
      if (params.rsort) qs.set("rsort", params.rsort);
      for (const [k, v] of Object.entries(over)) {
        if (v) qs.set(k, v);
        else qs.delete(k);
      }
      return `/platform/evaluation2?${qs.toString()}`;
    };
    /** 표 머리글을 눌렀을 때 갈 주소 — 같은 칸을 다시 누르면 방향이 뒤집힌다. */
    const rHref = (key: string) =>
      reportHref({ rsort: rKey === key && !rDesc ? `${key}-desc` : key });
    const rMark = (key: string) => (rKey === key ? (rDesc ? " ↓" : " ↑") : "");
    const sortableHead = (
      key: string,
      label: string,
      align: "left" | "right" = "left",
    ) => (
      <th
        className={`px-3 py-1.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}
      >
        <Link
          href={rHref(key)}
          className="hover:text-slate-800 hover:underline"
        >
          {label}
          {rMark(key)}
        </Link>
      </th>
    );

    /*
      한 라인 안을 **책임(부문) 라인**으로 한 번 더 가른다 — 「황수목 운영책임」
      밑의 「박은희 책임 · 생산」 · 「김지훈 책임 · 기술연구」처럼. 조직도의 부문을
      그대로 따라가므로 책임이 아직 지정되지 않은 부문도 이름으로 갈린다.

      묶음이 하나뿐이면 머리를 띄우지 않는다 — 한 줄짜리 소제목은 표만 길어진다.
    */
    const deptGroups = (rows: typeof reportPeople) => {
      if (!grouped) return [{ key: "__flat__", rows, showHead: false }];
      const by = new Map<string, typeof reportPeople>();
      for (const p of rows) {
        const d = deptOf(p);
        by.set(d, [...(by.get(d) ?? []), p]);
      }
      const keys = [...by.keys()].sort((a, b) =>
        a === NO_DEPT
          ? 1
          : b === NO_DEPT
            ? -1
            : deptLabel(a).localeCompare(deptLabel(b)),
      );
      return keys.map((key) => ({
        key,
        rows: by.get(key)!,
        /*
          묶음이 하나뿐이면 소제목을 띄우지 않는다 — 한 줄짜리 소제목은 표만
          길어진다. 다만 그 하나가 「부문 미지정」이면 띄운다: 라인 전원이 한
          덩어리로 보이는 이유를 그 자리에서 말해 주어야 한다.
        */
        showHead: keys.length > 1 || key === NO_DEPT,
      }));
    };

    /** 그 사람의 등급 — 라인마다 따로 매겨져 있어 한 번 찾아 준다. */
    const unitGradeOf = (p: (typeof reportPeople)[number]) => {
      const u = reportUnits.find((x) => x.rows.some((r) => r.id === p.id));
      return u?.grades.get(p.id) ?? null;
    };

    /*
      정렬은 «값이 없는 사람은 늘 아래»로 둔다. 점수가 빈 사람이 오름차순에서
      맨 위에 몰리면, 정작 읽으려던 «낮은 점수부터»가 화면 밖으로 밀린다.
    */
    const sortRows = (rows: typeof reportPeople) => {
      const num = (v: number | null | undefined) => (v == null ? null : v);
      const key = (p: (typeof reportPeople)[number]) => {
        const sc = reportScores.get(p.id);
        switch (rKey) {
          case "name":
            return p.name;
          case "team":
            return p.team?.name ?? p.division ?? "";
          case "first":
            return evaluatorByPerson.get(p.id)?.first?.name ?? "";
          case "perf":
            return num(sc?.performance);
          case "comp":
            return num(sc?.competency);
          case "bonus":
            return sc?.bonus ?? 0;
          case "grade":
            return unitGradeOf(p)?.grade ?? "";
          default:
            return num(sc?.total);
        }
      };
      return [...rows].sort((a, b) => {
        const x = key(a);
        const y = key(b);
        if (x == null && y == null) return a.name.localeCompare(b.name);
        if (x == null) return 1;
        if (y == null) return -1;
        const n =
          typeof x === "number" && typeof y === "number"
            ? x - y
            : String(x).localeCompare(String(y));
        return (rDesc ? -n : n) || a.name.localeCompare(b.name);
      });
    };

    /*
      임원진 REPORT — **라인 단위로 읽는** 자리. 사람 한 줄씩이 아니라 묶음마다
      «몇 명이 끝났고, 평균이 얼마고, 등급이 어떻게 갈렸는지»를 놓는다. 적는
      칸은 하나도 두지 않는다.
    */
    const mean = (xs: number[]) =>
      xs.length
        ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
        : null;
    /** 한 묶음의 요약. 평균은 **값이 있는 사람만**으로 낸다 — 미입력을 0으로
        세면 평가가 덜 끝난 라인이 통째로 낮아 보인다. */
    const summarize = (
      rows: typeof reportPeople,
      gradeOf: (p: (typeof reportPeople)[number]) => string | null,
    ) => {
      const got = (
        pick: (
          sc: ReturnType<typeof reportScores.get>,
        ) => number | null | undefined,
      ) =>
        mean(
          rows
            .map((p) => pick(reportScores.get(p.id)))
            .filter((v): v is number => v != null),
        );
      const dist = new Map<string, number>();
      for (const p of rows) {
        const g = gradeOf(p);
        if (g) dist.set(g, (dist.get(g) ?? 0) + 1);
      }
      return {
        n: rows.length,
        done: rows.filter((p) => reportScores.get(p.id)?.total != null).length,
        perf: got((sc) => sc?.performance),
        comp: got((sc) => sc?.competency),
        total: got((sc) => sc?.total),
        dist,
      };
    };
    const showNum = (v: number | null) =>
      v == null ? <span className="text-slate-300">–</span> : v;
    /** 등급 분포 — 다섯 칸을 늘 같은 자리에 둔다(없으면 «·»). */
    const distCells = (dist: Map<string, number>) =>
      PERSON_GRADES.map((g) => (
        <td key={g} className="px-2 py-1.5 text-right tabular-nums">
          {dist.get(g) ? (
            <span className="font-medium text-slate-800">{dist.get(g)}</span>
          ) : (
            <span className="text-slate-300">·</span>
          )}
        </td>
      ));
    const gradeHeads = PERSON_GRADES.map((g) => (
      <th key={g} className="px-2 py-1.5 text-right font-medium">
        {g}
      </th>
    ));

    const execSections = () => {
      const allRows = shown.flatMap((u) => u.rows);
      const whole = summarize(allRows, (p) => unitGradeOf(p)?.grade ?? null);
      /*
        책임 라인별 — 고른 범위 안에서만 묶는다. 묶는 열쇠는 «운영책임 + 책임»
        둘이다. 책임만으로 묶으면 「책임 미지정」이 여러 라인에서 한 줄로 뭉쳐,
        옆에 적힌 운영책임이 그중 한 명만 가리키는 거짓말이 된다.
      */
      const byDept = new Map<
        string,
        { rows: typeof reportPeople; unitKey: string; deptKey: string }
      >();
      for (const u of shown) {
        for (const p of u.rows) {
          const d = deptOf(p);
          const key = `${u.unit}|${d}`;
          const cur = byDept.get(key);
          if (cur) cur.rows.push(p);
          else byDept.set(key, { rows: [p], unitKey: u.unit, deptKey: d });
        }
      }
      const deptRows = [...byDept.entries()].sort(([, a], [, b]) => {
        const byUnit = unitLabel(a.unitKey).localeCompare(unitLabel(b.unitKey));
        if (byUnit !== 0) return byUnit;
        if (a.deptKey === NO_DEPT) return 1;
        if (b.deptKey === NO_DEPT) return -1;
        return deptLabel(a.deptKey).localeCompare(deptLabel(b.deptKey));
      });

      return (
        <>
          <section className={CARD_CLASS}>
            {sectionHead(
              "1. 한눈에",
              pickedDept
                ? deptLabel(pickedDept)
                : pickedUnit
                  ? unitLabel(pickedUnit)
                  : "전사",
            )}
            <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
              {[
                { label: "평가 대상", value: `${whole.n}명` },
                {
                  label: "점수 산출 완료",
                  value: `${whole.done}명`,
                  hint:
                    whole.n > 0
                      ? `${Math.round((whole.done / whole.n) * 100)}%`
                      : null,
                },
                {
                  label: `평균 성과 ${Math.round(PERFORMANCE_WEIGHT * 100)}%`,
                  value: whole.perf == null ? "–" : String(whole.perf),
                },
                {
                  label: `평균 역량 ${Math.round(COMPETENCY_WEIGHT * 100)}%`,
                  value: whole.comp == null ? "–" : String(whole.comp),
                },
              ].map((b) => (
                <div key={b.label} className="bg-white px-4 py-3">
                  <p className="text-xs break-keep text-slate-500">{b.label}</p>
                  <p className="text-xl font-bold tabular-nums text-slate-900">
                    {b.value}
                    {b.hint && (
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        {b.hint}
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5">
              <span className="text-xs font-medium text-slate-700">
                평균 최종점수
              </span>
              <span className="text-lg font-bold tabular-nums text-slate-900">
                {whole.total == null ? "–" : whole.total}
              </span>
              <span className="ml-3 text-xs font-medium text-slate-700">
                등급 분포
              </span>
              {PERSON_GRADES.map((g) => (
                <span
                  key={g}
                  className="flex items-center gap-1 text-xs text-slate-600"
                >
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                      PERSON_GRADE_CLASS[g] ?? "bg-slate-500 text-white"
                    }`}
                  >
                    {g}
                  </span>
                  {whole.dist.get(g) ?? 0}명
                </span>
              ))}
              {whole.done < whole.n && (
                <span className="ml-auto text-xs break-keep text-status-critical">
                  아직 {whole.n - whole.done}명은 점수가 비어 있습니다 — 성과 ·
                  역량 중 한쪽이라도 미입력이면 최종점수가 나오지 않습니다.
                </span>
              )}
            </div>
          </section>

          <section className={CARD_CLASS}>
            {sectionHead(
              "2. 운영책임 라인별",
              "등급을 매기는 묶음 · 점수는 평균",
            )}
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[46rem] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-3 py-1.5 font-medium">라인</th>
                    <th className="px-3 py-1.5 text-right font-medium">인원</th>
                    <th className="px-3 py-1.5 text-right font-medium">완료</th>
                    <th className="px-3 py-1.5 font-medium">조직등급</th>
                    <th className="px-3 py-1.5 text-right font-medium">성과</th>
                    <th className="px-3 py-1.5 text-right font-medium">역량</th>
                    <th className="px-3 py-1.5 text-right font-medium">최종</th>
                    {gradeHeads}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => {
                    const sum = summarize(
                      u.rows,
                      (p) => u.grades.get(p.id)?.grade ?? null,
                    );
                    return (
                      <tr key={u.unit} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-medium whitespace-nowrap text-slate-800">
                          <Link
                            href={reportHref({ unit: u.unit, dept: "" })}
                            className="hover:underline"
                          >
                            {unitLabel(u.unit)}
                          </Link>
                        </td>
                        <td className={cell}>{sum.n}</td>
                        <td className={cell}>
                          {sum.done < sum.n ? (
                            <span className="text-status-critical">
                              {sum.done}
                            </span>
                          ) : (
                            sum.done
                          )}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {u.orgGrade ? (
                            <span className="font-medium text-slate-800">
                              {u.orgGrade}
                            </span>
                          ) : (
                            <span className="text-xs text-status-critical">
                              미지정
                            </span>
                          )}
                        </td>
                        <td className={cell}>{showNum(sum.perf)}</td>
                        <td className={cell}>{showNum(sum.comp)}</td>
                        <td className={`${cell} font-bold text-slate-900`}>
                          {showNum(sum.total)}
                        </td>
                        {distCells(sum.dist)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={CARD_CLASS}>
            {sectionHead("3. 책임 라인별", "조직도의 부문 단위 · 점수는 평균")}
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[46rem] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-3 py-1.5 font-medium">책임 라인</th>
                    <th className="px-3 py-1.5 font-medium">운영책임</th>
                    <th className="px-3 py-1.5 text-right font-medium">인원</th>
                    <th className="px-3 py-1.5 text-right font-medium">완료</th>
                    <th className="px-3 py-1.5 text-right font-medium">성과</th>
                    <th className="px-3 py-1.5 text-right font-medium">역량</th>
                    <th className="px-3 py-1.5 text-right font-medium">최종</th>
                    {gradeHeads}
                  </tr>
                </thead>
                <tbody>
                  {deptRows.map(([key, g]) => {
                    const dept = g.deptKey;
                    const sum = summarize(
                      g.rows,
                      (p) => unitGradeOf(p)?.grade ?? null,
                    );
                    return (
                      <tr key={key} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-medium whitespace-nowrap text-slate-800">
                          <Link
                            href={reportHref({
                              unit: g.unitKey,
                              dept: dept === NO_DEPT ? "" : dept,
                            })}
                            className="hover:underline"
                          >
                            {deptLabel(dept)}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">
                          {unitLabel(g.unitKey)}
                        </td>
                        <td className={cell}>{sum.n}</td>
                        <td className={cell}>
                          {sum.done < sum.n ? (
                            <span className="text-status-critical">
                              {sum.done}
                            </span>
                          ) : (
                            sum.done
                          )}
                        </td>
                        <td className={cell}>{showNum(sum.perf)}</td>
                        <td className={cell}>{showNum(sum.comp)}</td>
                        <td className={`${cell} font-bold text-slate-900`}>
                          {showNum(sum.total)}
                        </td>
                        {distCells(sum.dist)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 px-4 py-2 text-[11px] break-keep text-slate-400">
              등급은 운영책임 라인 안에서 매겨진 값을 그대로 세었습니다 — 책임
              라인끼리는 정원이 따로 있지 않습니다.
            </p>
          </section>
        </>
      );
    };

    return (
      <div className="flex flex-col gap-4">
        {/*
          섹터 두 장 — 「평가 점수 관리」는 인사팀이 **적는** 자리, 「임원진
          REPORT」는 **읽는** 자리다. 한 화면에 섞어 두면 임원이 보는 곳에
          가산점·등급 입력칸이 따라다녀, 손댈 자리가 아닌데 손대게 된다.

          목표 층 탭(대시보드 · 전사목표)과 같은 줄 모양을 쓴다 — 화면 맨 위에서
          갈래를 고르는 자리는 한 가지로만 생겼어야 어디를 누르는지 헷갈리지 않는다.
        */}
        <nav className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs shadow-sm">
          {[
            { key: "scores", label: "평가 점수 관리" },
            { key: "exec", label: "임원진 REPORT" },
          ].map((t) => (
            <Link
              key={t.key}
              href={reportHref({ rtab: t.key === "exec" ? "exec" : "" })}
              className={`rounded-full px-3 py-1.5 transition-colors sm:py-0.5 ${
                rtab === t.key ? TAB_CLASS.on : TAB_CLASS.off
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <section className={CARD_CLASS}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
            <h1 className="text-base font-bold text-slate-900">
              {selectedYear}년 인사평가 HR REPORT
            </h1>
            <span className="text-xs break-keep text-slate-500">
              성과평가 {Math.round(PERFORMANCE_WEIGHT * 100)}% + 역량평가{" "}
              {Math.round(COMPETENCY_WEIGHT * 100)}% + 운영(책임) 가산점 =
              최종점수
            </span>
            <span className="ml-auto text-xs break-keep text-slate-500">
              평가 대상 {reportPeople.length}명 · 운영책임 {reportUnits.length}
              개 라인 · 책임 {allDeptKeys.length}개 라인 · 조직도 기준(정규직 +
              영업관리팀 계약직 중 담당 · 팀장)
            </span>
          </div>
          {/*
            고르개 줄 — 조직도를 그대로 따라 내려간다(본부 → 부문). 운영책임
            라인은 백 명이 넘어 한눈에 안 읽히므로, 그 안에서 책임 라인으로 한 칸
            더 좁힐 수 있다.
          */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-4 py-2">
            <span className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-700">
                운영책임
              </span>
              <ParamSelect
                param="unit"
                value={pickedUnit}
                ariaLabel="운영책임 라인 고르기"
                options={[
                  { value: "", label: `전체 ${reportUnits.length}개 라인` },
                  ...reportUnits.map((u) => ({
                    value: u.unit,
                    label: `${unitLabel(u.unit)} (${u.rows.length}명)`,
                  })),
                ]}
              />
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-700">책임</span>
              <ParamSelect
                param="dept"
                value={pickedDept}
                ariaLabel="책임 라인 고르기"
                options={[
                  { value: "", label: `전체 ${deptKeys.length}개 책임 라인` },
                  ...deptKeys.map((k) => ({
                    value: k,
                    label: `${deptLabel(k)} (${deptCount.get(k)}명)`,
                  })),
                ]}
              />
            </span>
            {rtab === "scores" && (
              <Link
                href={reportHref({ rgroup: grouped ? "flat" : "" })}
                className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors ${
                  grouped
                    ? "border-goal-4 bg-goal-4/10 font-medium text-goal-4"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                책임별 묶기 {grouped ? "켬" : "끔"}
              </Link>
            )}
            <span className="ml-auto text-[11px] break-keep text-slate-400">
              {rtab === "exec"
                ? "라인별 요약만 읽는 자리입니다 — 적는 칸은 「평가 점수 관리」에 있습니다."
                : "등급은 운영책임 라인 안에서 매겨집니다 — 책임으로 좁혀도 순위는 그대로입니다."}
            </span>
          </div>
        </section>

        {shown.length === 0 ? (
          <p className={`${CARD_CLASS} p-8 text-center text-sm text-slate-500`}>
            {selectedYear}년 평가 대상자가 없습니다 — 「평가대상자 관리」에서
            확인해 주세요.
          </p>
        ) : rtab === "exec" ? (
          execSections()
        ) : (
          shown.map((u) => (
            <section key={u.unit} className={CARD_CLASS}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 px-4 py-2">
                <h2 className="text-sm font-bold text-slate-900">
                  {unitLabel(u.unit)}
                </h2>
                <span className="text-xs text-slate-500">
                  {u.rows.length}명
                </span>
                {/*
                  조직등급을 여기서 바로 고른다 — 정원표가 그 등급을 따라오므로,
                  등급을 고치려고 관리 화면으로 건너갔다 돌아오면 무엇이 바뀌었는지
                  나란히 볼 수 없다.
                */}
                <span className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-700">
                    조직등급
                  </span>
                  <InstantSelect
                    action={setUnitOrgGrade}
                    hidden={{
                      year: String(selectedYear),
                      unitKey: u.unit,
                    }}
                    name="orgGrade"
                    value={u.orgGrade ?? ""}
                    ariaLabel={`${unitLabel(u.unit)} 조직등급`}
                    tone={u.orgGrade ? "plain" : "warn"}
                    options={[
                      { value: "", label: "미지정" },
                      ...ORG_GRADES.map((g) => ({ value: g, label: g })),
                    ]}
                  />
                </span>
                {u.orgGrade ? (
                  <span className="text-xs break-keep text-slate-500">
                    정원{" "}
                    {PERSON_GRADES.filter((g) => (u.ratios?.[g] ?? 0) > 0)
                      .map((g) => `${g} ${u.ratios![g]}%`)
                      .join(" · ") || "미입력"}
                  </span>
                ) : (
                  <span className="text-xs break-keep text-status-critical">
                    조직등급을 고르면 정원표대로 등급이 매겨집니다
                  </span>
                )}
                <Link
                  href="/admin/grade"
                  className="ml-auto text-xs text-brand-green-dark underline"
                >
                  분포표 고치기
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[62rem] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs text-slate-500">
                      {sortableHead("name", "이름")}
                      {sortableHead("team", "부서")}
                      {sortableHead("first", "1차 평가자")}
                      {sortableHead(
                        "perf",
                        `성과 ${Math.round(PERFORMANCE_WEIGHT * 100)}%`,
                        "right",
                      )}
                      {sortableHead(
                        "comp",
                        `역량 ${Math.round(COMPETENCY_WEIGHT * 100)}%`,
                        "right",
                      )}
                      {sortableHead("bonus", "가산점 ±")}
                      {sortableHead("total", "최종점수", "right")}
                      {sortableHead("grade", "등급")}
                    </tr>
                  </thead>
                  <tbody>
                    {deptGroups(u.rows).map((g) => (
                      <Fragment key={g.key}>
                        {g.showHead && (
                          <tr className="border-t border-slate-200 bg-slate-50">
                            <td
                              colSpan={8}
                              className="px-3 py-1 text-xs font-medium text-slate-600"
                            >
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="h-3 w-0.5 rounded-full bg-goal-4"
                                  aria-hidden="true"
                                />
                                {deptLabel(g.key)}
                                <span className="font-normal text-slate-400">
                                  {g.rows.length}명
                                </span>
                                {/*
                                  왜 미지정인지를 그 자리에서 알린다 — 「부문」은
                                  팀 관리 화면에서 「본부」라는 이름으로 적는 칸이라,
                                  어디를 채워야 하는지 말해 주지 않으면 찾을 수 없다.
                                */}
                                {g.key === NO_DEPT && (
                                  <span className="font-normal break-keep text-slate-400">
                                    · 팀의 「본부」 칸이 비어 있습니다 —{" "}
                                    <Link
                                      href="/admin/teams"
                                      className="text-brand-green-dark underline"
                                    >
                                      팀 관리
                                    </Link>
                                    에서 채우면 책임 라인으로 갈립니다
                                  </span>
                                )}
                              </span>
                            </td>
                          </tr>
                        )}
                        {sortRows(g.rows).map((p) => {
                          const sc = reportScores.get(p.id);
                          const gr = u.grades.get(p.id) ?? null;
                          const chain = evaluatorByPerson.get(p.id) ?? null;
                          return (
                            <tr
                              key={p.id}
                              className="border-t border-slate-100"
                            >
                              <td className="px-3 py-1.5 font-medium whitespace-nowrap text-slate-800">
                                {p.name} {POSITION_LABEL[p.position]}
                              </td>
                              <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">
                                {p.team?.name ?? p.division ?? "-"}
                              </td>
                              <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">
                                {chain?.first
                                  ? evaluatorLabel(chain.first)
                                  : "-"}
                              </td>
                              <td className={cell}>
                                {sc?.performance ?? (
                                  <span className="text-status-critical">
                                    미입력
                                  </span>
                                )}
                              </td>
                              <td className={cell}>
                                {sc?.competency ?? (
                                  <span className="text-status-critical">
                                    미입력
                                  </span>
                                )}
                              </td>
                              {/*
                            가산점만 적는 칸이다. 줄마다 폼을 두되 칸 **안에**
                            둔다 — `<tr>` 바로 아래에 폼을 넣으면 올바른 HTML이
                            아니라 브라우저가 표 밖으로 밀어낼 수 있다.
                          */}
                              <td className="px-3 py-1.5">
                                <ActionForm
                                  action={setGradeBonus}
                                  successMessage="가산점을 적었습니다."
                                  className="flex items-center gap-1"
                                >
                                  <input
                                    type="hidden"
                                    name="year"
                                    value={selectedYear}
                                  />
                                  <input
                                    type="hidden"
                                    name="userId"
                                    value={p.id}
                                  />
                                  <input
                                    type="number"
                                    name="points"
                                    step="0.1"
                                    min={-50}
                                    max={50}
                                    defaultValue={sc?.bonus ? sc.bonus : ""}
                                    placeholder="0"
                                    aria-label={`${p.name} 가산점`}
                                    className="w-14 rounded-md border border-slate-300 px-1.5 py-1 text-right text-xs tabular-nums"
                                  />
                                  <input
                                    name="note"
                                    defaultValue={sc?.bonusNote ?? ""}
                                    placeholder="사유"
                                    aria-label={`${p.name} 가산점 사유`}
                                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs"
                                  />
                                  <button
                                    type="submit"
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs whitespace-nowrap text-slate-700 hover:bg-slate-50"
                                  >
                                    저장
                                  </button>
                                </ActionForm>
                              </td>
                              <td
                                className={`${cell} text-base font-bold text-slate-900`}
                              >
                                {sc?.total ?? "–"}
                              </td>
                              {/*
                            등급 칸. 표대로 나온 등급을 보여 주되 인사팀이 손으로
                            고칠 수 있다 — 반올림으로 갈린 자리는 사람이 정한다.
                            고른 값이 계산값과 다르면 그 사실을 옆에 적는다.
                          */}
                              <td className="px-3 py-1.5 whitespace-nowrap">
                                <span className="flex items-center gap-1.5">
                                  <InstantSelect
                                    action={setFinalGrade}
                                    hidden={{
                                      year: String(selectedYear),
                                      userId: p.id,
                                    }}
                                    name="grade"
                                    value={gr?.fixed ? gr.grade : ""}
                                    ariaLabel={`${p.name} 등급 확정`}
                                    options={[
                                      {
                                        value: "",
                                        label: gr
                                          ? `표대로 ${gr.computed ?? gr.grade}`
                                          : "표대로 (미정)",
                                      },
                                      ...PERSON_GRADES.map((g) => ({
                                        value: g,
                                        label: g,
                                      })),
                                    ]}
                                  />
                                  {gr ? (
                                    <span
                                      className={`rounded-md px-2 py-0.5 text-sm font-bold ${
                                        PERSON_GRADE_CLASS[gr.grade] ??
                                        "bg-slate-500 text-white"
                                      }`}
                                    >
                                      {gr.grade}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">
                                      미정
                                    </span>
                                  )}
                                  {gr && (
                                    <span className="text-[11px] whitespace-nowrap text-slate-400">
                                      {gr.of}명 중 {gr.rank}위
                                    </span>
                                  )}
                                  {gr?.fixed && (
                                    <span className="rounded bg-goal-4/10 px-1 py-0.5 text-[10px] font-medium whitespace-nowrap text-goal-4">
                                      인사팀 확정
                                      {gr.computed &&
                                        gr.computed !== gr.grade &&
                                        ` · 표대로는 ${gr.computed}`}
                                    </span>
                                  )}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </div>
    );
  }

  function companyGoalBoard() {
    return (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
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
                  <span className="ml-0.5 text-xs font-normal text-slate-400">
                    %
                  </span>
                </span>
              </>
            )}
            {/* 한 줄을 유지하려고 라벨과 값을 가로로 붙인다. */}
            <dl className="hidden items-center gap-2.5 text-xs text-slate-500 sm:flex">
              <div className="flex items-center gap-1">
                <dt>목표</dt>
                <dd className="font-semibold text-slate-800">
                  {companyGoals.length}
                </dd>
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
                  <dd className="font-semibold text-slate-400">
                    {excludedCount}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* 표는 펼친 채로 연다. 자리가 아깝다 싶으면 머리글을 눌러 접는다. */}
        <details open>
          <summary className="flex cursor-pointer items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-1 text-xs text-slate-600 hover:bg-slate-100">
            <span className="font-medium">
              전사 목표 {companyGoals.length}건
            </span>
            <span className="text-slate-400">· 눌러서 접기 / 펼치기</span>
          </summary>
          {companyGoals.length === 0 ? (
            <div className="border-t border-slate-200 px-5 py-6">
              <p className="text-sm text-slate-500">
                등록된 전사목표가 없습니다.
                {isAdmin &&
                  " 여기에 등록하면 이 자리에 고정되어 모두에게 보입니다."}
              </p>
              {isAdmin && cycle && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ActionForm
                    action={seedCompanyGoalTemplate.bind(
                      null,
                      goalCycleId ?? cycle.id,
                    )}
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
                    제품기획마케팅 · 영업고객관리 · 기술연구 · 생산 ·
                    재무경영관리 다섯 줄이 한 번에 들어갑니다. 내용은 등록 후
                    수정하세요.
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/*
              좁은 화면에서는 최소 너비를 걸지 않는다. 걸어 두면 표가 자기 상자
              안에서 옆으로 밀려 목표 이름의 오른쪽이 잘린 채 읽힌다 — 휴대폰에서는
              이름이 여러 줄로 접히는 편이 낫다. 달성률 칸도 좁은 화면에서는 막대를
              접고 숫자만 남긴다.
            */}
              <table className="w-full text-sm sm:min-w-[860px]">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-3 py-1 text-left text-xs font-semibold sm:px-4">
                      목표
                    </th>
                    {showsProgress && (
                      <th className="w-16 px-3 py-1 text-left text-xs font-semibold sm:w-56 sm:px-4">
                        달성률
                      </th>
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
                        <td className="px-4 py-1">
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
                            <span className="font-medium text-slate-800">
                              {goalTitle(g)}
                            </span>
                          </div>
                          {/* 기타 자리에는 지표도 설명도 붙이지 않는다 — 담아 두는
                            칸이지 그 자체로 세운 목표가 아니다. */}
                          {!g.isOther &&
                            (g.metric || g.targetValue || g.description) && (
                              <p className="mt-0.5 pl-5 text-xs text-slate-500">
                                {[
                                  g.metric,
                                  g.targetValue
                                    ? `목표 ${g.targetValue}`
                                    : null,
                                  g.description,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                        </td>
                        {showsProgress && (
                          <td className="px-3 py-1 sm:px-4">
                            <div className="flex items-center gap-2">
                              <span className="hidden flex-1 sm:block">
                                <Meter value={g.rollupProgress} size="md" />
                              </span>
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
          {(unlinked.length > 0 ||
            needsReviewCount > 0 ||
            awaitingMyApproval > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-2.5">
              <div className="space-y-1 text-xs text-slate-500">
                {awaitingMyApproval > 0 && (
                  <p className="font-medium text-brand-green-dark">
                    합의를 기다리는 개인목표 {awaitingMyApproval}건이 있습니다 —
                    개인목표 탭에서 승인하거나 되돌릴 수 있습니다.
                  </p>
                )}
                {needsReviewCount > 0 && (
                  <p className="text-amber-700">
                    담당자가 퇴사했거나 부서를 옮긴 목표 {needsReviewCount}건이
                    아직 집계에 들어 있습니다 — 해당 목표에서 「집계 제외」를
                    눌러 빼실 수 있습니다.
                  </p>
                )}
                {unlinked.length > 0 && (
                  <p className="text-status-critical">
                    상위 목표에 연결되지 않은 목표 {unlinked.length}건은 전사
                    달성률에 반영되지 않습니다 — 해당 목표를 열어 「상위
                    목표」를 지정해 주세요.
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

  /*
    한 해 평가가 지나가는 길을 가로 한 줄로 편 띠. 목표설정부터 종료까지 열 마디를
    늘어놓고, 지금 내가 어디쯤인지를 표시한다.

    마디는 세 갈래다.
      - 사이클 마디(목표설정·중간평가·최종평가): 관리자가 「목표 사이클」에서 잡은
        기간·상태와 **내 개인목표의 평가완료 수**를 함께 읽는다. 회사가 단계를
        열었는지와 내가 그 단계를 끝냈는지는 다른 이야기라 둘 다 본다.
      - 아직 만들지 않은 마디(합의·피드백·역량평가·성과평가): 자리만 잡아 둔다.
        길 전체를 먼저 보여 주지 않으면 «지금 어디쯤인지»를 가늠할 수 없다.
      - 종료: 그 해 사이클이 전부 완료되면 켜진다.

    기간과 남은 날짜는 사이클에 적힌 시작·마감일을 그대로 쓴다 — 여기서 따로
    적는 값이 없다. 관리자가 사이클 날짜를 고치면 이 띠도 그날로 같이 바뀐다.
  */
  function stageTimeline() {
    type Stage = {
      label: string;
      rank?: 1 | 2 | 3;
      /** 역량평가 마디 — 사이클이 아니라 그 해 양식의 상태를 읽는다. */
      competency?: boolean;
      end?: boolean;
    };
    const PLAN: Stage[] = [
      { label: "목표설정", rank: 1 },
      { label: "합의" },
      { label: MID_PHASE_LABEL, rank: 2 },
      { label: "피드백" },
      { label: "합의" },
      /* 성과점수는 목표별 평가점수의 합이라, 세 번째 단계가 곧 성과평가다
         (`FINAL_PHASE_LABEL`). 마디를 따로 하나 더 그리면 같은 일을 두 번
         하는 것처럼 읽히고, 영영 «준비 중»으로 남는 칸이 된다. */
      { label: FINAL_PHASE_LABEL, rank: 3 },
      { label: "역량평가", competency: true },
      { label: "합의" },
      { label: "종료", end: true },
    ];

    const cycleOf = (rank?: number) =>
      rank
        ? (yearCycles.find((c) => cyclePhaseRank(c) === rank) ?? null)
        : null;

    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const dayOf = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const DAY = 86_400_000;
    const fmt = (d: Date) =>
      `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    const fmtFull = (d: Date) =>
      `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
        d.getDate(),
      ).padStart(2, "0")}`;

    /*
      「종료」는 그 해 치러야 하는 것이 전부 닫혔을 때 켠다 — 성과평가까지 끝났는데
      역량평가가 진행중이면 그 해는 끝난 것이 아니다.
    */
    const shut = (c: { status: string; goalsLockedAt?: Date | null }) =>
      c.status === "CLOSED" || !!c.goalsLockedAt;
    const allClosed =
      yearCycles.length > 0 &&
      yearCycles.every(shut) &&
      (!competencyFormState ||
        competencyFormState.status === "CLOSED" ||
        !!competencyFormState.lockedAt);

    const nodes = PLAN.map((st) => {
      if (st.end) {
        return {
          ...st,
          state: allClosed ? ("done" as const) : ("todo" as const),
          period: null as string | null,
          cycle: null as (typeof yearCycles)[number] | null,
        };
      }
      /*
        역량평가는 사이클이 아니라 그 해 양식 한 줄이다(`CompetencyForm`). 상태
        읽는 규칙은 사이클과 같게 둔다 — 「전체 마감」을 눌렀으면 지나간 마디다.
      */
      if (st.competency) {
        const f = competencyFormState;
        return {
          ...st,
          state: !f
            ? ("todo" as const)
            : f.status === "CLOSED" || f.lockedAt
              ? ("done" as const)
              : f.status === "OPEN"
                ? ("current" as const)
                : ("todo" as const),
          period: f ? competencyFormStateLabel(f) : null,
          cycle: null as (typeof yearCycles)[number] | null,
        };
      }
      const c = cycleOf(st.rank);
      if (!c) {
        // 아직 만들지 않은 단계(합의·피드백…)와, 그 해에 아직 열지 않은 사이클.
        return {
          ...st,
          state: "todo" as const,
          period: null,
          cycle: null,
        };
      }
      const mine = myStageStat.get(c.id) ?? { total: 0, done: 0 };
      /*
        지나간 마디로 보는 두 가지 — **관리자가 「전체 마감」을 눌렀거나**, 내
        개인목표가 모두 평가완료거나.

        마감이 곧 끝이다. 마감은 «이 단계는 여기서 닫는다»고 관리자가 못을 박는
        일이라, 그걸 눌러 놓고도 띠가 계속 「진행중」으로 빛나면 띠가 화면의 다른
        곳과 다른 이야기를 한다(고르개는 이미 「(마감)」으로 적는다). 목표설정에는
        평가완료라는 개념이 없어 마감만 본다.
      */
      const mineDone =
        !!c.goalsLockedAt ||
        (st.rank !== 1 && mine.total > 0 && mine.done === mine.total);
      const state: "done" | "current" | "todo" =
        c.status === "CLOSED" || mineDone
          ? "done"
          : c.status === "OPEN"
            ? "current"
            : "todo";
      return {
        ...st,
        state,
        period: `${fmt(c.startDate)}~${fmt(c.endDate)}`,
        cycle: c,
      };
    });

    /*
      «지금»은 하나만 켠다. 세 사이클이 모두 열려 있는 일이 흔한데(관리자가 한
      해치를 미리 만들어 둔다), 그대로 그리면 목표설정·중간·최종이 전부 «진행중»으로
      빛나서 어디를 봐야 하는지가 사라진다. 앞선 단계부터 훑어 처음 만나는 하나만
      남기고 뒤는 예정으로 내린다.
    */
    const currentIndex = nodes.findIndex((n) => n.state === "current");
    for (
      let i = currentIndex + 1;
      i < nodes.length && currentIndex >= 0;
      i += 1
    ) {
      if (nodes[i].state === "current") nodes[i].state = "todo";
    }
    const active = currentIndex >= 0 ? nodes[currentIndex] : null;
    const activeCycle = active?.cycle ?? null;
    const remainDays = activeCycle
      ? Math.ceil((dayOf(activeCycle.endDate) - midnight) / DAY)
      : null;

    return (
      <section className={`${CARD_CLASS} px-4 py-1.5`}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-sm font-semibold text-slate-800">
            {activeCycle
              ? `「${cyclePhaseLabel(activeCycle)}」 기간`
              : `${selectedYear}년 평가 진행 현황`}
          </h2>
          {remainDays !== null && (
            <span
              className={`text-xs font-medium ${
                remainDays < 0
                  ? "text-status-critical"
                  : remainDays <= 7
                    ? "text-status-critical"
                    : "text-brand-green-dark"
              }`}
            >
              {remainDays < 0
                ? `(마감 ${-remainDays}일 지남)`
                : `(남은 기간 ${remainDays}일)`}
            </span>
          )}
          <HelpMark text="기간과 남은 날짜는 관리자가 「조직 목표 관리」의 목표 사이클에 적어 둔 시작일·마감일을 그대로 읽습니다. 사이클 날짜를 고치면 이 줄도 같이 바뀝니다. 마디는 관리자가 「전체 마감」을 누르거나 내 개인목표가 모두 평가완료되면 지나간 것으로 바뀝니다. 합의·피드백은 아직 준비 중이라 자리만 잡아 두었습니다." />
          {activeCycle && (
            <span className="ml-auto text-xs text-slate-500 tabular-nums">
              {fmtFull(activeCycle.startDate)} ~ {fmtFull(activeCycle.endDate)}
            </span>
          )}
        </div>

        {/* 열 마디가 좁은 화면에 다 들어가지 않으면 옆으로 밀어 본다. */}
        <div className="mt-2 overflow-x-auto">
          <ol className="flex min-w-[640px] items-start">
            {nodes.map((n, i) => {
              const passed =
                currentIndex < 0 ? n.state === "done" : i <= currentIndex;
              const lineBefore =
                i > 0 && (nodes[i - 1].state === "done" || passed);
              const lineAfter = i < nodes.length - 1 && n.state === "done";
              return (
                <li
                  key={`${n.label}-${i}`}
                  className="relative flex min-w-0 flex-1 flex-col items-center px-0.5"
                >
                  {i > 0 && (
                    <span
                      className={`absolute top-[10px] left-0 h-[2px] w-1/2 ${
                        lineBefore ? "bg-brand-green" : "bg-slate-200"
                      }`}
                    />
                  )}
                  {i < nodes.length - 1 && (
                    <span
                      className={`absolute top-[10px] right-0 h-[2px] w-1/2 ${
                        lineAfter ? "bg-brand-green" : "bg-slate-200"
                      }`}
                    />
                  )}
                  <span
                    className={`relative z-10 flex h-[21px] w-[21px] items-center justify-center rounded-full text-[10px] font-bold ${
                      n.state === "done"
                        ? "bg-brand-green text-white"
                        : n.state === "current"
                          ? "bg-white text-brand-green ring-2 ring-brand-green"
                          : "border border-dashed border-slate-300 bg-white text-slate-400"
                    }`}
                  >
                    {n.state === "done" ? "✓" : i + 1}
                  </span>
                  <span
                    className={`mt-1 text-center text-[11px] leading-tight break-keep ${
                      n.state === "current"
                        ? "font-bold text-brand-green-dark"
                        : n.state === "done"
                          ? "font-medium text-slate-700"
                          : "text-slate-400"
                    }`}
                  >
                    {n.label}
                  </span>
                  <span className="text-center text-[10px] leading-tight text-slate-400 tabular-nums">
                    {n.period ?? (n.rank || n.end ? "" : "준비 중")}
                  </span>
                </li>
              );
            })}
          </ol>
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
    const all = visibleRows(byLevel(level));

    /*
      **반기 하나가 대시보드의 단위다.**

      한 사람은 상반기 다섯 · 하반기 다섯처럼 반기마다 목표를 따로 세우므로, 둘을
      한 덩어리로 세면 «개인목표 10건»이 되고 평균 달성률도 «끝난 상반기 102%와
      갓 시작한 하반기 0%»를 섞은 51%가 되어 아무것도 뜻하지 않는다. 지금 굴러가는
      반기(`currentGoalHalf`)를 앞세우고, 지난 반기는 아래 한 줄로 남긴다 — 감추면
      «상반기는 어떻게 됐지»를 다른 화면에서 찾아야 한다.

      팀목표에는 반기 칸이 없다(`usesHalf`). 그 달성률은 딸린 개인목표에서 굴러
      올라오는 값이라, 반기를 가르려면 그 반기의 개인목표만으로 다시 굴린다 —
      그러지 않으면 개인목표 카드는 하반기 0%인데 팀목표 카드는 두 반기를 섞은
      51%가 되어, 나란한 두 장이 서로 다른 이야기를 한다.
    */
    const halfSplit = level === "TEAM" || level === "INDIVIDUAL";

    /**
     * 그 반기의 개인목표만으로 굴린 팀목표 달성률. 그 반기에 딸린 목표가 없으면
     * null이다 — 0%로 세면 «그 반기에 할 일이 없던 팀»이 평균을 끌어내린다.
     */
    const teamRollupIn = (team: GoalNode, half: string) => {
      const kids = team.children.filter((c) => inGoalHalf(c, half));
      return kids.some(countsTowardProgress) ? weightedProgress(kids) : null;
    };
    /*
      팀목표 줄도 반기로 가린다. 딸린 개인목표가 다른 반기 것뿐인 팀목표는 이
      반기의 «전체»에 들 이유가 없다. 하위가 **하나도 없는** 팀목표는 남긴다 —
      아직 개인목표가 안 붙은 것이라 어느 반기에도 속하지 않고, 빼 버리면
      «하위 목표가 없어 0%입니다»라고 알려 줄 자리까지 사라진다.
    */
    const teamInHalf = (team: GoalNode, half: string) =>
      team.children.length === 0 || teamRollupIn(team, half) !== null;

    const rowsIn = (half: string) =>
      !halfSplit
        ? all
        : all.filter((g) =>
            usesHalf(level) ? inGoalHalf(g, half) : teamInHalf(g, half),
          );
    /** 그 반기로 본 달성률 — 팀목표는 그 반기 개인목표만으로 다시 굴린다. */
    const percentIn = (half: string) => {
      if (level === "COMPANY")
        return all.length > 0 ? weightedProgress(all) : 0;
      if (level !== "TEAM") return levelAverage(level, rowsIn(half));
      const per = all
        .map((t) => teamRollupIn(t, half))
        .filter((v): v is number => v !== null);
      if (per.length === 0) return 0;
      return Math.round(per.reduce((a, b) => a + b, 0) / per.length);
    };
    /** 그 반기로 본 «완료» — 팀목표는 그 반기 달성률이 100%를 채웠는지로 본다. */
    const doneIn = (half: string) =>
      level === "TEAM"
        ? all.filter((t) => !t.excluded && (teamRollupIn(t, half) ?? 0) >= 100)
            .length
        : rowsIn(half).filter((g) => g.rollupStatus === "DONE" && !g.excluded)
            .length;

    const nodes = rowsIn(shownHalf);
    const counted = nodes.filter(countsTowardProgress);
    const done = doneIn(shownHalf);
    const overdue = nodes.filter(
      (g) => isOverdue(g, now) && !g.excluded,
    ).length;
    const percent = percentIn(shownHalf);

    /** 다른 반기 한 줄. 그 반기에 목표가 있을 때만 적는다. */
    const otherHalf =
      shownHalf === GOAL_HALVES[0] ? GOAL_HALVES[1] : GOAL_HALVES[0];
    const otherHasGoals = usesHalf(level)
      ? all.some((g) => goalHalf(g) === otherHalf)
      : all.some((t) => t.children.some((c) => goalHalf(c) === otherHalf));
    const otherCount = rowsIn(otherHalf).filter(countsTowardProgress).length;
    const otherPercent = percentIn(otherHalf);

    const href =
      level === "COMPANY"
        ? "/admin/org-goals"
        : buildHref({ tab: level.toLowerCase() });
    const linkable = level !== "COMPANY" || isAdmin;

    /*
      도넛을 왼쪽에, 이름과 숫자를 오른쪽에 나란히 둔다. 세로로 쌓아 두었더니
      카드 두 장이 PC 100% 화면의 절반을 먹어서, 정작 아래의 전사 목표 표가 한
      화면에 같이 들어오지 않았다. 가로로 누이면 카드 높이가 도넛 하나 높이로
      끝난다 — 읽는 순서(무엇의 달성률인가 → 몇 %인가 → 몇 건인가)는 그대로다.
    */
    const body = (
      <div className="flex items-center gap-4">
        {showsProgress && (
          <div className="relative shrink-0">
            <ProgressDonut
              value={percent}
              color={LEVEL_COLOR[level]}
              size={188}
              stroke={18}
              className="h-auto w-20 sm:w-[88px]"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl leading-none font-semibold tabular-nums text-slate-900">
                {percent}
                <span className="ml-0.5 text-sm font-normal text-slate-400">
                  %
                </span>
              </span>
              <span className="mt-0.5 text-[10px] text-slate-500">
                {level === "COMPANY" ? "가중평균" : "평균 달성률"}
              </span>
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <LevelDot level={level} />
            <h2 className="text-base font-semibold text-slate-800">
              {GOAL_LEVEL_LABEL[level]}
            </h2>
            {/* 어느 반기의 숫자인지 이름 옆에 적는다 — 숫자만으로는 알 수 없다. */}
            {halfSplit && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  HALF_TONE[shownHalf]?.badge ?? "bg-slate-500 text-white"
                }`}
              >
                {shownHalf}
              </span>
            )}
          </div>

          <dl className="mt-2 grid grid-cols-3 gap-1 border-t border-slate-100 pt-2 text-center">
            <div>
              <dt className="text-xs text-slate-500">전체</dt>
              <dd className="text-xl font-semibold tabular-nums text-slate-800">
                {counted.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">완료</dt>
              <dd className="text-xl font-semibold tabular-nums text-brand-green-dark">
                {done}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">지연</dt>
              <dd
                className={`text-xl font-semibold tabular-nums ${
                  overdue > 0 ? "text-status-critical" : "text-slate-400"
                }`}
              >
                {overdue}
              </dd>
            </div>
          </dl>

          {/*
            다른 반기는 한 줄로 남긴다. 상반기가 끝난 뒤에도 «상반기는 102%였다»가
            이 카드에서 읽혀야 한다 — 감추면 지난 반기를 찾아 다른 화면을 돌게 된다.
          */}
          {halfSplit && showsProgress && otherHasGoals && (
            <p className="mt-1.5 text-[11px] break-keep text-slate-500">
              {otherHalf}{" "}
              <b className="font-medium text-slate-600">{otherCount}건</b> ·{" "}
              <b className="font-medium text-slate-600">{otherPercent}%</b>
            </p>
          )}
        </div>
      </div>
    );

    const className = `${CARD_CLASS} flex flex-col p-3`;

    return linkable ? (
      <Link
        href={href}
        className={`${className} transition-colors hover:border-brand-green`}
      >
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
    /*
      **개인목표의 피평가자 칸은 팀장에게도 띄운다.**

      예전에는 관리자만 볼 수 있었고, 팀장이 팀원 목표를 적으면 서버가 조용히
      로그인한 사람으로 바꿔 저장했다 — 인사팀 개인목표 서른 건이 팀장 한 사람에게
      몰려 있었고, 팀원들의 결과지는 성과점수가 영영 비었다. 고를 수 있는 사람은
      자기 팀원뿐이다(서버도 같은 규칙으로 막는다).
    */
    const showOwner =
      isAdmin || (level === "INDIVIDUAL" && viewer.ledTeamIds.length > 0);
    const ownerChoices = isAdmin
      ? personOptions
      : personOptions.filter((o) =>
          viewer.ledTeamIds.includes(teamIdOfPerson.get(o.value) ?? "__none__"),
        );
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
      goal?.teamId ??
      (viewer.ledTeamIds.length === 1 ? viewer.ledTeamIds[0] : null);
    const formSubjectId = formTeamId
      ? (teamById.get(formTeamId)?.leaderId ?? null)
      : null;
    const formEval = formSubjectId
      ? (evaluatorByPerson.get(formSubjectId) ?? null)
      : null;
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
                options={ownerChoices}
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
        <input
          name="title"
          defaultValue={goal?.title ?? ""}
          required
          className={INPUT_CLASS}
        />
      </div>
    );

    /*
      상위 목록에서 「기타」 묶음은 뺀다. 자동으로 만들어지는 자리라 "기타(책임
      미지정)" 같은 이름으로 목록에 끼어 있었는데, 바로 아래 「기타」 항목과
      결과가 똑같으면서 이름만 달라 어느 쪽을 고를지 망설이게 했다. 고르는 길은
      하나면 된다. 이미 기타에 매달린 목표를 고칠 때는 그 「기타」 항목이
      골라진 것으로 보여 준다.
    */
    const currentParent = goal?.parentId
      ? (nodeById.get(goal.parentId) ?? null)
      : null;
    const parentIsOther = !!currentParent?.isOther;
    /*
      지금 매달려 있는 상위가 내가 볼 수 있는 범위 밖일 수 있다 — 다른 부문의
      책임목표에 걸린 팀목표가 그렇다. 그때 목록에 그 항목이 없으면 select가
      빈 값이 되고, 필수 칸이라 저장 버튼이 아무 말 없이 안 먹는다. 카드에는
      이미 그 이름이 «상위: …»로 보이고 있으므로 목록에도 넣어 준다.
    */
    const parentChoices = parentOptions.filter((p) => !p.isOther);
    if (
      currentParent &&
      !parentIsOther &&
      !parentChoices.some((p) => p.id === currentParent.id)
    ) {
      parentChoices.push(currentParent);
    }
    const parent = parentLevel && (
      <div className={isTeam ? "md:col-span-2" : undefined}>
        <label className={LABEL_CLASS}>
          상위 {GOAL_LEVEL_LABEL[parentLevel]}
        </label>
        <select
          name="parentId"
          defaultValue={
            parentIsOther ? OTHER_PARENT_VALUE : (goal?.parentId ?? "")
          }
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
          <option value={OTHER_PARENT_VALUE}>
            기타 (딱 맞는 상위 목표가 없을 시)
          </option>
        </select>
      </div>
    );

    const metric = (
      <div>
        <label className={LABEL_CLASS}>
          {isTeam ? "성과지표(KPI)" : "측정지표"}
        </label>
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
        <label className={LABEL_CLASS}>
          {isTeam ? "목표수준 · 현수준" : "현재수준"}
        </label>
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
        <label className={LABEL_CLASS}>
          {isTeam ? "목표수준 · 목표치" : "목표수준"}
        </label>
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
        <label className={LABEL_CLASS}>
          {isTeam || isOkr ? "가중치(비중, %)" : "가중치(%)"}
        </label>
        {usesDerivedWeight(level) ? (
          <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
            담당자 한 사람이 100씩, 그 합으로 자동 계산됩니다 (직접 입력하지
            않습니다)
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
          평가척도{" "}
          <HelpMark text="등급별로 «어디까지 해야 그 등급인지»를 목표 세울 때 적어 둡니다. 연말에 가서 정하면 사람마다 다르게 읽습니다. 예) S: 3천만원 이상 절감 / A: 2천만원 이상 절감" />
        </label>
        <div className="grid gap-2 sm:grid-cols-5">
          {GOAL_SCALES.map((sc) => (
            <div key={sc.field}>
              <div className="mb-1 rounded-t-md bg-slate-100 px-2 py-1 text-center text-xs font-semibold text-slate-700">
                {sc.grade}
                <span className="ml-0.5 font-normal text-slate-500">
                  ({sc.score})
                </span>
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
      (v) => !(isAutoCalculated(level) && v === "DONE"),
    );
    /*
      목표설정 단계의 팀·개인 목표는 상태를 고르지 않는다 — 전부 «진행중»이다.
      목표를 세우는 자리에서 작성중/진행중/중단을 고르게 하면 같은 시점에 세운
      목표가 사람마다 다른 상태로 남아 목록이 들쭉날쭉해진다. 무엇이 끝났고
      무엇이 접혔는지는 중간평가·최종평가에서 갈린다.
    */
    /*
      **팀·개인목표에는 상태 칸을 두지 않는다**(`usesStatusField`). 개인목표의
      달성률은 1차 평가자가 매기는데, 그 옆에 «완료»를 고를 칸이 있으면 평가자가
      70%로 본 목표가 «완료»라는 이유로 100%로 올라간다(`leafProgress`). 완료는
      달성률이 100%를 채우면 저절로 붙고, 중단은 아래 「중단 처리」가 찍는다.
    */
    const status = !usesStatusField(level) ? null : usesFixedActiveStatus(
        level,
        cycle,
      ) ? (
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
        <select
          name="status"
          defaultValue={goal?.status ?? "ACTIVE"}
          className={INPUT_CLASS}
        >
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
            목표설정 단계에서는 적지 않습니다 ({MID_PHASE_LABEL}·
            {FINAL_PHASE_LABEL}에서 입력)
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
            max={PROGRESS_MAX}
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

      팀·개인목표에는 칸을 두지 않는다(`usesDueDateField`) — 어느 화면에도 나오지
      않는 값이라 열에 아홉은 기본값 그대로였다. 서버가 그 해 말일을 넣는다.
    */
    const dueDate = !usesDueDateField(level) ? null : (
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
    /*
      평가완료를 누른 목표는 «여기서 끝»이라고 못을 박은 것이다. 그 뒤에도 점수가
      고쳐지면 완료 표시가 아무것도 뜻하지 않게 된다. 그래서 완료 상태에서는 이
      폼의 모든 칸을 잠그고, 고치려면 먼저 「평가완료 취소」를 누르게 한다.
      서버(updateGoal)도 같은 기준으로 한 번 더 막는다.
    */
    const evalLocked = showEval && !!goal?.evalDoneAt;
    /*
      **반기가 다른 목표는 이 단계에서 매기지 않는다.** 사내 양식이 「개인목표
      평가(상반기)」와 「(하반기)」 두 장이고, 상반기 목표는 중간평가에서 매긴다.
      목표는 한 벌이고 중간·최종평가가 함께 보기 때문에, 막아 두지 않으면 최종평가
      화면에서 상반기 점수까지 고칠 수 있다 — 중간평가에서 확정한 성적이 여기서
      조용히 바뀐다. 값은 그대로 보여 준다(중간평가에서 매긴 그 값이다).
    */
    const halfHere = !goal || evaluatesHalfHere(goal, cycle);
    const otherHalfStage = goal ? evalStageNameForHalf(goalHalf(goal)) : null;
    const canWriteSelf =
      !evalLocked &&
      halfHere &&
      (isAdmin || evalSubjectId === session!.user.id);
    const canWriteFirst =
      !evalLocked &&
      halfHere &&
      (isAdmin || (!!evalFirst && evalFirst.id === session!.user.id));
    // 내용(제목·가중치·상위)을 고칠 수 있는 사람. 평가만 하는 사람은 못 고친다.
    const canEditContent = !evalLocked && (!goal || canManage(goal));
    /*
      최종평가에서는 목표의 **정의**를 잠근다 — 상위 목표 · 목표 구분 · 목표
      유형 · Objective · Key Results · 가중치. 점수를 매기는 자리에서 목표가
      바뀌면 그 점수가 무엇에 대한 점수인지 알 수 없게 된다. 서버도 같은
      기준으로 한 번 더 막는다(`locksGoalDefinition`).

      새로 만드는 자리(`!goal`)는 잠그지 않는다 — 최종평가에서 빠진 목표를
      추가하는 일은 여전히 있다.
    */
    const defLocked = !!goal && locksGoalDefinition(level, cycle);
    /*
      점수 상한은 가중치의 110%다 — 가중치 30짜리 목표는 33점이 최고다. 상한이
      없으면 가중치 10짜리에 100점을 적어 두고 «다 했다»가 되어 비중을 나눠 놓은
      뜻이 사라진다. 가중치를 아직 안 적었으면 막지 않는다.
    */
    const scoreCeiling =
      goal && goal.weight > 0 ? maxScore(goal.weight) : undefined;
    /*
      달성률 상한을 화면에 적어 둔다. 110%는 «넘겨 해냈다»는 뜻이고 그만큼 점수로
      가는 값이라, 숫자만 막아 두면 «왜 100에서 안 올라가지»가 된다.
    */
    const progressHelp =
      `달성률은 ${PROGRESS_MAX}%까지 적을 수 있습니다 — 목표를 넘겨 해낸 만큼은` +
      ` 점수로도 인정합니다(가중치의 110%까지).`;
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
        {/*
          왜 칸이 잠겼는지를 잠긴 칸 바로 위에 적는다. 이 말이 없으면 «왜 안
          고쳐지지»가 화면만 보고는 풀리지 않는다.
        */}
        {evalLocked && (
          <p className="rounded-md border border-status-critical/40 bg-status-critical/5 px-3 py-2 text-xs font-medium text-status-critical">
            평가완료된 목표입니다. 수정하려면 「평가완료 취소」를 눌러 주세요.
          </p>
        )}
        {!halfHere && (
          <p className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs break-keep text-slate-600">
            {goalHalf(goal!)} 목표는{" "}
            {otherHalfStage ? `「${otherHalfStage}」` : "그 반기의 평가"}에서
            매깁니다 — 여기 보이는 점수는 그때 매긴 값이고, 이 화면에서는 고칠
            수 없습니다.
          </p>
        )}

        <div className="rounded-lg border border-brand-green/40 bg-brand-green-light/50 p-3">
          <p className="mb-2 block text-xs font-semibold text-brand-green-dark">
            피평가자(본인)
          </p>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className={LABEL_CLASS}>
                달성률(%)
                <HelpMark text={progressHelp} />
              </label>
              <input
                type="number"
                name="progress"
                min={0}
                max={PROGRESS_MAX}
                step={1}
                defaultValue={goal?.progress ?? 0}
                /*
                  달성률도 그 반기의 평가다 — 한 칸에 담기는 값이라, 최종평가에서
                  상반기 목표의 달성률을 고치면 중간평가에서 확정한 값이 덮인다.
                */
                disabled={!canEditContent || !halfHere}
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
          {/*
            직책을 괄호로 붙이지 않는다. 사슬이 팀장을 건너뛴 경우(그 팀에 팀장이
            지정돼 있지 않을 때)에는 「1차 평가자(운영책임)」처럼 떠서, 실제
            평가자가 누구인지 모른 채 «왜 운영책임이지»만 남는다. 누구인지는
            폼 위쪽 「1차 평가자」 칸이 이름으로 적어 주고, 건너뛴 이유는 바로
            아래 `evalNote`가 적는다.
          */}
          <p className="mb-2 block text-xs font-semibold text-goal-3">
            1차 평가자
          </p>
          {/*
            사슬이 팀장을 건너뛰었으면 왜 건너뛰었는지 적는다 — 대개 그 팀에
            팀장이 지정돼 있지 않아서다. 이 말이 없으면 «왜 우리 팀장이 아니지»가
            화면만 보고는 풀리지 않는다.
          */}
          {evalNote && (
            <p className="mb-2 text-[11px] text-status-critical">{evalNote}</p>
          )}
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className={LABEL_CLASS}>
                달성률(%)
                <HelpMark
                  text={`1차 평가자가 본 달성률입니다. 여기에 적으면 이 값이 그 목표의 달성률이 되어 팀·책임·전사 목표로 굴러 올라갑니다. 비워 두면 본인이 적은 달성률을 그대로 씁니다. ${progressHelp}`}
                />
              </label>
              <input
                type="number"
                name="firstProgress"
                min={0}
                max={PROGRESS_MAX}
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
              <label className={LABEL_CLASS}>
                {period && `${period} `}평가사유
              </label>
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
          {line(
            "what",
            <>
              {title}
              {metric}
            </>,
          )}
          {line(
            "level",
            <>
              {currentValue}
              {targetValue}
            </>,
          )}
          {line("weight", weight)}
          {line(
            "scale",
            <>
              {scales}
              {formula}
            </>,
          )}
          {line(
            "progress",
            <>
              {status}
              {progress}
            </>,
          )}
          {dueDate && line("due", dueDate)}
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
            {/*
              왜 잠겼는지 잠긴 칸 바로 위에 적는다. 이 말이 없으면 «왜 안
              고쳐지지»가 화면만 보고는 풀리지 않는다.
            */}
            {defLocked && (
              <p className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs break-keep text-slate-600 md:col-span-2">
                {FINAL_PHASE_LABEL}에서는 목표 내용({GOAL_DEFINITION_LABEL})을
                고칠 수 없습니다 — 점수를 매기는 단계라 목표는 그대로 둡니다.
                고쳐야 하면 「목표설정」 단계에서 고쳐 주세요. 달성률 · 설명과
                평가 칸은 그대로 적을 수 있습니다.
              </p>
            )}
            {/*
              목표의 «정의»만 따로 잠근다. 달성률 · 설명은 «그 목표가 어떻게
              됐는가»라서 최종평가에서 적는 것이 맞다.
            */}
            <fieldset disabled={defLocked} className="contents">
              {line("parent", parent)}
              {line(
                "kind",
                <>
                  {half}
                  {goalType}
                </>,
              )}
              {line("objective", title)}
              {line("kr", keyResults)}
              {/* 달성률은 평가 칸으로 올라갔다 — 같은 칸을 두 번 두지 않는다. */}
              {line(
                "weight",
                showEval ? (
                  weight
                ) : (
                  <>
                    {weight}
                    {progress}
                  </>
                ),
              )}
            </fieldset>
            {(status || dueDate) &&
              line(
                "state",
                <>
                  {status}
                  {dueDate}
                </>,
              )}
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
          </div>,
        )}
        {line(
          "state",
          <>
            {status}
            {dueDate}
          </>,
        )}
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
    const editable =
      canManage(goal) && lock.canEditGoals && level !== "COMPANY";
    /*
      **성과평가(최종)에서는 지울 수 없다.** 그 단계는 점수를 매기는 자리이고,
      목표는 한 벌이라 세 단계가 같이 본다(`sourceCycleId`) — 거기서 한 줄을
      지우면 성과평가(중간)에서 확정한 상반기 성적까지 함께 사라지고 되돌릴 수도
      없다. 상반기든 하반기든 마찬가지다. 지워야 할 목표는 등록하는 자리에서
      지운다. 서버도 같은 규칙으로 막는다.
    */
    const deletable = editable && (!cycle || cyclePhaseRank(cycle) !== 3);
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
    const shownWeight = Math.round(
      usesDerivedWeight(level) ? goal.rollupWeight : goal.weight,
    );
    /*
      평가를 여는 자리. 목표를 관리하는 사람(본인·팀장·관리자)뿐 아니라 조직도가
      정한 1차 평가자에게도 띄운다 — 팀장의 개인목표를 평가하는 건 책임·운영책임인데,
      그 사람은 그 팀의 팀장이 아니라 「수정」이 뜨지 않는다.
    */
    const evalPeriod = evalPeriodLabel(cycle);
    const subject = goalSubject(goal);
    const subjectEval = subject
      ? (evaluatorByPerson.get(subject.id) ?? null)
      : null;
    const evaluator = subjectEval?.first ?? null;
    const evalDone = !!goal.evalDoneAt;
    // 평가완료는 1차 평가자와 관리자만 누른다 — 피평가자가 스스로 «다 됐다»고
    // 할 수 있으면 그 표시가 아무것도 뜻하지 않는다.
    const canFinishEval =
      (isAdmin || evaluator?.id === session!.user.id) &&
      evaluatesHalfHere(goal, cycle);
    /*
      반기가 다른 목표(최종평가에서 보는 상반기 목표)에는 평가를 여는 단추를
      띄우지 않는다. 열어도 칸이 다 잠겨 있고, 무엇보다 단추 이름이 그 단계의
      반기를 달고 나와(「하반기 평가」) 상반기 목표를 하반기에 매긴 것처럼 읽힌다.
    */
    const showEvalEntry =
      usesEvaluation(level, cycle) &&
      evaluatesHalfHere(goal, cycle) &&
      lock.canEditGoals &&
      !isEditing &&
      (canManage(goal) || evaluator?.id === session!.user.id);
    const isOwner = goal.ownerId === session!.user.id;
    const canApprove =
      isAdmin ||
      teams.some(
        (t) => t.id === goal.teamId && t.leaderId === session!.user.id,
      );
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
                className="rounded-md bg-brand-green px-3 py-1.5 text-xs sm:py-1 font-medium text-white hover:bg-brand-green-dark"
              >
                팀장에게 합의 요청
              </button>
            </ActionForm>
          )}
          {isOwner && agreement === "REQUESTED" && (
            <span className="text-[11px] text-slate-500">
              팀장 승인 대기 중입니다.
            </span>
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
                className="rounded-md bg-brand-green px-3 py-1.5 text-xs sm:py-1 font-medium text-white hover:bg-brand-green-dark"
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
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs sm:py-1 text-status-critical hover:bg-red-50"
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
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs sm:py-1 hover:bg-white"
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
            <span className="select-none text-[10px] text-slate-400 group-open:hidden">
              ▶
            </span>
            <span className="hidden select-none text-[10px] text-slate-400 group-open:inline">
              ▼
            </span>
            <LevelDot level={level} />
            <span className="text-sm font-medium text-slate-800">
              {goalTitle(goal)}
            </span>
            {/*
            책임목표에는 부문 이름을 붙이지 않는다. 책임목표 탭은 그 자체가
            부문별 목록이라 «재무경영관리»가 줄마다 되풀이될 뿐이고, 정작 읽어야
            할 목표 이름 옆자리를 먹는다. 팀목표의 팀 이름과 개인목표의 담당자
            이름은 남긴다 — 여러 팀·여러 사람 것이 한 목록에 섞여 나오므로 그건
            누구 목표인지 가려 주는 유일한 표시다.
          */}
            <StatusBadge status={goal.rollupStatus} />
            {isOverdue(goal, now) && <OverdueBadge />}
            {needsAgreement(goal.level) && (
              <AgreementBadge status={goal.agreementStatus} />
            )}
            {goal.goalType && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  GOAL_TYPE_BADGE_CLASS[goal.goalType] ??
                  "bg-slate-100 text-slate-700"
                }`}
              >
                {goal.goalType}
              </span>
            )}
            {/*
              **집계 제외 표시도 관리자만 본다.** 제외는 인사팀이 내리는 판단이고
              (`canExclude`), 그 판단을 담당자 화면에 배지로 띄우면 «내 목표가
              성적에서 빠졌다»는 말을 설명 없이 읽게 된다 — 물어볼 곳은 화면이
              아니라 사람이다. 단추는 이미 관리자만 볼 수 있었는데 배지만 모두에게
              떠 있었다.
            */}
            {isAdmin && goal.excluded && (
              <ExcludedBadge reason={goal.excludeReason} />
            )}
            {isAdmin && !goal.excluded && goal.targetExcluded && (
              <ExcludedBadge
                reason={goal.targetExcludeReason ?? "평가대상 아님"}
              />
            )}
            {flag && !goal.excluded && !goal.targetExcluded && (
              <OwnerFlagBadge label={flag.label} />
            )}
            {/*
            «상위 · 가중치 · 피평가자»는 제목 옆에 붙인다. 아래 줄로 내려 두면 한
            카드가 두 줄이 되어, 목록을 훑을 때 눈이 줄마다 두 번 꺾인다. 이 줄에
            더 넣지 않는다 — 지표·목표수준·마감일까지 늘어놓으면 정작 목표 이름이
            밀린다. 자세한 값은 카드를 펴서 본다.
          */}
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal text-slate-500">
              {parent && (
                <span>
                  상위: {parent.title} (
                  {GOAL_LEVEL_LABEL[parent.level as GoalLevel]})
                </span>
              )}
              {!parent && parentLevel && (
                <span className="text-status-critical">상위 목표 미연결</span>
              )}
              {/*
                가중치는 **0이어도 적는다**. 숨겨 두었더니 어떤 줄에는 있고 어떤
                줄에는 없어서 «왜 이 목표만 가중치가 없지»가 됐다. 팀목표의
                가중치는 아래 개인목표에서 굴러 올라온 값이라 하위가 없으면
                0이고, 사람이 적는 층(개인목표)에서 0이면 아직 안 적은 것이다 —
                그 둘은 다른 이야기라 다르게 적는다.
              */}
              {/*
                전사목표는 여기서 «안 적었다»고 다그치지 않는다. 이 탭은 굴러
                올라온 달성률을 읽기만 하는 자리라 고칠 칸 자체가 없고(가중치는
                「조직 목표 관리」에서 정한다), 고칠 수 없는 화면에 빨간 경고만
                띄우면 눌러 볼 데 없는 빨간 줄이 목록마다 남는다.
              */}
              {shownWeight > 0 ? (
                <span>가중치 {shownWeight}%</span>
              ) : usesDerivedWeight(level) || level === "COMPANY" ? (
                <span>가중치 0%</span>
              ) : (
                <span className="text-status-critical">가중치 미입력</span>
              )}
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
              {/*
                지우는 자리는 **접힌 줄에서도** 보인다. 카드 안에만 두었더니
                한 건 지우려고 카드를 펴고, 긴 폼을 지나 맨 아래까지 내려가야
                했다. 되돌릴 수 없는 일이라 한 번 되묻는다.
              */}
              {deletable && (
                <ActionForm
                  action={deleteGoal.bind(null, goal.id)}
                  successMessage="삭제되었습니다."
                  confirmMessage={`「${goalTitle(goal)}」 목표를 삭제할까요? 되돌릴 수 없습니다.`}
                  className="flex items-center"
                >
                  <input
                    type="hidden"
                    name="viewCycleId"
                    value={cycle?.id ?? ""}
                  />
                  <button
                    type="submit"
                    aria-label="이 목표 삭제"
                    className="rounded-md border border-red-200 px-2 py-1 text-[11px] leading-none text-status-critical hover:bg-red-50"
                  >
                    삭제
                  </button>
                </ActionForm>
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
          {usesKeyResults(level) &&
            keyResultLines(goal.keyResults).length > 0 && (
              <div className="mt-2">
                {/* ① ② 만 늘어놓으면 이게 무슨 목록인지가 안 읽힌다. */}
                <p className="text-[11px] font-medium text-slate-500">
                  Key Results (핵심결과)
                </p>
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
            <div className="mt-2">
              {/*
              휴대폰에서는 다섯 칸을 한 줄에 늘어놓지 않는다 — 한 칸이 65px이면
              «3천만원 이상 절감»이 글자 하나씩 끊겨 읽힌다. 등급별로 한 줄씩
              쌓아 두면 폭이 좁아도 그대로 읽힌다.
            */}
              <dl className="grid grid-cols-[3.5rem_1fr] overflow-hidden rounded border border-slate-200 text-xs sm:hidden">
                {scaleValues(goal).map((sc) => (
                  <div key={sc.field} className="contents">
                    <dt className="border-b border-slate-200 bg-slate-100 px-2 py-1.5 font-semibold text-slate-700">
                      {sc.grade}
                      <span className="ml-0.5 font-normal text-slate-500">
                        ({sc.score})
                      </span>
                    </dt>
                    <dd className="border-b border-slate-200 px-2 py-1.5 text-slate-600">
                      {sc.value || <span className="text-slate-300">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {usesScales(level) && scaleValues(goal).some((sc) => sc.value) && (
            <div className="mt-2 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[560px] table-fixed border-collapse text-xs">
                <thead>
                  <tr>
                    {GOAL_SCALES.map((sc) => (
                      <th
                        key={sc.field}
                        className="border border-slate-200 bg-slate-100 px-2 py-1 font-semibold text-slate-700"
                      >
                        {sc.grade}
                        <span className="ml-0.5 font-normal text-slate-500">
                          ({sc.score})
                        </span>
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

          {goal.description && (
            <p className="mt-2 text-xs text-slate-600">{goal.description}</p>
          )}

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
          {needsAgreement(goal.level) &&
            agreement === "AGREED" &&
            goal.agreedAt && (
              <p className="mt-1 text-[11px] text-slate-400">
                {goal.agreedBy?.name ?? "팀장"} 합의 ·{" "}
                {formatKSTDate(goal.agreedAt)}
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
                className={`rounded-md border px-3 py-1.5 text-xs sm:py-1 font-medium ${
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
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs sm:py-1 hover:bg-slate-50"
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
                  action={setGoalDropped.bind(
                    null,
                    goal.id,
                    goal.status !== "DROPPED",
                  )}
                  successMessage={
                    goal.status === "DROPPED"
                      ? "중단을 해제했습니다."
                      : "중단 처리했습니다."
                  }
                >
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs sm:py-1 hover:bg-slate-50"
                  >
                    {goal.status === "DROPPED" ? "중단 해제" : "중단 처리"}
                  </button>
                </ActionForm>
              )}
              {canExclude() && lock.canEditProgress && (
                <ActionForm
                  action={setGoalExcluded.bind(null, goal.id, !goal.excluded)}
                  successMessage={
                    goal.excluded
                      ? "집계에 다시 포함했습니다."
                      : "집계에서 제외했습니다."
                  }
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
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs sm:py-1 hover:bg-slate-50"
                  >
                    {goal.excluded ? "집계에 포함" : "집계 제외"}
                  </button>
                </ActionForm>
              )}
              {deletable && (
                <ActionForm
                  action={deleteGoal.bind(null, goal.id)}
                  successMessage="삭제되었습니다."
                  confirmMessage={`「${goalTitle(goal)}」 목표를 삭제할까요? 되돌릴 수 없습니다.`}
                >
                  {/* 어느 단계를 통해 지우는 중인지 — 잠금 판단이 여기서 갈린다. */}
                  <input
                    type="hidden"
                    name="viewCycleId"
                    value={cycle?.id ?? ""}
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-red-200 px-3 py-1.5 text-xs sm:py-1 text-status-critical hover:bg-red-50"
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
              <GoalFormFields
                level={level}
                goal={goal}
                parentOptions={parentOptions}
              />
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                {/*
                  평가완료 상태에서는 저장 단추를 아예 내린다. 눌러도 서버가
                  막을 것이라 «저장했는데 안 됐다»만 남는다 — 눌리지 않는 단추를
                  두는 대신, 무엇을 먼저 해야 하는지를 옆에 적어 준다.
                */}
                {usesEvaluation(level, cycle) && evalDone ? (
                  <span className="text-xs font-medium text-status-critical">
                    평가완료된 목표입니다. 수정하려면 「평가완료 취소」를 눌러
                    주세요.
                  </span>
                ) : (
                  <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                    저장
                  </button>
                )}
                {/* 저장과 나란히, 같은 모양으로 — 고친 손이 그 자리에 있다. */}
                <Link
                  href={buildHref({ edit: null })}
                  className={PRIMARY_BUTTON_CLASS}
                >
                  닫기
                </Link>
                {/*
                평가완료는 저장과 다른 일이라 색을 달리한다 — 저장은 적은 것을
                남기는 일이고, 이건 «이 평가는 여기서 끝»이라고 못을 박는 일이다.

                그래도 **같은 폼**으로 보낸다. 예전에는 폼 안에 폼을 넣을 수 없어
                밖에 숨겨 둔 폼을 `form` 속성으로 이었는데, 그 폼에는 평가 칸이
                없어서 달성률 110%와 점수 22점을 적고 이 단추를 누르면 적은 값이
                한 줄도 저장되지 않고 완료 표시만 찍혔다 — «저장했는데 반영이 안
                된다»가 그것이었다. 이제 이 단추는 폼의 제출 단추이고, 서버가
                적은 값을 저장한 뒤에 완료로 찍는다(`finishEval`).
              */}
                {usesEvaluation(level, cycle) && canFinishEval && !evalDone && (
                  <button
                    type="submit"
                    name="finishEval"
                    value="1"
                    className="rounded-md bg-goal-3 px-4 py-2 text-sm font-medium text-white hover:brightness-95"
                  >
                    평가완료
                  </button>
                )}
                {/*
                  되돌리기는 저장할 것이 없다 — 완료 상태에서는 모든 칸이 잠겨
                  있어서 폼에 실려 올 값도 없다. 그래서 이것만 따로 둔 폼으로
                  보낸다.
                */}
                {usesEvaluation(level, cycle) && canFinishEval && evalDone && (
                  <button
                    type="submit"
                    form={`evaldone-${goal.id}`}
                    className="rounded-md border border-status-critical px-4 py-2 text-sm font-medium text-status-critical hover:bg-red-50"
                  >
                    평가완료 취소
                  </button>
                )}
              </div>
            </ActionForm>
          )}
          {/*
          위 폼의 «평가완료 취소» 단추가 눌러 보내는 폼. 폼끼리 겹칠 수 없어 밖에
          둔다. 누르고 나면 폼은 닫는다.
        */}
          {isEditing &&
            usesEvaluation(level, cycle) &&
            canFinishEval &&
            evalDone && (
              <ActionForm
                id={`evaldone-${goal.id}`}
                action={setGoalEvalDone.bind(null, goal.id, false)}
                successMessage="평가완료를 취소했습니다."
                successHref={buildHref({ edit: null })}
                className="hidden"
              >
                <input
                  type="hidden"
                  name="viewCycleId"
                  value={cycle?.id ?? ""}
                />
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
    const buckets = new Map<
      string,
      { ownerKey: string; half: string; sum: number }
    >();
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
    const subtotals = [...buckets.values()].sort(
      (a, b) => halfRank(a.half) - halfRank(b.half),
    );
    const ownerCount = new Set(subtotals.map((b) => b.ownerKey)).size;
    const ownersOffTarget = new Set(
      subtotals.filter((b) => Math.round(b.sum) !== 100).map((b) => b.ownerKey),
    ).size;

    /*
      전사목표는 이 탭에서 만들지 않는다. 한 벌뿐인 회사 목표를 세 군데(조직 목표
      관리·상단 표·이 탭)에서 고칠 수 있게 두면 어디서 고친 것이 진짜인지가
      흐려진다. 여기서는 굴러 올라온 달성률을 읽기만 한다.
    */
    /*
      목표를 **새로 만드는 자리는 중간평가 하나**로 모았다.

      네 단계에 같은 등록 폼을 띄워 두면 같은 목표를 어디서 만든 것이 진짜인지
      흐려진다 — 목표는 한 벌이고 단계들이 그것을 빌려 보기 때문에(`sourceCycleId`)
      어디서 만들어도 같은 줄이 생기는데, 화면이 네 군데면 «저기서 만든 게 여기
      안 보인다»는 말이 나온다. 인사팀이 실제로 목표를 손보는 자리가 중간평가라
      거기만 남긴다. 이미 있는 목표를 고치는 「수정」은 그대로다.
    */
    const canCreate =
      lock.canEditGoals &&
      !!cycle &&
      cyclePhaseRank(cycle) === 2 &&
      level !== "COMPANY" &&
      (isAdmin ||
        level === "INDIVIDUAL" ||
        (level === "TEAM" &&
          teams.some((t) => t.leaderId === session!.user.id)));

    return (
      <div data-goal-list className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <LevelDot level={level} />
          <h2 className="text-lg font-semibold">{GOAL_LEVEL_LABEL[level]}</h2>
          <span className="text-sm text-slate-500">{rows.length}건</span>
          {showsProgress && (
            <span className="text-sm text-slate-500">
              평균 달성률 {levelAverage(level, rows)}%
            </span>
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
                    sum === 100
                      ? "text-slate-500"
                      : "font-medium text-status-critical"
                  }`}
                >
                  {bucket.half ? `${bucket.half} ` : ""}가중치 소계 {sum}%
                  {sum !== 100 && " — 100%로 맞춰 주세요"}
                </span>
              );
            })}
          {usesWeightSubtotal(level) &&
            ownerCount > 1 &&
            ownersOffTarget > 0 && (
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
          전사목표를 고치는 자리는 「조직 목표 관리」 한 곳이다. 여기서는 아래
          층에서 굴러 올라온 달성률을 읽는다 — 어디서 고쳐야 하는지는 적어 준다.
        */}
        {level === "COMPANY" && isAdmin && (
          <p className="text-xs text-slate-500">
            전사목표를 세우고 고치는 자리는{" "}
            <Link
              href="/admin/org-goals"
              className="text-brand-green-dark underline"
            >
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
              <input
                type="hidden"
                name="cycleId"
                value={goalCycleId ?? cycle.id}
              />
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
          <p className="text-xs text-slate-500">
            * 점수 = 가중치(비중) × 평가자 점수
          </p>
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
              /*
                이 단계에서 매기는 반기만 펼쳐 둔다.

                최종평가는 하반기를 매기는 자리다. 상반기 묶음이 펼쳐진 채 위에
                쌓여 있으면 정작 매겨야 하는 하반기 목표가 화면 밖으로 밀려나서,
                한 건 매길 때마다 스크롤을 한참 내려야 한다. 상반기 값은 중간평가
                에서 확정된 것이라 여기서는 «확인하려면 펼쳐 보는» 자리다.

                반기를 매기지 않는 단계(목표설정·목표진행현황)에서는 둘 다
                펼친다 — 그때는 어느 쪽이 주인공이라고 할 것이 없다.
              */
              const openByDefault = evaluatesHalfHere(
                { half: group.half === HALF_UNSET ? null : group.half },
                cycle,
              );
              /*
                접힌 묶음 안의 목표를 고치는 중이면 그 묶음은 열어 둔다. 접어 둔
                채로 폼을 열면 화면에 아무 일도 안 일어난 것처럼 보인다.
              */
              const editingHere = group.items.some(
                (g) => g.id === editingGoal?.id,
              );
              return (
                <details
                  key={group.half}
                  open={openByDefault || editingHere}
                  className={`overflow-hidden rounded-xl border ${tone.border} ${tone.panel}`}
                >
                  <summary
                    className={`flex cursor-pointer flex-wrap items-center gap-2 border-b ${tone.border} ${tone.head} px-4 py-2.5`}
                  >
                    <h3 className={`text-sm font-semibold ${tone.text}`}>
                      {group.half === HALF_UNSET
                        ? "구분 미지정"
                        : `${group.half} 목표`}
                    </h3>
                    <span
                      className={`rounded-full ${tone.badge} px-2 py-0.5 text-[11px] font-medium tabular-nums`}
                    >
                      {group.items.length}건
                    </span>
                    {showsProgress && (
                      <span className="text-xs text-slate-600">
                        평균 달성률 {levelAverage(level, group.items)}%
                      </span>
                    )}
                    {/* 접힌 줄에서도 무엇을 누르면 되는지 적어 둔다. */}
                    <span className="text-[11px] text-slate-500">
                      · 눌러서 접기 / 펼치기
                    </span>
                    {!openByDefault && (
                      <span className="text-[11px] break-keep text-slate-500">
                        {evalStageNameForHalf(group.half)
                          ? `「${evalStageNameForHalf(group.half)}」에서 매긴 값입니다`
                          : ""}
                      </span>
                    )}
                  </summary>
                  <div className="flex flex-col gap-3 p-3">
                    {group.items.map((g) => (
                      <GoalRowCard key={g.id} goal={g} />
                    ))}
                  </div>
                </details>
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
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
    }).format(now),
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
              ? `연도를 넣으면 목표설정 · ${MID_PHASE_LABEL} · ${FINAL_PHASE_LABEL} · 역량평가가 한 번에 만들어집니다. 그 안에 전사 · 책임 · 팀 · 개인목표를 등록합니다.`
              : "관리자가 사이클을 열면 목표를 등록할 수 있습니다."}
          </p>
          {isAdmin && (
            <ActionForm
              action={createGoalYear}
              successMessage="그 해의 빠진 단계를 만들었습니다."
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
                목표설정 · {MID_PHASE_LABEL} · {FINAL_PHASE_LABEL} · 역량평가
                만들기
              </button>
            </ActionForm>
          )}
        </div>
      </div>
    );
  }

  const isDashboard = tab === "dashboard";

  /**
   * 아직 만들지 않은 자리. 그냥 «준비 중»만 적어 두면 눌러 본 사람이 무엇을
   * 기다리는지 모른 채 돌아간다 — 여기에 무엇이 들어올지까지 적는다.
   */
  function comingUp(title: string, badge: string | null, lines: string[]) {
    return (
      <section className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-700">{title}</h2>
          {badge && (
            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-white">
              {badge}
            </span>
          )}
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600">
          준비 중
        </span>
        <div className="mt-2 max-w-lg text-sm leading-relaxed break-keep text-slate-500">
          {lines.map((line) => (
            <p key={line} className="mt-1">
              {line}
            </p>
          ))}
        </div>
      </section>
    );
  }

  return (
    // 배너 · 전사 목표 표 · 목록이 한 덩어리로 함께 스크롤된다.
    //
    // 한때는 위를 고정하고 목록만 안에서 굴렸는데, 그러면 "책임목표 0건" 같은
    // 목록 머리글이 고정된 표 밑으로 들어가 사라진다. 위를 얼려 둘수록 아래에서
    // 볼 수 있는 자리가 줄고, 그 자리를 벗어난 것은 어디로 갔는지 알 수 없게
    // 된다. 지금은 평범한 스크롤 한 벌만 있고, 화면 밖으로 나간 것은 위로
    // 올리면 그대로 돌아온다.
    <div className="flex flex-col gap-1.5">
      {/* 다른 사람이 목표를 고쳐도 이 화면이 알아서 최신 값을 받아온다. */}
      <AutoRefresh />

      {/*
        인사평가 선택이 먼저, 층 선택 탭이 그 아래.

        본문 위에 붙여 두었더니(sticky) 밑을 지나가는 도넛과 표가 이 두 줄에
        가려 반쯤 잘려 보였다. 늘 보이는 것은 위쪽 띠 하나로 충분하고, 나머지는
        평범하게 함께 굴러야 «가려진 것이 있나» 의심할 일이 없다.
      */}
      {cycleBar()}

      {/*
        역량평가 · 평가결과 · HR REPORT는 목표 층(전사·팀·개인)으로 갈리지 않아
        탭 줄을 띄우지 않는다 — 단계 자체가 그 화면이다.
      */}
      {!offCycleView && tabBar()}

      {/*
        마감 안내 — 왜 수정 버튼이 사라졌는지 화면에서 바로 읽히게 한다. 결과 쪽
        탭에는 고칠 것이 없으니 띄우지 않는다.

        아래 마감 카드가 뜨는 화면(관리자)에는 띄우지 않는다. 같은 말을 두 줄로
        적는 셈인데, 마감을 누르는 순간 이 줄이 새로 생겨서 카드가 한 칸 아래로
        밀려 내려간다 — 누른 단추가 눈앞에서 움직인다.
      */}
      {lock.message && !offCycleView && !lockCardShown && (
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
            여기에는 «왜 못 고치는지»만 적는다. 마감을 풀는 단추는 아래 마감
            카드에 있다 — 예전에는 이 줄에도 하나 있어서, 마감을 누른 뒤 단추가
            카드에서 사라지고 이 줄의 글 옆에 다시 나타났다. 누른 자리에 그대로
            있지 않으면 «내가 뭘 눌렀지»가 된다.
          */}
        </div>
      )}

      {/*
        마감 카드. 목표를 다 세우고 나면 «이 목표로 평가한다»고 못을 박는 자리가
        있어야 한다. 마감 전에는 누구든 목표를 고칠 수 있어서, 평가하는 도중에
        목표가 바뀌면 그 점수가 무엇을 기준으로 매겨진 것인지 남지 않는다.

        **마감한 뒤에도 이 카드는 그 자리에 남는다.** 예전에는 마감을 누르면 카드가
        사라지고 위쪽 안내 줄에 「마감 해제」가 나타났다 — 누른 자리에 아무것도
        없고 단추가 왼쪽 위로 옮겨 가 있으니, 무엇이 눌렸는지 화면으로는 알 수
        없었다. 이제 안쪽 글과 단추만 바뀌고 자리는 그대로다.
      */}
      {lockCardShown && cycle && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="shrink-0 text-sm font-medium text-slate-800">
            마감
          </span>
          <span className="min-w-0 flex-1 text-xs break-keep text-slate-500">
            {cycle.status === "CLOSED"
              ? "완료로 닫힌 인사평가입니다 — 목표와 점수 모두 읽기 전용입니다. 마감을 풀면 다시 적을 수 있습니다."
              : cycle.goalsLockedAt
                ? `${formatKSTDate(cycle.goalsLockedAt)} 마감 — 이 단계에서는 목표를 고칠 수 없습니다. 달성률과 점수는 그대로 적을 수 있습니다.`
                : `마감하면 이 단계에서는 관리자를 포함해 아무도 목표를 고칠 수 없습니다${
                    !sharedFrom && followUps.length > 0
                      ? ` — 「${followUps
                          .map((c) => cyclePhaseLabel(c))
                          .join("」 · 「")}」가 이 목표를 그대로 이어받습니다`
                      : ""
                  }. 달성률과 점수는 그대로 적을 수 있고, 마감을 풀면 목표도 다시 고칠 수 있습니다.`}
          </span>
          {/*
              단추는 늘 오른쪽 끝 같은 칸에 있다. 글의 길이가 바뀌어도 자리가
              밀리지 않게 설명 칸이 남는 폭을 다 먹고(`flex-1`), 단추는 줄어들지
              않는다(`shrink-0`).
            */}
          <div className="ml-auto shrink-0">
            {cycle.goalsLockedAt || cycle.status === "CLOSED" ? (
              <ActionForm
                action={unlockGoalSetting.bind(null, cycle.id)}
                successMessage="마감을 풀었습니다. 다시 목표를 고칠 수 있습니다."
                confirmMessage="마감을 풀면 이 평가의 목표를 다시 고칠 수 있게 됩니다. 진행할까요?"
              >
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  마감 해제
                </button>
              </ActionForm>
            ) : (
              <ActionForm
                action={lockGoalSetting.bind(null, cycle.id)}
                successMessage="마감했습니다."
                confirmMessage="이 평가를 전체 마감할까요? 마감하면 아무도 목표를 고칠 수 없습니다."
              >
                <button
                  type="submit"
                  className="rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
                >
                  전체 마감
                </button>
              </ActionForm>
            )}
          </div>
        </div>
      )}

      {/*
        역량평가의 「전체 마감」. 목표 쪽과 같은 자리에 같은 모양으로 둔다 —
        고르개에는 「목표설정 (마감)」과 「역량평가 (진행중)」이 나란히 뜨는데
        한쪽만 마감할 길이 있으면 나머지는 관리 화면을 찾아다녀야 한다.

        마감은 «제출 기한이 끝났다»라서 되돌리는 것이 보통이고, 「완료」는 그
        해 평가를 닫는 별개 동작이다(관리 화면의 「평가 완료」).
      */}
      {competencyView && isAdmin && competencyFormState && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="shrink-0 text-sm font-medium text-slate-800">
            역량평가 마감
          </span>
          {competencyFormState.status === "CLOSED" ? (
            <>
              <span className="min-w-0 flex-1 text-xs break-keep text-slate-500">
                이 해의 역량평가는 완료되었습니다 — 점수는 읽기 전용입니다.
              </span>
              <Link
                href="/admin/competency"
                className="ml-auto text-xs text-brand-green-dark underline"
              >
                관리 화면에서 되돌리기
              </Link>
            </>
          ) : competencyFormState.lockedAt ? (
            <>
              <span className="min-w-0 flex-1 text-xs break-keep text-slate-500">
                {formatKSTDate(competencyFormState.lockedAt)} 마감 — 자기평가 ·
                팀장평가를 더 적을 수 없습니다. 마감을 풀면 다시 적을 수
                있습니다.
              </span>
              <ActionForm
                action={unlockCompetencyForm.bind(null, selectedYear)}
                successMessage="마감을 풀었습니다. 다시 점수를 적을 수 있습니다."
                confirmMessage="마감을 풀면 자기평가·팀장평가를 다시 적을 수 있게 됩니다. 진행할까요?"
                className="ml-auto shrink-0"
              >
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  마감 해제
                </button>
              </ActionForm>
            </>
          ) : competencyFormState.status === "OPEN" ? (
            <>
              <span className="min-w-0 flex-1 text-xs break-keep text-slate-500">
                마감하면 관리자를 포함해 아무도 자기평가 · 팀장평가를 고칠 수
                없습니다. 마감을 풀면 다시 적을 수 있습니다.
              </span>
              <ActionForm
                action={lockCompetencyForm.bind(null, selectedYear)}
                successMessage="역량평가를 마감했습니다."
                confirmMessage="이 해의 역량평가를 전체 마감할까요? 마감하면 아무도 점수를 고칠 수 없습니다."
                className="ml-auto shrink-0"
              >
                <button
                  type="submit"
                  className="rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
                >
                  전체 마감
                </button>
              </ActionForm>
            </>
          ) : (
            <span className="text-xs text-slate-500">
              아직 준비중입니다 — 관리 화면에서 「평가 시작」을 누르면 점수를
              받습니다.
            </span>
          )}
        </div>
      )}

      {competencyView ? (
        competencyBoard()
      ) : resultView ? (
        resultBoard()
      ) : reportView ? (
        reportBoard()
      ) : !cycle ? (
        // 인사평가를 고르기 전에는 어느 탭이든 비워 둔다. 어느 해 숫자인지
        // 모르는 채로 목표를 읽게 두지 않는다.
        <section className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-24">
          <p className="text-base font-semibold text-slate-700">
            {selectedYear}년에 만들어진 인사평가가 없습니다
          </p>
          <p className="mt-1 text-sm text-slate-500">
            왼쪽 위에서 다른 연도를 고르면 그 해의 전사 · 책임 · 팀 · 개인
            목표가 보입니다.
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

          「평가결과」·「HR REPORT」는 이 기다림에서 뺀다. 결과지는 목표 목록이
          아니라 **한 해의 결과** 한 장이라, 앞 단계의 마감 여부와 상관이 없다.
          같이 막아 두면 역량평가 점수가 다 들어와 있는데도 결과지 대신 「목표를
          마감해 주세요」가 떠서, 단계를 고르는 것만으로 결과지가 사라진다.
        */
        <section className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center">
          <p className="text-base font-semibold text-slate-700">
            「{sharedFrom!.name}」이 아직 마감되지 않았습니다
          </p>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            이 평가는 「{sharedFrom!.name}」에서 확정된 목표를 그대로
            이어받습니다. 목표를 마감하면 그 내용이 여기에 그대로 뜹니다.
          </p>
          {isAdmin ? (
            <Link
              href="/admin/org-goals"
              className="mt-5 rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
            >
              조직 목표 관리에서 마감하기
            </Link>
          ) : (
            <p className="mt-4 text-xs text-slate-400">
              마감은 관리자가 합니다. 인사팀에 문의해 주세요.
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
              {/* 층별 카드보다 먼저 «지금 어느 단계인가»를 읽는다. */}
              {stageTimeline()}
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
