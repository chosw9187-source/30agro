"use client";

import { useActionState, useState } from "react";
import { saveUserPermissionOverrides } from "./actions";
import {
  MODULES,
  ADMIN_ONLY_MODULES,
  MODULE_LABEL,
  POSITION_LABEL,
  PERMISSION_SCOPES,
  PERMISSION_SCOPE_LABEL,
  type Position,
  type PermissionScope,
} from "@/lib/permission-constants";

const DEFAULT_SENTINEL = "DEFAULT";

export function UserOverrideForm({
  userId,
  userName,
  userPosition,
  overrideByModule,
}: {
  userId: string;
  userName: string;
  userPosition: Position;
  overrideByModule: Record<string, PermissionScope>;
}) {
  const [result, formAction, isPending] = useActionState(
    saveUserPermissionOverrides.bind(null, userId),
    undefined
  );
  // See matrix-form.tsx: keep this controlled locally so a post-save
  // server refresh can't snap the selection back to the old value.
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(MODULES.map((m) => [m, overrideByModule[m] ?? DEFAULT_SENTINEL])),
  }));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-1 text-sm font-medium text-slate-700">{userName}님 개별 권한 설정</h3>
      <p className="mb-3 text-xs text-slate-500">
        직책 기본값({POSITION_LABEL[userPosition]}의 권한 매트릭스 설정)을 그대로 쓰려면
        &quot;직책 기본값&quot;을 선택하세요. 그 외 값을 선택하면 직책 기본값보다 우선 적용됩니다.
        단, 인사카드 상세 열람은 직책별 상한을 넘지 못해서 여기서 넓게 잡아도
        {" "}{POSITION_LABEL[userPosition]}의 상한까지만 열립니다.
      </p>
      <form action={formAction} className="flex flex-col gap-2">
        {MODULES.filter((m) => !ADMIN_ONLY_MODULES.has(m)).map((m) => (
          <div key={m} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-700">{MODULE_LABEL[m]}</span>
            <select
              name={m}
              value={values[m] ?? DEFAULT_SENTINEL}
              onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            >
              <option value={DEFAULT_SENTINEL}>직책 기본값</option>
              {PERMISSION_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {PERMISSION_SCOPE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="self-start rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
          {result && <p className="text-sm text-brand-green-dark">저장되었습니다.</p>}
        </div>
      </form>
    </div>
  );
}
