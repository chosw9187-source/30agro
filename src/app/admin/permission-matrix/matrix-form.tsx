"use client";

import { useActionState } from "react";
import { savePermissionMatrix } from "./actions";
import {
  MODULES,
  MODULE_LABEL,
  POSITIONS,
  POSITION_LABEL,
  PERMISSION_SCOPES,
  PERMISSION_SCOPE_LABEL,
  type PermissionScope,
} from "@/lib/permission-constants";

export function MatrixForm({ scopeByKey }: { scopeByKey: Record<string, PermissionScope> }) {
  const [result, formAction, isPending] = useActionState(savePermissionMatrix, undefined);

  return (
    <form action={formAction}>
      <p className="mb-3 text-sm text-slate-600">
        직책별로 각 메뉴에서 어디까지 볼 수 있는지 범위를 설정하세요:{" "}
        <strong>전체</strong>(회사 전체) → <strong>사업단위</strong> →{" "}
        <strong>부문</strong> → <strong>팀</strong> → <strong>본인</strong> →{" "}
        <strong>접근 불가</strong>(사이드바와 해당 화면 모두 숨김). 관리자(역할)는
        항상 전체 접근 가능합니다.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">모듈 \ 직책</th>
              {POSITIONS.map((p) => (
                <th key={p} className="px-4 py-3 text-center font-medium">
                  {POSITION_LABEL[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m) => (
              <tr key={m} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{MODULE_LABEL[m]}</td>
                {POSITIONS.map((p) => {
                  const key = `${m}:${p}`;
                  const current = scopeByKey[key] ?? "FULL";
                  return (
                    <td key={p} className="px-4 py-3 text-center">
                      <select
                        name={key}
                        defaultValue={current}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        {PERMISSION_SCOPES.map((s) => (
                          <option key={s} value={s}>
                            {PERMISSION_SCOPE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
        {result && <p className="text-sm text-brand-green-dark">저장되었습니다.</p>}
      </div>
    </form>
  );
}
