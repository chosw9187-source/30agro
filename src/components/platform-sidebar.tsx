"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  POSITION_LABEL,
  SIDEBAR_MODULES,
  ADMIN_MENU_ITEMS,
  type Module,
  type Position,
  type AdminMenuKey,
} from "@/lib/permission-constants";

type Role = "ADMIN" | "EVALUATOR" | "EMPLOYEE";

type NavItem = {
  href: string;
  label: string;
  comingSoon?: boolean;
  badgeCount?: number;
  module?: Module;
  hidden?: boolean;
};

type Section = {
  key: string;
  label: string;
  items: NavItem[];
};

const MODULE_NAV: Record<string, { href: string; label: string }> = {
  HR_REPORT: { href: "/platform/hr-report", label: "HR REPORT" },
  ORG_CHART: { href: "/platform/org-chart", label: "조직도" },
  JOB_MANAGEMENT: { href: "/platform/job-management", label: "직무관리" },
  TASK_MANAGEMENT: { href: "/platform/task-management", label: "업무 관리" },
  EMPLOYEES: { href: "/platform/employees", label: "직원정보 조회" },
  LEGAL_LIBRARY: { href: "/platform/legal-library", label: "인사 규정 챗봇" },
  TALENT_ASSESSMENT: {
    href: "/platform/talent-assessment",
    label: "SG 인적성검사",
  },
  ONBOARDING: { href: "/platform/onboarding", label: "온보딩 프로그램" },
  EVALUATION_V2: { href: "/platform/evaluation2", label: "평가2" },
};

function evaluationHref(role: Role): string {
  if (role === "ADMIN") return "/admin/evaluation";
  if (role === "EVALUATOR") return "/evaluate";
  return "/my-evaluations";
}

function mainItems(
  role: Role,
  notificationCount: number,
  moduleUiConfig: Record<
    string,
    { order: number; comingSoon: boolean; hidden: boolean }
  >,
): NavItem[] {
  const orderedModules = [...SIDEBAR_MODULES].sort(
    (a, b) => (moduleUiConfig[a]?.order ?? 0) - (moduleUiConfig[b]?.order ?? 0),
  );
  const moduleItems: NavItem[] = orderedModules.map((m) => ({
    href: m === "EVALUATION" ? evaluationHref(role) : MODULE_NAV[m].href,
    label: MODULE_LABEL_FOR_NAV[m],
    module: m as Module,
    comingSoon: moduleUiConfig[m]?.comingSoon ?? false,
    hidden: moduleUiConfig[m]?.hidden ?? false,
  }));

  return [
    { href: "/platform", label: "홈" },
    ...moduleItems,
    {
      href: "/notifications",
      label: "알림",
      badgeCount: notificationCount > 0 ? notificationCount : undefined,
    },
  ];
}

const MODULE_LABEL_FOR_NAV: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(MODULE_NAV).map(([k, v]) => [k, v.label]),
  ),
  EVALUATION: "평가",
};

function manageItems(
  role: Role,
  hiddenAdminMenuKeys: Set<AdminMenuKey>,
): NavItem[] {
  if (role !== "ADMIN") {
    return [];
  }
  return ADMIN_MENU_ITEMS.filter(
    (item) => !hiddenAdminMenuKeys.has(item.key),
  ).map((item) => ({
    href: item.href,
    label: item.label,
  }));
}

const supportItems: NavItem[] = [
  { href: "/platform/support", label: "문의 · 피드백", comingSoon: true },
];

const roleLabel: Record<Role, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

function closeMobileNav() {
  const toggle = document.getElementById(
    "mobile-nav-toggle",
  ) as HTMLInputElement | null;
  if (toggle) toggle.checked = false;
}

function NavLink({
  item,
  active,
  showHiddenBadge,
}: {
  item: NavItem;
  active: boolean;
  showHiddenBadge?: boolean;
}) {
  return (
    <Link
      href={item.href}
      onClick={closeMobileNav}
      className={`flex items-center justify-between rounded px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-white text-brand-green-dark font-medium"
          : "text-white hover:bg-black/10"
      }`}
    >
      <span>{item.label}</span>
      {showHiddenBadge && (
        <span
          className="rounded-full bg-slate-500 px-2 py-0.5 text-[10px] font-semibold text-white"
          title="다른 사용자에게는 사이드바에서 숨겨져 있습니다"
        >
          관리자만
        </span>
      )}
      {item.comingSoon && (
        <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
          개발 중
        </span>
      )}
      {!!item.badgeCount && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
          {item.badgeCount}
        </span>
      )}
    </Link>
  );
}

export function PlatformSidebar({
  role,
  user,
  notificationCount = 0,
  onLogout,
  visibleModules,
  moduleUiConfig,
  hiddenAdminMenuKeys = [],
}: {
  role: Role;
  user: { name?: string | null; role: Role; position?: Position };
  notificationCount?: number;
  onLogout: () => Promise<void>;
  visibleModules: Module[];
  moduleUiConfig: Record<
    string,
    { order: number; comingSoon: boolean; hidden: boolean }
  >;
  hiddenAdminMenuKeys?: AdminMenuKey[];
}) {
  const pathname = usePathname();
  const visible = new Set(visibleModules);

  function isActive(href: string) {
    if (href === "/platform") return pathname === "/platform";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // 숨김 처리된 메뉴는 관리자 본인에게는 계속 보여야 개발 중에도 접근할 수
  // 있으므로, 다른 역할(평가자·직원)에게서만 실제로 숨긴다.
  const visibleMainItems = mainItems(
    role,
    notificationCount,
    moduleUiConfig,
  ).filter(
    (item) =>
      (!item.module || visible.has(item.module)) &&
      (role === "ADMIN" || !item.hidden),
  );

  const sections: Section[] = [
    {
      key: "manage",
      label: "관리",
      items: manageItems(role, new Set(hiddenAdminMenuKeys)),
    },
    { key: "support", label: "지원", items: supportItems },
  ];

  // Manual open/close overrides from clicks; sections not overridden default
  // to open when the current path is inside them (computed at render time,
  // no effect needed).
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());

  function isSectionOpen(section: Section) {
    if (overrides.has(section.key)) return overrides.get(section.key)!;
    return section.items.some((item) => isActive(item.href));
  }

  function toggleSection(section: Section) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(section.key, !isSectionOpen(section));
      return next;
    });
  }

  return (
    <nav className="fixed inset-y-0 left-0 z-40 flex h-screen w-64 -translate-x-full flex-col overflow-hidden bg-brand-green px-3 py-6 transition-transform duration-200 peer-checked:translate-x-0 md:sticky md:top-0 md:left-auto md:z-auto md:h-full md:w-60 md:shrink-0 md:translate-x-0">
      {/*
        메뉴 목록만 구르고, 아래의 «로그아웃»은 늘 제자리에 둔다. 예전에는 nav
        전체가 굴러서, 화면이 조금만 낮아도(노트북, 또는 위에 띠가 붙은 지금)
        로그아웃이 아래로 밀려 사라졌다 — 찾으려면 메뉴를 끝까지 내려야 했다.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        <div className="px-3 pb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">
            SG HR PLATFORM
          </p>
          <p className="text-lg font-bold text-white">한국삼공 HR</p>
        </div>

        <div className="flex flex-col gap-1">
          {visibleMainItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              showHiddenBadge={role === "ADMIN" && item.hidden}
            />
          ))}
        </div>

        <div className="my-3 border-t border-white/20" />

        {sections.map((section) => {
          if (section.items.length === 0) return null;
          if (section.items.length === 1) {
            return (
              <NavLink
                key={section.key}
                item={{ ...section.items[0], label: section.label }}
                active={isActive(section.items[0].href)}
              />
            );
          }
          const open = isSectionOpen(section);
          return (
            <div key={section.key} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => toggleSection(section)}
                className="flex items-center justify-between rounded px-3 py-2 text-sm text-white hover:bg-black/10"
              >
                <span>{section.label}</span>
                <span
                  className={`transition-transform ${open ? "rotate-90" : ""}`}
                >
                  ›
                </span>
              </button>
              {open && (
                <div className="ml-2 flex flex-col gap-1 border-l border-white/20 pl-2">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      active={isActive(item.href)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex shrink-0 flex-col gap-1 border-t border-white/20 pt-3">
        <div className="flex items-center justify-between rounded px-3 py-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white">
              {user.name?.[0] ?? "?"}
            </span>
            <div className="min-w-0 text-xs text-white">
              <p className="truncate font-medium">{user.name}</p>
              <p className="text-white/70">
                {user.role === "ADMIN"
                  ? roleLabel.ADMIN
                  : user.position
                    ? POSITION_LABEL[user.position]
                    : roleLabel[user.role]}
              </p>
            </div>
          </div>
          <form action={onLogout}>
            <button
              type="submit"
              className="shrink-0 rounded border border-white/30 px-2 py-1 text-xs text-white hover:bg-white/10"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
