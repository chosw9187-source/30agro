"use client";

import { useState, useTransition } from "react";
import { updateUserJobGrade } from "./actions";

export function JobGradeEditor({
  userId,
  jobGrade,
}: {
  userId: string;
  jobGrade: string | null;
}) {
  const [value, setValue] = useState(jobGrade ?? "");
  const [isPending, startTransition] = useTransition();

  function commit() {
    const trimmed = value.trim();
    if (trimmed === (jobGrade ?? "")) return;
    startTransition(() => {
      updateUserJobGrade(userId, trimmed);
    });
  }

  return (
    <input
      value={value}
      placeholder="-"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      disabled={isPending}
      className="w-20 rounded border border-transparent px-1.5 py-1 text-slate-600 hover:border-slate-300 focus:border-brand-green focus:outline-none disabled:opacity-50"
    />
  );
}
