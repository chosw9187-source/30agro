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
  GOAL_LEVEL_RAMP,
  GOAL_LEVEL_RAMP_BORDER,
  GOAL_PARENT_LEVEL,
  GOAL_STATUSES,
  GOAL_STATUS_LABEL,
  averageProgress,
  buildGoalTree,
  countsTowardProgress,
  flattenGoalTree,
  isOverdue,
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
  seedCompanyGoalTemplate,
  setGoalCycleStatus,
  updateGoal,
  updateGoalCycleNote,
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

/** 대시보드 하단 보드에 한 줄로 나란히 세우는 층. 전사목표는 상단 고정이라 뺀다. */
const BOARD_LEVELS: GoalLevel[] = ["DIVISION", "TEAM", "INDIVIDUAL"];

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
    if (cycle) qs.set("cycleId", cycle.id);
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
  const doneCount = allNodes.filter((g) => g.status === "DONE").length;
  const overdueCount = allNodes.filter((g) => isOverdue(g, now)).length;
  const myGoals = allNodes.filter((g) => g.ownerId === session!.user.id);
  const noteLines = (cycle?.note ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  function canManage(goal: GoalNode): boolean {
    if (isAdmin) return true;
    if (goal.ownerId === session!.user.id) return true;
    const team = teams.find((t) => t.id === goal.teamId);
    return !!team && team.leaderId === session!.user.id;
  }

  // ---- 상단 고정 전사목표 표 ---------------------------------------------

  function companyGoalBoard() {
    return (
      <section className={`${CARD_CLASS} overflow-hidden`}>
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-3 pb-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-green">
              전사목표
            </p>
            <h1 className="mt-0.5 text-lg font-bold text-slate-900">
              {cycle ? `${cycle.year}년 조직 목표` : "목표관리"}
              <span className="ml-2 text-sm font-normal text-slate-400">
                {cycle?.name}
              </span>
            </h1>
          </div>

          <div className="flex items-end gap-5">
            <div className="text-right">
              <p className="text-[11px] font-medium whitespace-nowrap text-slate-500">전사 종합 달성률</p>
              <p className="text-3xl leading-none font-semibold text-slate-900">
                {overallProgress}
                <span className="ml-0.5 text-lg font-normal text-slate-400">%</span>
              </p>
            </div>
            <dl className="hidden gap-4 text-right sm:flex">
              <div>
                <dt className="text-[11px] text-slate-500">목표</dt>
                <dd className="text-base font-semibold text-slate-800">{allNodes.length}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">완료</dt>
                <dd className="text-base font-semibold text-slate-800">{doneCount}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">지연</dt>
                <dd
                  className={`text-base font-semibold ${
                    overdueCount > 0 ? "text-status-critical" : "text-slate-800"
                  }`}
                >
                  {overdueCount}
                </dd>
              </div>
            </dl>
            {cycles.length > 0 && cycle && (
              <CycleSelect
                value={cycle.id}
                options={cycles.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${GOAL_CYCLE_STATUS_LABEL[c.status as GoalCycleStatus]})`,
                }))}
              />
            )}
          </div>
        </div>

        {companyGoals.length === 0 ? (
          <div className="border-t border-slate-200 px-5 py-6">
            <p className="text-sm text-slate-500">
              등록된 전사목표가 없습니다.
              {isAdmin && " 여기에 등록하면 이 자리에 고정되어 모두에게 보입니다."}
            </p>
            {isAdmin && cycle && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={seedCompanyGoalTemplate.bind(null, cycle.id)}>
                  <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                    조직 단위별 목표 양식으로 채우기
                  </button>
                </form>
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
          <div className="max-h-[38vh] overflow-auto border-t border-slate-200">
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
                          href={buildHref({ tab: "dashboard", focus: focused ? null : g.id })}
                          className="group flex items-start gap-1.5"
                          title={focused ? "전체 보기" : "이 목표의 하위 목표만 보기"}
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

        {(noteLines.length > 0 || focusGoal) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-2.5">
            <div className="text-xs text-slate-500">
              {noteLines.map((line, i) => (
                <p key={i}>
                  {["i)", "ii)", "iii)", "iv)", "v)"][i] ?? "·"} {line}
                </p>
              ))}
            </div>
            {focusGoal && (
              <Link
                href={buildHref({ tab: "dashboard", focus: null })}
                className="shrink-0 rounded-full border border-brand-green px-3 py-1 text-xs font-medium text-brand-green-dark hover:bg-brand-green-light"
              >
                「{focusGoal.title}」 갈래만 보는 중 · 전체 보기 ✕
              </Link>
            )}
          </div>
        )}
      </section>
    );
  }

  // ---- 한 줄 보드: 책임 · 팀 · 개인 ---------------------------------------

  function BoardCard({ goal }: { goal: GoalNode }) {
    const level = goal.level as GoalLevel;
    const parent = goal.parentId ? nodeById.get(goal.parentId) : null;
    return (
      <li
        className={`border-l-2 py-2.5 pl-3 ${GOAL_LEVEL_RAMP_BORDER[level]} ${
          goal.status === "DROPPED" ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-medium text-slate-800">{goal.title}</p>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
            {goal.rollupProgress}%
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span className="font-medium text-slate-600">{scopeText(goal)}</span>
          {goal.weight > 0 && <span>가중치 {goal.weight}%</span>}
          {goal.dueDate && <span>~{formatKSTDate(goal.dueDate)}</span>}
          <StatusBadge status={goal.status} />
          {isOverdue(goal, now) && <OverdueBadge />}
        </div>
        <div className="mt-1.5">
          <Meter value={goal.rollupProgress} />
        </div>
        {parent && (
          <p className="mt-1 truncate text-[11px] text-slate-400">↖ {parent.title}</p>
        )}
      </li>
    );
  }

  function BoardColumn({ level }: { level: GoalLevel }) {
    let rows = byLevel(level);
    if (focusedIds) rows = rows.filter((g) => focusedIds.has(g.id));
    if (level === "INDIVIDUAL" && !isAdmin) {
      const myTeamIds = new Set(
        teams.filter((t) => t.leaderId === session!.user.id).map((t) => t.id)
      );
      rows = rows.filter(
        (g) => g.ownerId === session!.user.id || (g.teamId && myTeamIds.has(g.teamId))
      );
    }

    return (
      <section className={`${CARD_CLASS} flex min-h-0 flex-col`}>
        <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <LevelDot level={level} />
          <h2 className="text-sm font-semibold text-slate-800">{GOAL_LEVEL_LABEL[level]}</h2>
          <span className="text-xs text-slate-400">{rows.length}건</span>
          <span className="ml-auto text-sm font-semibold tabular-nums text-slate-700">
            {averageProgress(rows)}%
          </span>
        </header>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">
            {focusedIds ? "이 갈래에는 없습니다." : `등록된 ${GOAL_LEVEL_LABEL[level]}가 없습니다.`}
          </p>
        ) : (
          <ul className="max-h-[42vh] divide-y divide-slate-100 overflow-y-auto px-4 py-1">
            {rows.map((g) => (
              <BoardCard key={g.id} goal={g} />
            ))}
          </ul>
        )}
        <Link
          href={buildHref({ tab: level.toLowerCase(), focus: null })}
          className="border-t border-slate-200 px-4 py-2 text-xs text-brand-green-dark hover:bg-slate-50"
        >
          {GOAL_LEVEL_LABEL[level]} 관리 →
        </Link>
      </section>
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

  function GoalRowCard({ goal }: { goal: GoalNode }) {
    const level = goal.level as GoalLevel;
    const parent = goal.parentId ? nodeById.get(goal.parentId) : null;
    const editable = canManage(goal);
    const isEditing = editingGoal?.id === goal.id;
    const parentLevel = GOAL_PARENT_LEVEL[level];
    const parentOptions = parentLevel ? byLevel(parentLevel) : [];

    return (
      <div className={`${CARD_CLASS} border-l-2 p-4 ${GOAL_LEVEL_RAMP_BORDER[level]}`}>
        <div className="flex flex-wrap items-center gap-2">
          <LevelDot level={level} />
          <span className="text-sm font-medium text-slate-800">{goal.title}</span>
          <span className="text-xs text-slate-500">{scopeText(goal)}</span>
          <StatusBadge status={goal.status} />
          {isOverdue(goal, now) && <OverdueBadge />}
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
            </form>
          )}
          {editable && goal.children.length > 0 && (
            <span className="text-[11px] text-slate-400">
              하위 목표의 가중평균으로 자동 계산됩니다
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
          {isAdmin && (
            <form action={deleteGoal.bind(null, goal.id)}>
              <button
                type="submit"
                className="rounded-md border border-red-200 px-3 py-1 text-xs text-status-critical hover:bg-red-50"
              >
                삭제
              </button>
            </form>
          )}
        </div>

        {isEditing && (
          <form
            action={updateGoal}
            className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2"
          >
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

  function levelTab(level: GoalLevel) {
    const parentLevel = GOAL_PARENT_LEVEL[level];
    const parentOptions = parentLevel ? byLevel(parentLevel) : [];
    let rows = byLevel(level);

    if (level === "INDIVIDUAL" && !isAdmin) {
      const myTeamIds = new Set(
        teams.filter((t) => t.leaderId === session!.user.id).map((t) => t.id)
      );
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

  function cycleAdminPanel() {
    return (
      <section className={`${CARD_CLASS} p-5`}>
        <h2 className="text-base font-semibold">목표 사이클 관리</h2>
        <div className="mt-3 flex flex-col gap-2">
          {cycles.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"
            >
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
                    <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                      진행중으로
                    </button>
                  </form>
                )}
                {c.status !== "CLOSED" && (
                  <form action={setGoalCycleStatus.bind(null, c.id, "CLOSED")}>
                    <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                      종료
                    </button>
                  </form>
                )}
                <form action={deleteGoalCycle.bind(null, c.id)}>
                  <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-status-critical hover:bg-red-50">
                    삭제
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>

        {cycle && (
          <form action={updateGoalCycleNote} className="mt-4 border-t border-slate-200 pt-4">
            <input type="hidden" name="cycleId" value={cycle.id} />
            <label className={LABEL_CLASS}>
              전사목표 표 하단 안내문 — 한 줄이 i), ii) 한 항목이 됩니다
            </label>
            <textarea
              name="note"
              rows={2}
              defaultValue={cycle.note ?? ""}
              placeholder={"각 조직별 목표 달성을 위한 핵심 과제는 내부 공유 통해 정보 획득 및 실행 필요.\n사업개발의 경우 추후 확정 예정."}
              className={INPUT_CLASS}
            />
            <button type="submit" className={`${PRIMARY_BUTTON_CLASS} mt-2`}>
              안내문 저장
            </button>
          </form>
        )}

        <form
          action={createGoalCycle}
          className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-4"
        >
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
      </section>
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
            <form action={createGoalCycle} className="mt-4 grid gap-3 md:grid-cols-4">
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
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 전사목표는 어느 탭에 있든 화면 맨 위에 붙어 모두에게 계속 보인다. */}
      <div className="sticky -top-6 z-20 -mx-4 -mt-6 bg-slate-50 px-4 pt-6 pb-3 md:-top-8 md:-mx-8 md:-mt-8 md:px-8 md:pt-8">
        {companyGoalBoard()}
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={buildHref({ tab: t.key })}
            className={`rounded-full px-3.5 py-1.5 transition-colors ${
              tab === t.key
                ? "bg-brand-green text-white"
                : "border border-slate-300 text-slate-600 hover:bg-white"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "dashboard" ? (
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 lg:grid-cols-3">
            {BOARD_LEVELS.map((level) => (
              <BoardColumn key={level} level={level} />
            ))}
          </div>

          <section className={`${CARD_CLASS} p-5`}>
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold">내 목표</h2>
              <span className="text-xs text-slate-500">
                {me?.name}님이 담당자로 지정된 목표
              </span>
            </div>
            {myGoals.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">담당으로 지정된 목표가 없습니다.</p>
            ) : (
              <ul className="mt-3 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                {myGoals.map((g) => (
                  <BoardCard key={g.id} goal={g} />
                ))}
              </ul>
            )}
          </section>

          {isAdmin && cycleAdminPanel()}
        </div>
      ) : (
        levelTab(TAB_TO_LEVEL[tab])
      )}
    </div>
  );
}
