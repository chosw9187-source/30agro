"use client";

import { useRouter } from "next/navigation";

export function TeamFilterSelect({
  teams,
  selected,
}: {
  teams: { id: string; name: string }[];
  selected: string;
}) {
  const router = useRouter();

  return (
    <select
      defaultValue={selected}
      onChange={(e) => {
        const value = e.target.value;
        router.push(value ? `/platform?teamId=${value}` : "/platform");
      }}
      className="rounded border border-slate-300 px-3 py-1.5 text-sm"
    >
      <option value="">전체 팀</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
