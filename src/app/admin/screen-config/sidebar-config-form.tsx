"use client";

import { useActionState } from "react";
import { saveSidebarConfig } from "./actions";
import {
  SIDEBAR_MODULES,
  MODULE_LABEL,
  type ModuleUiConfigEntry,
  type Module,
} from "@/lib/permission-constants";

export function SidebarConfigForm({
  config,
}: {
  config: Record<Module, ModuleUiConfigEntry>;
}) {
  const [result, formAction, isPending] = useActionState(saveSidebarConfig, undefined);
  const orderedModules = [...SIDEBAR_MODULES].sort((a, b) => config[a].order - config[b].order);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        사이드바에 나오는 순서와 &quot;개발 중&quot; 배지 표시 여부를 항목별로
        설정하세요. 홈/알림은 항상 맨 위·맨 아래 고정입니다.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">메뉴</th>
              <th className="px-4 py-3 font-medium">순서</th>
              <th className="px-4 py-3 font-medium">개발 중 배지</th>
            </tr>
          </thead>
          <tbody>
            {orderedModules.map((m) => (
              <tr key={m} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{MODULE_LABEL[m]}</td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    name={`order:${m}`}
                    defaultValue={config[m].order}
                    className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    name={`comingSoon:${m}`}
                    defaultChecked={config[m].comingSoon}
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
