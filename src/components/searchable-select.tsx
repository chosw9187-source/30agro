"use client";

import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string; sublabel?: string };

export function SearchableSelect({
  name,
  options,
  defaultValue = "",
  placeholder = "검색...",
  emptyLabel = "없음",
}: {
  name: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const initial = options.find((o) => o.value === defaultValue) ?? null;
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState(initial?.label ?? "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = options.filter((o) => o.label.includes(query)).slice(0, 30);

  function select(opt: Option | null) {
    setValue(opt?.value ?? "");
    setQuery(opt?.label ?? "");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setValue("");
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key !== "Enter" || !open) return;
          // 검색 중의 엔터는 폼 제출이 아니라 "첫 후보 선택"이어야 한다.
          // 이름을 치고 엔터를 누르면 아무것도 고르지 않은 채 폼이 제출돼
          // "직원을 선택해 주세요"만 돌아왔다.
          e.preventDefault();
          if (filtered.length > 0) select(filtered[0]);
        }}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => select(null)}
            className="block w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
          >
            {emptyLabel}
          </button>
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => select(o)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-green-light"
            >
              {o.label}
              {o.sublabel && <span className="ml-1 text-xs text-slate-400">{o.sublabel}</span>}
            </button>
          ))}
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">검색 결과 없음</p>}
        </div>
      )}
    </div>
  );
}
