import { notFound } from "next/navigation";
import { checkModuleAccess, EXECUTIVE_POSITIONS } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { BackLink } from "@/components/back-link";
import { EmployeeCardContent } from "@/components/employee-card-content";
import { HomeTabBar } from "@/components/home-tab-bar";
import { loadEmployeeCard } from "@/lib/employee-card-loader";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  if (!(await checkModuleAccess("EMPLOYEES"))) {
    return <NoModuleAccess title="직원정보 조회" />;
  }

  const { userId } = await params;
  const { allowed, employee, isAdmin, isOwnCard } = await loadEmployeeCard(userId);

  if (!allowed) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink fallbackHref="/platform/employees" label="목록으로" />
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white text-center">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            접근 권한 없음
          </span>
          <p className="text-slate-500">
            이 직원의 상세 정보는 본인, 임원급, 인사팀, 또는 같은 팀의
            팀장만 볼 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  if (!employee) notFound();
  const showHomeTabs = isOwnCard && (isAdmin || EXECUTIVE_POSITIONS.includes(employee.position));

  return (
    <div className="flex flex-col gap-6">
      {showHomeTabs ? <HomeTabBar active="card" selfId={employee.id} /> : <BackLink fallbackHref="/platform/employees" label="목록으로" />}
      <EmployeeCardContent employee={employee} isAdmin={isAdmin} />
    </div>
  );
}
