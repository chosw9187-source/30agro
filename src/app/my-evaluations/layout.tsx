import { requireRole } from "@/lib/auth-helpers";
import { AppHeader } from "@/components/app-header";

const navLinks = [{ href: "/my-evaluations", label: "내 평가 결과" }];

export default async function MyEvaluationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("EMPLOYEE");

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader title="내 평가" navLinks={navLinks} user={session.user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
