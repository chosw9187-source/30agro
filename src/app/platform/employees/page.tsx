import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess, getEmployeeListScopeFilter } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { POSITIONS, POSITION_LABEL, type Position } from "@/lib/permission-constants";

export const dynamic = "force-dynamic";

export default async function EmployeeDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; teamId?: string }>;
}) {
  if (!(await checkModuleAccess("EMPLOYEES"))) {
    return <NoModuleAccess title="직원정보 조회" />;
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const teamId = params.teamId ?? "";
  const hasQuery = q.length > 0 || teamId.length > 0;

  const scopeFilter = await getEmployeeListScopeFilter();
  const matchingPositions = q
    ? POSITIONS.filter((p) => POSITION_LABEL[p].includes(q))
    : [];

  const [employees, teams] = await Promise.all([
    hasQuery
      ? prisma.user.findMany({
          where: {
            ...(scopeFilter ?? {}),
            ...(teamId ? { teamId } : {}),
            ...(q
              ? {
                  OR: [
                    { name: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                    { employeeNumber: { contains: q } },
                    { major: { contains: q, mode: "insensitive" } },
                    { school: { contains: q, mode: "insensitive" } },
                    { jobFamily: { contains: q, mode: "insensitive" } },
                    { gender: { contains: q, mode: "insensitive" } },
                    { employmentType: { contains: q, mode: "insensitive" } },
                    { jobGrade: { contains: q, mode: "insensitive" } },
                    { educationLevel: { contains: q, mode: "insensitive" } },
                    { degree: { contains: q, mode: "insensitive" } },
                    { businessUnit: { contains: q, mode: "insensitive" } },
                    { division: { contains: q, mode: "insensitive" } },
                    { team: { name: { contains: q, mode: "insensitive" } } },
                    { team: { businessUnit: { contains: q, mode: "insensitive" } } },
                    { team: { division: { contains: q, mode: "insensitive" } } },
                    ...(matchingPositions.length > 0
                      ? [{ position: { in: matchingPositions } }]
                      : []),
                  ],
                }
              : {}),
          },
          orderBy: { name: "asc" },
          include: { team: true },
        })
      : Promise.resolve([]),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">직원정보 조회</h1>
        <p className="mt-1 text-slate-600">
          키워드로 검색하면 볼 수 있습니다. 이름을 클릭하면 상세 정보를 볼 수
          있습니다.
        </p>
      </div>

      <form method="GET" className="flex flex-wrap gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="키워드 검색 (이름, 사번, 이메일, 팀, 직책, 직군 등)"
          className="w-64 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="teamId"
          defaultValue={teamId}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">전체 팀</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark"
        >
          검색
        </button>
      </form>

      {!hasQuery ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white py-10 text-center text-slate-500">
          키워드를 검색하거나 팀을 선택하면 직원 정보가 표시됩니다.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-500">총 {employees.length}명</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {employees.map((e) => (
              <Link
                key={e.id}
                href={`/platform/employees/${e.id}`}
                className="rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-green"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-brand-green-dark hover:underline">
                    {e.name}
                  </p>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {POSITION_LABEL[e.position as Position]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">사번 {e.employeeNumber}</p>
                <p className="text-sm text-slate-500">{e.team?.name ?? "팀 미지정"}</p>
              </Link>
            ))}
            {employees.length === 0 && (
              <p className="text-slate-500">검색 결과가 없습니다.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
