import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatKSTDate } from "@/lib/format-kst";
import {
  LOGISTICS_BADGE_CLASS,
  LOGISTICS_LABEL,
  canViewOnboardingProgram,
  formatLogisticsPeriod,
  formatSessionDay,
  formatSessionStart,
  formatSessionTimeRange,
  kstDayKey,
  type LogisticsKind,
} from "@/lib/onboarding";
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

/** 온보딩 안내 탭 링크. 보던 달·필터·펼친 일정을 유지한 채 이동하기 위한 것. */
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
  location: string | null;
  startAt: Date;
  endAt: Date;
  instructors: { user: { name: string; team: { name: string } | null } }[];
  teams: { team: { name: string } }[];
  attendees: { traineeId: string }[];
};

/**
 * 화면에 싣는 담당 표기. 여러 명이 나눠 맡기도 하고 사람과 부서가 섞이기도
 * 한다 — 교육생 입장에서는 "어디서 나오는 강의인지"만 알면 되고, 부서로만
 * 잡힌 강의는 당일 누가 오는지 그때 정해지기도 한다.
 */
function instructorLabel(s: FinalSession): string {
  const parts = [...s.instructors.map((i) => i.user.name), ...s.teams.map((t) => `${t.team.name} (강사 미정)`)];
  return parts.length > 0 ? parts.join(", ") : "미정";
}

type Trainee = { id: string; userId: string; user: { name: string; team: { name: string } | null } };

/**
 * 달력 칩 색 — 지난 일정 / 내가 참석할 일정 / 그 밖의 일정.
 * 달력은 훑어보는 화면이라 얇은 테두리에 흰 바탕이면 글자가 배경에 묻힌다.
 * 세 가지를 색의 무게로 갈라 둔다: 내가 들어가야 하는 교육은 초록을 꽉 채워
 * 멀리서도 먼저 눈에 걸리게, 그 밖의 교육도 회색 면을 깔아 흰 칸 위로
 * 떠오르게, 이미 지난 교육만 흐리게 뒤로 물린다.
 *
 * marksMine이 꺼져 있으면 — 관리자·강사처럼 이 기수의 교육생이 아닌 사람이
 * 볼 때 — "내 교육"이라는 구분 자체가 없다. 그때 회색만 깔면 화면 전체가
 * 무채색이 되므로, 예정된 교육을 초록 계열로 올려 잘 보이게 한다.
 */
function chipTone(s: FinalSession, mine: boolean, now: Date, marksMine: boolean) {
  if (s.endAt <= now) return "border-slate-200 bg-slate-50 text-slate-400";
  if (!marksMine) return "border-brand-green-dark bg-brand-green-light text-brand-green-dark";
  return mine
    ? "border-brand-green-dark bg-brand-green text-white shadow-sm"
    : "border-slate-400 bg-slate-200 text-slate-800";
}

/** 요일 글자색 — 일요일 빨강, 토요일 파랑. 국내 달력의 관례. */
function weekdayTone(weekday: number) {
  return weekday === 0 ? "text-rose-500" : weekday === 6 ? "text-blue-500" : "text-slate-600";
}

/**
 * 온보딩 안내 — 이 기수가 어떻게 흘러가는지 한 화면에서 읽는 곳.
 *
 * 시간표만 있는 화면이 아니다. 교육생이 실제로 묻는 것은 "언제 어디로 가서
 * 무엇을 듣는지"만이 아니라 "어디서 자고 어떻게 가는지, 뭘 챙겨야 하는지"라
 * 숙박·교통·공지를 일정과 같은 자리에 둔다.
 *
 * 일정은 [일정 관리]에서 이미 합의된 것만 적히므로, 여기 보이는 것은 전부
 * 확정본이다.
 */
export async function FinalScheduleSection({
  programId,
  viewerId,
  isAdmin,
  onlyMine,
  view,
  month,
  sessionId,
}: {
  programId: string | null;
  viewerId: string;
  isAdmin: boolean;
  onlyMine: boolean;
  view: FinalView;
  month?: string;
  sessionId?: string;
}) {
  if (!programId) return <EmptyBox>등록된 온보딩 기수가 없습니다.</EmptyBox>;

  // 탭을 감추는 것만으로는 URL을 직접 치고 들어오는 걸 막지 못한다.
  if (!(await canViewOnboardingProgram(programId, viewerId, isAdmin))) {
    return (
      <EmptyBox>
        이 기수의 온보딩 안내는 참여하는 분들만 볼 수 있습니다.
        <br />
        <span className="text-xs text-slate-400">
          교육생 · 강의를 맡은 강사 · 교육생이 속한 팀의 팀장에게 열립니다. 열람이 필요하면 관리자에게 문의해 주세요.
        </span>
      </EmptyBox>
    );
  }

  const [program, sessions, logistics] = await Promise.all([
    prisma.onboardingProgram.findUnique({
      where: { id: programId },
      select: {
        id: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        notice: true,
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
        location: true,
        startAt: true,
        endAt: true,
        instructors: { select: { user: { select: { name: true, team: { select: { name: true } } } } } },
        teams: { select: { team: { select: { name: true } } } },
        attendees: { select: { traineeId: true } },
      },
    }),
    prisma.onboardingLogistics.findMany({
      where: { programId },
      orderBy: [{ startDate: "asc" }, { kind: "asc" }],
      select: { id: true, kind: true, startDate: true, endDate: true, title: true, detail: true },
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
  // 가장 자주 필요한 정보는 "다음에 내가 어디로 가면 되는지" 한 줄이다.
  const nextForMe = myTrainee ? sessions.find((s) => isForMe(s) && s.endAt > new Date()) ?? null : null;
  const shown = onlyMine && myTrainee ? sessions.filter(isForMe) : sessions;
  const lectureCount = sessions.length;

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
          교육 {lectureCount}건 · 교육생 {trainees.length}명
        </p>
      </div>

      {myTrainee ? (
        <div className="rounded-lg border border-brand-green bg-brand-green-light p-4">
          <p className="text-sm font-medium text-brand-green-dark">
            {myTrainee.user.name}님은 이 기수 교육생입니다 — 참석 대상 교육 {myCount}건
          </p>
          {nextForMe ? (
            <p className="mt-1.5 text-sm text-slate-700">
              다음 교육:{" "}
              <span className="font-bold text-brand-green-dark">
                {formatSessionDay(nextForMe.startAt)} {formatSessionTimeRange(nextForMe.startAt, nextForMe.endAt)}
              </span>{" "}
              · <span className="font-semibold text-slate-800">{nextForMe.title}</span>
              {nextForMe.location && ` · ${nextForMe.location}`}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">남은 교육이 없습니다.</p>
          )}
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
          이 기수의 교육생 명단에 포함되어 있지 않아 전체 일정만 표시됩니다.
        </p>
      )}

      <StayGuide logistics={logistics} />

      <ProgramNotice notice={program.notice} isAdmin={isAdmin} />

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

      {view === "calendar" && (
        // 색으로 갈라 놓은 이상 무슨 색이 무슨 뜻인지도 같이 있어야 한다.
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {myTrainee && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm border border-brand-green-dark bg-brand-green" />
              <span className="font-medium text-brand-green-dark">내가 참석하는 교육</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-3 w-3 rounded-sm border ${
                myTrainee ? "border-slate-400 bg-slate-200" : "border-brand-green-dark bg-brand-green-light"
              }`}
            />
            {myTrainee ? "그 밖의 교육" : "예정된 교육"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-slate-200 bg-slate-50" />
            지난 교육
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-green text-[8px] font-bold text-white">
              1
            </span>
            오늘
          </span>
        </div>
      )}

      {view === "calendar" ? (
        // 폰 화면에서 7칸을 욱여넣으면 칸이 40px까지 눌려 "10…"밖에 안 보인다.
        // 최소 폭을 주고 가로로 스크롤하게 해서 교육명이 읽히도록 한다.
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-bold">
            {WEEKDAY_LABEL.map((w, i) => (
              <div key={w} className={`py-2 ${weekdayTone(i)}`}>
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-slate-200">
            {monthCells(year, monthIdx).map((day, i) => {
              if (day === null) return <div key={i} className="min-h-[104px] bg-slate-50" />;
              const key = `${currentMonthKey}-${String(day).padStart(2, "0")}`;
              const daySessions = byDay.get(key) ?? [];
              return (
                <div
                  key={i}
                  className={`flex min-h-[104px] flex-col gap-1 p-1.5 ${
                    daySessions.length > 0 ? "bg-emerald-50/60" : "bg-white"
                  }`}
                >
                  <span
                    className={`mb-0.5 text-xs font-bold ${
                      key === todayKey
                        ? "flex h-5 w-5 items-center justify-center rounded-full bg-brand-green text-white"
                        : weekdayTone(i % 7)
                    }`}
                  >
                    {day}
                  </span>
                  {daySessions.map((s) => (
                    <Link
                      key={s.id}
                      href={finalHref({ ...linkBase, sessionId: openSession?.id === s.id ? null : s.id })}
                      title={`${formatSessionTimeRange(s.startAt, s.endAt)} ${s.title}`}
                      className={`block truncate rounded border-l-4 px-1.5 py-1 text-xs font-semibold leading-tight hover:brightness-95 ${chipTone(
                        s,
                        isForMe(s),
                        now,
                        !!myTrainee
                      )} ${openSession?.id === s.id ? "ring-2 ring-brand-green-dark ring-offset-1" : ""}`}
                    >
                      <span className="tabular-nums opacity-75">{formatSessionStart(s.startAt)}</span> {s.title}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
          </div>
          {/* 폰에서는 달력 칸이 좁아 한글 교육명이 잘린다 — 달력은 그 달의
              모양을 보는 용도로 두고, 읽을 수 있는 목록을 아래에 함께 준다. */}
          <div className="md:hidden">
            <DayList
              byDay={byDay}
              now={now}
              isForMe={isForMe}
              hrefOf={(id) => finalHref({ ...linkBase, sessionId: openSession?.id === id ? null : id })}
              emptyLabel={onlyMine ? "참석 대상으로 지정된 교육이 없습니다." : "이 기수에 등록된 교육 일정이 없습니다."}
            />
          </div>
        </div>
      ) : (
        <DayList
          byDay={byDay}
          now={now}
          isForMe={isForMe}
          hrefOf={(id) => finalHref({ ...linkBase, sessionId: openSession?.id === id ? null : id })}
          emptyLabel={onlyMine ? "참석 대상으로 지정된 교육이 없습니다." : "이 기수에 등록된 교육 일정이 없습니다."}
        />
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

type Logistics = {
  id: string;
  kind: string;
  startDate: Date;
  endDate: Date | null;
  title: string;
  detail: string | null;
};

/**
 * 날짜에 걸리는 숙박·교통. 일정과 나란히 두되 섞지는 않는다 — 시간표에서
 * 찾는 것("몇 시에 어디로")과 여기서 찾는 것("오늘 밤 어디서 자나")이 달라,
 * 한 덩어리로 묶어 두면 둘 다 잘 안 보인다.
 */
function StayGuide({ logistics }: { logistics: Logistics[] }) {
  if (logistics.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
        <h3 className="text-sm font-bold text-slate-800">숙박 · 교통</h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {logistics.map((g) => (
          <li key={g.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3">
            <span className="w-44 shrink-0 text-sm font-bold text-slate-800">
              {formatLogisticsPeriod(g.startDate, g.endDate)}
            </span>
            <div className="min-w-[12rem] flex-1">
              <p className="text-sm font-semibold text-slate-900">
                <span
                  className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    LOGISTICS_BADGE_CLASS[g.kind as LogisticsKind]
                  }`}
                >
                  {LOGISTICS_LABEL[g.kind as LogisticsKind]}
                </span>
                {g.title}
              </p>
              {g.detail && <p className="mt-0.5 whitespace-pre-line text-xs text-slate-500">{g.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 기수 전체에 걸리는 공지. 숙박·교통은 날짜에 걸리는 것이라 여기가 아니라
 * 위쪽 [숙박 · 교통] 카드에 따로 선다.
 *
 * 비어 있으면 빈 상자를 띄우지 않고 통째로 감추되, 관리자에게는 "여기에 적을
 * 수 있다"는 것을 알려 준다 — 안 그러면 이 칸의 존재를 모른다.
 */
function ProgramNotice({ notice, isAdmin }: { notice: string | null; isAdmin: boolean }) {
  if (!notice) {
    if (!isAdmin) return null;
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-xs text-slate-500">
        기수 전체 공지는 [일정 관리]의 기수 정보에서 적을 수 있습니다. 숙박·교통은 그 아래
        [숙박 · 교통 안내]에서 날짜별로 적습니다.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-brand-green bg-brand-green-light/40 p-5">
      <h3 className="text-sm font-bold text-brand-green-dark">온보딩 공지사항</h3>
      {/* 여러 줄로 적는 자리라 줄바꿈을 그대로 살린다. */}
      <p className="mt-2 whitespace-pre-line text-sm text-slate-800">{notice}</p>
    </div>
  );
}

/**
 * 날짜별로 묶은 교육 목록. 달력이 좁은 화면에서 읽히지 않으므로 폰에서는
 * 달력과 함께, [목록] 보기에서는 단독으로 쓴다.
 */
function DayList({
  byDay,
  now,
  isForMe,
  hrefOf,
  emptyLabel,
}: {
  byDay: Map<string, FinalSession[]>;
  now: Date;
  isForMe: (s: FinalSession) => boolean;
  hrefOf: (sessionId: string) => string;
  emptyLabel: string;
}) {
  if (byDay.size === 0) return <EmptyBox>{emptyLabel}</EmptyBox>;

  return (
    <div className="flex flex-col gap-4">
      {[...byDay.entries()].map(([key, daySessions]) => (
        <div key={key} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-brand-green-light px-4 py-2.5 text-sm font-bold text-brand-green-dark">
            {formatSessionDay(daySessions[0].startAt)}
          </div>
          <ul className="divide-y divide-slate-100">
            {daySessions.map((s) => {
              const mine = isForMe(s);
              const past = s.endAt <= now;
              return (
              <li key={s.id}>
                <Link
                  href={hrefOf(s.id)}
                  // 왼쪽 굵은 색띠 하나로 "내가 들어가는 줄"이 목록에서 바로 잡힌다.
                  className={`flex flex-wrap items-start gap-x-4 gap-y-1 border-l-4 px-4 py-3 hover:bg-slate-50 ${
                    mine ? "border-brand-green bg-brand-green-light/50" : "border-transparent"
                  } ${past ? "opacity-55" : ""}`}
                >
                  <span className="w-32 shrink-0 text-sm font-bold tabular-nums text-slate-800">
                    {formatSessionTimeRange(s.startAt, s.endAt)}
                  </span>
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {s.title}
                      {mine && (
                        <span className="ml-2 rounded-full bg-brand-green px-2 py-0.5 text-[10px] font-bold text-white">
                          참석
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {s.location ?? "장소 미정"} ·{" "}
                      <span className="text-slate-700">강사 {instructorLabel(s)}</span>
                      {" · "}
                      {s.attendees.length === 0 ? "기수 전원" : `지정 ${s.attendees.length}명`}
                    </p>
                  </div>
                </Link>
              </li>
              );
            })}
          </ul>
        </div>
      ))}
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
    <div className="rounded-lg border-2 border-brand-green bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            {session.title}
            {mine && (
              <span className="ml-2 rounded-full bg-brand-green px-2 py-0.5 text-[10px] font-bold text-white">
                참석 대상
              </span>
            )}
          </h3>
          {/* 편성할 때 적은 설명은 여기 싣지 않는다 — 그 칸은 강사에게 넘기는
              전달사항(준비물, 진행 방식, 관리자 메모)을 적는 자리다. */}
        </div>
        <Link href={closeHref} className="text-xs text-slate-400 hover:underline">
          닫기
        </Link>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-slate-500">교육 시간</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">
            {formatKSTDate(session.startAt, { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
            <br />
            <span className="tabular-nums text-brand-green-dark">
              {formatSessionTimeRange(session.startAt, session.endAt)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">교육 장소</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">{session.location ?? "미정"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">강사</dt>
          <dd className="mt-0.5 text-sm">
            {session.instructors.length === 0 && session.teams.length === 0 ? (
              <span className="text-slate-400">-</span>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {session.instructors.map((i) => (
                  <li key={i.user.name} className="text-slate-800">
                    {i.user.name}
                    {i.user.team && <span className="ml-1 text-xs text-slate-400">{i.user.team.name}</span>}
                  </li>
                ))}
                {session.teams.map((t) => (
                  <li key={t.team.name} className="text-slate-800">
                    {t.team.name}
                    <span className="ml-1 text-xs text-slate-400">강사 미정</span>
                  </li>
                ))}
              </ul>
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
