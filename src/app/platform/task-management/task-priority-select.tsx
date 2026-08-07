"use client";

import { useTransition } from "react";
import { updateTaskPriority } from "./actions";

const PRIORITY_LABEL: Record<string, string> = {
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;

export function TaskPrioritySelect({ taskId, priority }: { taskId: string; priority: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={priority}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as (typeof PRIORITIES)[number];
        startTransition(() => {
          updateTaskPriority(taskId, next);
        });
      }}
      className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
    >
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {PRIORITY_LABEL[p]}
        </option>
      ))}
    </select>
  );
}
