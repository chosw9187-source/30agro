import { signOut } from "@/auth";
import { PlatformSidebar } from "@/components/platform-sidebar";

const roleLabel: Record<string, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

export function PlatformShell({
  user,
  children,
}: {
  user: { name?: string | null; role: "ADMIN" | "EVALUATOR" | "EMPLOYEE" };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1">
      <PlatformSidebar role={user.role} />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-8 py-3 text-sm">
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
        </header>
        <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
