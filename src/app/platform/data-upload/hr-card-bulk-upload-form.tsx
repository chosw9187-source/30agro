"use client";

import { useActionState } from "react";
import { uploadHrCardBulk, dedupeAppointmentRecords, deleteAllEducationRecords } from "./actions";

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
  const [dedupeResult, dedupeAction, isDeduping] = useActionState(dedupeAppointmentRecords, undefined);
  const [deleteEduResult, deleteEduAction, isDeletingEdu] = useActionState(deleteAllEducationRecords, undefined);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-3">
        <p className="text-sm text-slate-500">
          엑셀 파일 하나에 <strong>발령사항 / 학력사항 / 경력사항 / 자격사항 / 상벌사항</strong> 시트를 각각
          넣어서 한 번에 올립니다 — 시트 이름이 정확히 일치해야 하고, 없는 시트는 건너뜁니다. 발령사항·학력사항은
          같은 사번+발령일(또는 학력구분+학교명)이면 갱신되고, 경력사항/자격사항/상벌사항은 매번 새로 추가됩니다.
        </p>
        <a
          href="/api/admin/hr-card-bulk/template"
          className="inline-block self-start py-1.5 text-sm text-brand-green hover:underline sm:py-0"
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
          {isPending ? "업로드 중..." : "인사카드 일괄 업로드"}
        </button>
        {result && (
          <div className="flex flex-col gap-2 rounded bg-slate-50 p-3 text-sm">
            <SectionResult label="발령사항" result={result.appointments} />
            <SectionResult label="학력사항" result={result.education} />
            <SectionResult label="경력사항" result={result.careerHistory} />
            <SectionResult label="자격사항" result={result.certifications} />
            <SectionResult label="상벌사항" result={result.commendationDiscipline} />
          </div>
        )}
      </form>

      <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
        <p className="text-sm font-medium text-slate-700">데이터 정리</p>
        <form action={dedupeAction} className="flex flex-col gap-2">
          <p className="text-sm text-slate-500">
            같은 사번+발령일의 발령 이력이 중복으로 쌓여 있다면, 가장 최근 기록만 남기고 정리합니다.
          </p>
          <button
            type="submit"
            disabled={isDeduping}
            className="self-start rounded border border-brand-green px-4 py-2 text-sm text-brand-green-dark hover:bg-brand-green-light disabled:opacity-50"
          >
            {isDeduping ? "정리 중..." : "중복 발령이력 정리"}
          </button>
          {dedupeResult && (
            <p className="rounded bg-slate-50 p-3 text-sm">중복 {dedupeResult.removed}건을 정리했습니다.</p>
          )}
        </form>
        <form action={deleteEduAction} className="flex flex-col gap-2">
          <p className="text-sm text-slate-500">
            전 직원의 학력 정보를 한 번에 모두 지웁니다. 잘못 올라간 데이터가 많아 처음부터 다시 올리고
            싶을 때 사용하세요. 되돌릴 수 없습니다.
          </p>
          <button
            type="submit"
            disabled={isDeletingEdu}
            className="self-start rounded border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {isDeletingEdu ? "삭제 중..." : "학력 정보 전체 삭제"}
          </button>
          {deleteEduResult && (
            <p className="rounded bg-slate-50 p-3 text-sm">{deleteEduResult.deleted}건을 삭제했습니다.</p>
          )}
        </form>
      </div>
    </div>
  );
}
