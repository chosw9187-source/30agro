import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatKSTDate } from "@/lib/format-kst";
import { formatSessionDay, formatSessionStart, formatSessionTimeRange, kstDayKey } from "@/lib/onboarding";
import {
  EmptyBox,
  WEEKDAY_LABEL,
  monthCells,
  monthKeyOf,
  nextMonthOf,
  parseMonthKey,
  prevMonthOf,
  programPeriod,
} from "./ui";

export type FinalView = "calendar" | "list";

/** 최종 스케줄 탭 링크. 보던 달·필터·펼친 일정을 유지한 채 이동하기 위한 것. */
export function finalHref(opts: {
  programId: string | null;
  view?: FinalView;
  onlyMine?: boolean;
  month?: string;
  sessionId?: string | null;
}) {
  const params = new URLSearchParams({ tab: "final" });
  if (opts.programId) params.set("programId", opts.programId);
  if (opts.view && opts.view !== "calendar") params.set("view", opts.view);
  if (opts.onlyMine) params.set("only", "mine");
  if (opts.month) params.set("month", opts.month);
  if (opts.sessionId) params.set("sessionId", opts.sessionId);
  return `/platform/onboarding?${params.toString()}`;
}

type FinalSession = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  requiredInstructors: number;
  bookings: { user: { name: string; team: { name: string } | null } }[];
  attendees: { traineeId: string }[];
};

type Trainee = { id: string; userId: string; user: { name: string; team: { name: string } | null } };

/** 달력 칩 색 — 지난 일정 / 내가 참석할 일정 / 그 밖의 일정. */
function chipTone(s: FinalSession, mine: boolean, now: Date) {
  if (s.endAt <= now) return "border-slate-300 bg-slate-100 text-slate-400";
  return mine
    ? "border-brand-green bg-brand-green-light text-brand-green-dark"
    : "border-slate-300 bg-white text-slate-600";
}

/**
 * 일정과 강사 배정이 모두 반영된 확정 시간표. 교육생이 "우리 기수가 언제 뭘
 * 듣는지"와 "그중 내가 들어가야 하는 건 어느 것인지"를 한 화면에서 보는 것이
 * 목적이라, 강사가 아직 확정되지 않은 교육도 감추지 않고 "강사 미정"으로
 * 남겨 둔다 — 시간은 이미 잡혀 있으므로 교육생은 그 시간을 비워 둬야 한다.
 */
export async function FinalScheduleSection({
  programId,
  viewerId,
  onlyMine,
  view,
  month,
  sessionId,
}: {
  programId: string | null;
  viewerId: string;
  onlyMine: boolean;
  view: FinalView;
  month?: string;
  sessionId?: string;
}) {
  if (!programId) return <EmptyBox>등록된 온보딩 기수가 없습니다.</EmptyBox>;

  const [program, sessions] = await Promise.all([
    prisma.onboardingProgram.findUnique({
      where: { id: programId },
      select: {
        id: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        trainees: {
          orderBy: { user: { name: "asc" } },
          select: { id: true, userId: true, user: { select: { name: true, team: { select: { name: true } } } } },
        },
      },
    }),
    prisma.onboardingSession.findMany({
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
        // 최종 스케줄이므로 확정(CONFIRMED)된 강사만 이름을 싣는다. 신청
        // 단계의 이름을 보여 주면 교육생이 확정된 것으로 오해한다.
        bookings: {
          where: { status: "CONFIRMED" },
          orderBy: { createdAt: "asc" },
          select: { user: { select: { name: true, team: { select: { name: true } } } } },
        },
        attendees: { select: { traineeId: true } },
      },
    }),
  ]);

  if (!program) return <EmptyBox>선택한 프로그램을 찾을 수 없습니다.</EmptyBox>;

  const trainees: Trainee[] = program.trainees;
  const myTrainee = trainees.find((t) => t.userId === viewerId) ?? null;

  // 대상이 따로 지정되지 않은 교육은 기수 전원이 듣는다 — 지정 명단이 비어
  // 있는 것을 "전원 대상"으로 읽는다.
  const audienceOf = (s: FinalSession): Trainee[] =>
    s.attendees.length === 0 ? trainees : trainees.filter((t) => s.attendees.some((a) => a.traineeId === t.id));
  const isForMe = (s: FinalSession) => !!myTrainee && audienceOf(s).some((t) => t.id === myTrainee.id);

  const myCount = myTrainee ? sessions.filter(isForMe).length : 0;
  const shown = onlyMine && myTrainee ? sessions.filter(isForMe) : sessions;
  const confirmedCount = sessions.filter((s) => s.bookings.length >= s.requiredInstructors).length;

  const now = new Date();
  const todayKey = kstDayKey(now);

  const byDay = new Map<string, FinalSession[]>();
  for (const s of shown) {
    const key = kstDayKey(s.startAt);
    const list = byDay.get(key) ?? [];
    list.push(s);
    byDay.set(key, list);
  }

  // 기본으로 펼칠 달: 앞으로 열리는 첫 교육이 있는 달. 기수가 다음 달 일정만
  // 갖고 있는데 이번 달 빈 달력을 띄우면 교육생은 아무것도 못 본다.
  const upcoming = shown.find((s) => s.endAt > now) ?? shown[shown.length - 1];
  const fallbackMonth = upcoming
    ? kstDayKey(upcoming.startAt).slice(0, 7)
    : (program.startDate ? kstDayKey(program.startDate) : todayKey).slice(0, 7);
  const { year, monthIdx } = parseMonthKey(month, fallbackMonth);
  const currentMonthKey = monthKeyOf(year, monthIdx);
  const prev = prevMonthOf(year, monthIdx);
  const next = nextMonthOf(year, monthIdx);

  // 펼친 일정. 지금 보고 있는 목록(필터 결과) 안에 있을 때만 연다 — "내
  // 교육만 보기"를 켠 채로 남의 교육 상세가 열려 있으면 앞뒤가 안 맞는다.
  const openSession = sessionId ? shown.find((s) => s.id === sessionId) ?? null : null;

  const linkBase = { programId, view, onlyMine, month: currentMonthKey };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-800">{program.name}</h2>
          <span className="text-sm text-slate-500">{programPeriod(program) || "기간 미지정"}</span>
        </div>
        {program.description && <p className="mt-1 text-sm text-slate-600">{program.description}</p>}
        <p className="mt-3 text-xs text-slate-500">
          교육 {sessions.length}건 · 강사 확정 {confirmedCount}건 · 교육생 {trainees.length}명
        </p>
      </div>

      {myTrainee ? (
        <div className="rounded-lg border border-brand-green bg-brand-green-light p-4">
          <p className="text-sm font-medium text-brand-green-dark">
            {myTrainee.user.name}님은 이 기수 교육생입니다 — 참석 대상 교육 {myCount}건
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Link
              href={finalHref({ ...linkBase, onlyMine: false })}
              className={`rounded-full border px-3 py-1 ${
                onlyMine ? "border-slate-200 bg-white text-slate-600" : "border-brand-green bg-white text-brand-green-dark"
              }`}
            >
              전체 일정
            </Link>
            <Link
              href={finalHref({ ...linkBase, onlyMine: true })}
              className={`rounded-full border px-3 py-1 ${
                onlyMine ? "border-brand-green bg-white text-brand-green-dark" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              내 교육만 보기
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          이 기수의 교육생 명단에 포함되어 있지 않아 전체 일정만 표시됩니다. 명단 등록은 관리자에게 문의하세요.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-sm">
          <Link
            href={finalHref({ ...linkBase, month: monthKeyOf(prev.year, prev.monthIdx) })}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50"
            aria-label="이전 달"
          >
            ‹
          </Link>
          <span className="min-w-[7rem] text-center font-semibold text-slate-800">
            {year}년 {monthIdx + 1}월
          </span>
          <Link
            href={finalHref({ ...linkBase, month: monthKeyOf(next.year, next.monthIdx) })}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50"
            aria-label="다음 달"
          >
            ›
          </Link>
        </div>
        <div className="flex gap-1 text-xs">
          {(["calendar", "list"] as const).map((v) => (
            <Link
              key={v}
              href={finalHref({ ...linkBase, view: v })}
              className={`rounded border px-3 py-1 ${
                view === v ? "border-brand-green bg-brand-green-light text-brand-green-dark" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {v === "calendar" ? "달력" : "목록"}
            </Link>
          ))}
        </div>
      </div>

      {view === "calendar" ? (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="grid grid-cols-7 bg-slate-50 text-center text-xs font-medium text-slate-500">
            {WEEKDAY_LABEL.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-slate-200">
            {monthCells(year, monthIdx).map((day, i) => {
              if (day === null) return <div key={i} className="min-h-[92px] bg-slate-50" />;
              const key = `${currentMonthKey}-${String(day).padStart(2, "0")}`;
              const daySessions = byDay.get(key) ?? [];
              return (
                <div key={i} className="flex min-h-[92px] flex-col gap-0.5 bg-white p-1.5">
                  <span
                    className={`mb-0.5 text-xs font-medium ${
                      key === todayKey
                        ? "flex h-5 w-5 items-center justify-center rounded-full bg-brand-green text-white"
                        : "text-slate-500"
                    }`}
                  >
                    {day}
                  </span>
                  {daySessions.map((s) => (
                    <Link
                      key={s.id}
                      href={finalHref({ ...linkBase, sessionId: openSession?.id === s.id ? null : s.id })}
                      title={`${formatSessionTimeRange(s.startAt, s.endAt)} ${s.title}`}
                      className={`truncate rounded border-l-2 px-1 py-0.5 text-[11px] hover:brightness-95 ${chipTone(
                        s,
                        isForMe(s),
                        now
                      )} ${openSession?.id === s.id ? "ring-1 ring-inset ring-brand-green" : ""}`}
                    >
                      {formatSessionStart(s.startAt)} {s.title}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : shown.length === 0 ? (
        <EmptyBox>
          {onlyMine ? "참석 대상으로 지정된 교육이 없습니다." : "이 기수에 등록된 교육 일정이 없습니다."}
        </EmptyBox>
      ) : (
        <div className="flex flex-col gap-4">
          {[...byDay.entries()].map(([key, daySessions]) => (
            <div key={key} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                {formatSessionDay(daySessions[0].startAt)}
              </div>
              <ul className="divide-y divide-slate-100">
                {daySessions.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={finalHref({ ...linkBase, sessionId: openSession?.id === s.id ? null : s.id })}
                      className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50"
                    >
                      <span className="w-32 shrink-0 text-sm font-medium text-slate-700">
                        {formatSessionTimeRange(s.startAt, s.endAt)}
                      </span>
                      <div className="min-w-[12rem] flex-1">
                        <p className="text-sm font-medium text-slate-800">
                          {s.title}
                          {isForMe(s) && (
                            <span className="ml-2 rounded-full bg-brand-green-light px-2 py-0.5 text-[10px] font-semibold text-brand-green-dark">
                              참석
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {s.location ?? "장소 미정"} ·{" "}
                          {s.bookings.length > 0 ? (
                            <span className="text-slate-700">강사 {s.bookings.map((b) => b.user.name).join(", ")}</span>
                          ) : (
                            <span className="text-amber-600">강사 미정</span>
                          )}
                          {" · "}
                          {s.attendees.length === 0 ? "기수 전원" : `지정 ${s.attendees.length}명`}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {openSession ? (
        <SessionDetail
          session={openSession}
          audience={audienceOf(openSession)}
          mine={isForMe(openSession)}
          myTraineeId={myTrainee?.id ?? null}
          closeHref={finalHref({ ...linkBase, sessionId: null })}
        />
      ) : (
        <p className="text-xs text-slate-400">
          {view === "calendar"
            ? "달력에서 교육을 누르면 시간·장소·교육 대상자를 볼 수 있습니다."
            : "목록에서 교육을 누르면 시간·장소·교육 대상자를 볼 수 있습니다."}
        </p>
      )}
    </div>
  );
}

/** 달력에서 고른 교육 한 건의 상세 — 시간 · 장소 · 강사 · 교육 대상자. */
function SessionDetail({
  session,
  audience,
  mine,
  myTraineeId,
  closeHref,
}: {
  session: FinalSession;
  audience: Trainee[];
  mine: boolean;
  myTraineeId: string | null;
  closeHref: string;
}) {
  return (
    <div className="rounded-lg border border-brand-green bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-800">
            {session.title}
            {mine && (
              <span className="ml-2 rounded-full bg-brand-green-light px-2 py-0.5 text-[10px] font-semibold text-brand-green-dark">
                참석 대상
              </span>
            )}
          </h3>
          {session.description && <p className="mt-1 text-sm text-slate-600">{session.description}</p>}
        </div>
        <Link href={closeHref} className="text-xs text-slate-400 hover:underline">
          닫기
        </Link>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-slate-500">교육 시간</dt>
          <dd className="mt-0.5 text-sm text-slate-800">
            {formatKSTDate(session.startAt, { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
            <br />
            {formatSessionTimeRange(session.startAt, session.endAt)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">교육 장소</dt>
          <dd className="mt-0.5 text-sm text-slate-800">{session.location ?? "미정"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">강사</dt>
          <dd className="mt-0.5 text-sm">
            {session.bookings.length > 0 ? (
              <span className="text-slate-800">{session.bookings.map((b) => b.user.name).join(", ")}</span>
            ) : (
              <span className="text-amber-600">미정</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="text-xs font-medium text-slate-500">
          교육 대상자 {audience.length}명
          <span className="ml-1 font-normal text-slate-400">
            {session.attendees.length === 0 ? "(기수 전원)" : "(지정 대상)"}
          </span>
        </p>
        {audience.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">등록된 교육생이 없습니다.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {audience.map((t) => (
              <li
                key={t.id}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  t.id === myTraineeId
                    ? "border-brand-green bg-brand-green-light font-medium text-brand-green-dark"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {t.user.name}
                {t.user.team && <span className="ml-1 text-slate-400">{t.user.team.name}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
