/** 온보딩 화면들이 공유하는 폼 클래스와 조각들. */

import { formatKSTDate } from "@/lib/format-kst";

export const INPUT_CLASS = "w-full rounded border border-slate-300 px-3 py-2 text-sm";
export const LABEL_CLASS = "mb-1 block text-xs font-medium text-slate-600";
export const PRIMARY_BUTTON_CLASS =
  "rounded bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark";

export function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

/** "2026-10-19 ~ 2026-10-20" — 양쪽 다 비어 있으면 빈 문자열. */
export function programPeriod(p: { startDate: Date | null; endDate: Date | null }) {
  if (!p.startDate && !p.endDate) return "";
  const fmt = (d: Date | null) =>
    d ? formatKSTDate(d, { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
  return `${fmt(p.startDate)} ~ ${fmt(p.endDate)}`;
}

/* ---------------------------------------------------------------- 달력 계산 */

export const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-10" — 달력 URL과 날짜 키의 접두사로 쓰는 달 키. */
export function monthKeyOf(year: number, monthIdx: number) {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
}

export function parseMonthKey(value: string | undefined, fallback: string) {
  const s = value && /^\d{4}-\d{2}$/.test(value) ? value : fallback;
  const [year, month] = s.split("-").map(Number);
  return { year, monthIdx: month - 1 };
}

/**
 * 한 달치 격자 칸. 앞뒤로 null을 채워 항상 7의 배수로 맞춘다.
 * 순수 달력 계산이라 Date.UTC로 만든다 — 로컬 시간대가 끼면 서버 리전에
 * 따라 1일이 밀린다.
 */
export function monthCells(year: number, monthIdx: number): (number | null)[] {
  const firstWeekday = new Date(Date.UTC(year, monthIdx, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function prevMonthOf(year: number, monthIdx: number) {
  return monthIdx === 0 ? { year: year - 1, monthIdx: 11 } : { year, monthIdx: monthIdx - 1 };
}

export function nextMonthOf(year: number, monthIdx: number) {
  return monthIdx === 11 ? { year: year + 1, monthIdx: 0 } : { year, monthIdx: monthIdx + 1 };
}
