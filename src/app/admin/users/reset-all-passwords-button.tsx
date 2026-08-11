"use client";

import { useTransition } from "react";
import { resetAllPasswords } from "./actions";

export function ResetAllPasswordsButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("본인 계정을 제외한 전체 직원의 비밀번호를 각자의 사번으로 초기화합니다. 계속할까요?")) return;
        startTransition(() => resetAllPasswords());
      }}
      className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      title="본인 계정은 제외하고 전체 직원의 비밀번호를 사번으로 초기화합니다"
    >
      {isPending ? "초기화 중…" : "전체 비밀번호 초기화"}
    </button>
  );
}
