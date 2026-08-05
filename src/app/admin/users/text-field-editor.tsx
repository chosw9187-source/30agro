"use client";

import { useState, useTransition } from "react";

export function TextFieldEditor({
  userId,
  value,
  action,
  placeholder = "-",
  width = "w-24",
  listId,
}: {
  userId: string;
  value: string | null;
  action: (userId: string, value: string) => Promise<void>;
  placeholder?: string;
  width?: string;
  listId?: string;
}) {
  const [val, setVal] = useState(value ?? "");
  const [isPending, startTransition] = useTransition();

  function commit() {
    const trimmed = val.trim();
    if (trimmed === (value ?? "")) return;
    startTransition(() => {
      action(userId, trimmed);
    });
  }

  return (
    <input
      value={val}
      list={listId}
      placeholder={placeholder}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      disabled={isPending}
      className={`${width} rounded border border-transparent px-1.5 py-1 text-slate-600 hover:border-slate-300 focus:border-brand-green focus:outline-none disabled:opacity-50`}
    />
  );
}
