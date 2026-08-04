"use client";

import { useTransition } from "react";
import { updateUserGender } from "./actions";

export function GenderSelect({ userId, gender }: { userId: string; gender: string | null }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={gender ?? ""}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(() => {
          updateUserGender(userId, next);
        });
      }}
      className="rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
    >
      <option value="">미입력</option>
      <option value="남">남</option>
      <option value="여">여</option>
    </select>
  );
}
