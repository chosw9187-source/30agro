"use client";

import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string; sublabel?: string };

export function SearchableSelect({
  name,
  options,
  defaultValue = "",
  placeholder = "검색...",
  emptyLabel = "없음",
  required = false,
}: {
  name: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  emptyLabel?: string;
  /** 목록에서 실제로 하나를 고르지 않으면 폼 제출을 막는다. */
  required?: boolean;
}) {
  const initial = options.find((o) => o.value === defaultValue) ?? null;
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState(initial?.label ?? "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
    실제 값은 hidden input에 들어 있는데, 브라우저는 hidden input에 required를
    걸어도 검사하지 않는다. 그래서 보이는 검색칸에 required를 걸고, "글자는
    쳤는데 목록에서 고르지는 않은" 상태를 따로 막는다 — 그대로 두면 화면에는
    이름이 적혀 있는데 저장되는 값은 비어 있다.
  */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setCustomValidity(required && !value ? "목록에서 하나를 골라 주세요." : "");
  }, [required, value]);

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
        ref={inputRef}
        type="text"
        value={query}
        required={required}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setValue("");
          setOpen(true);
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
