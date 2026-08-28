"use client";

import { useActionState, useState } from "react";
import { savePermissionMatrix } from "./actions";
import {
  MODULES,
  MODULE_LABEL,
  POSITIONS,
  POSITION_LABEL,
  PERMISSION_SCOPES,
  PERMISSION_SCOPE_LABEL,
  ADMIN_ONLY_MODULES,
  type PermissionScope,
} from "@/lib/permission-constants";

export function MatrixForm({ scopeByKey }: { scopeByKey: Record<string, PermissionScope> }) {
  const [result, formAction, isPending] = useActionState(savePermissionMatrix, undefined);
  // Controlled locally so a post-save server refresh (which hands this
  // component a fresh `scopeByKey` prop) can't snap an in-progress or
  // just-submitted selection back to the old value — `defaultValue` alone
  // does that because the <select> DOM nodes persist across the refresh.
  const [values, setValues] = useState<Record<string, PermissionScope>>(() => ({ ...scopeByKey }));

  return (
    <form action={formAction}>
      <p className="mb-3 text-sm text-slate-600">
        직책별로 각 메뉴에서 어디까지 볼 수 있는지 범위를 설정하세요:{" "}
        <strong>전체</strong>(회사 전체) → <strong>사업단위</strong> →{" "}
        <strong>부문</strong> → <strong>팀</strong> → <strong>본인</strong> →{" "}
        <strong>접근 불가</strong>(사이드바와 해당 화면 모두 숨김). 관리자(역할)는
        항상 전체 접근 가능합니다.
      </p>
      <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <strong>인사카드 상세는 직책별 상한이 따로 있습니다.</strong> 여기서 더 넓게
        잡아도 사장=전사, 운영책임=본인 사업단위, 책임=본인 부문, 팀장=본인 팀,
        담당=본인 정보까지만 열립니다. 이 표는 상한을 <strong>좁히는</strong> 데만
        쓸 수 있고, 비관리자에게 전 직원 인사카드를 열어주려면 사용자 관리에서
        역할을 관리자로 올려야 합니다.
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
                <td className="px-4 py-3 font-medium">
                  {MODULE_LABEL[m]}
                  {ADMIN_ONLY_MODULES.has(m) && (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-normal text-slate-600">
                      관리자 전용
                    </span>
                  )}
                </td>
                {/* 관리자 전용 모듈은 직책 설정이 아무 효과가 없으므로, 값을
                    고를 수 있게 두면 설정해도 안 열려서 혼란만 준다. */}
                {ADMIN_ONLY_MODULES.has(m) ? (
                  <td
                    colSpan={POSITIONS.length}
                    className="px-4 py-3 text-center text-xs text-slate-500"
                  >
                    관리자(역할)만 접근할 수 있는 메뉴입니다. 직책 설정은 적용되지 않습니다.
                  </td>
                ) : (
                  POSITIONS.map((p) => {
                  const key = `${m}:${p}`;
                  const current = values[key] ?? "FULL";
                  return (
                    <td key={p} className="px-4 py-3 text-center">
                      <select
                        name={key}
                        value={current}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [key]: e.target.value as PermissionScope }))
                        }
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
                  })
                )}
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
