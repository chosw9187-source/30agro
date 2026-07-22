"use client";

import { useTransition } from "react";
import { toggleTargetYear } from "./target-year-actions";

export function TargetYearToggle({
  userId,
  year,
  active,
}: {
  userId: string;
  year: number;
  active: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={active}
      disabled={isPending}
      onChange={(e) => {
        const checked = e.target.checked;
        startTransition(() => {
          toggleTargetYear(userId, year, checked);
        });
      }}
      className="h-4 w-4 disabled:opacity-50"
    />
  );
}
