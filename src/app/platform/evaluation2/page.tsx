import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { SearchableSelect } from "@/components/searchable-select";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { formatKSTDate } from "@/lib/format-kst";
import {
  GOAL_CYCLE_STATUS_LABEL,
  GOAL_LEVELS,
  GOAL_LEVEL_LABEL,
  GOAL_PARENT_LEVEL,
  GOAL_STATUSES,
  GOAL_STATUS_BADGE_CLASS,
  GOAL_STATUS_LABEL,
  averageProgress,
  buildGoalTree,
  countsTowardProgress,
  flattenGoalTree,
  isOverdue,
  progressBarClass,
  toDateInputValue,
  weightedProgress,
  type GoalCycleStatus,
  type GoalLevel,
  type GoalNode,
  type GoalStatus,
} from "@/lib/goals";
import {
  addGoalCheckIn,
  createGoal,
  createGoalCycle,
  deleteGoal,
  deleteGoalCycle,
  setGoalCycleStatus,
  updateGoal,
} from "./actions";
import { CycleSelect } from "./cycle-select";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "dashboard", label: "대시보드" },
  ...GOAL_LEVELS.map((level) => ({ key: level.toLowerCase(), label: GOAL_LEVEL_LABEL[level] })),
] as const;

const TAB_TO_LEVEL: Record<string, GoalLevel> = {
  company: "COMPANY",
  division: "DIVISION",
  team: "TEAM",
  individual: "INDIVIDUAL",
};

const INPUT_CLASS = "w-full rounded border border-slate-300 px-3 py-2 text-sm";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-slate-600";
const PRIMARY_BUTTON_CLASS =
  "rounded bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark";
const CARD_CLASS = "rounded-lg border border-slate-200 bg-white p-5";

/** 층별 강조색 — 대시보드/트리에서 어느 층 목표인지 눈으로 바로 잡히게. */
const LEVEL_ACCENT: Record<GoalLevel, string> = {
  COMPANY: "border-l-4 border-l-brand-green",
  DIVISION: "border-l-4 border-l-blue-400",
  TEAM: "border-l-4 border-l-amber-400",
  INDIVIDUAL: "border-l-4 border-l-slate-300",
};

const LEVEL_CHIP: Record<GoalLevel, string> = {
  COMPANY: "bg-brand-green-light text-brand-green-dark",
  DIVISION: "bg-blue-50 text-blue-700",
  TEAM: "bg-amber-50 text-amber-800",
  INDIVIDUAL: "bg-slate-100 text-slate-600",
};

function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div
        className={`h-full rounded-full ${progressBarClass(value)}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className={CARD_CLASS}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-800">
        {value}
        {suffix && <span className="ml-0.5 text-base font-normal text-slate-500">{suffix}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (GOAL_STATUSES as readonly string[]).includes(status)
    ? (status as GoalStatus)
    : "ACTIVE";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${GOAL_STATUS_BADGE_CLASS[s]}`}>
      {GOAL_STATUS_LABEL[s]}
    </span>
  );
}

/** 목표에 붙는 소속 표기 — 책임은 부문명, 팀은 팀명, 개인은 담당자명. */
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
  const tab = TABS.some((t) => t.key === params.tab) ? params.tab! : "dashboard";

  const session = await auth();
  const isAdmin = session!.user.role === "ADMIN";
  const me = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { name: true },
  });

  const cycles = await prisma.goalCycle.findMany({
    orderBy: [{ year: "desc" }, { startDate: "desc" }],
  });
  const cycle = cycles.find((c) => c.id === params.cycleId) ?? cycles[0] ?? null;

  const [teams, people] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, division: true, leaderId: true },
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
          dueDate: true,
          sortOrder: true,
          team: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      })
    : [];

  const tree = buildGoalTree(goals);
  const allNodes = flattenGoalTree(tree);
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const byLevel = (level: GoalLevel) => allNodes.filter((n) => n.level === level);

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

  const editingGoal = params.edit ? nodeById.get(params.edit) ?? null : null;

  function hrefFor(nextTab: string) {
    const qs = new URLSearchParams();
    qs.set("tab", nextTab);
    if (cycle) qs.set("cycleId", cycle.id);
    return `/platform/evaluation2?${qs.toString()}`;
  }

  function goalHref(goalId: string | null) {
    const qs = new URLSearchParams();
    qs.set("tab", tab);
    if (cycle) qs.set("cycleId", cycle.id);
    if (goalId) qs.set("edit", goalId);
    return `/platform/evaluation2?${qs.toString()}`;
  }

  // ---- 대시보드 집계 ------------------------------------------------------

  const now = new Date();
  const counted = allNodes.filter(countsTowardProgress);
  const companyGoals = byLevel("COMPANY");
  // 전사목표끼리는 가중치가 서로를 비교하는 값이라 가중평균이 맞다.
  // 아직 전사목표가 없으면 등록된 전체 목표의 단순 평균으로 대신 보여준다.
  const overallProgress =
    companyGoals.length > 0 ? weightedProgress(companyGoals) : averageProgress(counted);
  const doneCount = allNodes.filter((g) => g.status === "DONE").length;
  const overdueCount = allNodes.filter((g) => isOverdue(g, now)).length;
  const unlinkedCount = allNodes.filter(
    (g) => GOAL_PARENT_LEVEL[g.level as GoalLevel] !== null && !g.parentId
  ).length;

  const divisionRollup = divisions
    .map((name) => {
      const nodes = byLevel("DIVISION").filter((g) => g.division === name);
      return { name, count: nodes.length, progress: averageProgress(nodes) };
    })
    .filter((d) => d.count > 0);

  const teamRollup = teams
    .map((t) => {
      const nodes = byLevel("TEAM").filter((g) => g.teamId === t.id);
      return { name: t.name, division: t.division, count: nodes.length, progress: averageProgress(nodes) };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.progress - a.progress);

  const myGoals = allNodes.filter((g) => g.ownerId === session!.user.id);

  // ---- 캐스케이드 트리 ----------------------------------------------------

  function CascadeNode({ node, depth }: { node: GoalNode; depth: number }) {
    const level = node.level as GoalLevel;
    const hasChildren = node.children.length > 0;
    const overdue = isOverdue(node, now);

    const body = (
      <div className={`rounded border border-slate-200 bg-white p-3 ${LEVEL_ACCENT[level]}`}>
        <div className="flex flex-wrap items-center gap-2">
          {hasChildren && (
            <span className="text-slate-400 transition-transform group-open:rotate-90" aria-hidden>
              ›
            </span>
          )}
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${LEVEL_CHIP[level]}`}>
            {GOAL_LEVEL_LABEL[level]}
          </span>
          <span className="text-sm font-medium text-slate-800">{node.title}</span>
          <span className="text-xs text-slate-500">{scopeText(node)}</span>
          <StatusBadge status={node.status} />
          {overdue && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
              지연
            </span>
          )}
          {node.weight > 0 && (
            <span className="text-[11px] text-slate-400">가중치 {node.weight}%</span>
          )}
          <span className="ml-auto text-sm font-semibold text-slate-700">
            {node.rollupProgress}%
          </span>
        </div>
        <ProgressBar value={node.rollupProgress} className="mt-2" />
        {(node.metric || node.targetValue) && (
          <p className="mt-2 text-xs text-slate-500">
            {node.metric}
            {node.targetValue && ` · 목표 ${node.targetValue}${node.unit ?? ""}`}
            {node.currentValue && ` / 현재 ${node.currentValue}${node.unit ?? ""}`}
          </p>
        )}
        {hasChildren && (
          <p className="mt-2 text-[11px] text-slate-400">
            하위 {node.children.length}건의 가중평균으로 자동 산출 · 클릭해서 접기/펼치기
          </p>
        )}
      </div>
    );

    return (
      <div className={depth > 0 ? "ml-4 border-l border-slate-200 pl-4" : ""}>
        {hasChildren ? (
          <details open={depth < 2} className="group mt-2">
            <summary className="cursor-pointer list-none">{body}</summary>
            <div>
              {node.children.map((child) => (
                <CascadeNode key={child.id} node={child} depth={depth + 1} />
              ))}
            </div>
          </details>
        ) : (
          <div className="mt-2">{body}</div>
        )}
      </div>
    );
  }

  // ---- 목표 입력 폼 -------------------------------------------------------

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
          <input name="currentValue" defaultValue={goal?.currentValue ?? ""} className={INPUT_CLASS} />
        </div>

        <div>
          <label className={LABEL_CLASS}>단위</label>
          <input name="unit" defaultValue={goal?.unit ?? ""} placeholder="건, %, 억원" className={INPUT_CLASS} />
        </div>

        <div>
          <label className={LABEL_CLASS}>달성률(%)</label>
          <input
            type="number"
            name="progress"
            min={0}
            max={100}
            step={1}
            defaultValue={goal?.progress ?? 0}
            className={INPUT_CLASS}
          />
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

  /** 이 사용자가 해당 목표를 직접 고칠 수 있는지 — 서버 액션과 같은 기준. */
  function canManage(goal: GoalNode): boolean {
    if (isAdmin) return true;
    if (goal.ownerId === session!.user.id) return true;
    const team = teams.find((t) => t.id === goal.teamId);
    return !!team && team.leaderId === session!.user.id;
  }

  function GoalRowCard({ goal }: { goal: GoalNode }) {
    const level = goal.level as GoalLevel;
    const parent = goal.parentId ? nodeById.get(goal.parentId) : null;
    const editable = canManage(goal);
    const isEditing = editingGoal?.id === goal.id;
    const parentLevel = GOAL_PARENT_LEVEL[level];
    const parentOptions = parentLevel ? byLevel(parentLevel) : [];

    return (
      <div className={`rounded-lg border border-slate-200 bg-white p-4 ${LEVEL_ACCENT[level]}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-800">{goal.title}</span>
          <span className="text-xs text-slate-500">{scopeText(goal)}</span>
          <StatusBadge status={goal.status} />
          {isOverdue(goal, now) && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
              지연
            </span>
          )}
          <span className="ml-auto text-sm font-semibold text-slate-700">{goal.rollupProgress}%</span>
        </div>

        <ProgressBar value={goal.rollupProgress} className="mt-2" />

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {parent && (
            <span>
              상위: {parent.title} ({GOAL_LEVEL_LABEL[parent.level as GoalLevel]})
            </span>
          )}
          {!parent && parentLevel && <span className="text-amber-600">상위 목표 미연결</span>}
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {editable && goal.children.length === 0 && (
            <form action={addGoalCheckIn} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="goalId" value={goal.id} />
              <input
                type="number"
                name="progress"
                min={0}
                max={100}
                defaultValue={goal.progress}
                aria-label="달성률"
                className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <input
                name="currentValue"
                placeholder="현재수준"
                aria-label="현재수준"
                className="w-28 rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <input
                name="note"
                placeholder="진척 메모"
                aria-label="진척 메모"
                className="w-44 rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                type="submit"
                className="rounded bg-brand-green px-3 py-1 text-xs font-medium text-white hover:bg-brand-green-dark"
              >
                진척 반영
              </button>
            </form>
          )}
          {editable && goal.children.length > 0 && (
            <span className="text-[11px] text-slate-400">
              하위 목표의 가중평균으로 자동 계산됩니다
            </span>
          )}
          {editable && (
            <Link
              href={isEditing ? goalHref(null) : goalHref(goal.id)}
              className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
            >
              {isEditing ? "수정 닫기" : "수정"}
            </Link>
          )}
          {isAdmin && (
            <form action={deleteGoal.bind(null, goal.id)}>
              <button
                type="submit"
                className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                삭제
              </button>
            </form>
          )}
        </div>

        {isEditing && (
          <form action={updateGoal} className="mt-4 grid gap-3 rounded border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            <input type="hidden" name="goalId" value={goal.id} />
            <GoalFormFields level={level} goal={goal} parentOptions={parentOptions} />
            <div className="md:col-span-2">
              <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                저장
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  function LevelTab({ level }: { level: GoalLevel }) {
    const parentLevel = GOAL_PARENT_LEVEL[level];
    const parentOptions = parentLevel ? byLevel(parentLevel) : [];
    let rows = byLevel(level);

    // 개인목표는 건수가 많아 전사 목록이 의미가 없다. 관리자가 아니면
    // 본인 것과 본인이 팀장인 팀의 것만 보여준다.
    if (level === "INDIVIDUAL" && !isAdmin) {
      const myTeamIds = new Set(teams.filter((t) => t.leaderId === session!.user.id).map((t) => t.id));
      rows = rows.filter(
        (g) => g.ownerId === session!.user.id || (g.teamId && myTeamIds.has(g.teamId))
      );
    }

    const canCreate =
      isAdmin ||
      level === "INDIVIDUAL" ||
      (level === "TEAM" && teams.some((t) => t.leaderId === session!.user.id));

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">{GOAL_LEVEL_LABEL[level]}</h2>
          <span className="text-sm text-slate-500">{rows.length}건</span>
          <span className="text-sm text-slate-500">평균 달성률 {averageProgress(rows)}%</span>
        </div>

        {canCreate && cycle && (
          <details className={CARD_CLASS}>
            <summary className="cursor-pointer text-sm font-medium text-brand-green-dark">
              + {GOAL_LEVEL_LABEL[level]} 등록
            </summary>
            <form action={createGoal} className="mt-4 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="cycleId" value={cycle.id} />
              <input type="hidden" name="level" value={level} />
              <GoalFormFields level={level} parentOptions={parentOptions} />
              <div className="md:col-span-2">
                <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                  등록
                </button>
              </div>
            </form>
          </details>
        )}

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">평가2 · 목표관리</h1>
          <p className="mt-1 text-slate-600">
            전사목표에서 책임 · 팀 · 개인목표까지 이어지는 목표 정렬과 달성 현황입니다.
          </p>
        </div>
        {cycles.length > 0 && cycle && (
          <div className="flex items-center gap-2">
            <CycleSelect
              value={cycle.id}
              options={cycles.map((c) => ({
                value: c.id,
                label: `${c.name} (${GOAL_CYCLE_STATUS_LABEL[c.status as GoalCycleStatus]})`,
              }))}
            />
            <span className="text-xs text-slate-500">
              {formatKSTDate(cycle.startDate)} ~ {formatKSTDate(cycle.endDate)}
            </span>
          </div>
        )}
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            className={`rounded px-3 py-1.5 ${
              tab === t.key
                ? "bg-brand-green text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {!cycle ? (
        <div className={CARD_CLASS}>
          <p className="text-sm text-slate-600">
            등록된 목표 사이클이 없습니다. {isAdmin ? "먼저 사이클을 만들어 주세요." : "관리자가 사이클을 열면 목표를 등록할 수 있습니다."}
          </p>
          {isAdmin && (
            <form action={createGoalCycle} className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <label className={LABEL_CLASS}>사이클명</label>
                <input name="name" required placeholder="2026년 상반기" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>시작일</label>
                <input type="date" name="startDate" required className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>종료일</label>
                <input type="date" name="endDate" required className={INPUT_CLASS} />
              </div>
              <div className="md:col-span-4">
                <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                  사이클 만들기
                </button>
              </div>
            </form>
          )}
        </div>
      ) : tab === "dashboard" ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="전사 종합 달성률"
              value={overallProgress}
              suffix="%"
              hint={companyGoals.length > 0 ? `전사목표 ${companyGoals.length}건 기준` : "전사목표 미등록 — 전체 평균"}
            />
            <StatCard label="등록 목표" value={allNodes.length} suffix="건" hint={`중단 제외 ${counted.length}건`} />
            <StatCard label="완료" value={doneCount} suffix="건" hint={`전체의 ${allNodes.length > 0 ? Math.round((doneCount / allNodes.length) * 100) : 0}%`} />
            <StatCard label="지연" value={overdueCount} suffix="건" hint={unlinkedCount > 0 ? `상위 미연결 ${unlinkedCount}건` : "마감일 경과 · 미완료"} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GOAL_LEVELS.map((level) => {
              const nodes = byLevel(level);
              return (
                <div key={level} className={`${CARD_CLASS} ${LEVEL_ACCENT[level]}`}>
                  <div className="flex items-center justify-between">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${LEVEL_CHIP[level]}`}>
                      {GOAL_LEVEL_LABEL[level]}
                    </span>
                    <span className="text-xs text-slate-500">{nodes.length}건</span>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-slate-800">
                    {averageProgress(nodes)}
                    <span className="ml-0.5 text-base font-normal text-slate-500">%</span>
                  </p>
                  <ProgressBar value={averageProgress(nodes)} className="mt-2" />
                  <Link
                    href={hrefFor(level.toLowerCase())}
                    className="mt-3 inline-block text-xs text-brand-green-dark hover:underline"
                  >
                    목록 보기 →
                  </Link>
                </div>
              );
            })}
          </div>

          <div className={CARD_CLASS}>
            <h2 className="text-lg font-semibold">목표 정렬 현황</h2>
            <p className="mt-1 text-xs text-slate-500">
              전사목표를 펼치면 그 아래 책임 · 팀 · 개인목표가 이어집니다. 상위 목표의 달성률은
              하위 목표의 가중평균입니다.
            </p>
            {tree.length === 0 ? (
              <p className="mt-6 rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                이번 사이클에 등록된 목표가 없습니다.
              </p>
            ) : (
              <div className="mt-3">
                {tree.map((node) => (
                  <CascadeNode key={node.id} node={node} depth={0} />
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={CARD_CLASS}>
              <h2 className="text-base font-semibold">책임별 달성률</h2>
              {divisionRollup.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">등록된 책임목표가 없습니다.</p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="py-2">책임(부문)</th>
                      <th className="py-2">목표</th>
                      <th className="py-2 w-1/2">달성률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {divisionRollup.map((d) => (
                      <tr key={d.name} className="border-b border-slate-100 last:border-0">
                        <td className="py-2">{d.name}</td>
                        <td className="py-2 text-slate-500">{d.count}건</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <ProgressBar value={d.progress} />
                            <span className="w-10 shrink-0 text-right text-xs text-slate-600">
                              {d.progress}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className={CARD_CLASS}>
              <h2 className="text-base font-semibold">팀별 달성률</h2>
              {teamRollup.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">등록된 팀목표가 없습니다.</p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="py-2">팀</th>
                      <th className="py-2">목표</th>
                      <th className="py-2 w-1/2">달성률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamRollup.map((t) => (
                      <tr key={t.name} className="border-b border-slate-100 last:border-0">
                        <td className="py-2">
                          {t.name}
                          {t.division && <span className="ml-1 text-xs text-slate-400">{t.division}</span>}
                        </td>
                        <td className="py-2 text-slate-500">{t.count}건</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <ProgressBar value={t.progress} />
                            <span className="w-10 shrink-0 text-right text-xs text-slate-600">
                              {t.progress}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className={CARD_CLASS}>
            <h2 className="text-base font-semibold">내 목표</h2>
            <p className="mt-1 text-xs text-slate-500">
              {me?.name}님이 담당자로 지정된 목표입니다.
            </p>
            {myGoals.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">담당으로 지정된 목표가 없습니다.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {myGoals.map((g) => (
                  <div key={g.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-3">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${LEVEL_CHIP[g.level as GoalLevel]}`}>
                      {GOAL_LEVEL_LABEL[g.level as GoalLevel]}
                    </span>
                    <span className="text-sm text-slate-800">{g.title}</span>
                    <StatusBadge status={g.status} />
                    {isOverdue(g, now) && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                        지연
                      </span>
                    )}
                    <span className="ml-auto text-sm font-semibold text-slate-700">
                      {g.rollupProgress}%
                    </span>
                    <div className="w-full">
                      <ProgressBar value={g.rollupProgress} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className={CARD_CLASS}>
              <h2 className="text-base font-semibold">목표 사이클 관리</h2>
              <div className="mt-3 flex flex-col gap-2">
                {cycles.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-3 text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-slate-500">
                      {formatKSTDate(c.startDate)} ~ {formatKSTDate(c.endDate)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {GOAL_CYCLE_STATUS_LABEL[c.status as GoalCycleStatus]}
                    </span>
                    <div className="ml-auto flex gap-2">
                      {c.status !== "OPEN" && (
                        <form action={setGoalCycleStatus.bind(null, c.id, "OPEN")}>
                          <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                            진행중으로
                          </button>
                        </form>
                      )}
                      {c.status !== "CLOSED" && (
                        <form action={setGoalCycleStatus.bind(null, c.id, "CLOSED")}>
                          <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                            종료
                          </button>
                        </form>
                      )}
                      <form action={deleteGoalCycle.bind(null, c.id)}>
                        <button className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                          삭제
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>

              <form action={createGoalCycle} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className={LABEL_CLASS}>새 사이클명</label>
                  <input name="name" required placeholder="2026년 하반기" className={INPUT_CLASS} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>시작일</label>
                  <input type="date" name="startDate" required className={INPUT_CLASS} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>종료일</label>
                  <input type="date" name="endDate" required className={INPUT_CLASS} />
                </div>
                <div className="md:col-span-4">
                  <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                    사이클 추가
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      ) : (
        <LevelTab level={TAB_TO_LEVEL[tab]} />
      )}
    </div>
  );
}
