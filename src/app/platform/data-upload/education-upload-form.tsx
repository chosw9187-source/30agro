"use client";

import { useActionState } from "react";
import { uploadEducationRecords } from "./actions";

export function EducationUploadForm() {
  const [result, formAction, isPending] = useActionState(
    uploadEducationRecords,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        엑셀 컬럼: <strong>사번 / 학력구분</strong>은 필수(학력구분은
        고등학교/대학교/대학원(석사)/대학원(박사) 중 하나), <strong>학교명 /
        전공 / 학위</strong>는 있으면 함께 반영됩니다. 한 사람당 여러 학력
        단계를 각각 한 행씩 올리면 됩니다. 편입·복수전공 등으로 같은
        학력구분에 학교가 2곳 이상이면 행을 나눠 각각 다른 학교명으로
        올리면 모두 반영됩니다. 같은 사번+학력구분+학교명을 다시 올리면
        갱신됩니다.
      </p>
      <a
        href="/api/admin/education-records/template"
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
        {isPending ? "업로드 중..." : "학력 업로드"}
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
