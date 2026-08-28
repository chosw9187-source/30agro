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
    // 셸을 화면 높이에 묶어서 <main>만 굴린다 — 로고 줄과 본인 띠는 그 바깥에
    // 있으니 스크롤과 무관하게 제자리에 남고, main 안의 sticky(평가2의 연도 ·
    // 목표 · 탭 줄)는 화면 위가 아니라 «본문 위»에 붙는다. 그래서 붙는 자리를
    // 픽셀로 맞출 일이 없다.
    //
    // 예전에는 좁은 화면만 문서 전체를 굴렸는데, 그러면 main의 overflow가
    // sticky를 자기 박스 안에 가둬 버려서 본문 안의 고정 줄이 그냥 같이 밀려
    // 올라갔다. 높이는 100dvh다 — iOS에서 100vh는 주소창 높이를 빼지 않아
    // 화면 아래가 잘린다.
    <div className="flex h-[100dvh] min-w-0 flex-none flex-col overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
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
                className="-mx-4 -mt-6 mb-6 md:-mx-8 md:-mt-8 md:mb-8"
              />
            </RouteOnly>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
