"use client";

import { useActionState } from "react";
import { importUsersFromExcel } from "./import-actions";

export function ImportUsersForm({ defaultYear }: { defaultYear: number }) {
  const [result, formAction, isPending] = useActionState(
    importUsersFromExcel,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        엑셀 파일의 첫 행은 헤더로, <strong>이름 / 사번 / 이메일주소 / 팀명</strong> 열이
        필수이고, <strong>직책</strong>(사장/운영책임/책임/팀장/담당),{" "}
        <strong>성별</strong>(남/여), <strong>생년월일 / 입사일 / 퇴사일</strong>
        (YYYY-MM-DD 형식 권장),{" "}
        <strong>사원구분 / 직급 / 학력 / 학교 / 전공 / 학위 / 직군</strong> 열은
        있으면 함께 반영됩니다. 이메일이 이미 존재하면 정보를 갱신하고, 새
        이메일이면 직원 권한으로 새로 등록합니다. 비밀번호는 사번으로 자동
        설정됩니다. 아래 연도의 대상자로도 함께 등록됩니다.
      </p>
      <a
        href="/api/admin/users/template"
        className="self-start text-sm text-brand-green hover:underline"
      >
        업로드 양식 다운로드 (.xlsx)
      </a>
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600">대상 연도</label>
        <input
          type="number"
          name="year"
          defaultValue={defaultYear}
          className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
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
        {isPending ? "업로드 중..." : "엑셀로 일괄 등록"}
      </button>
      {result && (
        <div className="rounded bg-slate-50 p-3 text-sm">
          <p>
            생성 {result.created}건 · 갱신 {result.updated}건
          </p>
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
