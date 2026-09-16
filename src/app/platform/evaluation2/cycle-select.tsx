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

/**
 * 무엇을 볼지 고르는 두 칸 — 왼쪽은 **연도**, 오른쪽은 그 해의 **목표**다.
 *
 * 연도와 단계를 한 칸에 붙여 두면(「2026년 목표설정」) 해가 늘어날수록 목록이
 * 길어지고 «지금 몇 년도를 보는 중인가»가 단계 이름에 묻힌다. 연도를 먼저 고르고
 * 그 안에서 단계를 고르면 두 물음이 각자 자리를 갖는다.
 *
 * 고르는 즉시 주소가 바뀐다(`year`, `phase`). 보고 있는 층(tab)은 그대로 둔다 —
 * 해를 바꿨다고 개인목표에서 대시보드로 튕겨 나갈 이유가 없다.
 *
 * 단계를 바꿀 때는 한 가지 예외가 있다. 「최종결과」·「HR REPORT」는 단계와 상관
 * 없는 화면이라(한 해의 결과를 읽는 자리다) 탭을 그대로 두면 단계를 골라도 같은
 * 화면이 그대로 남는다 — 주소의 `phase`만 바뀌고 본문은 한 글자도 안 바뀌어서
 * «눌러도 안 넘어간다»로 읽힌다. 그때는 `phaseChangeTab`으로 돌아간다.
 */
export function YearPhaseSelect({
  years,
  year,
  phases,
  phase,
  phaseChangeTab = null,
}: {
  years: Option[];
  year: string;
  phases: Option[];
  phase: string;
  /**
   * 단계를 바꿀 때 옮겨 갈 탭. 지금 탭이 단계와 상관없는 화면일 때만 넘겨받고,
   * null이면 탭을 그대로 둔다.
   */
  phaseChangeTab?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = (next: { year?: string; phase?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", next.year ?? year);
    params.set("phase", next.phase ?? phase);
    // 예전 주소(cycleId)로 들어왔더라도 여기서부터는 연도·단계로 읽는다.
    params.delete("cycleId");
    // 고치던 목표를 열어 둔 채 다른 평가로 넘어가면 없는 목표를 편집하게 된다.
    params.delete("edit");
    /*
      단계를 **바꿀 때만** 탭을 옮긴다. 해를 바꾸는 것은 그 화면 안에서 해를
      고르는 일이라(결과지도 해마다 한 장이다) 탭을 건드릴 이유가 없다.
    */
    if (next.phase && next.phase !== phase && phaseChangeTab) {
      params.set("tab", phaseChangeTab);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const selectClass = "rounded-md border border-slate-300 px-3 py-1 text-xs";

  return (
    <>
      <select
        value={year}
        aria-label="평가 연도 선택"
        onChange={(e) => go({ year: e.target.value })}
        className={selectClass}
      >
        {years.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={phase}
        aria-label="목표 선택"
        onChange={(e) => go({ phase: e.target.value })}
        className={selectClass}
      >
        {phases.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}

/**
 * 주소의 **한 칸만** 바꾸는 고르개.
 *
 * 역량평가에서 «누구 것을 볼지»를 고르는 데 쓴다. 연도·단계·탭 같은 나머지
 * 조건은 건드리지 않는다 — 사람을 바꿨다고 보고 있던 해가 바뀔 이유가 없다.
 * 빈 값을 고르면 그 칸을 주소에서 지운다(기본값으로 돌아간다).
 */
export function ParamSelect({
  param,
  value,
  options,
  ariaLabel,
}: {
  param: string;
  value: string;
  options: Option[];
  ariaLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) params.set(param, e.target.value);
        else params.delete(param);
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
