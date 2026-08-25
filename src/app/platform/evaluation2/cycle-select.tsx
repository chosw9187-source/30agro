"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Option = { value: string; label: string };

/**
 * 인사평가(사이클) 전환 — 현재 탭은 유지한 채 cycleId만 바꾼다.
 * 빈 값("선택")을 고르면 cycleId를 URL에서 아예 지운다. 빈 문자열로 남겨두면
 * "선택 안 함"과 "잘못된 id"를 서버에서 구분할 수 없다.
 *
 * 목록은 연도로 묶어서 보여준다(`groups`). "2026년 목표설정 / 2026년 중간평가 /
 * 2026년 최종평가"가 평평하게 늘어서면 몇 해치가 섞인 순간 읽기 어려워지는데,
 * 연도 아래 단계가 들어가면 "2026년에는 이 세 가지가 있다"가 한눈에 읽힌다.
 * label이 null인 묶음은 제목 없이 그대로 펼친다("선택" 한 줄에 쓴다).
 */
export function CycleSelect({
  groups,
  value,
}: {
  groups: { label: string | null; options: Option[] }[];
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
      {groups.map((g, i) =>
        g.label === null ? (
          g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        ) : (
          <optgroup key={`${g.label}-${i}`} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )
      )}
    </select>
  );
}
