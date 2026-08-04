"use client";

import { useActionState } from "react";
import { uploadAppointmentRecords } from "./actions";

export function AppointmentUploadForm() {
  const [result, formAction, isPending] = useActionState(
    uploadAppointmentRecords,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        엑셀 컬럼: <strong>사번 / 발령일</strong>은 필수, <strong>발령구분 /
        발령명 / 부서(또는 근무부서) / 직위(또는 직책) / 직급 / 발령내역</strong>은
        있으면 함께 반영됩니다. 매 행이 새 이력으로 누적되며(덮어쓰지 않음),
        같은 사번을 여러 번 올려도 각각 별도 기록으로 쌓입니다.
      </p>
      <a
        href="/api/admin/appointment-records/template"
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
        {isPending ? "업로드 중..." : "발령사항 업로드"}
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
