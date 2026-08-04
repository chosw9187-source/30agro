"use client";

import { useActionState } from "react";
import { seedJobDescriptionsFromDraft } from "./actions";

export function SeedDraftForm() {
  const [result, formAction, isPending] = useActionState(
    seedJobDescriptionsFromDraft,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <button
        type="submit"
        disabled={isPending}
        className="whitespace-nowrap rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
      >
        {isPending ? "불러오는 중..." : "초안 PDF로 기본값 불러오기"}
      </button>
      {result && (
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <p>
            초안 파일 {result.filesFound}개 중 {result.teamsMatched}개 팀에 매칭 ·
            직무목적 {result.purposeFilled}건 · 담당업무 {result.responsibilitiesFilled}건
            새로 채움
          </p>
          {result.unmatchedFiles.length > 0 && (
            <p className="mt-1 text-amber-600">
              팀 이름과 매칭되지 않은 파일: {result.unmatchedFiles.join(", ")}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
