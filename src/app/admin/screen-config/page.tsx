import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { saveHomeLayout, saveSidebarConfig } from "./actions";
import {
  HOME_BLOCKS,
  HOME_BLOCK_LABEL,
  POSITIONS,
  POSITION_LABEL,
  SIDEBAR_MODULES,
  MODULE_LABEL,
  getModuleUiConfig,
  type Position,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded px-3 py-1.5 text-sm ${
        active ? "bg-brand-green text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );
}

async function HomeTab({ selected }: { selected: Position }) {
  const hiddenRows = await prisma.homeLayoutEntry.findMany({
    where: { position: selected, visible: false },
  });
  const hidden = new Set(hiddenRows.map((r) => r.block));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {POSITIONS.map((p) => (
          <Link
            key={p}
            href={`/admin/screen-config?tab=home&position=${p}`}
            className={`rounded px-3 py-1.5 text-sm ${
              p === selected
                ? "bg-brand-green text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {POSITION_LABEL[p]}
          </Link>
        ))}
      </div>

      <form
        action={saveHomeLayout.bind(null, selected)}
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <p className="mb-4 text-sm font-medium text-slate-700">
          {POSITION_LABEL[selected]}의 홈 화면 블록
        </p>
        <div className="flex flex-col gap-2">
          {HOME_BLOCKS.map((b) => (
            <label key={b} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="block" value={b} defaultChecked={!hidden.has(b)} />
              {HOME_BLOCK_LABEL[b]}
            </label>
          ))}
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

async function SidebarTab() {
  const config = await getModuleUiConfig();
  const orderedModules = [...SIDEBAR_MODULES].sort((a, b) => config[a].order - config[b].order);

  return (
    <form action={saveSidebarConfig} className="flex flex-col gap-4">
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
      <button
        type="submit"
        className="self-start rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark"
      >
        저장
      </button>
    </form>
  );
}

export default async function ScreenConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; position?: string }>;
}) {
  const params = await searchParams;
  const activeTab = params.tab === "sidebar" ? "sidebar" : "home";
  const selected: Position = POSITIONS.includes(params.position as Position)
    ? (params.position as Position)
    : "STAFF";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">화면 구성</h1>
        <p className="mt-1 text-slate-600">
          직책별로 홈 화면에 어떤 블록을 보여줄지, 사이드바 메뉴 순서와 개발
          중 배지를 설정하세요.
        </p>
      </div>

      <div className="flex gap-2">
        <TabLink href="/admin/screen-config?tab=home" label="홈 화면" active={activeTab === "home"} />
        <TabLink href="/admin/screen-config?tab=sidebar" label="사이드바" active={activeTab === "sidebar"} />
      </div>

      {activeTab === "home" ? <HomeTab selected={selected} /> : <SidebarTab />}
    </div>
  );
}
