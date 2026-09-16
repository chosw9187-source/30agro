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
        ),
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
 * 해를 바꿨다고 개인목표에서 대시보드로 튕겨 나갈 이유가 없다. 그 단계에 없는
 * 탭이면 화면이 그 단계의 첫 탭으로 되돌린다.
 *
 * 단계 목록은 묶음으로 받는다(`groups`). 「인사평가」 다섯과 「결과」 둘이 한 줄로
 * 늘어서면 어디까지가 치르는 이야기이고 어디부터 읽는 이야기인지 글자만으로는 안
 * 읽힌다. 고른 단계가 결과
 * 쪽이면 고르개 자체에 색이 든다(`toneClass`) — 한 칸짜리 고르개에서 «지금 결과를
 * 보는 중»이라고 말할 수 있는 자리가 거기뿐이다(브라우저마다 option에 색을 넣는
 * 방법이 달라서 믿을 수 없다).
 */
export function YearPhaseSelect({
  years,
  year,
  groups,
  phase,
  toneClass = "",
}: {
  years: Option[];
  year: string;
  /** 단계 묶음. label이 null인 묶음은 제목 없이 그대로 펼친다. */
  groups: { label: string | null; options: Option[] }[];
  phase: string;
  /** 고른 단계에 맞춘 고르개 색. 결과 쪽 단계에서 눈에 걸리게 한다. */
  toneClass?: string;
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
    router.push(`${pathname}?${params.toString()}`);
  };

  /*
    테두리 색은 `toneClass` 쪽에만 둔다. 기본값과 색조가 둘 다 `border-*`를 들고
    있으면 어느 쪽이 이기는지는 만들어진 CSS 순서가 정하므로(같은 특이도),
    색조를 줘도 테두리만 회색으로 남는 일이 생긴다.
  */
  const selectClass = "rounded-md border px-3 py-1 text-xs";
  const toneOrDefault = toneClass || "border-slate-300";

  return (
    <>
      <select
        value={year}
        aria-label="평가 연도 선택"
        onChange={(e) => go({ year: e.target.value })}
        className={`${selectClass} border-slate-300`}
      >
        {years.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={phase}
        aria-label="인사평가 선택"
        onChange={(e) => go({ phase: e.target.value })}
        className={`${selectClass} ${toneOrDefault}`}
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
          ),
        )}
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
