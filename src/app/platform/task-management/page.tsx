import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { activePrismaWhere } from "@/lib/hr-analytics";
import {
  createTask,
  deleteTask,
  createSopDocument,
  deleteSopDocument,
  createWorkLogEntry,
  deleteWorkLogEntry,
} from "./actions";
import { TaskStatusSelect } from "./task-status-select";
import { SearchableSelect } from "./searchable-select";

export const dynamic = "force-dynamic";

const TABS = [
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

function fmtDate(d: Date) {
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
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

async function KanbanTab({
  users,
  teams,
  defaultTeamId,
}: {
  users: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  defaultTeamId: string;
}) {
  const tasks = await prisma.task.findMany({
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: { assignee: { select: { name: true } }, team: { select: { name: true } } },
  });
  const columns = STATUS_COLUMNS.map((status) => ({ status, items: tasks.filter((t) => t.status === status) }));

  return (
    <div className="flex flex-col gap-4">
      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-brand-green-dark">+ 새 업무 추가</summary>
        <form action={createTask} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            name="title"
            placeholder="제목"
            required
            className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />
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
          <input type="date" name="dueDate" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <button
            type="submit"
            className="rounded bg-brand-green px-3 py-2 text-sm font-medium text-white hover:bg-brand-green-dark sm:col-span-2"
          >
            추가
          </button>
        </form>
      </details>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {columns.map((col) => (
          <div key={col.status} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">
              {STATUS_LABEL[col.status]} <span className="text-slate-400">({col.items.length})</span>
            </p>
            {col.items.map((t) => (
              <div key={t.id} className="rounded border border-slate-200 bg-white p-3 text-sm shadow-sm">
                <p className="font-medium text-slate-800">{t.title}</p>
                {t.description && <p className="mt-1 text-xs text-slate-500">{t.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  {t.assignee && (
                    <span className="rounded-full bg-brand-green-light px-2 py-0.5 text-brand-green-dark">
                      {t.assignee.name}
                    </span>
                  )}
                  {t.team && <span className="rounded-full bg-slate-100 px-2 py-0.5">{t.team.name}</span>}
                  {t.dueDate && <span>~{fmtDate(t.dueDate)}</span>}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <TaskStatusSelect taskId={t.id} status={t.status} />
                  <form action={deleteTask.bind(null, t.id)}>
                    <button type="submit" className="text-xs text-red-500 hover:underline">
                      삭제
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {col.items.length === 0 && <p className="text-xs text-slate-400">없음</p>}
          </div>
        ))}
      </div>
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
                          className={`truncate rounded px-1 py-0.5 text-[11px] ${
                            t.status === "DONE"
                              ? "bg-slate-100 text-slate-400 line-through"
                              : "bg-brand-green-light text-brand-green-dark"
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
        <div className="flex flex-col gap-1.5">
          {open.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">{t.title}</span>
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
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  if (!(await checkModuleAccess("TASK_MANAGEMENT"))) {
    return <NoModuleAccess title="업무 관리" />;
  }

  const session = await auth();
  const userId = session!.user.id;
  const { tab, month } = await searchParams;
  const active: TabKey = TABS.find((t) => t.key === tab)?.key ?? "kanban";

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
        <p className="mt-1 text-slate-600">팀/개인 업무를 칸반·일정·To-do·SOP·업무일지로 관리합니다.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <TabLink key={t.key} tab={t} active={t.key === active} />
        ))}
      </div>

      {active === "kanban" && <KanbanTab users={users} teams={teams} defaultTeamId={me?.teamId ?? ""} />}
      {active === "calendar" && <CalendarTab month={month} />}
      {active === "todo" && <TodoTab userId={userId} />}
      {active === "sop" && <SopTab />}
      {active === "log" && <LogTab userId={userId} />}
    </div>
  );
}
