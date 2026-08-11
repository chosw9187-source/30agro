import Link from "next/link";

export function HomeTabBar({ active, selfId }: { active: "dashboard" | "card"; selfId: string }) {
  const tabClass = (isActive: boolean) =>
    `rounded px-3 py-1.5 text-sm font-medium ${
      isActive ? "bg-brand-green text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="flex gap-2">
      <Link href="/platform" className={tabClass(active === "dashboard")}>
        대시보드
      </Link>
      <Link href={`/platform/employees/${selfId}`} className={tabClass(active === "card")}>
        내 인사카드
      </Link>
    </div>
  );
}
