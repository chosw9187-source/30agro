"use client";

import { useActionState } from "react";
import { importUsersFromExcel } from "./import-actions";

export function ImportUsersForm() {
  const [result, formAction, isPending] = useActionState(
    importUsersFromExcel,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        엑셀 파일의 첫 행은 헤더로, <strong>이름 / 사번 / 이메일주소 / 팀명</strong> 열이
        있어야 합니다. 이메일이 이미 존재하면 정보를 갱신하고, 새 이메일이면 직원
        권한으로 새로 등록합니다. 비밀번호는 사번으로 자동 설정됩니다.
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
