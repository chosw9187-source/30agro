import Link from "next/link";
import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlatformSidebar } from "@/components/platform-sidebar";
import { CompanyLogo } from "@/components/company-logo";
import { Watermark } from "@/components/watermark";
import { SessionHeartbeat } from "@/components/session-heartbeat";
import { getVisibleModules, getModuleUiConfig, type Position } from "@/lib/permissions";
import { logPageView } from "@/lib/page-view";

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
    logPageView(user.id),
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
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const watermarkText = [user.name, user.email, viewedAt].filter(Boolean).join(" · ");

  return (
    <div className="flex min-w-0 flex-1">
      <input type="checkbox" id="mobile-nav-toggle" className="peer hidden" />
      <label
        htmlFor="mobile-nav-toggle"
        aria-hidden="true"
        className="fixed inset-0 z-30 hidden bg-black/40 peer-checked:block md:!hidden"
      />
      <Watermark text={watermarkText} />
      <SessionHeartbeat />
      <PlatformSidebar
        role={user.role}
        user={{ ...user, position }}
        notificationCount={notificationCount}
        onLogout={logout}
        visibleModules={[...visibleModules]}
        moduleUiConfig={moduleUiConfig}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 text-sm md:px-8">
          <div className="flex items-center gap-3">
            <label
              htmlFor="mobile-nav-toggle"
              aria-label="메뉴 열기"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-slate-300 text-lg text-slate-700 md:hidden"
            >
              ☰
            </label>
            <CompanyLogo className="h-9" />
          </div>
          <Link
            href="/platform/support"
            className="rounded border border-slate-300 px-3 py-1.5 text-slate-700 hover:border-brand-green hover:text-brand-green"
          >
            관리자에게 문의하기
          </Link>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
