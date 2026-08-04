import Link from "next/link";
import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlatformSidebar } from "@/components/platform-sidebar";
import { getVisibleModules, getModuleUiConfig, type Position } from "@/lib/permissions";

export async function PlatformShell({
  user,
  children,
}: {
  user: { id: string; name?: string | null; role: "ADMIN" | "EVALUATOR" | "EMPLOYEE" };
  children: React.ReactNode;
}) {
  const [notificationCount, dbUser] = await Promise.all([
    prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { position: true } }),
  ]);
  const position = (dbUser?.position ?? "STAFF") as Position;
  const [visibleModules, moduleUiConfig] = await Promise.all([
    getVisibleModules(user.id, user.role, position),
    getModuleUiConfig(),
  ]);

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex flex-1">
      <PlatformSidebar
        role={user.role}
        user={{ ...user, position }}
        notificationCount={notificationCount}
        onLogout={logout}
        visibleModules={[...visibleModules]}
        moduleUiConfig={moduleUiConfig}
      />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-slate-200 bg-white px-8 py-3 text-sm">
          <Link
            href="/platform/support"
            className="rounded border border-slate-300 px-3 py-1.5 text-slate-700 hover:border-brand-green hover:text-brand-green"
          >
            관리자에게 문의하기
          </Link>
        </header>
        <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
