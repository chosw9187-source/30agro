"use client";

import { useTransition } from "react";
import { deleteUser, resetUserPassword } from "./actions";

export function UserRowActions({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => resetUserPassword(userId))}
        className="text-slate-500 hover:underline disabled:opacity-50"
        title="비밀번호를 사번으로 초기화하고 다음 로그인 시 변경을 요구합니다"
      >
        비밀번호 초기화
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => deleteUser(userId))}
        className="text-red-600 hover:underline disabled:opacity-50"
      >
        삭제
      </button>
    </div>
  );
}
