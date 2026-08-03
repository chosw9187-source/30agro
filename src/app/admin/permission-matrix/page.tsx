import { prisma } from "@/lib/prisma";
import { savePermissionMatrix } from "./actions";
import { MODULES, MODULE_LABEL, POSITIONS, POSITION_LABEL } from "@/lib/permissions";

export default async function PermissionMatrixPage() {
  const hiddenRows = await prisma.permissionMatrixEntry.findMany({
    where: { visible: false },
  });
  const hidden = new Set(hiddenRows.map((r) => `${r.module}:${r.position}`));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">권한 매트릭스</h1>
        <p className="mt-1 text-slate-600">
          직책별로 어떤 메뉴가 보일지 설정하세요. 체크 해제하면 그 직책에게는
          사이드바와 해당 화면 접근이 모두 숨겨집니다. 관리자(역할)는 항상 전체
          접근 가능합니다.
        </p>
      </div>

      <form action={savePermissionMatrix}>
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
                    return (
                      <td key={p} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          name="cell"
                          value={key}
                          defaultChecked={!hidden.has(key)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="submit"
          className="mt-4 rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark"
        >
          저장
        </button>
      </form>
    </div>
  );
}
