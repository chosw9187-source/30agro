"use client";

import { useActionState } from "react";
import { uploadJobDescriptionFile } from "./actions";

export function JobFileUploadForm({ teamId }: { teamId: string }) {
  const [result, formAction, isPending] = useActionState(
    uploadJobDescriptionFile.bind(null, teamId),
    undefined
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.doc,.docx,.xls,.xlsx,.hwp,.hwpx"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark disabled:opacity-50"
        >
          {isPending ? "업로드 중..." : "업로드 (덮어쓰기)"}
        </button>
      </div>
      {result && (
        <p className="text-xs text-slate-500">
          {result.fileName} 업로드 완료 · 직무목적 {result.purposeExtracted ? "추출됨" : "추출 안 됨"} ·
          담당업무 {result.responsibilitiesExtracted ? "추출됨" : "추출 안 됨"} · 자격사항{" "}
          {result.qualificationsExtracted ? "추출됨" : "추출 안 됨"} · 외국어{" "}
          {result.languagesExtracted ? "추출됨" : "추출 안 됨"}
          {(!result.purposeExtracted ||
            !result.responsibilitiesExtracted ||
            !result.qualificationsExtracted ||
            !result.languagesExtracted) &&
            " (추출 안 된 항목은 문서 형식 확인 후 직접 입력해주세요)"}
        </p>
      )}
    </form>
  );
}
