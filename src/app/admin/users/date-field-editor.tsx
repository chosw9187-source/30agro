"use client";

import { useState, useTransition } from "react";

function toInputValue(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function DateFieldEditor({
  userId,
  value,
  action,
}: {
  userId: string;
  value: Date | null;
  action: (userId: string, value: string) => Promise<void>;
}) {
  const initial = toInputValue(value);
  const [val, setVal] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function commit() {
    if (val === initial) return;
    startTransition(() => {
      action(userId, val);
    });
  }

  return (
    <input
      type="date"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      disabled={isPending}
      className="w-32 rounded border border-transparent px-1.5 py-1 text-slate-600 hover:border-slate-300 focus:border-brand-green focus:outline-none disabled:opacity-50"
    />
  );
}
