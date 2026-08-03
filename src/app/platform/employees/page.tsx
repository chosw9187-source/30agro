import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";

const roleLabel: Record<string, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

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

  const [employees, teams] = await Promise.all([
    hasQuery
      ? prisma.user.findMany({
          where: {
            ...(teamId ? { teamId } : {}),
            ...(q
              ? {
                  OR: [
                    { name: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                    { employeeNumber: { contains: q } },
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
        <p className="mt-1 text-slate-600">이름, 사번, 이메일로 검색하거나 팀으로 필터링하세요.</p>
      </div>

      <form method="GET" className="flex flex-wrap gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="이름 / 사번 / 이메일 검색"
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
          이름/사번/이메일을 검색하거나 팀을 선택하면 직원 정보가 표시됩니다.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-500">총 {employees.length}명</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {employees.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{e.name}</p>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {roleLabel[e.role] ?? e.role}
                  </span>
                </div>
                <dl className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
                  <div className="flex gap-2">
                    <dt className="w-10 shrink-0 text-slate-400">사번</dt>
                    <dd>{e.employeeNumber}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-10 shrink-0 text-slate-400">이메일</dt>
                    <dd className="truncate">{e.email}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-10 shrink-0 text-slate-400">팀</dt>
                    <dd>{e.team?.name ?? "미지정"}</dd>
                  </div>
                </dl>
              </div>
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
