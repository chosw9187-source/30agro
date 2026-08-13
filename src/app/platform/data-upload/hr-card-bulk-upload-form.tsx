"use client";

import { useActionState } from "react";
import { uploadHrCardBulk } from "./actions";

function SectionResult({ label, result }: { label: string; result: { applied: number; errors: string[] } }) {
  if (result.applied === 0 && result.errors.length === 0) return null;
  return (
    <div>
      <p>
        {label}: 반영 {result.applied}건
      </p>
      {result.errors.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-red-600">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HrCardBulkUploadForm() {
  const [result, formAction, isPending] = useActionState(uploadHrCardBulk, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        엑셀 파일 하나에 <strong>발령사항 / 자격사항 / 상벌사항</strong> 시트를 각각 넣어서 한 번에
        올립니다 — 시트 이름이 정확히 일치해야 하고, 없는 시트는 건너뜁니다. 발령사항은
        같은 사번+발령일이면 갱신되고, 자격사항/상벌사항은 매번 새로 추가됩니다.
      </p>
      <a
        href="/api/admin/hr-card-bulk/template"
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
        {isPending ? "업로드 중..." : "발령/자격/상벌 일괄 업로드"}
      </button>
      {result && (
        <div className="flex flex-col gap-2 rounded bg-slate-50 p-3 text-sm">
          <SectionResult label="발령사항" result={result.appointments} />
          <SectionResult label="자격사항" result={result.certifications} />
          <SectionResult label="상벌사항" result={result.commendationDiscipline} />
        </div>
      )}
    </form>
  );
}
