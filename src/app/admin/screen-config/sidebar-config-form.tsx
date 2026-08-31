"use client";

import { useActionState, useState } from "react";
import { saveSidebarConfig } from "./actions";
import {
  SIDEBAR_MODULES,
  MODULE_LABEL,
  ADMIN_ONLY_MODULES,
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
  // 저장 후 서버가 새 config를 내려줘도 방금 입력한 이름이 되돌아가지 않도록
  // 로컬에서 통제한다 (다른 defaultValue 필드들과 달리 이건 되돌아가면 눈에
  // 바로 띄어서 반드시 controlled로 둬야 함).
  const [labels, setLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries(SIDEBAR_MODULES.map((m) => [m, config[m].label ?? ""]))
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        사이드바에 나오는 순서, &quot;개발 중&quot; 배지 표시 여부, 사이드바에서
        완전히 숨길지, 그리고 사이드바에 표시할 이름을 항목별로 설정하세요.
        이름을 비워두면 기본 이름을 그대로 씁니다. 홈/알림은 항상 맨 위·맨 아래
        고정입니다.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">메뉴</th>
              <th className="px-4 py-3 font-medium">표시 이름</th>
              <th className="px-4 py-3 font-medium">순서</th>
              <th className="px-4 py-3 font-medium">개발 중 배지</th>
              <th className="px-4 py-3 font-medium">사이드바에서 숨기기</th>
            </tr>
          </thead>
          <tbody>
            {orderedModules.map((m) => (
              <tr key={m} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">
                  {MODULE_LABEL[m]}
                  {ADMIN_ONLY_MODULES.has(m) && (
                    <span
                      className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-normal text-slate-600"
                      title="이 메뉴는 관리자에게만 열려 있습니다. 아래 설정과 관계없이 다른 역할에는 보이지 않고, URL로 직접 들어와도 막힙니다."
                    >
                      관리자 전용
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    name={`label:${m}`}
                    value={labels[m]}
                    onChange={(e) => setLabels((v) => ({ ...v, [m]: e.target.value }))}
                    placeholder={MODULE_LABEL[m]}
                    className="w-36 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
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
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    name={`hidden:${m}`}
                    defaultChecked={config[m].hidden}
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
