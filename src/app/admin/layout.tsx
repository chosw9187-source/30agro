import { requireRole } from "@/lib/auth-helpers";
import { signOut } from "@/auth";
import { PlatformSidebar } from "@/components/platform-sidebar";

const roleLabel: Record<string, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("ADMIN");

  return (
    <div className="flex flex-1">
      <PlatformSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-8 py-3 text-sm">
          <span className="text-slate-500">
            {session.user.name} ({roleLabel[session.user.role] ?? session.user.role})
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
        </header>
        <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
