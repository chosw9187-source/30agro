import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess, POSITION_LABEL, type Position } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { SearchableSelect } from "@/components/searchable-select";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { formatKSTDate } from "@/lib/format-kst";
import {
  BOOKING_STATUS_BADGE_CLASS,
  BOOKING_STATUS_LABEL,
  formatSessionDay,
  formatSessionTimeRange,
  isActiveInstructor,
  kstDayKey,
  toKSTInputValues,
  type BookingStatus,
} from "@/lib/onboarding";
import {
  assignInstructor,
  bookSession,
  cancelMyBooking,
  createProgram,
  createSession,
  deleteBooking,
  deleteProgram,
  deleteSession,
  removeInstructor,
  setBookingStatus,
  toggleInstructorActive,
  toggleProgramActive,
  updateSession,
} from "./actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "schedule", label: "온보딩 일정", role: "all" },
  { key: "my", label: "내 강의 일정", role: "instructor" },
  { key: "instructors", label: "강사 지정", role: "admin" },
  { key: "manage", label: "일정 관리", role: "admin" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const INPUT_CLASS = "w-full rounded border border-slate-300 px-3 py-2 text-sm";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-slate-600";
const PRIMARY_BUTTON_CLASS =
  "rounded bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark";

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

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function programPeriod(p: { startDate: Date | null; endDate: Date | null }) {
  if (!p.startDate && !p.endDate) return "";
  const fmt = (d: Date | null) => (d ? formatKSTDate(d, { year: "numeric", month: "2-digit", day: "2-digit" }) : "");
  return `${fmt(p.startDate)} ~ ${fmt(p.endDate)}`;
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
      </div>

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
                  <form action={setBookingStatus.bind(null, b.id, "CONFIRMED")}>
                    <button type="submit" className="text-emerald-600 hover:underline">
                      확정
                    </button>
                  </form>
                )}
                {b.status !== "DECLINED" && (
                  <form action={setBookingStatus.bind(null, b.id, "DECLINED")} className="flex items-center gap-1">
                    <input
                      name="adminNote"
                      placeholder="반려 사유"
                      className="w-28 rounded border border-slate-200 px-1.5 py-0.5 text-[11px]"
                    />
                    <button type="submit" className="text-amber-600 hover:underline">
                      반려
                    </button>
                  </form>
                )}
                <form action={deleteBooking.bind(null, b.id)}>
                  <button type="submit" className="text-red-500 hover:underline">
                    삭제
                  </button>
                </form>
              </span>
            )}
          </div>
        ))}
      </div>

      {amInstructor && !(past && !myBooking) && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {myBooking ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-600">
                내 예약 상태: <strong>{BOOKING_STATUS_LABEL[myBooking.status as BookingStatus]}</strong>
              </span>
              {!past && (
                <form action={cancelMyBooking.bind(null, myBooking.id)}>
                  <button type="submit" className="text-red-500 hover:underline">
                    예약 취소
                  </button>
                </form>
              )}
            </div>
          ) : (
            <form action={bookSession.bind(null, session.id)} className="flex flex-wrap items-center gap-2">
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
            </form>
          )}
        </div>
      )}
    </div>
  );
}

async function ScheduleSection({
  programId,
  viewerId,
  isAdmin,
  amInstructor,
}: {
  programId: string | null;
  viewerId: string;
  isAdmin: boolean;
  amInstructor: boolean;
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

  if (sessions.length === 0) {
    return <EmptyBox>이 프로그램에 등록된 교육 일정이 없습니다.</EmptyBox>;
  }

  // 지난 일정은 카드에서 "종료"로 표시하고 예약 버튼을 감춘다 — 한 번
  // 지나간 시간대에 새로 예약이 들어오면 강사도 관리자도 혼란스럽다.
  const now = new Date();

  // 같은 날짜끼리 묶어서 하루 단위로 보여준다 — 강사는 "내가 되는 날"을
  // 먼저 찾고 그 안에서 시간을 고르기 때문.
  const days = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const key = kstDayKey(s.startAt);
    const list = days.get(key) ?? [];
    list.push(s);
    days.set(key, list);
  }

  return (
    <div className="flex flex-col gap-5">
      {!amInstructor && !isAdmin && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          예약은 관리자가 지정한 온보딩 강사만 할 수 있습니다. 일정은 열람만 가능합니다.
        </p>
      )}
      {[...days.entries()].map(([key, list]) => (
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

  return (
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
          {bookings.map((b) => (
            <tr key={b.id} className="border-t border-slate-100">
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
                  <form action={cancelMyBooking.bind(null, b.id)}>
                    <button type="submit" className="text-xs text-red-500 hover:underline">
                      취소
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-slate-400">종료</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <form action={assignInstructor} className="rounded-lg border border-slate-200 bg-white p-5">
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
      </form>

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
                      <form action={toggleInstructorActive.bind(null, i.id)}>
                        <button type="submit" className="text-slate-600 hover:underline">
                          {i.active ? "지정 해제" : "다시 지정"}
                        </button>
                      </form>
                      <form action={removeInstructor.bind(null, i.id)}>
                        <button type="submit" className="text-red-500 hover:underline">
                          삭제
                        </button>
                      </form>
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
          _count: { select: { bookings: true } },
        },
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <form action={createProgram} className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800">온보딩 프로그램 등록</h2>
        <p className="mt-1 text-sm text-slate-600">기수 단위로 프로그램을 만든 뒤, 그 안에 교육 일정을 추가합니다.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>프로그램명</label>
            <input name="name" required placeholder="예: 2026년 상반기 신입 온보딩" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>시작일 (선택)</label>
            <input type="date" name="startDate" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>종료일 (선택)</label>
            <input type="date" name="endDate" className={INPUT_CLASS} />
          </div>
          <div className="sm:col-span-4">
            <label className={LABEL_CLASS}>설명 (선택)</label>
            <input name="description" placeholder="대상·목적 등" className={INPUT_CLASS} />
          </div>
        </div>
        <button type="submit" className={`mt-4 ${PRIMARY_BUTTON_CLASS}`}>
          프로그램 등록
        </button>
      </form>

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
                      <form action={toggleProgramActive.bind(null, p.id)}>
                        <button type="submit" className="text-slate-600 hover:underline">
                          {p.active ? "종료 처리" : "다시 진행"}
                        </button>
                      </form>
                      <form action={deleteProgram.bind(null, p.id)}>
                        <button type="submit" className="text-red-500 hover:underline">
                          삭제
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={createSession} className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800">교육 일정 추가</h2>
        <p className="mt-1 text-sm text-slate-600">
          여기서 만든 시간대가 강사에게 노출되고, 강사는 본인이 가능한 시간에 예약합니다.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>프로그램</label>
            <select name="programId" required defaultValue={programId ?? ""} className={INPUT_CLASS}>
              <option value="" disabled>
                선택하세요
              </option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>과정명</label>
            <input name="title" required placeholder="예: 회사 소개 · 인사제도 안내" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>날짜</label>
            <input type="date" name="date" required className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>시작 시간</label>
            <input type="time" name="startTime" required defaultValue="09:00" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>종료 시간</label>
            <input type="time" name="endTime" required defaultValue="11:00" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>필요 강사 수</label>
            <input type="number" name="requiredInstructors" min={1} defaultValue={1} className={INPUT_CLASS} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>장소 (선택)</label>
            <input name="location" placeholder="예: 본사 3층 대회의실" className={INPUT_CLASS} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>설명 (선택)</label>
            <input name="description" placeholder="교육 내용 요약" className={INPUT_CLASS} />
          </div>
        </div>
        <button type="submit" className={`mt-4 ${PRIMARY_BUTTON_CLASS}`}>
          일정 추가
        </button>
      </form>

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
                      {s._count.bookings}건
                    </p>
                  </div>
                  <form action={deleteSession.bind(null, s.id)}>
                    <button type="submit" className="text-xs text-red-500 hover:underline">
                      삭제
                    </button>
                  </form>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-brand-green-dark">일정 수정</summary>
                  <form action={updateSession.bind(null, s.id)} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
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
                  </form>
                </details>
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
  searchParams: Promise<{ tab?: string; programId?: string }>;
}) {
  if (!(await checkModuleAccess("ONBOARDING"))) {
    return <NoModuleAccess title="온보딩 프로그램" />;
  }

  const session = await auth();
  const viewerId = session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";
  const amInstructor = await isActiveInstructor(viewerId);

  const { tab: tabParam, programId: programIdParam } = await searchParams;

  const visibleTabs = TABS.filter(
    (t) => t.role === "all" || (t.role === "admin" && isAdmin) || (t.role === "instructor" && amInstructor)
  );
  const tab: TabKey = visibleTabs.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "schedule";

  const programs = await prisma.onboardingProgram.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, active: true },
  });
  const selectedProgram =
    programs.find((p) => p.id === programIdParam) ?? programs.find((p) => p.active) ?? programs[0] ?? null;
  const programId = selectedProgram?.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">SG 온보딩 프로그램</h1>
        <p className="mt-1 text-slate-600">
          관리자가 온보딩 교육 일정과 강사를 설정하고, 지정된 강사는 본인이 가능한 시간에 직접 예약합니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleTabs.map((t) => (
          <TabLink key={t.key} tab={t} active={t.key === tab} programId={programId ?? undefined} />
        ))}
      </div>

      {(tab === "schedule" || tab === "manage") && programs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">프로그램</span>
          {programs.map((p) => (
            <Link
              key={p.id}
              href={`/platform/onboarding?tab=${tab}&programId=${p.id}`}
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
        <ScheduleSection programId={programId} viewerId={viewerId} isAdmin={isAdmin} amInstructor={amInstructor} />
      )}
      {tab === "my" && <MyBookingsSection viewerId={viewerId} />}
      {tab === "instructors" && <InstructorsSection />}
      {tab === "manage" && <ManageSection programId={programId} />}
    </div>
  );
}
