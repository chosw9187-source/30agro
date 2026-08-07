"use client";

import { useTransition } from "react";
import { updateTaskStatus } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  TODO: "진행 예정",
  IN_PROGRESS: "진행 중",
  REVIEW: "검토 중",
  DONE: "완료",
};
const STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;

export function TaskStatusSelect({ taskId, status }: { taskId: string; status: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={status}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as (typeof STATUSES)[number];
        startTransition(() => {
          updateTaskStatus(taskId, next);
        });
      }}
      className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
