import Link from "next/link";
import { signOut } from "@/auth";
import { CompanyLogo } from "@/components/company-logo";

const roleLabel: Record<string, string> = {
  ADMIN: "인사팀 관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

export function AppHeader({
  title,
  navLinks,
  user,
  notificationCount = 0,
}: {
  title: string;
  navLinks: { href: string; label: string }[];
  user: { name?: string | null; role: string };
  notificationCount?: number;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <CompanyLogo className="h-7 w-auto" />
            <span className="hidden text-sm text-slate-400 sm:inline">|</span>
            <span className="hidden text-sm font-medium text-slate-600 sm:inline">
              {title}
            </span>
          </div>
          <nav className="flex gap-4 text-sm text-slate-600">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative hover:text-brand-green hover:underline"
              >
                {link.label}
                {link.href === "/notifications" && notificationCount > 0 && (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white no-underline">
                    {notificationCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">
            {user.name} ({roleLabel[user.role] ?? user.role})
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded border border-slate-300 px-3 py-1 text-slate-700 hover:border-brand-green hover:text-brand-green"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
