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
          {result.fileName} 업로드 완료 ·{" "}
          {result.purposeExtracted
            ? "직무목적 자동 추출됨"
            : "직무목적 자동 추출 안 됨(문서 형식 확인 필요, 직접 입력해주세요)"}{" "}
          ·{" "}
          {result.responsibilitiesExtracted
            ? "담당업무 자동 추출됨"
            : "담당업무 자동 추출 안 됨(문서 형식 확인 필요, 직접 입력해주세요)"}
        </p>
      )}
    </form>
  );
}
