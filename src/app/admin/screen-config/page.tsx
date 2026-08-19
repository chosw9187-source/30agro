import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { HomeLayoutForm } from "./home-layout-form";
import { SidebarConfigForm } from "./sidebar-config-form";
import { AdminMenuConfigForm } from "./admin-menu-config-form";
import {
  POSITIONS,
  POSITION_LABEL,
  getModuleUiConfig,
  getHiddenAdminMenuKeys,
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
  const hidden = new Set(hiddenRows.map((r) => r.block as string));

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

      <HomeLayoutForm position={selected} hidden={hidden} />
    </div>
  );
}

async function SidebarTab() {
  const config = await getModuleUiConfig();
  return <SidebarConfigForm config={config} />;
}

async function AdminMenuTab() {
  const hidden = await getHiddenAdminMenuKeys();
  return <AdminMenuConfigForm hidden={hidden} />;
}

export default async function ScreenConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; position?: string }>;
}) {
  const params = await searchParams;
  const activeTab =
    params.tab === "sidebar" ? "sidebar" : params.tab === "admin-menu" ? "admin-menu" : "home";
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
        <TabLink
          href="/admin/screen-config?tab=admin-menu"
          label="관리 메뉴"
          active={activeTab === "admin-menu"}
        />
      </div>

      {activeTab === "home" ? (
        <HomeTab selected={selected} />
      ) : activeTab === "sidebar" ? (
        <SidebarTab />
      ) : (
        <AdminMenuTab />
      )}
    </div>
  );
}
