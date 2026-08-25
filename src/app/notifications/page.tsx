import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlatformShell } from "@/components/platform-shell";
import { formatKSTDateTime } from "@/lib/format-kst";

const typeLabel: Record<string, string> = {
  SELF_ASSESSMENT_SUBMITTED: "자기평가 제출",
  COMMENT_ADDED: "새 코멘트",
  ONBOARDING_BOOKING_REQUESTED: "온보딩 강의 신청",
  ONBOARDING_BOOKING_DECIDED: "온보딩 강의 확정·반려",
  ONBOARDING_SCHEDULE_CHANGED: "온보딩 일정 변경",
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const detailBase = role === "EVALUATOR" ? "/evaluate" : "/my-evaluations";

  await prisma.notification.updateMany({
    where: { recipientId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  const notifications = await prisma.notification.findMany({
    where: { recipientId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <PlatformShell user={session.user}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">알림</h1>
          <p className="mt-1 text-slate-600">
            자기평가 제출, 코멘트 등록 알림을 확인하세요.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {notifications.length === 0 && (
            <p className="text-slate-500">알림이 없습니다.</p>
          )}
          {notifications.map((n) => {
            const content = (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400">
                <div>
                  <p className="text-xs text-slate-400">
                    {typeLabel[n.type] ?? n.type}
                  </p>
                  <p className="mt-1">{n.message}</p>
                </div>
                <p className="whitespace-nowrap text-sm text-slate-500">
                  {formatKSTDateTime(n.createdAt)}
                </p>
              </div>
            );
            const href = n.link ?? (n.evaluationId ? `${detailBase}/${n.evaluationId}` : null);
            return href ? (
              <Link key={n.id} href={href}>
                {content}
              </Link>
            ) : (
              <div key={n.id}>{content}</div>
            );
          })}
        </div>
        <Link
          href="/platform"
          className="text-sm text-slate-500 hover:text-brand-green hover:underline"
        >
          ← 돌아가기
        </Link>
      </div>
    </PlatformShell>
  );
}
