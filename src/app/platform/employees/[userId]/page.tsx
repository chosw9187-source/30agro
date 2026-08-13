import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess, canViewEmployeeCard, EXECUTIVE_POSITIONS } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { BackLink } from "@/components/back-link";
import { EmployeeCardContent } from "@/components/employee-card-content";
import { HomeTabBar } from "@/components/home-tab-bar";

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

  if (!(await canViewEmployeeCard(userId))) {
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

  const employee = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      team: true,
      appointmentRecords: { orderBy: { date: "desc" } },
      performanceHistory: { orderBy: { year: "desc" } },
      educationRecords: { orderBy: [{ admissionDate: "asc" }, { order: "asc" }] },
      careerHistory: { orderBy: [{ startDate: "asc" }, { order: "asc" }] },
      certifications: { orderBy: [{ acquiredDate: "asc" }, { order: "asc" }] },
      commendationDiscipline: { orderBy: [{ startDate: "asc" }, { order: "asc" }] },
    },
  });

  if (!employee) notFound();
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";
  const isOwnCard = session?.user.id === employee.id;
  const showHomeTabs = isOwnCard && (isAdmin || EXECUTIVE_POSITIONS.includes(employee.position));

  return (
    <div className="flex flex-col gap-6">
      {showHomeTabs ? <HomeTabBar active="card" selfId={employee.id} /> : <BackLink fallbackHref="/platform/employees" label="목록으로" />}
      <EmployeeCardContent employee={employee} isAdmin={isAdmin} />
    </div>
  );
}
