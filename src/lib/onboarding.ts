import { prisma } from "@/lib/prisma";
import { formatKSTDate, formatKSTDateTime } from "@/lib/format-kst";

/**
 * 편성 폼을 열었을 때 시각 칸에 미리 들어가는 값. 오전 한 타임이 가장 흔해
 * 이걸 기본으로 두고, 다른 시간대는 그 자리에서 고쳐 넣는다.
 */
export const DEFAULT_SESSION_TIME = { start: "09:00", end: "12:00" } as const;

/**
 * 날짜 input(YYYY-MM-DD) + 시간 input(HH:mm)을 한국 시간으로 확정해
 * 파싱한다. `new Date("2026-09-01T10:00")`은 서버 로컬 시간대로 해석되므로
 * Railway(UTC)에서는 입력한 것보다 9시간 뒤로 저장돼 버린다 — 오프셋을
 * 문자열에 직접 박아 어느 리전에서 돌든 같은 시각이 되도록 한다.
 */
export function parseKSTDateTime(dateValue: unknown, timeValue: unknown): Date | null {
  const date = String(dateValue ?? "").trim();
  const time = String(timeValue ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;

  const d = new Date(`${date}T${time}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 저장된 시각을 date/time input의 기본값으로 되돌린다(수정 폼용). */
export function toKSTInputValues(d: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    // h23 — hour12:false는 자정을 "24:00"으로 뱉는 구현이 있어 time input에
    // 그대로 넣으면 값이 비어버린다.
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export const LOGISTICS_KINDS = ["LODGING", "TRANSPORT"] as const;
export type LogisticsKind = (typeof LOGISTICS_KINDS)[number];

export const LOGISTICS_LABEL: Record<LogisticsKind, string> = {
  LODGING: "숙박",
  TRANSPORT: "교통",
};

/** 숙박은 밤을 재우는 것이고 교통은 그 날 한 번 뜨는 것이라, 색으로 갈라 둔다. */
export const LOGISTICS_BADGE_CLASS: Record<LogisticsKind, string> = {
  LODGING: "bg-indigo-100 text-indigo-800",
  TRANSPORT: "bg-amber-100 text-amber-800",
};

/** "8월 12일 (수)" 또는 "8월 12일 (수) ~ 8월 13일 (목)". */
export function formatLogisticsPeriod(startDate: Date, endDate: Date | null): string {
  const from = formatSessionDay(startDate);
  return endDate ? `${from} ~ ${formatSessionDay(endDate)}` : from;
}

/** "9월 1일 (월)" 형태의 날짜 구분 헤더. */
export function formatSessionDay(d: Date): string {
  return formatKSTDate(d, { month: "long", day: "numeric", weekday: "short" });
}

/** "10:00 ~ 12:00" 형태의 시간대. */
export function formatSessionTimeRange(startAt: Date, endAt: Date): string {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  return `${formatKSTDateTime(startAt, opts)} ~ ${formatKSTDateTime(endAt, opts)}`;
}

/** "10:00" — 달력 셀처럼 좁은 자리에 쓰는 시작 시각. */
export function formatSessionStart(d: Date): string {
  return formatKSTDateTime(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** 같은 날짜(KST 기준)끼리 묶기 위한 키. */
export function kstDayKey(d: Date): string {
  return toKSTInputValues(d).date;
}

/**
 * 이 기수의 온보딩 안내를 볼 수 있는 사람인지.
 *
 * 온보딩 안내에는 교육생 명단과 숙박·교통까지 실린다. 전 직원이 볼 글은
 * 아니고, 그 기수에 실제로 얽힌 사람만 본다 —
 *   · 그 기수의 교육생 본인
 *   · 그 기수의 강의를 맡은 강사(개인 배정이든, 그 부서 소속이든)
 *   · 교육생이 속한 팀의 팀장 — 내 팀원이 언제 어디에 가 있는지는 알아야 한다
 * 관리자는 운영자이므로 언제나 본다.
 *
 * 탭을 감추는 것만으로는 URL을 직접 치고 들어오는 걸 막지 못하므로, 화면
 * 자체도 이 함수로 다시 확인한다.
 */
export async function canViewOnboardingProgram(
  programId: string,
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true;

  const [asTrainee, asInstructor] = await Promise.all([
    prisma.onboardingTrainee.count({ where: { programId, userId } }),
    prisma.onboardingSession.count({
      where: { programId, instructors: { some: { userId } } },
    }),
  ]);
  if (asTrainee > 0 || asInstructor > 0) return true;

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } });
  if (!me?.teamId) return false;

  // 부서가 맡은 강의라면 그 부서 사람 전부가 강사 후보다.
  const myTeamTeaches = await prisma.onboardingSession.count({
    where: { programId, teams: { some: { teamId: me.teamId } } },
  });
  if (myTeamTeaches > 0) return true;

  // 내가 팀장인 팀에 이 기수 교육생이 있는지.
  const iLead = await prisma.team.count({ where: { id: me.teamId, leaderId: userId } });
  if (iLead === 0) return false;
  const myMemberIsTrainee = await prisma.onboardingTrainee.count({
    where: { programId, user: { teamId: me.teamId } },
  });
  return myMemberIsTrainee > 0;
}

/**
 * 온보딩 안내를 볼 수 있는 기수가 하나라도 있는지 — 메뉴·탭 노출 판단용.
 *
 * 위 규칙을 기수 구분 없이 한 번에 묻는다. 사이드바가 모든 화면에서 이걸
 * 부르므로 기수 수에 비례해 질의가 늘면 안 된다.
 */
export async function hasAnyOnboardingAccess(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;

  const [asTrainee, asInstructor, me] = await Promise.all([
    prisma.onboardingTrainee.count({ where: { userId } }),
    prisma.onboardingSession.count({ where: { instructors: { some: { userId } } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } }),
  ]);
  if (asTrainee > 0 || asInstructor > 0) return true;
  if (!me?.teamId) return false;

  const myTeamTeaches = await prisma.onboardingSession.count({
    where: { teams: { some: { teamId: me.teamId } } },
  });
  if (myTeamTeaches > 0) return true;

  const iLead = await prisma.team.count({ where: { id: me.teamId, leaderId: userId } });
  if (iLead === 0) return false;
  return (await prisma.onboardingTrainee.count({ where: { user: { teamId: me.teamId } } })) > 0;
}
