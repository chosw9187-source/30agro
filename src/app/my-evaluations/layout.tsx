import { requireRole } from "@/lib/auth-helpers";
import { AppHeader } from "@/components/app-header";
import { prisma } from "@/lib/prisma";

const navLinks = [
  { href: "/my-evaluations", label: "내 평가 결과" },
  { href: "/notifications", label: "알림" },
];

export default async function MyEvaluationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("EMPLOYEE");
  const notificationCount = await prisma.notification.count({
    where: { recipientId: session.user.id, readAt: null },
  });

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        title="내 평가"
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
