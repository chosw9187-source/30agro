import { requireRole } from "@/lib/auth-helpers";
import { AppHeader } from "@/components/app-header";

const navLinks = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/templates", label: "평가 템플릿" },
  { href: "/admin/cycles", label: "평가 사이클" },
  { href: "/admin/teams", label: "팀 관리" },
  { href: "/admin/users", label: "사용자 관리" },
  { href: "/admin/reports", label: "결과 다운로드" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("ADMIN");

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader title="인사팀 관리자" navLinks={navLinks} user={session.user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
