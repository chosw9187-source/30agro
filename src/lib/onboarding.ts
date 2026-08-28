import { prisma } from "@/lib/prisma";
import { formatKSTDate, formatKSTDateTime } from "@/lib/format-kst";

export const SESSION_STATUSES = ["PLANNED", "SUBMITTED", "DECLINED", "CONFIRMED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  PLANNED: "강사 응답 대기",
  SUBMITTED: "강사 확정 · 승인 대기",
  DECLINED: "강의 불가",
  CONFIRMED: "확정",
};

/**
 * 편성 폼을 열었을 때 시각 칸에 미리 들어가는 값. 오전 한 타임이 가장 흔해
 * 이걸 기본으로 두고, 다른 시간대는 그 자리에서 고쳐 넣는다.
 */
export const DEFAULT_SESSION_TIME = { start: "09:00", end: "12:00" } as const;

/**
 * 한눈에 진행 단계가 읽히도록 색을 단계별로 맞춘다 — 빨강(아직 조율 안 됨)
 * → 파랑(강사가 시간을 확정해 보냄) → 초록(관리자 최종 확정).
 */
export const SESSION_STATUS_BADGE_CLASS: Record<SessionStatus, string> = {
  PLANNED: "bg-red-50 text-red-700",
  SUBMITTED: "bg-blue-50 text-blue-700",
  DECLINED: "bg-orange-100 text-orange-800",
  CONFIRMED: "bg-emerald-50 text-emerald-700",
};

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
 * [교육 프로그램 관리] 탭을 열 수 있는 사람인지. 별도의 강사 명단을 두지 않고
 * 실제 배정으로 판단한다 — 강의를 맡은 본인이거나, 본인 부서에 배정된 강의가
 * 있으면 열린다. 탭을 숨기는 것만으로는 직접 요청을 막을 수 없어 서버 액션도
 * 같은 기준을 다시 확인한다.
 */
export async function canCoordinateSessions(userId: string): Promise<boolean> {
  const assigned = await prisma.onboardingSession.count({
    where: { instructorId: userId },
  });
  if (assigned > 0) return true;

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } });
  if (!me?.teamId) return false;

  // 팀장 전용으로 잠근 강의는 팀장에게만 보인다 — 부서원에게 보여 봐야
  // 손댈 수 없고, 목록만 길어진다.
  const iLead = (await prisma.team.count({ where: { id: me.teamId, leaderId: userId } })) > 0;
  const teamAssigned = await prisma.onboardingSession.count({
    where: { instructorTeamId: me.teamId, ...(iLead ? {} : { leaderOnly: false }) },
  });
  return teamAssigned > 0;
}

/** 이 사람이 그 부서의 팀장인지 — "팀장만 지정" 강의의 권한 기준. */
export async function isLeaderOfTeam(userId: string, teamId: string): Promise<boolean> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leaderId: true } });
  return team?.leaderId === userId;
}

/**
 * 부서 배정 강의를 다룰 수 있는지. 팀장만으로 잠근 강의면 그 팀의 팀장이어야
 * 하고, 그렇지 않으면 그 부서 소속이면 된다.
 */
export async function canHandleTeamSession(
  userId: string,
  teamId: string,
  leaderOnly: boolean
): Promise<boolean> {
  return leaderOnly ? isLeaderOfTeam(userId, teamId) : isMemberOfTeam(userId, teamId);
}

/**
 * 이 사람이 그 부서 소속인지 — 부서 배정 강의를 다룰 권한의 기준.
 *
 * 직급은 보지 않는다. "부서 내 지정"은 그 부서가 알아서 정하라는 뜻이고,
 * 실제로도 팀장이 아니라 일정을 아는 사람이 먼저 손대는 경우가 많다.
 */
export async function isMemberOfTeam(userId: string, teamId: string): Promise<boolean> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } });
  return me?.teamId === teamId;
}
