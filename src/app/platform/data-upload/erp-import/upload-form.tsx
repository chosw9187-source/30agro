"use client";

import { useActionState } from "react";
import { uploadErpBatch } from "./actions";

export function ErpUploadForm() {
  const [error, formAction, isPending] = useActionState(uploadErpBatch, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        ERP에서 뽑은 사원명부조회 원본 엑셀을 그대로 올리세요. 바로 반영되지
        않고, 다음 화면에서 신규/변경/변동없음/퇴직전환/매핑필요로 미리
        분류해서 보여줍니다. 관리자가 확인하고 승인한 행만 실제 반영됩니다.
      </p>
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
        {isPending ? "업로드 및 분석 중..." : "업로드하고 미리보기"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
