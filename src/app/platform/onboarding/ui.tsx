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
