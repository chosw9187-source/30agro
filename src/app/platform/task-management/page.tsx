import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { formatKSTDate } from "@/lib/format-kst";
import {
  createTask,
  deleteTask,
  addSubtask,
  deleteSubtask,
  createSopDocument,
  deleteSopDocument,
  createWorkLogEntry,
  deleteWorkLogEntry,
} from "./actions";
import { TaskStatusSelect } from "./task-status-select";
import { TaskPrioritySelect } from "./task-priority-select";
import { SubtaskCheckbox } from "./subtask-checkbox";
import { SearchableSelect } from "./searchable-select";
import { FilterSelect } from "./filter-select";
import { KanbanDropZone, DraggableCard } from "./kanban-dnd";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "dashboard", label: "대시보드" },
  { key: "list", label: "업무 목록" },
  { key: "kanban", label: "칸반보드" },
  { key: "calendar", label: "캘린더·타임라인" },
  { key: "todo", label: "To-do·주간업무일지" },
  { key: "sop", label: "SOP" },
  { key: "log", label: "업무일지 DB" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const STATUS_LABEL: Record<string, string> = {
  TODO: "진행 예정",
  IN_PROGRESS: "진행 중",
  REVIEW: "검토 중",
  DONE: "완료",
};
const STATUS_COLUMNS = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;

const PRIORITY_LABEL: Record<string, string> = { HIGH: "높음", MEDIUM: "보통", LOW: "낮음" };
const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const PRIORITY_BADGE_CLASS: Record<string, string> = {
  HIGH: "bg-red-50 text-red-600",
  MEDIUM: "bg-amber-50 text-amber-600",
  LOW: "bg-emerald-50 text-emerald-600",
};

type TaskWithRelations = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  assignee: { name: string } | null;
  team: { name: string } | null;
  subtasks: { id: string; title: string; done: boolean }[];
};

function fmtDate(d: Date) {
  return formatKSTDate(d, { month: "2-digit", day: "2-digit" });
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function TabLink({ tab, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  return (
    <Link
      href={`/platform/task-management?tab=${tab.key}`}
      className={`rounded px-3 py-1.5 text-sm font-medium ${
        active ? "bg-brand-green text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-100"
      }`}
    >
      {tab.label}
    </Link>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE_CLASS[priority] ?? "bg-slate-100 text-slate-500"}`}>
      {PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}

function SubtaskSection({ taskId, subtasks }: { taskId: string; subtasks: { id: string; title: string; done: boolean }[] }) {
  const done = subtasks.filter((s) => s.done).length;

  if (subtasks.length === 0) {
    return (
      <form action={addSubtask.bind(null, taskId)} className="mt-2 flex gap-1">
        <input
          name="title"
          placeholder="체크리스트 추가"
          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
        />
        <button type="submit" className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">
          추가
        </button>
      </form>
    );
  }

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-slate-500">
        체크리스트 {done}/{subtasks.length}
      </summary>
      <div className="mt-1.5 flex flex-col gap-1">
        {subtasks.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
            <SubtaskCheckbox subtaskId={s.id} done={s.done} title={s.title} />
            <form action={deleteSubtask.bind(null, s.id)}>
              <button type="submit" className="shrink-0 text-slate-400 hover:text-red-500">
                ✕
              </button>
            </form>
          </div>
        ))}
        <form action={addSubtask.bind(null, taskId)} className="flex gap-1 pt-1">
          <input
            name="title"
            placeholder="항목 추가"
            className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
          />
          <button type="submit" className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">
            추가
          </button>
        </form>
      </div>
    </details>
  );
}

function StatCard({ label, value, valueClass, sub, subClass }: { label: string; value: number; valueClass?: string; sub?: string; subClass?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass ?? "text-slate-800"}`}>{value}</p>
      {sub && <p className={`mt-1 text-xs ${subClass ?? "text-slate-400"}`}>{sub}</p>}
    </div>
  );
}

function StatBar({ label, count, total, colorClass }: { label: string; count: number; total: number; colorClass: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-16 shrink-0 text-slate-600">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-slate-500">{count}</span>
    </div>
  );
}

async function DashboardTab() {
  const tasks = await prisma.task.findMany({ include: { assignee: { select: { name: true } } } });

  const total = tasks.length;
  const byStatus: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
  const byPriority: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
  }
  const completed = byStatus.DONE;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const today = startOfDay(new Date());

  const urgentTasks = tasks
    .filter((t) => t.status !== "DONE" && (t.priority === "HIGH" || (t.dueDate && startOfDay(t.dueDate) <= today)))
    .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="전체 업무" value={total} />
        <StatCard label="진행 중 업무" value={byStatus.IN_PROGRESS} valueClass="text-amber-600" />
        <StatCard
          label="완료된 업무"
          value={completed}
          valueClass="text-emerald-600"
          sub={`달성율 ${percent}%`}
          subClass="text-emerald-600"
        />
        <StatCard label="긴급 / 마감임박" value={urgentTasks.length} valueClass="text-red-600" sub="우선순위 높음 또는 오늘 마감" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">상태별 업무 분포</h3>
          <div className="flex flex-col gap-2.5">
            {STATUS_COLUMNS.map((s) => (
              <StatBar
                key={s}
                label={STATUS_LABEL[s]}
                count={byStatus[s]}
                total={total}
                colorClass={
                  s === "DONE" ? "bg-emerald-500" : s === "IN_PROGRESS" ? "bg-amber-500" : s === "REVIEW" ? "bg-blue-500" : "bg-slate-400"
                }
              />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">우선순위 비율</h3>
          <div className="flex flex-col gap-2.5">
            <StatBar label="높음" count={byPriority.HIGH} total={total} colorClass="bg-red-500" />
            <StatBar label="보통" count={byPriority.MEDIUM} total={total} colorClass="bg-amber-500" />
            <StatBar label="낮음" count={byPriority.LOW} total={total} colorClass="bg-emerald-500" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">주요 리마인더 및 긴급 업무</h3>
        <div className="flex flex-col gap-2">
          {urgentTasks.slice(0, 6).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">{t.title}</span>
                {t.assignee && (
                  <span className="rounded-full bg-brand-green-light px-2 py-0.5 text-xs text-brand-green-dark">{t.assignee.name}</span>
                )}
                {t.dueDate && <span className="text-xs text-slate-400">~{fmtDate(t.dueDate)}</span>}
              </div>
              <PriorityBadge priority={t.priority} />
            </div>
          ))}
          {urgentTasks.length === 0 && <p className="text-sm text-slate-500">긴급하거나 오늘 마감인 업무가 없습니다.</p>}
        </div>
      </div>
    </div>
  );
}

async function ListTab({ status, priority, sort }: { status?: string; priority?: string; sort?: string }) {
  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (priority && priority !== "all") where.priority = priority;

  const tasks: TaskWithRelations[] = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { name: true } },
      team: { select: { name: true } },
      subtasks: { select: { id: true, title: true, done: true } },
    },
  });

  const sortKey = sort ?? "dueDate";
  tasks.sort((a, b) => {
    if (sortKey === "priority") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (sortKey === "title") return a.title.localeCompare(b.title);
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <FilterSelect
          paramKey="status"
          ariaLabel="상태 필터"
          options={[{ value: "all", label: "모든 상태" }, ...STATUS_COLUMNS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
        />
        <FilterSelect
          paramKey="priority"
          ariaLabel="우선순위 필터"
          options={[
            { value: "all", label: "모든 우선순위" },
            { value: "HIGH", label: "높음" },
            { value: "MEDIUM", label: "보통" },
            { value: "LOW", label: "낮음" },
          ]}
        />
        <span className="ml-auto text-xs text-slate-400">정렬</span>
        <FilterSelect
          paramKey="sort"
          ariaLabel="정렬 기준"
          options={[
            { value: "dueDate", label: "마감일순" },
            { value: "priority", label: "우선순위순" },
            { value: "title", label: "제목순" },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <div key={t.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">{t.title}</span>
                <PriorityBadge priority={t.priority} />
                {t.assignee && (
                  <span className="rounded-full bg-brand-green-light px-2 py-0.5 text-xs text-brand-green-dark">{t.assignee.name}</span>
                )}
                {t.team && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t.team.name}</span>}
                {t.dueDate && <span className="text-xs text-slate-400">~{fmtDate(t.dueDate)}</span>}
              </div>
              <div className="flex items-center gap-2">
                <TaskStatusSelect taskId={t.id} status={t.status} />
                <TaskPrioritySelect taskId={t.id} priority={t.priority} />
                <form action={deleteTask.bind(null, t.id)}>
                  <button type="submit" className="text-xs text-red-500 hover:underline">
                    삭제
                  </button>
                </form>
              </div>
            </div>
            {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
            <SubtaskSection taskId={t.id} subtasks={t.subtasks} />
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">
            조건에 일치하는 업무가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function NewTaskForm({ users, teams, defaultTeamId }: { users: { id: string; name: string }[]; teams: { id: string; name: string }[]; defaultTeamId: string }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-brand-green-dark">+ 새 업무 추가</summary>
      <form action={createTask} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input name="title" placeholder="제목" required className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
        <textarea
          name="description"
          placeholder="설명(선택)"
          rows={2}
          className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
        />
        <div>
          <label className="mb-1 block text-xs text-slate-500">담당자</label>
          <SearchableSelect
            name="assigneeId"
            options={users.map((u) => ({ value: u.id, label: u.name }))}
            placeholder="이름 검색"
            emptyLabel="담당자 없음"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">팀</label>
          <SearchableSelect
            name="teamId"
            options={teams.map((t) => ({ value: t.id, label: t.name }))}
            defaultValue={defaultTeamId}
            placeholder="팀 검색"
            emptyLabel="팀 없음"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">우선순위</label>
          <select name="priority" defaultValue="MEDIUM" className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="HIGH">높음</option>
            <option value="MEDIUM">보통</option>
            <option value="LOW">낮음</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">마감일</label>
          <input type="date" name="dueDate" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button
          type="submit"
          className="rounded bg-brand-green px-3 py-2 text-sm font-medium text-white hover:bg-brand-green-dark sm:col-span-2"
        >
          추가
        </button>
      </form>
    </details>
  );
}

async function KanbanTab({
  users,
  teams,
  defaultTeamId,
}: {
  users: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  defaultTeamId: string;
}) {
  const tasks: TaskWithRelations[] = await prisma.task.findMany({
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      assignee: { select: { name: true } },
      team: { select: { name: true } },
      subtasks: { select: { id: true, title: true, done: true } },
    },
  });
  const columns = STATUS_COLUMNS.map((status) => ({ status, items: tasks.filter((t) => t.status === status) }));

  return (
    <div className="flex flex-col gap-4">
      <NewTaskForm users={users} teams={teams} defaultTeamId={defaultTeamId} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {columns.map((col) => (
          <KanbanDropZone key={col.status} status={col.status} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">
              {STATUS_LABEL[col.status]} <span className="text-slate-400">({col.items.length})</span>
            </p>
            {col.items.map((t) => (
              <DraggableCard key={t.id} taskId={t.id}>
                <div className="rounded border border-slate-200 bg-white p-3 text-sm shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-800">{t.title}</p>
                    <PriorityBadge priority={t.priority} />
                  </div>
                  {t.description && <p className="mt-1 text-xs text-slate-500">{t.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    {t.assignee && (
                      <span className="rounded-full bg-brand-green-light px-2 py-0.5 text-brand-green-dark">{t.assignee.name}</span>
                    )}
                    {t.team && <span className="rounded-full bg-slate-100 px-2 py-0.5">{t.team.name}</span>}
                    {t.dueDate && <span>~{fmtDate(t.dueDate)}</span>}
                  </div>
                  <SubtaskSection taskId={t.id} subtasks={t.subtasks} />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <TaskStatusSelect taskId={t.id} status={t.status} />
                      <TaskPrioritySelect taskId={t.id} priority={t.priority} />
                    </div>
                    <form action={deleteTask.bind(null, t.id)}>
                      <button type="submit" className="text-xs text-red-500 hover:underline">
                        삭제
                      </button>
                    </form>
                  </div>
                </div>
              </DraggableCard>
            ))}
            {col.items.length === 0 && <p className="text-xs text-slate-400">없음</p>}
          </KanbanDropZone>
        ))}
      </div>
      <p className="text-xs text-slate-400">카드를 다른 칸으로 끌어다 놓거나, 카드 안의 상태 선택으로 옮길 수 있습니다.</p>
    </div>
  );
}

const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

function parseMonthParam(month?: string): { year: number; monthIdx: number } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, monthIdx: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), monthIdx: now.getMonth() };
}

function monthParamValue(year: number, monthIdx: number) {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
}

async function CalendarTab({ month }: { month?: string }) {
  const { year, monthIdx } = parseMonthParam(month);
  const monthStart = new Date(year, monthIdx, 1);
  const monthEnd = new Date(year, monthIdx + 1, 1);
  const today = startOfDay(new Date());

  const tasks = await prisma.task.findMany({
    where: { dueDate: { gte: monthStart, lt: monthEnd } },
    orderBy: { dueDate: "asc" },
    include: { assignee: { select: { name: true } } },
  });

  const byDay = new Map<number, typeof tasks>();
  for (const t of tasks) {
    const day = t.dueDate!.getDate();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(t);
  }

  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = monthIdx === 0 ? { year: year - 1, monthIdx: 11 } : { year, monthIdx: monthIdx - 1 };
  const next = monthIdx === 11 ? { year: year + 1, monthIdx: 0 } : { year, monthIdx: monthIdx + 1 };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href={`/platform/task-management?tab=calendar&month=${monthParamValue(prev.year, prev.monthIdx)}`}
            className="rounded border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            ‹
          </Link>
          <p className="w-28 text-center text-lg font-semibold text-slate-800">
            {year}년 {monthIdx + 1}월
          </p>
          <Link
            href={`/platform/task-management?tab=calendar&month=${monthParamValue(next.year, next.monthIdx)}`}
            className="rounded border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            ›
          </Link>
        </div>
        <Link
          href="/platform/task-management?tab=calendar"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          오늘
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-7 bg-slate-50 text-center text-xs font-medium text-slate-500">
          {WEEKDAY_LABEL.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-slate-200">
          {cells.map((day, i) => {
            const isToday =
              day !== null && year === today.getFullYear() && monthIdx === today.getMonth() && day === today.getDate();
            const dayTasks = day !== null ? (byDay.get(day) ?? []) : [];
            return (
              <div key={i} className={`min-h-[100px] bg-white p-1.5 ${day === null ? "bg-slate-50" : ""}`}>
                {day !== null && (
                  <>
                    <p
                      className={`mb-1 text-xs font-medium ${
                        isToday
                          ? "flex h-5 w-5 items-center justify-center rounded-full bg-brand-green text-white"
                          : "text-slate-500"
                      }`}
                    >
                      {day}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {dayTasks.slice(0, 3).map((t) => (
                        <p
                          key={t.id}
                          title={`${t.title}${t.assignee ? ` · ${t.assignee.name}` : ""}`}
                          className={`truncate rounded border-l-2 px-1 py-0.5 text-[11px] ${
                            t.status === "DONE"
                              ? "border-slate-300 bg-slate-100 text-slate-400 line-through"
                              : t.priority === "HIGH"
                                ? "border-red-400 bg-red-50 text-red-700"
                                : "border-brand-green bg-brand-green-light text-brand-green-dark"
                          }`}
                        >
                          {t.title}
                        </p>
                      ))}
                      {dayTasks.length > 3 && <p className="text-[11px] text-slate-400">+{dayTasks.length - 3}개 더</p>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {tasks.length === 0 && <p className="text-slate-500">이번 달 마감일이 설정된 업무가 없습니다.</p>}
    </div>
  );
}

async function TodoTab({ userId }: { userId: string }) {
  const tasks = await prisma.task.findMany({
    where: { assigneeId: userId },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: { subtasks: { select: { id: true, title: true, done: true } } },
  });
  const open = tasks.filter((t) => t.status !== "DONE");
  const done = tasks.filter((t) => t.status === "DONE");

  return (
    <div className="flex flex-col gap-6">
      <form action={createTask} className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <input type="hidden" name="assigneeId" value={userId} />
        <input
          name="title"
          placeholder="할 일 추가"
          required
          className="min-w-[200px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <select name="priority" defaultValue="MEDIUM" className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="HIGH">높음</option>
          <option value="MEDIUM">보통</option>
          <option value="LOW">낮음</option>
        </select>
        <input type="date" name="dueDate" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <button
          type="submit"
          className="rounded bg-brand-green px-3 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
        >
          추가
        </button>
      </form>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">할 일 ({open.length})</h3>
        <div className="flex flex-col gap-2">
          {open.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">{t.title}</span>
                  <PriorityBadge priority={t.priority} />
                  {t.dueDate && <span className="text-xs text-slate-400">~{fmtDate(t.dueDate)}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <TaskStatusSelect taskId={t.id} status={t.status} />
                  <form action={deleteTask.bind(null, t.id)}>
                    <button type="submit" className="text-xs text-red-500 hover:underline">
                      삭제
                    </button>
                  </form>
                </div>
              </div>
              <SubtaskSection taskId={t.id} subtasks={t.subtasks} />
            </div>
          ))}
          {open.length === 0 && <p className="text-xs text-slate-400">할 일이 없습니다.</p>}
        </div>
      </div>

      {done.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-400">이번 주 완료 ({done.length})</h3>
          <div className="flex flex-col gap-1.5">
            {done.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-400 line-through"
              >
                <span>{t.title}</span>
                <TaskStatusSelect taskId={t.id} status={t.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function SopTab() {
  const sops = await prisma.sopDocument.findMany({
    orderBy: [{ category: "asc" }, { title: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-brand-green-dark">+ SOP 작성</summary>
        <form action={createSopDocument} className="mt-3 flex flex-col gap-3">
          <input name="title" placeholder="제목" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input
            name="category"
            placeholder="분류(선택, 예: 정산·결재)"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            name="content"
            placeholder="절차 내용"
            required
            rows={5}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="self-start rounded bg-brand-green px-3 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
          >
            저장
          </button>
        </form>
      </details>

      <div className="flex flex-col gap-3">
        {sops.map((s) => (
          <details key={s.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <summary className="flex cursor-pointer items-center justify-between gap-2">
              <span className="font-medium text-slate-800">
                {s.title}
                {s.category && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                    {s.category}
                  </span>
                )}
              </span>
              <span className="text-xs text-slate-400">{s.createdBy.name}</span>
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{s.content}</p>
            <form action={deleteSopDocument.bind(null, s.id)} className="mt-2">
              <button type="submit" className="text-xs text-red-500 hover:underline">
                삭제
              </button>
            </form>
          </details>
        ))}
        {sops.length === 0 && <p className="text-slate-500">등록된 SOP가 없습니다.</p>}
      </div>
    </div>
  );
}

async function LogTab({ userId }: { userId: string }) {
  const entries = await prisma.workLogEntry.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <form action={createWorkLogEntry} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">날짜</label>
          <input type="date" name="date" defaultValue={today} className="rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <textarea
          name="content"
          placeholder="오늘 업무 내용을 기록하세요"
          required
          rows={3}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="self-start rounded bg-brand-green px-3 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
        >
          기록 저장
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {entries.map((e) => (
          <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">{fmtDate(e.date)}</span>
              <form action={deleteWorkLogEntry.bind(null, e.id)}>
                <button type="submit" className="text-xs text-red-500 hover:underline">
                  삭제
                </button>
              </form>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{e.content}</p>
          </div>
        ))}
        {entries.length === 0 && <p className="text-slate-500">작성된 업무일지가 없습니다.</p>}
      </div>
    </div>
  );
}

export default async function TaskManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string; status?: string; priority?: string; sort?: string }>;
}) {
  if (!(await checkModuleAccess("TASK_MANAGEMENT"))) {
    return <NoModuleAccess title="업무 관리" />;
  }

  const session = await auth();
  const userId = session!.user.id;
  const { tab, month, status, priority, sort } = await searchParams;
  const active: TabKey = TABS.find((t) => t.key === tab)?.key ?? "dashboard";

  const [users, teams, me] =
    active === "kanban"
      ? await Promise.all([
          prisma.user.findMany({
            where: activePrismaWhere(),
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
          prisma.team.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
          prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } }),
        ])
      : [[], [], null];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">업무 관리</h1>
        <p className="mt-1 text-slate-600">팀/개인 업무를 대시보드·목록·칸반·일정·To-do·SOP·업무일지로 관리합니다.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <TabLink key={t.key} tab={t} active={t.key === active} />
        ))}
      </div>

      {active === "dashboard" && <DashboardTab />}
      {active === "list" && <ListTab status={status} priority={priority} sort={sort} />}
      {active === "kanban" && <KanbanTab users={users} teams={teams} defaultTeamId={me?.teamId ?? ""} />}
      {active === "calendar" && <CalendarTab month={month} />}
      {active === "todo" && <TodoTab userId={userId} />}
      {active === "sop" && <SopTab />}
      {active === "log" && <LogTab userId={userId} />}
    </div>
  );
}
