"use client";

import { useTransition } from "react";
import { toggleSubtask } from "./actions";

export function SubtaskCheckbox({ subtaskId, done, title }: { subtaskId: string; done: boolean; title: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <label className={`flex flex-1 items-center gap-1.5 ${isPending ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        defaultChecked={done}
        disabled={isPending}
        onChange={() => {
          startTransition(() => {
            toggleSubtask(subtaskId);
          });
        }}
        className="h-3.5 w-3.5 rounded border-slate-300 text-brand-green focus:ring-brand-green"
      />
      <span className={done ? "text-slate-400 line-through" : "text-slate-700"}>{title}</span>
    </label>
  );
}
