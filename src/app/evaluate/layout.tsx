import { requireRole } from "@/lib/auth-helpers";
import { AppHeader } from "@/components/app-header";
import { prisma } from "@/lib/prisma";

const navLinks = [
  { href: "/evaluate", label: "내 평가 목록" },
  { href: "/notifications", label: "알림" },
];

export default async function EvaluateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("EVALUATOR");
  const notificationCount = await prisma.notification.count({
    where: { recipientId: session.user.id, readAt: null },
  });

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        title="평가자 화면"
        navLinks={navLinks}
        user={session.user}
        notificationCount={notificationCount}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
