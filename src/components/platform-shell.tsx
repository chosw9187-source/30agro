import Link from "next/link";
import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlatformSidebar } from "@/components/platform-sidebar";
import { CompanyLogo } from "@/components/company-logo";
import { Watermark } from "@/components/watermark";
import { SessionHeartbeat } from "@/components/session-heartbeat";
import { ToastHost } from "@/components/toast";
import { NumberStepGuard } from "@/components/number-step-guard";
import { EvaluateeBanner } from "@/components/evaluatee-banner";
import { RouteOnly } from "@/components/route-only";
import {
  getVisibleModules,
  getModuleUiConfig,
  getHiddenAdminMenuKeys,
  type Position,
} from "@/lib/permissions";
import { logPageView } from "@/lib/page-view";

export async function PlatformShell({
  user,
  children,
}: {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    role: "ADMIN" | "EVALUATOR" | "EMPLOYEE";
  };
  children: React.ReactNode;
}) {
  const [notificationCount, dbUser] = await Promise.all([
    prisma.notification.count({
      where: { recipientId: user.id, readAt: null },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { position: true },
    }),
    logPageView(user.id),
  ]);
  const position = (dbUser?.position ?? "STAFF") as Position;
  const [visibleModules, moduleUiConfig, hiddenAdminMenuKeys] =
    await Promise.all([
      getVisibleModules(user.id, user.role, position),
      getModuleUiConfig(),
      user.role === "ADMIN"
        ? getHiddenAdminMenuKeys()
        : Promise.resolve(new Set<never>()),
    ]);

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const viewedAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const watermarkText = [user.name, user.email, viewedAt]
    .filter(Boolean)
    .join(" · ");

  return (
    // 스크롤은 **문서 하나**로만 흐른다. 안쪽에 따로 굴러가는 상자를 두면 화면
    // 오른쪽과 왼쪽에 스크롤 막대가 두세 개씩 생기고, 위쪽이 고정된 만큼 한 번에
    // 보이는 본문이 줄어든다. 로고 줄도 함께 흘러 올라가는 편이 «아래로 내리면
    // 아래 내용이 나온다»는 당연한 기대에 맞는다.
    <div className="flex min-h-screen min-w-0 flex-1">
      <div className="flex min-w-0 flex-1">
        <input type="checkbox" id="mobile-nav-toggle" className="peer hidden" />
        <label
          htmlFor="mobile-nav-toggle"
          aria-hidden="true"
          className="fixed inset-0 z-30 hidden bg-black/40 peer-checked:block md:!hidden"
        />
        <Watermark text={watermarkText} />
        <SessionHeartbeat />
        {/* 알림은 화면 껍데기에 한 번만 붙여둔다 — 알림을 띄운 폼이 그 직후
          사라져도(삭제처럼) 문구가 같이 지워지지 않게. */}
        <ToastHost />
        <NumberStepGuard />
        <PlatformSidebar
          role={user.role}
          user={{ ...user, position }}
          notificationCount={notificationCount}
          onLogout={logout}
          visibleModules={[...visibleModules]}
          moduleUiConfig={moduleUiConfig}
          hiddenAdminMenuKeys={[...hiddenAdminMenuKeys]}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 text-sm md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <label
                htmlFor="mobile-nav-toggle"
                aria-label="메뉴 열기"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-slate-300 text-lg text-slate-700 md:hidden"
              >
                ☰
              </label>
              <CompanyLogo className="h-9" />
            </div>
            {/*
              좁은 화면에서는 「문의」로 줄인다. 긴 이름을 그대로 두면 줄어들 자리가
              없어 로고 위로 올라타서 둘 다 못 읽게 된다.
            */}
            <Link
              href="/platform/support"
              className="shrink-0 rounded border border-slate-300 px-3 py-1.5 whitespace-nowrap text-slate-700 hover:border-brand-green hover:text-brand-green"
            >
              <span className="hidden sm:inline">관리자에게 문의하기</span>
              <span className="sm:hidden">문의</span>
            </Link>
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:pt-8 md:pb-4">
            {/*
              본인 띠는 본문 **안**, 맨 앞이다 — 로고 줄만 제자리에 남고 띠부터
              아래는 본문과 함께 굴러 내려간다. 띠를 로고 줄 옆에 붙여 두었더니
              화면 위가 늘 그만큼 잠겨서, 목록을 볼 때도 자리를 내주지 않았다.

              좌우·위 여백은 음수 마진으로 도로 빼내 본문 폭을 가득 채운다. 안쪽에
              끼워 넣은 카드처럼 보이면 «머리 띠»로 읽히지 않는다.

              평가2에서만 띄운다. 사진·소속·1·2차 평가자는 목표를 세우고 평가할 때
              쓰는 값이라, 조직도나 직원정보 조회에서까지 따라다니면 자리만 축낸다.
            */}
            <RouteOnly prefix="/platform/evaluation2">
              <EvaluateeBanner
                userId={user.id}
                className="-mx-4 -mt-6 mb-4 md:-mx-8 md:-mt-8 md:mb-4"
              />
            </RouteOnly>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
