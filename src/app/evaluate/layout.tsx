import { requireRole } from "@/lib/auth-helpers";
import { AppHeader } from "@/components/app-header";

const navLinks = [{ href: "/evaluate", label: "내 평가 목록" }];

export default async function EvaluateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("EVALUATOR");

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader title="평가자 화면" navLinks={navLinks} user={session.user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
