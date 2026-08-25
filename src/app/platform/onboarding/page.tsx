import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess, POSITION_LABEL, type Position } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { SearchableSelect } from "@/components/searchable-select";
import { ActionForm } from "@/components/action-form";
import { SelectAllToggle } from "./select-all-toggle";
import { activePrismaWhere } from "@/lib/hr-analytics";
import {
  BOOKING_STATUS_BADGE_CLASS,
  BOOKING_STATUS_LABEL,
  formatSessionDay,
  formatSessionStart,
  formatSessionTimeRange,
  isActiveInstructor,
  kstDayKey,
  toKSTInputValues,
  type BookingStatus,
} from "@/lib/onboarding";
import {
  addTrainee,
  addTraineesBulk,
  assignInstructor,
  bookSession,
  cancelMyBooking,
  createProgram,
  createSession,
  deleteBooking,
  deleteProgram,
  deleteSession,
  removeInstructor,
  removeTrainee,
  setBookingStatus,
  setSessionAudience,
  toggleInstructorActive,
  toggleProgramActive,
  updateSession,
} from "./actions";
import { ProgramPeriodFields } from "./program-period-fields";
import { FinalScheduleSection, finalHref } from "./final-schedule";
import {
  EmptyBox,
  INPUT_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  WEEKDAY_LABEL,
  monthCells,
  monthKeyOf,
  nextMonthOf,
  parseMonthKey,
  prevMonthOf,
  programPeriod,
} from "./ui";

export const dynamic = "force-dynamic";

// 확정된 결과([최종 스케줄])를 맨 앞에 둔다 — 이 화면을 가장 자주 여는 사람은
// 기수를 만드는 관리자가 아니라 "내가 언제 뭘 듣는지"만 확인하면 되는
// 교육생이기 때문. 뒤쪽은 만드는 순서(일정 관리 → 강사 지정 → 조율)대로다.
// [온보딩 일정]은 강사가 시간대를 잡고 예약을 조율하는 화면이라 staff(관리자
// 또는 강사)에게만 보인다 — 교육생에게는 "강사 모집 중 (0/1)"이나 남의 신청·
// 반려 사유가 보일 이유가 없다. 그래서 교육생 눈에는 [최종 스케줄] 하나만
// 남는다.
const TABS = [
  { key: "final", label: "최종 스케줄", role: "all" },
  { key: "manage", label: "일정 관리", role: "admin" },
  { key: "instructors", label: "강사 지정", role: "admin" },
  { key: "schedule", label: "온보딩 일정", role: "staff" },
  { key: "my", label: "내 강의 일정", role: "instructor" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type BookingRow = {
  id: string;
  status: string;
  note: string | null;
  adminNote: string | null;
  user: { id: string; name: string; team: { name: string } | null };
};

type SessionRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  requiredInstructors: number;
  createdById: string | null;
  createdBy: { name: string } | null;
  bookings: BookingRow[];
};

const STATUS_ORDER: Record<string, number> = { CONFIRMED: 0, REQUESTED: 1, DECLINED: 2 };

function sortBookings(bookings: BookingRow[]): BookingRow[] {
  return [...bookings].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

function StatusBadge({ status }: { status: string }) {
  const key = status as BookingStatus;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BOOKING_STATUS_BADGE_CLASS[key]}`}>
      {BOOKING_STATUS_LABEL[key]}
    </span>
  );
}

function TabLink({ tab, active, programId }: { tab: (typeof TABS)[number]; active: boolean; programId?: string }) {
  const query = programId ? `&programId=${programId}` : "";
  return (
    <Link
      href={`/platform/onboarding?tab=${tab.key}${query}`}
      className={`rounded px-3 py-1.5 text-sm font-medium ${
        active ? "bg-brand-green text-white" : "bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      {tab.label}
    </Link>
  );
}

/* ------------------------------------------------------------- 온보딩 일정 */

function SessionCard({
  session,
  viewerId,
  isAdmin,
  amInstructor,
  now,
}: {
  session: SessionRow;
  viewerId: string;
  isAdmin: boolean;
  amInstructor: boolean;
  now: Date;
}) {
  const bookings = sortBookings(session.bookings);
  const confirmed = bookings.filter((b) => b.status === "CONFIRMED");
  const myBooking = bookings.find((b) => b.user.id === viewerId);
  const full = confirmed.length >= session.requiredInstructors;
  const past = session.endAt <= now;

  return (
    <div className={`rounded-lg border border-slate-200 p-4 ${past ? "bg-slate-50" : "bg-white"}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`text-base font-semibold ${past ? "text-slate-500" : "text-slate-800"}`}>{session.title}</h3>
          {past ? (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              종료
            </span>
          ) : (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                full ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {full ? "강사 확정" : `강사 모집 중 (${confirmed.length}/${session.requiredInstructors})`}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {formatSessionTimeRange(session.startAt, session.endAt)}
          {session.location && <span className="ml-2 text-slate-400">· {session.location}</span>}
        </p>
        {session.description && <p className="mt-1 text-xs text-slate-500">{session.description}</p>}
        {session.createdBy && (
          <p className="mt-1 text-[11px] text-slate-400">등록: {session.createdBy.name}</p>
        )}
      </div>

      {(isAdmin || session.createdById === viewerId) && (
        <ActionForm action={deleteSession.bind(null, session.id)} className="mt-2"
          successMessage="시간대를 삭제했습니다."
          confirmMessage="이 시간대를 삭제하면 여기에 걸린 강사 예약도 함께 사라집니다. 삭제할까요?">
          <button type="submit" className="text-xs text-red-500 hover:underline">
            이 시간대 삭제
          </button>
        </ActionForm>
      )}

      <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-100 pt-3">
        {bookings.length === 0 && <p className="text-xs text-slate-400">아직 예약한 강사가 없습니다.</p>}
        {bookings.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge status={b.status} />
            <span className="font-medium text-slate-700">{b.user.name}</span>
            {b.user.team && <span className="text-slate-400">{b.user.team.name}</span>}
            {b.note && <span className="text-slate-500">— {b.note}</span>}
            {b.adminNote && <span className="text-slate-400">(관리자: {b.adminNote})</span>}
            {isAdmin && (
              <span className="ml-auto flex items-center gap-2">
                {b.status !== "CONFIRMED" && (
                  <ActionForm action={setBookingStatus.bind(null, b.id, "CONFIRMED")} successMessage="강사를 확정했습니다.">
                    <button type="submit" className="text-emerald-600 hover:underline">
                      확정
                    </button>
                  </ActionForm>
                )}
                {b.status !== "DECLINED" && (
                  <ActionForm action={setBookingStatus.bind(null, b.id, "DECLINED")} className="flex items-center gap-1" successMessage="신청을 반려했습니다.">
                    <input
                      name="adminNote"
                      placeholder="반려 사유"
                      className="w-28 rounded border border-slate-200 px-1.5 py-0.5 text-[11px]"
                    />
                    <button type="submit" className="text-amber-600 hover:underline">
                      반려
                    </button>
                  </ActionForm>
                )}
                <ActionForm action={deleteBooking.bind(null, b.id)} successMessage="예약을 삭제했습니다." confirmMessage="이 예약을 삭제할까요?">
                  <button type="submit" className="text-red-500 hover:underline">
                    삭제
                  </button>
                </ActionForm>
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 정원이 다 찬 교육에 예약 버튼을 남겨 두면 눌러 봐야 거절된다 —
          서버에서도 막지만 화면에서 먼저 이유를 알려 준다. */}
      {amInstructor && !myBooking && !past && full && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          필요한 강사 {session.requiredInstructors}명이 모두 확정되어 더 예약할 수 없습니다.
        </p>
      )}
      {amInstructor && !(past && !myBooking) && !(full && !myBooking && !past) && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {myBooking ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-600">
                내 예약 상태: <strong>{BOOKING_STATUS_LABEL[myBooking.status as BookingStatus]}</strong>
              </span>
              {!past && (
                <ActionForm action={cancelMyBooking.bind(null, myBooking.id)} successMessage="예약을 취소했습니다." confirmMessage="이 강의 예약을 취소할까요?">
                  <button type="submit" className="text-red-500 hover:underline">
                    예약 취소
                  </button>
                </ActionForm>
              )}
            </div>
          ) : (
            <ActionForm action={bookSession.bind(null, session.id)} className="flex flex-wrap items-center gap-2" successMessage="예약을 신청했습니다. 관리자 확정을 기다려 주세요.">
              <input
                name="note"
                placeholder="전달사항 (선택) — 예: 오전만 가능"
                className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs"
              />
              <button
                type="submit"
                className="shrink-0 rounded bg-brand-green px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-green-dark"
              >
                이 시간에 예약
              </button>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}


type ScheduleView = "calendar" | "list";

function scheduleHref(opts: {
  programId: string | null;
  view: ScheduleView;
  month?: string;
  date?: string | null;
}) {
  const params = new URLSearchParams({ tab: "schedule" });
  if (opts.programId) params.set("programId", opts.programId);
  if (opts.view !== "calendar") params.set("view", opts.view);
  if (opts.month) params.set("month", opts.month);
  if (opts.date) params.set("date", opts.date);
  return `/platform/onboarding?${params.toString()}`;
}

/** 달력 셀 안의 시간대 칩 색 — 종료 / 강사 확정 / 모집 중. */
function sessionTone(session: SessionRow, now: Date) {
  if (session.endAt <= now) return "border-slate-300 bg-slate-100 text-slate-400";
  const confirmed = session.bookings.filter((b) => b.status === "CONFIRMED").length;
  return confirmed >= session.requiredInstructors
    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
    : "border-amber-400 bg-amber-50 text-amber-700";
}

function CalendarGrid({
  year,
  monthIdx,
  byDay,
  selectedKey,
  todayKey,
  programId,
  now,
}: {
  year: number;
  monthIdx: number;
  byDay: Map<string, SessionRow[]>;
  selectedKey: string | null;
  todayKey: string;
  programId: string | null;
  now: Date;
}) {
  const cells = monthCells(year, monthIdx);

  return (
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
          if (day === null) return <div key={i} className="min-h-[92px] bg-slate-50" />;

          const key = `${monthKeyOf(year, monthIdx)}-${String(day).padStart(2, "0")}`;
          const daySessions = byDay.get(key) ?? [];
          const selected = key === selectedKey;

          return (
            <Link
              key={i}
              href={scheduleHref({ programId, view: "calendar", month: monthKeyOf(year, monthIdx), date: key })}
              className={`flex min-h-[92px] flex-col gap-0.5 p-1.5 text-left transition-colors ${
                selected ? "bg-brand-green-light ring-1 ring-inset ring-brand-green" : "bg-white hover:bg-slate-50"
              }`}
            >
              <span
                className={`mb-0.5 text-xs font-medium ${
                  key === todayKey
                    ? "flex h-5 w-5 items-center justify-center rounded-full bg-brand-green text-white"
                    : "text-slate-500"
                }`}
              >
                {day}
              </span>
              {daySessions.slice(0, 3).map((s) => (
                <span
                  key={s.id}
                  title={`${formatSessionTimeRange(s.startAt, s.endAt)} ${s.title}`}
                  className={`truncate rounded border-l-2 px-1 py-0.5 text-[11px] ${sessionTone(s, now)}`}
                >
                  {formatSessionStart(s.startAt)} {s.title}
                </span>
              ))}
              {daySessions.length > 3 && (
                <span className="text-[11px] text-slate-400">+{daySessions.length - 3}개 더</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 달력에서 고른 날짜에 교육일정을 바로 등록하는 폼. 강사가 직접 자기
 * 시간대를 잡을 수 있어야 해서 관리자 전용 화면이 아니라 여기에 둔다 —
 * 강사가 등록하면 본인 예약(신청)이 함께 걸리고, 등록된 시간대는 지정된
 * 강사 전원의 달력에 바로 나타난다.
 */
function AddSessionForm({
  programId,
  dateKey,
  isAdmin,
  amInstructor,
  past,
  openByDefault = false,
}: {
  programId: string;
  dateKey: string;
  isAdmin: boolean;
  amInstructor: boolean;
  past: boolean;
  openByDefault?: boolean;
}) {
  if (past) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-xs text-slate-400">
        지난 날짜에는 교육일정을 추가할 수 없습니다.
      </p>
    );
  }

  return (
    <details open={openByDefault} className="rounded-lg border border-dashed border-brand-green bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-brand-green-dark">
        + 이 날짜에 교육일정 추가
      </summary>
      <ActionForm action={createSession} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4" successMessage="교육일정을 추가했습니다.">
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="date" value={dateKey} />
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>과정명</label>
          <input name="title" required placeholder="예: 회사 소개 · 인사제도 안내" className={INPUT_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>시작 시간</label>
          <input type="time" name="startTime" required defaultValue="09:00" className={INPUT_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>종료 시간</label>
          <input type="time" name="endTime" required defaultValue="11:00" className={INPUT_CLASS} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>장소 (선택)</label>
          <input name="location" placeholder="예: 본사 3층 대회의실" className={INPUT_CLASS} />
        </div>
        <div className={isAdmin ? "" : "sm:col-span-2"}>
          <label className={LABEL_CLASS}>설명 (선택)</label>
          <input name="description" placeholder="교육 내용 요약" className={INPUT_CLASS} />
        </div>
        {isAdmin && (
          <div>
            <label className={LABEL_CLASS}>필요 강사 수</label>
            <input type="number" name="requiredInstructors" min={1} defaultValue={1} className={INPUT_CLASS} />
          </div>
        )}
        {amInstructor && (
          <div className="sm:col-span-4">
            <label className={LABEL_CLASS}>전달사항 (선택)</label>
            <input name="note" placeholder="예: 실습 자료 필요" className={INPUT_CLASS} />
          </div>
        )}
        <div className="sm:col-span-4 flex flex-wrap items-center gap-3">
          <button type="submit" className={PRIMARY_BUTTON_CLASS}>
            교육일정 추가
          </button>
          <span className="text-xs text-slate-500">
            {amInstructor
              ? "추가하면 이 시간대에 내 예약(신청)이 함께 등록됩니다."
              : "빈 시간대로 등록되어 강사가 예약할 수 있습니다."}
          </span>
        </div>
      </ActionForm>
    </details>
  );
}

async function ScheduleSection({
  programId,
  viewerId,
  isAdmin,
  amInstructor,
  view,
  month,
  date,
  programStart,
}: {
  programId: string | null;
  viewerId: string;
  isAdmin: boolean;
  amInstructor: boolean;
  view: ScheduleView;
  month?: string;
  date?: string;
  programStart: Date | null;
}) {
  if (!programId) {
    return (
      <EmptyBox>등록된 온보딩 프로그램이 없습니다. 관리자가 [일정 관리]에서 프로그램을 먼저 만들어 주세요.</EmptyBox>
    );
  }

  const sessions = (await prisma.onboardingSession.findMany({
    where: { programId },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      startAt: true,
      endAt: true,
      requiredInstructors: true,
      createdById: true,
      createdBy: { select: { name: true } },
      bookings: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          note: true,
          adminNote: true,
          user: { select: { id: true, name: true, team: { select: { name: true } } } },
        },
      },
    },
  })) as SessionRow[];

  // 지난 일정은 카드에서 "종료"로 표시하고 예약 버튼을 감춘다 — 한 번
  // 지나간 시간대에 새로 예약이 들어오면 강사도 관리자도 혼란스럽다.
  const now = new Date();
  const todayKey = kstDayKey(now);

  // 같은 날짜끼리 묶는다 — 달력은 이 날짜별 묶음을 셀에 뿌리고, 강사는
  // "내가 되는 날"을 고른 뒤 그 안에서 시간대를 선택해 예약한다.
  const byDay = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const key = kstDayKey(s.startAt);
    const list = byDay.get(key) ?? [];
    list.push(s);
    byDay.set(key, list);
  }

  // 기본으로 펼칠 달: 앞으로 열리는 첫 일정이 있는 달. 프로그램이 다음 달
  // 일정만 갖고 있는데 이번 달 빈 달력을 띄우면 아무것도 못 본다.
  // 아직 일정이 하나도 없으면(프로그램을 막 만든 직후) 프로그램 시작월을,
  // 그것도 없으면 이번 달을 펼친다 — 여기서 첫 일정을 추가하게 되므로 달력은
  // 항상 그려야 한다.
  const upcoming = sessions.find((s) => s.endAt > now) ?? sessions[sessions.length - 1];
  const fallbackMonth = upcoming
    ? kstDayKey(upcoming.startAt).slice(0, 7)
    : (programStart ? kstDayKey(programStart) : todayKey).slice(0, 7);
  const { year, monthIdx } = parseMonthKey(month ?? date?.slice(0, 7), fallbackMonth);
  const currentMonthKey = monthKeyOf(year, monthIdx);

  const monthDayKeys = [...byDay.keys()].filter((k) => k.startsWith(currentMonthKey)).sort();
  // 손으로 고친 URL로 month와 date가 서로 다른 달을 가리킬 수 있다 — 그럴
  // 땐 date를 버려서 달력과 아래 시간대 목록이 항상 같은 달을 가리키게 한다.
  // 일정이 없는 달이어도 날짜 하나는 고른 상태로 둔다(그래야 추가 폼이 뜬다).
  const selectedKey =
    (date?.startsWith(currentMonthKey) ? date : null) ??
    monthDayKeys.find((k) => k >= todayKey) ??
    monthDayKeys[0] ??
    (todayKey.startsWith(currentMonthKey) ? todayKey : `${currentMonthKey}-01`);
  const selectedSessions = byDay.get(selectedKey) ?? [];

  const prev = prevMonthOf(year, monthIdx);
  const next = nextMonthOf(year, monthIdx);
  const navLinkClass = "rounded border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-100";

  return (
    <div className="flex flex-col gap-4">
      {!amInstructor && !isAdmin && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          예약은 관리자가 지정한 온보딩 강사만 할 수 있습니다. 일정은 열람만 가능합니다.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {view === "calendar" ? (
          <div className="flex items-center gap-2">
            <Link
              href={scheduleHref({ programId, view, month: monthKeyOf(prev.year, prev.monthIdx) })}
              className={navLinkClass}
            >
              ‹
            </Link>
            <p className="w-28 text-center text-lg font-semibold text-slate-800">
              {year}년 {monthIdx + 1}월
            </p>
            <Link
              href={scheduleHref({ programId, view, month: monthKeyOf(next.year, next.monthIdx) })}
              className={navLinkClass}
            >
              ›
            </Link>
            <Link
              href={scheduleHref({ programId, view, month: todayKey.slice(0, 7), date: todayKey })}
              className="ml-1 rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
            >
              오늘
            </Link>
          </div>
        ) : (
          <p className="text-sm text-slate-500">전체 {sessions.length}개 시간대</p>
        )}

        <div className="flex gap-1 rounded bg-slate-100 p-0.5">
          {(["calendar", "list"] as const).map((v) => (
            <Link
              key={v}
              href={scheduleHref({ programId, view: v, month: currentMonthKey, date: selectedKey })}
              className={`rounded px-3 py-1 text-xs font-medium ${
                v === view ? "bg-white text-brand-green-dark shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {v === "calendar" ? "달력" : "목록"}
            </Link>
          ))}
        </div>
      </div>

      {view === "calendar" ? (
        <>
          <CalendarGrid
            year={year}
            monthIdx={monthIdx}
            byDay={byDay}
            selectedKey={selectedKey}
            todayKey={todayKey}
            programId={programId}
            now={now}
          />

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-lg font-semibold text-slate-800">
                {formatSessionDay(new Date(`${selectedKey}T00:00:00+09:00`))}
              </h2>
              <span className="text-sm text-slate-500">
                {selectedSessions.length > 0
                  ? `시간대 ${selectedSessions.length}개 — 아래에서 선택해 예약하세요`
                  : "등록된 시간대 없음"}
              </span>
            </div>

            {selectedSessions.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-4 text-center text-sm text-slate-500">
                이 날짜에는 아직 교육일정이 없습니다.
                {(amInstructor || isAdmin) && " 아래에서 추가하거나, 달력에서 다른 날짜를 선택하세요."}
              </p>
            )}

            {selectedSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                viewerId={viewerId}
                isAdmin={isAdmin}
                amInstructor={amInstructor}
                now={now}
              />
            ))}

            {(amInstructor || isAdmin) && (
              <AddSessionForm
                programId={programId}
                dateKey={selectedKey}
                isAdmin={isAdmin}
                amInstructor={amInstructor}
                past={new Date(`${selectedKey}T23:59:59+09:00`) <= now}
                openByDefault={sessions.length === 0}
              />
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-5">
          {sessions.length === 0 && (
            <EmptyBox>
              이 프로그램에 등록된 교육일정이 없습니다. [달력]에서 날짜를 눌러 추가하세요.
            </EmptyBox>
          )}
          {[...byDay.entries()].map(([key, list]) => (
            <div key={key} className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-slate-500">{formatSessionDay(list[0].startAt)}</p>
              {list.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  viewerId={viewerId}
                  isAdmin={isAdmin}
                  amInstructor={amInstructor}
                  now={now}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ 내 강의 일정 */

async function MyBookingsSection({ viewerId }: { viewerId: string }) {
  const bookings = await prisma.onboardingBooking.findMany({
    where: { userId: viewerId },
    orderBy: { session: { startAt: "asc" } },
    select: {
      id: true,
      status: true,
      note: true,
      adminNote: true,
      session: {
        select: {
          title: true,
          location: true,
          startAt: true,
          endAt: true,
          program: { select: { name: true } },
        },
      },
    },
  });

  if (bookings.length === 0) {
    return <EmptyBox>예약한 강의가 없습니다. [온보딩 일정]에서 가능한 시간을 선택해 예약해 주세요.</EmptyBox>;
  }

  const now = new Date();

  // 다가올 강의를 위로. 시간순으로만 쌓으면 지난 강의가 화면 위를 차지해,
  // 정작 챙겨야 할 다음 강의를 보려고 매번 스크롤해야 한다.
  const upcoming = bookings.filter((b) => b.session.endAt > now);
  const past = bookings.filter((b) => b.session.endAt <= now).reverse();
  const ordered = [...upcoming, ...past];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-600">
        다가올 강의 {upcoming.length}건 · 지난 강의 {past.length}건
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-3">일시</th>
            <th className="px-4 py-3">과정</th>
            <th className="px-4 py-3">장소</th>
            <th className="px-4 py-3">상태</th>
            <th className="px-4 py-3">비고</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {ordered.map((b) => (
            <tr key={b.id} className={`border-t border-slate-100 ${b.session.endAt <= now ? "bg-slate-50 text-slate-500" : ""}`}>
              <td className="px-4 py-3 whitespace-nowrap">
                <p>{formatSessionDay(b.session.startAt)}</p>
                <p className="text-xs text-slate-500">{formatSessionTimeRange(b.session.startAt, b.session.endAt)}</p>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">{b.session.title}</p>
                <p className="text-xs text-slate-400">{b.session.program.name}</p>
              </td>
              <td className="px-4 py-3 text-slate-600">{b.session.location ?? "-"}</td>
              <td className="px-4 py-3">
                <StatusBadge status={b.status} />
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {b.note ?? "-"}
                {b.adminNote && <span className="block text-slate-400">관리자: {b.adminNote}</span>}
              </td>
              <td className="px-4 py-3 text-right">
                {b.session.endAt > now ? (
                  <ActionForm action={cancelMyBooking.bind(null, b.id)} successMessage="예약을 취소했습니다." confirmMessage="이 강의 예약을 취소할까요?">
                    <button type="submit" className="text-xs text-red-500 hover:underline">
                      취소
                    </button>
                  </ActionForm>
                ) : (
                  <span className="text-xs text-slate-400">종료</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 강사 지정 */

async function InstructorsSection() {
  const [instructors, employees] = await Promise.all([
    prisma.onboardingInstructor.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        specialty: true,
        note: true,
        active: true,
        user: {
          select: {
            id: true,
            name: true,
            employeeNumber: true,
            position: true,
            team: { select: { name: true } },
            onboardingBookings: { where: { status: "CONFIRMED" }, select: { id: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: activePrismaWhere(),
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeNumber: true, team: { select: { name: true } } },
    }),
  ]);

  const assigned = new Set(instructors.map((i) => i.user.id));
  const options = employees
    .filter((e) => !assigned.has(e.id))
    .map((e) => ({
      value: e.id,
      label: e.name,
      sublabel: e.team?.name ?? e.employeeNumber,
    }));

  return (
    <div className="flex flex-col gap-6">
      <ActionForm action={assignInstructor} className="rounded-lg border border-slate-200 bg-white p-5" successMessage="강사로 지정했습니다.">
        <h2 className="text-lg font-semibold text-slate-800">강사 지정</h2>
        <p className="mt-1 text-sm text-slate-600">
          한국삼공 재직 직원 중에서 온보딩 강사를 지정합니다. 지정된 사람만 온보딩 일정에서 예약할 수 있습니다.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL_CLASS}>직원</label>
            <SearchableSelect name="userId" options={options} placeholder="이름 검색..." emptyLabel="선택 안 함" />
          </div>
          <div>
            <label className={LABEL_CLASS}>담당 분야 (선택)</label>
            <input name="specialty" placeholder="예: 안전보건 · 영업 프로세스" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>비고 (선택)</label>
            <input name="note" placeholder="예: 오전 강의만 가능" className={INPUT_CLASS} />
          </div>
        </div>
        <button type="submit" className={`mt-4 ${PRIMARY_BUTTON_CLASS}`}>
          강사로 지정
        </button>
      </ActionForm>

      {instructors.length === 0 ? (
        <EmptyBox>지정된 강사가 없습니다.</EmptyBox>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">소속 · 직책</th>
                <th className="px-4 py-3">담당 분야</th>
                <th className="px-4 py-3">비고</th>
                <th className="px-4 py-3">확정 강의</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {instructors.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">{i.user.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {i.user.team?.name ?? "-"}
                    <span className="ml-1 text-xs text-slate-400">{POSITION_LABEL[i.user.position as Position]}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{i.specialty ?? "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{i.note ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{i.user.onboardingBookings.length}건</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        i.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {i.active ? "활성" : "해제됨"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3 text-xs">
                      <ActionForm action={toggleInstructorActive.bind(null, i.id)} successMessage="강사 상태를 변경했습니다.">
                        <button type="submit" className="text-slate-600 hover:underline">
                          {i.active ? "지정 해제" : "다시 지정"}
                        </button>
                      </ActionForm>
                      <ActionForm action={removeInstructor.bind(null, i.id)} successMessage="강사를 삭제했습니다." confirmMessage="이 강사를 명단에서 완전히 삭제할까요?">
                        <button type="submit" className="text-red-500 hover:underline">
                          삭제
                        </button>
                      </ActionForm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- 일정 관리 */

async function ManageSection({ programId }: { programId: string | null }) {
  const programs = await prisma.onboardingProgram.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      startDate: true,
      endDate: true,
      active: true,
      _count: { select: { sessions: true } },
    },
  });

  const sessions = programId
    ? await prisma.onboardingSession.findMany({
        where: { programId },
        orderBy: { startAt: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          location: true,
          startAt: true,
          endAt: true,
          requiredInstructors: true,
          attendees: { select: { traineeId: true } },
          _count: { select: { bookings: true } },
        },
      })
    : [];

  // 교육생 명단 — 기수를 고르기 전에는 붙일 곳이 없으므로 건너뛴다.
  const [trainees, employees] = programId
    ? await Promise.all([
        prisma.onboardingTrainee.findMany({
          where: { programId },
          orderBy: { user: { name: "asc" } },
          select: {
            id: true,
            note: true,
            user: {
              select: { id: true, name: true, employeeNumber: true, team: { select: { name: true } } },
            },
          },
        }),
        prisma.user.findMany({
          where: activePrismaWhere(),
          orderBy: { name: "asc" },
          select: { id: true, name: true, employeeNumber: true, team: { select: { name: true } } },
        }),
      ])
    : [[], []];

  const enrolled = new Set(trainees.map((t) => t.user.id));
  const traineeOptions = employees
    .filter((e) => !enrolled.has(e.id))
    .map((e) => ({ value: e.id, label: e.name, sublabel: e.team?.name ?? e.employeeNumber }));

  return (
    <div className="flex flex-col gap-6">
      <ActionForm action={createProgram} className="rounded-lg border border-slate-200 bg-white p-5" successMessage="프로그램을 등록했습니다.">
        <h2 className="text-lg font-semibold text-slate-800">온보딩 프로그램 등록</h2>
        <p className="mt-1 text-sm text-slate-600">기수 단위로 프로그램을 만든 뒤, 그 안에 교육 일정을 추가합니다.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>프로그램명</label>
            <input name="name" required placeholder="예: 2026년 상반기 신입 온보딩" className={INPUT_CLASS} />
          </div>
          <ProgramPeriodFields inputClassName={INPUT_CLASS} labelClassName={LABEL_CLASS} />
          <div className="sm:col-span-4">
            <label className={LABEL_CLASS}>설명 (선택)</label>
            <input name="description" placeholder="대상·목적 등" className={INPUT_CLASS} />
          </div>
        </div>
        <button type="submit" className={`mt-4 ${PRIMARY_BUTTON_CLASS}`}>
          프로그램 등록
        </button>
      </ActionForm>

      {programs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">프로그램</th>
                <th className="px-4 py-3">기간</th>
                <th className="px-4 py-3">일정 수</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/onboarding?tab=manage&programId=${p.id}`}
                      className={`font-medium hover:underline ${
                        p.id === programId ? "text-brand-green-dark" : "text-slate-800"
                      }`}
                    >
                      {p.name}
                    </Link>
                    {p.description && <p className="text-xs text-slate-400">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{programPeriod(p) || "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{p._count.sessions}건</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        p.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {p.active ? "진행" : "종료"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3 text-xs">
                      <ActionForm action={toggleProgramActive.bind(null, p.id)} successMessage="프로그램 상태를 변경했습니다.">
                        <button type="submit" className="text-slate-600 hover:underline">
                          {p.active ? "종료 처리" : "다시 진행"}
                        </button>
                      </ActionForm>
                      <ActionForm action={deleteProgram.bind(null, p.id)} successMessage="프로그램을 삭제했습니다."
                        confirmMessage="이 기수를 삭제하면 소속된 교육 일정·강사 예약·교육생 명단이 모두 함께 삭제되며 되돌릴 수 없습니다. 삭제할까요?">
                        <button type="submit" className="text-red-500 hover:underline">
                          삭제
                        </button>
                      </ActionForm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800">교육 일정 추가</h2>
        <p className="mt-1 text-sm text-slate-600">
          교육 일정은 <strong>[온보딩 일정]</strong> 탭의 달력에서 날짜를 눌러 추가합니다. 지정된 강사도 같은
          화면에서 본인이 맡을 시간대를 직접 등록할 수 있습니다.
        </p>
        <Link
          href={scheduleHref({ programId, view: "calendar" })}
          className={`mt-4 inline-block ${PRIMARY_BUTTON_CLASS}`}
        >
          달력에서 추가하기
        </Link>
      </div>

      {programId && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-800">교육생 명단</h2>
          <p className="mt-1 text-sm text-slate-600">
            이 기수에 참석하는 교육생입니다. 명단에 오른 사람은 [최종 스케줄]에서 본인이 들어야 할 교육을 확인할 수
            있습니다.
          </p>
          <ActionForm action={addTrainee} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3" successMessage="교육생을 등록했습니다.">
            <input type="hidden" name="programId" value={programId} />
            <div>
              <label className={LABEL_CLASS}>직원</label>
              <SearchableSelect
                name="userId"
                options={traineeOptions}
                placeholder="이름 검색..."
                emptyLabel="선택 안 함"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>비고 (선택)</label>
              <input name="note" placeholder="예: 중도 합류" className={INPUT_CLASS} />
            </div>
            <div className="flex items-end">
              <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                교육생 등록
              </button>
            </div>
          </ActionForm>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-brand-green-dark">여러 명 한 번에 등록</summary>
            <ActionForm
              action={addTraineesBulk}
              className="mt-2"
              successMessage="교육생을 일괄 등록했습니다."
            >
              <input type="hidden" name="programId" value={programId} />
              <textarea
                name="entries"
                rows={4}
                placeholder={"사번 또는 이름을 한 줄에 하나씩 붙여넣으세요.\n예)\n20260101\n20260102\n홍길동"}
                className={`${INPUT_CLASS} font-mono`}
              />
              <p className="mt-1 text-xs text-slate-500">
                이미 명단에 있는 사람은 건너뜁니다. 이름이 겹치는 경우에는 사번으로 넣어 주세요.
              </p>
              <button type="submit" className={`mt-2 ${PRIMARY_BUTTON_CLASS}`}>
                일괄 등록
              </button>
            </ActionForm>
          </details>

          {trainees.length === 0 ? (
            <p className="mt-4 rounded border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              등록된 교육생이 없습니다.
            </p>
          ) : (
            <ul className="mt-4 flex flex-wrap gap-2">
              {trainees.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-2 text-xs"
                >
                  <span className="font-medium text-slate-700">{t.user.name}</span>
                  <span className="text-slate-400">{t.user.team?.name ?? t.user.employeeNumber}</span>
                  {t.note && <span className="text-slate-400">· {t.note}</span>}
                  <ActionForm action={removeTrainee.bind(null, t.id)} successMessage="교육생을 명단에서 제외했습니다." confirmMessage="이 교육생을 명단에서 제외할까요?">
                    <button type="submit" className="text-red-500 hover:underline" aria-label={`${t.user.name} 명단에서 제거`}>
                      ×
                    </button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-slate-800">등록된 일정</h2>
        {sessions.length === 0 ? (
          <EmptyBox>선택한 프로그램에 등록된 일정이 없습니다.</EmptyBox>
        ) : (
          sessions.map((s) => {
            const start = toKSTInputValues(s.startAt);
            const end = toKSTInputValues(s.endAt);
            return (
              <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-800">{s.title}</p>
                    <p className="text-xs text-slate-500">
                      {formatSessionDay(s.startAt)} {formatSessionTimeRange(s.startAt, s.endAt)}
                      {s.location && ` · ${s.location}`} · 필요 강사 {s.requiredInstructors}명 · 예약{" "}
                      {s._count.bookings}건 ·{" "}
                      {s.attendees.length === 0 ? "교육생 전원" : `교육생 ${s.attendees.length}명 지정`}
                    </p>
                  </div>
                  <ActionForm action={deleteSession.bind(null, s.id)} successMessage="일정을 삭제했습니다."
                    confirmMessage="이 일정을 삭제하면 여기에 걸린 강사 예약도 함께 사라집니다. 삭제할까요?">
                    <button type="submit" className="text-xs text-red-500 hover:underline">
                      삭제
                    </button>
                  </ActionForm>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-brand-green-dark">일정 수정</summary>
                  <ActionForm action={updateSession.bind(null, s.id)} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4" successMessage="일정을 저장했습니다.">
                    <div className="sm:col-span-2">
                      <label className={LABEL_CLASS}>과정명</label>
                      <input name="title" required defaultValue={s.title} className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>날짜</label>
                      <input type="date" name="date" required defaultValue={start.date} className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>필요 강사 수</label>
                      <input
                        type="number"
                        name="requiredInstructors"
                        min={1}
                        defaultValue={s.requiredInstructors}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>시작 시간</label>
                      <input type="time" name="startTime" required defaultValue={start.time} className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>종료 시간</label>
                      <input type="time" name="endTime" required defaultValue={end.time} className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>장소</label>
                      <input name="location" defaultValue={s.location ?? ""} className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>설명</label>
                      <input name="description" defaultValue={s.description ?? ""} className={INPUT_CLASS} />
                    </div>
                    <div className="sm:col-span-4">
                      <button
                        type="submit"
                        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                      >
                        저장
                      </button>
                    </div>
                  </ActionForm>
                </details>
                {trainees.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-brand-green-dark">참석 대상 지정</summary>
                    <ActionForm action={setSessionAudience.bind(null, s.id)} className="mt-3" successMessage="참석 대상을 저장했습니다.">
                      <p className="text-xs text-slate-500">
                        아무도 체크하지 않으면 기수 전원이 대상입니다. 일부만 듣는 교육일 때만 골라 주세요.
                      </p>
                      <SelectAllToggle groupId={`audience-${s.id}`} />
                      <div id={`audience-${s.id}`} className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                        {trainees.map((t) => (
                          <label key={t.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              name="traineeIds"
                              value={t.id}
                              defaultChecked={s.attendees.some((a) => a.traineeId === t.id)}
                            />
                            {t.user.name}
                          </label>
                        ))}
                      </div>
                      <button
                        type="submit"
                        className="mt-3 rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                      >
                        대상 저장
                      </button>
                    </ActionForm>
                  </details>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 페이지 */

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    programId?: string;
    view?: string;
    month?: string;
    date?: string;
    only?: string;
    sessionId?: string;
  }>;
}) {
  if (!(await checkModuleAccess("ONBOARDING"))) {
    return <NoModuleAccess title="온보딩 프로그램" />;
  }

  const session = await auth();
  const viewerId = session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";
  const amInstructor = await isActiveInstructor(viewerId);

  const {
    tab: tabParam,
    programId: programIdParam,
    view: viewParam,
    month: monthParam,
    date: dateParam,
    only: onlyParam,
    sessionId: sessionIdParam,
  } = await searchParams;
  const view: ScheduleView = viewParam === "list" ? "list" : "calendar";

  const visibleTabs = TABS.filter(
    (t) =>
      t.role === "all" ||
      (t.role === "admin" && isAdmin) ||
      (t.role === "instructor" && amInstructor) ||
      (t.role === "staff" && (isAdmin || amInstructor))
  );

  const programs = await prisma.onboardingProgram.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, active: true, startDate: true },
  });

  // 교육생이면 본인이 속한 기수를 먼저 연다 — 활성 기수가 둘 이상일 때
  // 남의 기수가 열려 있으면 "내 일정이 왜 없지" 하고 헤매게 된다.
  const myTraineeProgram = await prisma.onboardingTrainee.findFirst({
    where: { userId: viewerId },
    orderBy: { program: { createdAt: "desc" } },
    select: { programId: true },
  });

  // 평소에는 확정 시간표([최종 스케줄])로 들어온다 — 탭 순서상 맨 앞이기도 하고,
  // 대부분의 방문은 "언제 뭘 듣는지" 확인이 목적이다. 다만 기수가 아직 하나도
  // 없는 관리자는 거기서 할 수 있는 게 없으므로 [일정 관리]로 보낸다.
  const defaultTab: TabKey = isAdmin && programs.length === 0 ? "manage" : "final";
  const tab: TabKey = visibleTabs.some((t) => t.key === tabParam) ? (tabParam as TabKey) : defaultTab;
  const selectedProgram =
    programs.find((p) => p.id === programIdParam) ??
    programs.find((p) => p.id === myTraineeProgram?.programId) ??
    programs.find((p) => p.active) ??
    programs[0] ??
    null;
  const programId = selectedProgram?.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">SG 온보딩 프로그램</h1>
        <p className="mt-1 text-slate-600">
          관리자가 온보딩 기수와 강사를 지정하고, 지정된 강사는 달력에서 본인이 맡을 교육일정을 직접 등록·예약합니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleTabs.map((t) => (
          <TabLink key={t.key} tab={t} active={t.key === tab} programId={programId ?? undefined} />
        ))}
      </div>

      {(tab === "schedule" || tab === "manage" || tab === "final") && programs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">프로그램</span>
          {programs.map((p) => (
            <Link
              key={p.id}
              href={
                tab === "schedule"
                  ? scheduleHref({ programId: p.id, view })
                  : tab === "final"
                    ? finalHref({
                        programId: p.id,
                        view: viewParam === "list" ? "list" : "calendar",
                        onlyMine: onlyParam === "mine",
                      })
                    : `/platform/onboarding?tab=${tab}&programId=${p.id}`
              }
              className={`rounded-full border px-3 py-1 text-xs ${
                p.id === programId
                  ? "border-brand-green bg-brand-green-light text-brand-green-dark"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {p.name}
              {!p.active && <span className="ml-1 text-slate-400">(종료)</span>}
            </Link>
          ))}
        </div>
      )}

      {tab === "schedule" && (
        <ScheduleSection
          programId={programId}
          viewerId={viewerId}
          isAdmin={isAdmin}
          amInstructor={amInstructor}
          view={view}
          programStart={selectedProgram?.startDate ?? null}
          month={monthParam}
          date={dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined}
        />
      )}
      {tab === "final" && (
        <FinalScheduleSection
          programId={programId}
          viewerId={viewerId}
          onlyMine={onlyParam === "mine"}
          view={viewParam === "list" ? "list" : "calendar"}
          month={monthParam}
          sessionId={sessionIdParam}
        />
      )}
      {tab === "my" && <MyBookingsSection viewerId={viewerId} />}
      {tab === "instructors" && <InstructorsSection />}
      {tab === "manage" && <ManageSection programId={programId} />}
    </div>
  );
}
