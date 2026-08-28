import { prisma } from "@/lib/prisma";
import { checkModuleAccess, getEmployeeListScopeFilter } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { loadEmployeeCard } from "@/lib/employee-card-loader";
import { EmployeeCardContent } from "@/components/employee-card-content";
import {
  EmployeeTreeExplorerProvider,
  EmployeeTreeFilterPanel,
  EmployeeSummaryListPanel,
  type TeamLite,
  type EmployeeLite,
} from "./employee-tree-explorer";

export const dynamic = "force-dynamic";

const BASE_PATH = "/platform/employees";

export default async function EmployeeDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  if (!(await checkModuleAccess("EMPLOYEES"))) {
    return <NoModuleAccess title="직원정보 조회" />;
  }

  const params = await searchParams;
  const selectedUserId = (params.userId ?? "").trim();

  const scopeFilter = await getEmployeeListScopeFilter();

  const [teams, employees, selectedCard] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, businessUnit: true, division: true },
    }),
    prisma.user.findMany({
      where: {
        AND: [...(scopeFilter ? [scopeFilter] : []), activePrismaWhere(), { hiddenFromDirectory: false }],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        employeeNumber: true,
        email: true,
        position: true,
        birthDate: true,
        hireDate: true,
        jobGrade: true,
        gender: true,
        employmentType: true,
        jobFamily: true,
        educationRecords: { select: { school: true, major: true } },
        school: true,
        major: true,
        teamId: true,
        team: { select: { id: true, name: true, businessUnit: true, division: true } },
        businessUnit: true,
        division: true,
      },
    }),
    selectedUserId ? loadEmployeeCard(selectedUserId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex h-[calc(100dvh-152px)] min-h-[520px] flex-col gap-3">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold">직원정보 조회</h1>
        <p className="mt-1 text-sm text-slate-600">
          왼쪽 조직도에서 부서나 인원을 체크하면 가운데에 대상자 목록이 나타납니다. 이름을 클릭하면 오른쪽에 인사카드가 표시됩니다. (재직자만 표시됩니다)
        </p>
      </div>

      <EmployeeTreeExplorerProvider
        teams={teams as TeamLite[]}
        employees={employees as EmployeeLite[]}
        basePath={BASE_PATH}
        focusedUserId={selectedUserId}
      >
        <div className="flex min-h-0 flex-1 gap-3">
          <aside className="w-60 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <EmployeeTreeFilterPanel />
          </aside>

          <div className="w-80 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <EmployeeSummaryListPanel />
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
            {!selectedUserId ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-sm text-slate-400">
                <p>가운데 목록에서 이름을 클릭하면</p>
                <p>여기에 인사카드가 표시됩니다</p>
              </div>
            ) : !selectedCard?.allowed ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">접근 권한 없음</span>
                <p>이 직원의 상세 정보는 본인, 임원급, 인사팀, 또는 같은 팀의 팀장만 볼 수 있습니다.</p>
              </div>
            ) : !selectedCard.employee ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">직원을 찾을 수 없습니다.</div>
            ) : (
              <EmployeeCardContent employee={selectedCard.employee} isAdmin={selectedCard.isAdmin} />
            )}
          </div>
        </div>
      </EmployeeTreeExplorerProvider>
    </div>
  );
}
