"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  comingSoon?: boolean;
};

const mainItems: NavItem[] = [
  { href: "/admin", label: "홈" },
  { href: "/admin/hr-report", label: "HR REPORT", comingSoon: true },
  { href: "/admin/org-chart", label: "조직도", comingSoon: true },
  { href: "/admin/job-management", label: "직무관리", comingSoon: true },
  { href: "/admin/task-management", label: "업무 관리", comingSoon: true },
  { href: "/admin/employees", label: "직원정보 조회" },
  { href: "/admin/legal-library", label: "AI 법률 라이브러리", comingSoon: true },
];

const evaluationItems: NavItem[] = [
  { href: "/admin/evaluation", label: "평가 현황" },
  { href: "/admin/templates", label: "평가 템플릿" },
  { href: "/admin/cycles", label: "평가 사이클" },
  { href: "/admin/teams", label: "팀 관리" },
  { href: "/admin/reports", label: "결과 다운로드" },
];

const manageItems: NavItem[] = [
  { href: "/admin/users", label: "사용자 관리" },
  { href: "/admin/data-upload", label: "데이터 업로드", comingSoon: true },
  { href: "/admin/screen-config", label: "화면 구성", comingSoon: true },
];

const supportItems: NavItem[] = [
  { href: "/admin/support", label: "문의 · 피드백", comingSoon: true },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center justify-between rounded px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-white text-brand-green-dark font-medium"
          : "text-white/85 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span>{item.label}</span>
      {item.comingSoon && (
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/80">
          개발 중
        </span>
      )}
    </Link>
  );
}

export function PlatformSidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto bg-brand-green px-3 py-6">
      <div className="px-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
          SG HR PLATFORM
        </p>
        <p className="text-lg font-bold text-white">한국삼공 HR</p>
      </div>

      <div className="flex flex-col gap-1">
        {mainItems.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <p className="px-3 text-xs font-semibold text-white/70">평가</p>
        {evaluationItems.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <p className="px-3 text-xs font-semibold text-white/70">관리</p>
        {manageItems.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <p className="px-3 text-xs font-semibold text-white/70">지원</p>
        {supportItems.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>
    </nav>
  );
}
