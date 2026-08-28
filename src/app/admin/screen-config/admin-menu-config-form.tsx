"use client";

import { useActionState } from "react";
import { saveAdminMenuConfig } from "./actions";
import { ADMIN_MENU_ITEMS, type AdminMenuKey } from "@/lib/permission-constants";

export function AdminMenuConfigForm({ hidden }: { hidden: Set<AdminMenuKey> }) {
  const [result, formAction, isPending] = useActionState(saveAdminMenuConfig, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        사이드바 &quot;관리&quot; 섹션 메뉴를 항목별로 숨길 수 있습니다. 숨겨도
        해당 화면 자체가 없어지는 건 아니고 사이드바에만 안 보입니다 — URL을
        직접 아는 관리자는 여전히 들어갈 수 있어요.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">메뉴</th>
              <th className="px-4 py-3 font-medium">사이드바에서 숨기기</th>
            </tr>
          </thead>
          <tbody>
            {ADMIN_MENU_ITEMS.map((item) => (
              <tr key={item.key} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{item.label}</td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    name={`hidden:${item.key}`}
                    defaultChecked={hidden.has(item.key)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
        {result && <p className="text-sm text-brand-green-dark">저장되었습니다.</p>}
      </div>
    </form>
  );
}
