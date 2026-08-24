"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * 인사평가(사이클) 전환 — 현재 탭은 유지한 채 cycleId만 바꾼다.
 * 빈 값("선택")을 고르면 cycleId를 URL에서 아예 지운다. 빈 문자열로 남겨두면
 * "선택 안 함"과 "잘못된 id"를 서버에서 구분할 수 없다.
 */
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
        if (e.target.value) params.set("cycleId", e.target.value);
        else params.delete("cycleId");
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
      }}
      className="rounded-md border border-slate-300 px-3 py-1 text-xs"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
