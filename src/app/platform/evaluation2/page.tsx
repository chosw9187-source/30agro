import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { SearchableSelect } from "@/components/searchable-select";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { formatKSTDate } from "@/lib/format-kst";
import {
  GOAL_AGREEMENT_BADGE_CLASS,
  GOAL_AGREEMENT_LABEL,
  GOAL_CYCLE_STATUS_LABEL,
  GOAL_LEVEL_LABEL,
  GOAL_LEVEL_RAMP,
  GOAL_LEVEL_RAMP_BORDER,
  GOAL_PARENT_LEVEL,
  GOAL_STATUSES,
  GOAL_STATUS_LABEL,
  averageProgress,
  buildGoalTree,
  countsTowardProgress,
  flattenGoalTree,
  asAgreementStatus,
  canViewGoalRow,
  cycleLock,
  evalTargetState,
  isAutoCalculated,
  isOverdue,
  needsAgreement,
  ownerFlag,
  toDateInputValue,
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

/** 층 식별색. globals.css의 --color-goal-* 와 같은 값을 가리킨다. */
const LEVEL_COLOR: Record<GoalLevel, string> = {
  COMPANY: "var(--color-goal-1)",
  DIVISION: "var(--color-goal-2)",
  TEAM: "var(--color-goal-3)",
  INDIVIDUAL: "var(--color-goal-4)",
};

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

function scopeText(goal: GoalNode): string {
  if (goal.level === "COMPANY") return "전사";
  if (goal.level === "DIVISION") return goal.division ?? "책임 미지정";
  if (goal.level === "TEAM") return goal.team?.name ?? "팀 미지정";
  return goal.owner?.name ?? "담당자 미지정";
}

export default async function Evaluation2Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cycleId?: string; edit?: string; focus?: string }>;
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
    orderBy: [{ year: "desc" }, { startDate: "desc" }],
  });
  /**
   * 상단 배너의 인사평가 선택. 아무것도 안 고른 상태("선택")가 기본이고, 그때는
   * 오늘이 속한 사이클을 기준으로 보여준다. 특정 인사평가를 고르면 화면 구성은
   * 그대로 두고 그 사이클의 목표로만 갈아 끼운다 — 고르는 순간 대시보드가
   * 사라지면 연도만 바꿔 보려던 사람이 갈 곳이 없어진다.
   */
  const pickedCycle = params.cycleId
    ? (cycles.find((c) => c.id === params.cycleId) ?? null)
    : null;
  const selectedCycleId = pickedCycle?.id ?? "";
  // 안 골랐을 때 기준이 되는 사이클: 오늘이 기간 안에 든 것 → 없으면 이미
  // 시작한 것 중 가장 최근 → 그것도 없으면 목록의 첫 번째(가장 최신).
  // 그냥 최신을 잡으면 내년치를 미리 만들어 둔 순간 화면이 빈 채로 뜬다.
  const today = new Date();
  const defaultCycleForGoals =
    cycles.find((c) => c.startDate <= today && today <= c.endDate) ??
    cycles.find((c) => c.startDate <= today) ??
    cycles[0] ??
    null;
  const cycle = pickedCycle ?? defaultCycleForGoals;

  const [teams, people] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, division: true, businessUnit: true, leaderId: true },
    }),
    prisma.user.findMany({
      where: activePrismaWhere(),
      orderBy: { name: "asc" },
      select: { id: true, name: true, division: true, team: { select: { name: true } } },
    }),
  ]);

  const goals = cycle
    ? await prisma.goal.findMany({
        where: { cycleId: cycle.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          level: true,
          parentId: true,
          category: true,
          title: true,
          description: true,
          division: true,
          teamId: true,
          ownerId: true,
          weight: true,
          metric: true,
          targetValue: true,
          currentValue: true,
          unit: true,
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
  const manualTargets = cycle
    ? await prisma.goalCycleTarget.findMany({
        where: { cycleId: cycle.id },
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

  const lock = cycleLock(cycle);
  const tree = buildGoalTree(goalsWithTarget);
  const allNodes = flattenGoalTree(tree);
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const byLevel = (level: GoalLevel) => allNodes.filter((n) => n.level === level);
  const companyGoals = byLevel("COMPANY");

  const divisions = Array.from(
    new Set([
      ...teams.map((t) => t.division).filter((d): d is string => !!d),
      ...goals.map((g) => g.division).filter((d): d is string => !!d),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const teamOptions = teams.map((t) => ({
    value: t.id,
    label: t.name,
    sublabel: t.division ?? undefined,
  }));
  const personOptions = people.map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: p.team?.name ?? p.division ?? undefined,
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

  // 전사목표 한 건을 고르면 아래 세 칸이 그 목표의 갈래만 보여준다 — 한 화면
  // 안에서 "이 전사목표가 어디까지 내려가 있나"를 훑을 수 있게.
  const focusGoal = params.focus ? nodeById.get(params.focus) ?? null : null;
  const focusedIds = focusGoal
    ? new Set(flattenGoalTree([focusGoal]).map((n) => n.id))
    : null;

  function buildHref(next: { tab?: string; focus?: string | null; edit?: string | null }) {
    const qs = new URLSearchParams();
    qs.set("tab", next.tab ?? tab);
    // 사용자가 실제로 고른 인사평가만 URL에 남긴다. 기본값으로 잡아둔 사이클을
    // 여기서 붙이면, 탭을 누르는 순간 "인사평가 선택" 상태가 돼 목표관리 화면이
    // 빈 평가 화면으로 바뀌어 버린다.
    if (selectedCycleId) qs.set("cycleId", selectedCycleId);
    const focus = next.focus === undefined ? params.focus : next.focus;
    if (focus) qs.set("focus", focus);
    const edit = next.edit === undefined ? undefined : next.edit;
    if (edit) qs.set("edit", edit);
    return `/platform/evaluation2?${qs.toString()}`;
  }

  const now = new Date();
  const counted = allNodes.filter(countsTowardProgress);
  const overallProgress =
    companyGoals.length > 0 ? weightedProgress(companyGoals) : averageProgress(counted);
  const doneCount = allNodes.filter((g) => g.status === "DONE" && !g.excluded).length;
  const excludedCount = allNodes.filter((g) => g.excluded || g.targetExcluded).length;
  // 상위에 안 매달린 목표는 아무리 달성해도 전사 달성률을 못 움직인다.
  // 숫자가 안 오르는 가장 흔한 이유라 화면에 대놓고 알려준다.
  const unlinked = allNodes.filter(
    (g) =>
      GOAL_PARENT_LEVEL[g.level as GoalLevel] !== null && !g.parentId && canViewGoalRow(g, viewer, org)
  );
  const overdueCount = allNodes.filter((g) => isOverdue(g, now) && !g.excluded).length;

  /**
   * 아래 안내문들은 **읽는 사람이 손댈 수 있는 것만** 센다.
   *
   * 전사 숫자를 그대로 띄우면 팀원 화면에 "합의 안 된 개인목표 12건" 같은 줄이
   * 뜨는데, 남의 목표라 할 수 있는 게 없다. 읽고 넘길 수밖에 없는 문장은
   * 안내가 아니라 화면을 먹는 글자다. 그래서 자기 범위(canViewGoalRow)로
   * 줄이고, 셀 게 없으면 줄 자체를 띄우지 않는다.
   */
  const myNodes = visibleRows(allNodes);

  // 담당자가 퇴사·부서이동했는데 아직 집계에 들어 있는 목표 — 빼는 건 관리자·팀장
  // 몫이라 그 사람들에게만 알린다.
  const needsReviewCount = myNodes.filter(
    (g) => !g.excluded && !g.targetExcluded && ownerFlag(g, now) && canExclude(g)
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
   * 집계 제외는 관리자와 팀장만 — 본인은 못 건다. 진척이 안 나오는 자기
   * 목표를 스스로 빼면 팀·책임·전사 달성률이 조용히 올라간다.
   * 서버 액션(setGoalExcluded)도 같은 규칙으로 한 번 더 막는다.
   */
  function canExclude(goal: GoalNode): boolean {
    if (isAdmin) return true;
    const team = teams.find((t) => t.id === goal.teamId);
    return !!team && team.leaderId === session!.user.id;
  }

  // ---- 상단 고정 전사목표 표 ---------------------------------------------

  /**
   * 화면 맨 위에 늘 붙어 있는 얇은 바. 탭·평가 연도(사이클)·종합 달성률만
   * 담아 높이를 최소로 줄인다 — 여기에 전사목표 표까지 붙여 두면 고정 영역이
   * 화면의 절반을 먹어서 아래 내용이 가려진다.
   */
  function topBar() {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
        <nav className="flex flex-wrap gap-1.5 text-xs">
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

        <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
          {isAdmin && (
            <>
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
            </>
          )}
          {cycles.length > 0 && (
            <CycleSelect
              value={selectedCycleId}
              options={[
                { value: "", label: "선택" },
                ...cycles.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${GOAL_CYCLE_STATUS_LABEL[c.status as GoalCycleStatus]})`,
                })),
              ]}
            />
          )}
        </div>
      </div>
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
                <dd className="font-semibold text-slate-800">{allNodes.length}</dd>
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

        {/* 표와 안내문을 통째로 접을 수 있게 한다. 층별 목록 탭에서는 기본으로
            접어 둔다 — 펼친 채로 두면 고정 영역이 400px를 넘어, 화면이 낮은
            노트북에서는 정작 봐야 할 목록이 200~300px밖에 안 남는다. */}
        <details open={tab === "dashboard"}>
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
                  action={seedCompanyGoalTemplate.bind(null, cycle.id)}
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
                  제품기획마케팅 · 영업고객관리 · 기술연구 · 생산 · 재무경영관리 5개 구분과 표
                  하단 안내문이 한 번에 들어갑니다. 문구는 등록 후 수정하세요.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="max-h-[26vh] overflow-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
                <tr>
                  <th className="w-44 px-4 py-1.5 text-left text-xs font-semibold">구분</th>
                  <th className="px-4 py-1.5 text-left text-xs font-semibold">목표</th>
                  <th className="w-56 px-4 py-1.5 text-left text-xs font-semibold">달성률</th>
                </tr>
              </thead>
              <tbody>
                {companyGoals.map((g, i) => {
                  const focused = focusGoal?.id === g.id;
                  return (
                    <tr
                      key={g.id}
                      className={`border-t border-slate-100 align-top ${
                        focused ? "bg-brand-green-light" : i % 2 === 1 ? "bg-slate-50/70" : ""
                      }`}
                    >
                      <td className="px-4 py-2">
                        <span className="text-xs text-slate-400">{i + 1}.</span>{" "}
                        <span className="font-medium text-slate-700">{g.category ?? "전사"}</span>
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={
                            focused
                              ? buildHref({ focus: null })
                              : buildHref({ tab: "division", focus: g.id })
                          }
                          className="group flex items-start gap-1.5"
                          title={focused ? "전체 보기" : "이 목표에 달린 책임목표만 보기"}
                        >
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                          <span className="font-medium text-slate-800 group-hover:text-brand-green-dark group-hover:underline">
                            {g.title}
                          </span>
                        </Link>
                        {(g.metric || g.targetValue || g.description) && (
                          <p className="mt-0.5 pl-3 text-xs text-slate-500">
                            {[
                              g.metric,
                              g.targetValue ? `목표 ${g.targetValue}${g.unit ?? ""}` : null,
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
                        <div className="mt-1 flex items-center gap-1">
                          <StatusBadge status={g.status} />
                          {isOverdue(g, now) && <OverdueBadge />}
                          {g.children.length > 0 && (
                            <span className="text-[10px] text-slate-400">
                              하위 {g.children.length}건 가중평균
                            </span>
                          )}
                        </div>
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
        {(focusGoal || unlinked.length > 0 || needsReviewCount > 0 || awaitingMyApproval > 0) && (
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
            {focusGoal && (
              <Link
                href={buildHref({ focus: null })}
                className="shrink-0 rounded-full border border-brand-green px-3 py-1 text-xs font-medium text-brand-green-dark hover:bg-brand-green-light"
              >
                「{focusGoal.title}」 갈래만 보는 중 · 전체 보기 ✕
              </Link>
            )}
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
      level === "COMPANY" ? "/admin/org-goals" : buildHref({ tab: level.toLowerCase(), focus: null });
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
    return (
      <>
        <div className="md:col-span-2">
          <label className={LABEL_CLASS}>목표명</label>
          <input name="title" defaultValue={goal?.title ?? ""} required className={INPUT_CLASS} />
        </div>

        <div>
          <label className={LABEL_CLASS}>
            구분 <span className="text-slate-400">(표의 왼쪽 칸)</span>
          </label>
          <input
            name="category"
            defaultValue={goal?.category ?? ""}
            placeholder="예: 영업고객관리"
            className={INPUT_CLASS}
          />
        </div>

        {parentLevel && (
          <div>
            <label className={LABEL_CLASS}>상위 {GOAL_LEVEL_LABEL[parentLevel]}</label>
            <select name="parentId" defaultValue={goal?.parentId ?? ""} className={INPUT_CLASS}>
              <option value="">연결 안 함</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({scopeText(p)})
                </option>
              ))}
            </select>
          </div>
        )}

        {level === "DIVISION" && (
          <div>
            <label className={LABEL_CLASS}>책임(부문)</label>
            <select name="division" defaultValue={goal?.division ?? ""} className={INPUT_CLASS}>
              <option value="">선택</option>
              {divisions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {(level === "TEAM" || level === "INDIVIDUAL") && (
          <div>
            <label className={LABEL_CLASS}>팀</label>
            <SearchableSelect
              name="teamId"
              options={teamOptions}
              defaultValue={goal?.teamId ?? ""}
              placeholder="팀 검색"
            />
          </div>
        )}

        <div>
          <label className={LABEL_CLASS}>
            {level === "INDIVIDUAL" ? "담당자" : "책임자"}
            {level !== "INDIVIDUAL" && <span className="text-slate-400"> (선택)</span>}
          </label>
          <SearchableSelect
            name="ownerId"
            options={personOptions}
            defaultValue={goal?.ownerId ?? ""}
            placeholder="이름 검색"
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>가중치(%)</label>
          <input
            type="number"
            name="weight"
            min={0}
            max={100}
            step={1}
            defaultValue={goal?.weight ?? 0}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>측정지표</label>
          <input
            name="metric"
            defaultValue={goal?.metric ?? ""}
            placeholder="예: 신규 거래처 수"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>목표수준</label>
          <input name="targetValue" defaultValue={goal?.targetValue ?? ""} className={INPUT_CLASS} />
        </div>

        <div>
          <label className={LABEL_CLASS}>현재수준</label>
          <input
            name="currentValue"
            defaultValue={goal?.currentValue ?? ""}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>단위</label>
          <input
            name="unit"
            defaultValue={goal?.unit ?? ""}
            placeholder="건, %, 억원"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>달성률(%)</label>
          {isAutoCalculated(level) ? (
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
              className={INPUT_CLASS}
            />
          )}
        </div>

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

        <div>
          <label className={LABEL_CLASS}>마감일</label>
          <input
            type="date"
            name="dueDate"
            defaultValue={toDateInputValue(goal?.dueDate ?? null)}
            className={INPUT_CLASS}
          />
        </div>

        <div className="md:col-span-2">
          <label className={LABEL_CLASS}>설명</label>
          <textarea
            name="description"
            rows={2}
            defaultValue={goal?.description ?? ""}
            className={INPUT_CLASS}
          />
        </div>
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
          <span className="text-sm font-medium text-slate-800">{goal.title}</span>
          <span className="text-xs text-slate-500">{scopeText(goal)}</span>
          <StatusBadge status={goal.status} />
          {isOverdue(goal, now) && <OverdueBadge />}
          {needsAgreement(goal.level) && <AgreementBadge status={goal.agreementStatus} />}
          {goal.excluded && <ExcludedBadge reason={goal.excludeReason} />}
          {!goal.excluded && goal.targetExcluded && (
            <ExcludedBadge reason={goal.targetExcludeReason ?? "평가대상 아님"} />
          )}
          {flag && !goal.excluded && !goal.targetExcluded && <OwnerFlagBadge label={flag.label} />}
          <span className="ml-auto text-sm font-semibold tabular-nums text-slate-700">
            {goal.rollupProgress}%
          </span>
        </div>

        <div className="mt-2">
          <Meter value={goal.rollupProgress} size="md" />
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {goal.category && <span>구분: {goal.category}</span>}
          {parent && (
            <span>
              상위: {parent.title} ({GOAL_LEVEL_LABEL[parent.level as GoalLevel]})
            </span>
          )}
          {!parent && parentLevel && <span className="text-status-critical">상위 목표 미연결</span>}
          {goal.weight > 0 && <span>가중치 {goal.weight}%</span>}
          {goal.metric && <span>지표: {goal.metric}</span>}
          {goal.targetValue && (
            <span>
              목표 {goal.targetValue}
              {goal.unit ?? ""}
              {goal.currentValue && ` / 현재 ${goal.currentValue}${goal.unit ?? ""}`}
            </span>
          )}
          {goal.dueDate && <span>마감 {formatKSTDate(goal.dueDate)}</span>}
          {goal.children.length > 0 && <span>하위 {goal.children.length}건</span>}
        </div>

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
          {canTouchProgress && !isAutoCalculated(level) && (
            <ActionForm
              action={addGoalCheckIn}
              successMessage="진척이 반영되었습니다."
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="goalId" value={goal.id} />
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
          {isAutoCalculated(level) && (
            <span className="text-[11px] text-slate-400">
              {goal.children.length > 0
                ? `하위 ${goal.children.length}건의 가중평균으로 자동 계산됩니다`
                : "하위 목표가 없어 0%입니다 — 아래 층 목표를 만들고 상위로 연결하세요"}
            </span>
          )}
          {editable && (
            <Link
              href={buildHref({ edit: isEditing ? null : goal.id })}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
            >
              {isEditing ? "수정 닫기" : "수정"}
            </Link>
          )}
          {canExclude(goal) && lock.canEditProgress && (
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
          {isAdmin && lock.canEditGoals && (
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
    let rows = visibleRows(byLevel(level));
    // 전사 목표 표에서 한 줄을 고르면 그 갈래에 속한 목표만 남긴다.
    if (focusedIds) rows = rows.filter((g) => focusedIds.has(g.id));

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
              <input type="hidden" name="cycleId" value={cycle.id} />
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

  if (!cycle) {
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
                  구분 5개를 한 번에 넣을 수 있습니다.
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
    // 화면 높이에 딱 맞춘다. 페이지가 통째로 스크롤되면 위에 고정한 것들이
    // 아래 내용을 가려서 안 보이게 되므로, 페이지는 스크롤하지 않고 본문이
    // 자기 안에서만 스크롤한다.
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 다른 사람이 목표를 고쳐도 이 화면이 알아서 최신 값을 받아온다. */}
      <AutoRefresh />

      {/* 배너 — 탭과 인사평가 선택. 어느 화면에서도 맨 위에 그대로 남는다. */}
      <div className="shrink-0">{topBar()}</div>

      {/* 마감 안내 — 왜 수정 버튼이 사라졌는지 화면에서 바로 읽히게 한다. */}
      {lock.message && (
        <div className="shrink-0 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">
            {cycle?.status === "CLOSED" ? "종료됨" : "목표 확정됨"}
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

      {/* 전사 목표 — 배너와 줄을 나눠 그 아래에 놓는다. 표는 접을 수 있다. */}
      <div className="shrink-0">{companyGoalBoard()}</div>

      {isDashboard ? (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {DASHBOARD_LEVELS.map((level) => (
              <LevelSummaryCard key={level} level={level} />
            ))}
          </div>
        </div>
      ) : (
        // 층별 탭도 목록만 안에서 스크롤시켜, 배너와 전사 목표가 밀려
        // 올라가 사라지지 않게 한다.
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{levelTab(TAB_TO_LEVEL[tab])}</div>
      )}
    </div>
  );
}
