"use client";

import { useActionState } from "react";
import { applyRecommendedEmployeeScope } from "./actions";

export function RecommendedScopeButton() {
  const [result, formAction, isPending] = useActionState(
    applyRecommendedEmployeeScope,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={isPending}
        className="whitespace-nowrap rounded border border-brand-green px-3 py-1.5 text-sm text-brand-green-dark hover:bg-brand-green-light disabled:opacity-50"
      >
        {isPending ? "적용 중..." : "직원정보조회에 표준 설정 적용"}
      </button>
      {result && <p className="text-xs text-brand-green-dark">적용되었습니다.</p>}
    </form>
  );
}
