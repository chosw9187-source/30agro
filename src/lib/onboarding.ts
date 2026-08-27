import { prisma } from "@/lib/prisma";
import { formatKSTDate, formatKSTDateTime } from "@/lib/format-kst";

export const SESSION_STATUSES = ["PLANNED", "SUBMITTED", "CONFIRMED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  PLANNED: "시간 조정 중",
  SUBMITTED: "강사 확정 · 승인 대기",
  CONFIRMED: "확정",
};

export const SESSION_STATUS_BADGE_CLASS: Record<SessionStatus, string> = {
  PLANNED: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-amber-50 text-amber-700",
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

/** 분 단위 길이. 최소 강의 시간 검사와 화면 표시에 함께 쓴다. */
export function durationMinutes(startAt: Date, endAt: Date): number {
  return Math.round((endAt.getTime() - startAt.getTime()) / 60000);
}

/** "1시간 30분" — 강사가 시간을 조정할 때 길이를 바로 알 수 있게. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/**
 * 관리자가 강사로 지정했고 아직 해제하지 않은 사람인지. [교육 프로그램 관리]
 * 탭과 세부일정 수정은 전부 이 검사를 통과해야 한다 — 탭을 숨기는 것만으로는
 * 직접 요청을 막을 수 없기 때문.
 */
export async function isActiveInstructor(userId: string): Promise<boolean> {
  const row = await prisma.onboardingInstructor.findUnique({
    where: { userId },
    select: { active: true },
  });
  return !!row?.active;
}
