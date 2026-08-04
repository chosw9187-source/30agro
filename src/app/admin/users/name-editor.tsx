"use client";

import { useState, useTransition } from "react";
import { updateUserName } from "./actions";

export function NameEditor({ userId, name }: { userId: string; name: string }) {
  const [value, setValue] = useState(name);
  const [isPending, startTransition] = useTransition();

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setValue(name);
      return;
    }
    if (trimmed === name) return;
    startTransition(() => {
      updateUserName(userId, trimmed);
    });
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      disabled={isPending}
      className="w-28 rounded border border-transparent px-1.5 py-1 hover:border-slate-300 focus:border-brand-green focus:outline-none disabled:opacity-50"
    />
  );
}
