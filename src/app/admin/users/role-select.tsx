"use client";

import { useState, useTransition } from "react";
import { updateUserRole } from "./actions";

type Role = "ADMIN" | "EVALUATOR" | "EMPLOYEE";

export function RoleSelect({ userId, role }: { userId: string; role: Role }) {
  const [isPending, startTransition] = useTransition();
  // Controlled locally so a post-save server refresh (which hands this
  // component a fresh `role` prop) can't snap the just-picked value back —
  // defaultValue alone doesn't survive that, same bug fixed earlier in the
  // permission matrix selects.
  const [value, setValue] = useState<Role>(role);

  return (
    <select
      value={value}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as Role;
        setValue(next);
        startTransition(() => {
          updateUserRole(userId, next);
        });
      }}
      className="rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
    >
      <option value="ADMIN">관리자</option>
      <option value="EVALUATOR">평가자</option>
      <option value="EMPLOYEE">직원</option>
    </select>
  );
}
