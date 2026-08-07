"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function FilterSelect({
  paramKey,
  options,
  ariaLabel,
}: {
  paramKey: string;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      defaultValue={searchParams.get(paramKey) ?? options[0]?.value}
      aria-label={ariaLabel}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set(paramKey, e.target.value);
        router.push(`${pathname}?${params.toString()}`);
      }}
      className="rounded border border-slate-300 px-2.5 py-1.5 text-xs"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
