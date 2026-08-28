"use client";

import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string; sublabel?: string };

/**
 * 담당 배정 입력 — 강사와 부서를 각각 여럿 고른다.
 *
 * 한 과정을 둘이 나눠 진행하거나 실습에 보조 강사가 붙는 일이 흔하고,
 * "영업지원팀에서 한 명 + 인사팀 김OO"처럼 사람과 부서가 섞이기도 한다.
 * 그래서 둘 중 하나를 고르게 하지 않고 둘 다 목록으로 둔다.
 *
 * 고른 것은 hidden input으로 같은 이름에 여러 줄 실려 나간다 —
 * 서버에서는 formData.getAll()로 받는다.
 */
export function AssignFields({
  instructorOptions,
  teamOptions,
  defaultInstructorIds = [],
  defaultTeamIds = [],
  inputClassName,
  labelClassName,
}: {
  instructorOptions: Option[];
  teamOptions: Option[];
  defaultInstructorIds?: string[];
  defaultTeamIds?: string[];
  inputClassName: string;
  labelClassName: string;
}) {
  return (
    <>
      <div className="sm:col-span-2">
        <label className={labelClassName}>담당 강사 (여러 명 선택 가능)</label>
        <MultiPicker
          name="instructorIds"
          options={instructorOptions}
          defaultValues={defaultInstructorIds}
          placeholder="이름 검색..."
          inputClassName={inputClassName}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClassName}>담당 부서 (여러 곳 선택 가능)</label>
        <MultiPicker
          name="teamIds"
          options={teamOptions}
          defaultValues={defaultTeamIds}
          placeholder="부서 검색..."
          inputClassName={inputClassName}
        />
        <p className="mt-1 text-[11px] text-slate-400">
          그 날 되는 사람이 나가는 경우처럼 이름을 미리 못 박을 수 없을 때 부서로 답니다. 강사와 함께 고를 수
          있습니다.
        </p>
      </div>
    </>
  );
}

/**
 * 검색해서 여러 개를 고르는 칸. 고른 것은 위에 칩으로 쌓이고, ×로 뺀다.
 *
 * SearchableSelect를 쓰지 않은 이유는 그쪽이 "하나를 고르면 그 이름이 검색칸에
 * 남는" 단일 선택 전용이기 때문이다. 여기서는 고르는 즉시 칩으로 빠지고
 * 검색칸은 비어야 다음 사람을 이어서 고를 수 있다.
 */
function MultiPicker({
  name,
  options,
  defaultValues,
  placeholder,
  inputClassName,
}: {
  name: string;
  options: Option[];
  defaultValues: string[];
  placeholder: string;
  inputClassName: string;
}) {
  const [picked, setPicked] = useState<string[]>(defaultValues);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const byValue = new Map(options.map((o) => [o.value, o]));
  // 이미 고른 것은 후보에서 뺀다 — 같은 사람을 두 번 담을 이유가 없다.
  const candidates = options
    .filter((o) => !picked.includes(o.value) && o.label.includes(query))
    .slice(0, 30);

  function add(value: string) {
    setPicked((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      {picked.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}

      {picked.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-1.5">
          {picked.map((v) => (
            <li
              key={v}
              className="flex items-center gap-1 rounded-full border border-brand-green bg-brand-green-light py-0.5 pl-2.5 pr-1 text-xs text-brand-green-dark"
            >
              {byValue.get(v)?.label ?? v}
              <button
                type="button"
                onClick={() => setPicked((prev) => prev.filter((x) => x !== v))}
                className="px-1 text-slate-500 hover:text-red-500"
                aria-label={`${byValue.get(v)?.label ?? v} 제외`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key !== "Enter") return;
          // 검색 중의 엔터는 폼 제출이 아니라 "첫 후보 담기"여야 한다.
          e.preventDefault();
          if (open && candidates.length > 0) add(candidates[0].value);
        }}
        className={inputClassName}
      />

      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
          {candidates.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => add(o.value)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-green-light"
            >
              {o.label}
              {o.sublabel && <span className="ml-1 text-xs text-slate-400">{o.sublabel}</span>}
            </button>
          ))}
          {candidates.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">검색 결과 없음</p>}
        </div>
      )}
    </div>
  );
}
