import Link from "next/link";
import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlatformSidebar } from "@/components/platform-sidebar";
import { CompanyLogo } from "@/components/company-logo";
import { Watermark } from "@/components/watermark";
import { getVisibleModules, getModuleUiConfig, type Position } from "@/lib/permissions";

export async function PlatformShell({
  user,
  children,
}: {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    role: "ADMIN" | "EVALUATOR" | "EMPLOYEE";
  };
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

  const viewedAt = new Date().toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const watermarkText = [user.name, user.email, viewedAt].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-1">
      <Watermark text={watermarkText} />
      <PlatformSidebar
        role={user.role}
        user={{ ...user, position }}
        notificationCount={notificationCount}
        onLogout={logout}
        visibleModules={[...visibleModules]}
        moduleUiConfig={moduleUiConfig}
      />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-3 text-sm">
          <CompanyLogo className="h-9" />
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
