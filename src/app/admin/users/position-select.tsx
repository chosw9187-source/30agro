"use client";

import { useTransition } from "react";
import { updateUserPosition } from "./actions";
import { POSITIONS, POSITION_LABEL, type Position } from "@/lib/permissions";

export function PositionSelect({
  userId,
  position,
}: {
  userId: string;
  position: Position;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={position}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as Position;
        startTransition(() => {
          updateUserPosition(userId, next);
        });
      }}
      className="rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
    >
      {POSITIONS.map((p) => (
        <option key={p} value={p}>
          {POSITION_LABEL[p]}
        </option>
      ))}
    </select>
  );
}
