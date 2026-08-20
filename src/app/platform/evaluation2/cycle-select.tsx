"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** 목표 사이클 전환 — 현재 탭은 유지한 채 cycleId만 바꾼다. */
export function CycleSelect({
  options,
  value,
}: {
  options: { value: string; label: string }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      value={value}
      aria-label="목표 사이클 선택"
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("cycleId", e.target.value);
        router.push(`${pathname}?${params.toString()}`);
      }}
      className="rounded border border-slate-300 px-3 py-1.5 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
