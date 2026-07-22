"use client";

import { useTransition } from "react";
import { updateUserRole } from "./actions";

type Role = "ADMIN" | "EVALUATOR" | "EMPLOYEE";

export function RoleSelect({ userId, role }: { userId: string; role: Role }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={role}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as Role;
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
