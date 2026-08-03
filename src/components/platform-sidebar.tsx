"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "ADMIN" | "EVALUATOR" | "EMPLOYEE";

type NavItem = {
  href: string;
  label: string;
  comingSoon?: boolean;
  badgeCount?: number;
};

type Section = {
  key: string;
  label: string;
  items: NavItem[];
};

function mainItems(notificationCount: number): NavItem[] {
  return [
    { href: "/platform", label: "홈" },
    { href: "/platform/hr-report", label: "HR REPORT", comingSoon: true },
    { href: "/platform/org-chart", label: "조직도", comingSoon: true },
    { href: "/platform/job-management", label: "직무관리", comingSoon: true },
    { href: "/platform/task-management", label: "업무 관리", comingSoon: true },
    { href: "/platform/employees", label: "직원정보 조회" },
    { href: "/platform/legal-library", label: "AI 법률 라이브러리", comingSoon: true },
    {
      href: "/notifications",
      label: "알림",
      badgeCount: notificationCount > 0 ? notificationCount : undefined,
    },
  ];
}

function evaluationItems(role: Role): NavItem[] {
  if (role === "ADMIN") {
    return [
      { href: "/admin/evaluation", label: "평가 현황" },
      { href: "/admin/templates", label: "평가 템플릿" },
      { href: "/admin/cycles", label: "평가 사이클" },
      { href: "/admin/teams", label: "팀 관리" },
      { href: "/admin/reports", label: "결과 다운로드" },
    ];
  }
  if (role === "EVALUATOR") {
    return [{ href: "/evaluate", label: "평가" }];
  }
  return [{ href: "/my-evaluations", label: "평가" }];
}

function manageItems(role: Role): NavItem[] {
  const items: NavItem[] = [];
  if (role === "ADMIN") {
    items.push({ href: "/admin/users", label: "사용자 관리" });
  }
  items.push(
    { href: "/platform/data-upload", label: "데이터 업로드", comingSoon: true },
    { href: "/platform/screen-config", label: "화면 구성", comingSoon: true }
  );
  return items;
}

const supportItems: NavItem[] = [
  { href: "/platform/support", label: "문의 · 피드백", comingSoon: true },
];

const roleLabel: Record<Role, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center justify-between rounded px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-white text-brand-green-dark font-medium"
          : "text-white hover:bg-black/10"
      }`}
    >
      <span>{item.label}</span>
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
}: {
  role: Role;
  user: { name?: string | null; role: Role };
  notificationCount?: number;
  onLogout: () => Promise<void>;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/platform") return pathname === "/platform";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const sections: Section[] = [
    { key: "eval", label: "평가", items: evaluationItems(role) },
    { key: "manage", label: "관리", items: manageItems(role) },
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
    <nav className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-1 overflow-y-auto bg-brand-green px-3 py-6">
      <div className="px-3 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">
          SG HR PLATFORM
        </p>
        <p className="text-lg font-bold text-white">한국삼공 HR</p>
      </div>

      <div className="flex flex-col gap-1">
        {mainItems(notificationCount).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
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
              <span className={`transition-transform ${open ? "rotate-90" : ""}`}>
                ›
              </span>
            </button>
            {open && (
              <div className="ml-2 flex flex-col gap-1 border-l border-white/20 pl-2">
                {section.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-auto flex flex-col gap-1 border-t border-white/20 pt-3">
        <button
          type="button"
          disabled
          title="다크 모드는 준비 중입니다"
          className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-white/50"
        >
          ☾ 다크 모드로
        </button>
        <div className="flex items-center justify-between rounded px-3 py-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white">
              {user.name?.[0] ?? "?"}
            </span>
            <div className="min-w-0 text-xs text-white">
              <p className="truncate font-medium">{user.name}</p>
              <p className="text-white/70">{roleLabel[user.role]}</p>
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
