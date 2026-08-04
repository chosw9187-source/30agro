"use client";

import { useActionState } from "react";
import { uploadPerformanceHistory } from "./actions";

export function PerformanceHistoryUploadForm() {
  const [result, formAction, isPending] = useActionState(
    uploadPerformanceHistory,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        엑셀 컬럼: <strong>사번 / 연도</strong>는 필수, <strong>등급 / 점수 /
        비고</strong>는 있으면 함께 반영됩니다. 같은 사번+연도를 다시 올리면
        갱신되고, 새 연도는 누적됩니다. 처음에는 최소 3개년치를 한 번에
        올리고, 이후 매년 한 해씩 추가로 올려주세요.
      </p>
      <a
        href="/api/admin/performance-history/template"
        className="self-start text-sm text-brand-green hover:underline"
      >
        업로드 양식 다운로드 (.xlsx)
      </a>
      <input
        type="file"
        name="file"
        accept=".xlsx,.xls"
        required
        className="rounded border border-slate-300 px-3 py-2"
      />
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark disabled:opacity-50"
      >
        {isPending ? "업로드 중..." : "인사평가 이력 업로드"}
      </button>
      {result && (
        <div className="rounded bg-slate-50 p-3 text-sm">
          <p>반영 {result.applied}건</p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-red-600">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
