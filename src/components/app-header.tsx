import Link from "next/link";
import { signOut } from "@/auth";

const roleLabel: Record<string, string> = {
  ADMIN: "인사팀 관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

export function AppHeader({
  title,
  navLinks,
  user,
}: {
  title: string;
  navLinks: { href: string; label: string }[];
  user: { name?: string | null; role: string };
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold">{title}</span>
          <nav className="flex gap-4 text-sm text-slate-600">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-slate-900 hover:underline"
              >
                {link.label}
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
              className="rounded border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
