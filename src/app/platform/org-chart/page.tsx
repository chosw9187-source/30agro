import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";

const UNASSIGNED = "미지정";

export default async function OrgChartPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  if (!(await checkModuleAccess("ORG_CHART"))) {
    return <NoModuleAccess title="조직도" />;
  }

  const { division } = await searchParams;

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: { leader: true, _count: { select: { members: true } } },
  });

  const totalEmployees = await prisma.user.count();

  if (!division) {
    const groups = new Map<
      string,
      { teamCount: number; memberCount: number }
    >();
    for (const t of teams) {
      const key = t.division || UNASSIGNED;
      const g = groups.get(key) ?? { teamCount: 0, memberCount: 0 };
      g.teamCount += 1;
      g.memberCount += t._count.members;
      groups.set(key, g);
    }
    const divisionNames = Array.from(groups.keys()).sort((a, b) =>
      a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)
    );

    return (
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold">조직도</h1>
          <p className="mt-1 text-slate-600">한국삼공의 본부·팀 구성을 확인하세요.</p>
        </div>

        <div className="rounded-lg border border-brand-green-dark bg-brand-green px-8 py-6 text-white">
          <p className="text-sm text-white/80">한국삼공</p>
          <p className="mt-1 text-2xl font-bold">전체 조직</p>
          <div className="mt-4 flex gap-8 text-sm">
            <span>
              <strong className="text-lg">{totalEmployees}</strong>명 재직
            </span>
            <span>
              <strong className="text-lg">{divisionNames.length}</strong>개 본부
            </span>
            <span>
              <strong className="text-lg">{teams.length}</strong>개 팀
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {divisionNames.map((name) => {
            const g = groups.get(name)!;
            return (
              <Link
                key={name}
                href={`/platform/org-chart?division=${encodeURIComponent(name)}`}
                className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 hover:border-brand-green"
              >
                <p className="text-lg font-semibold">{name}</p>
                <p className="mt-1 text-sm text-slate-500">{g.teamCount}개 팀</p>
                <p className="mt-1 text-sm text-slate-500">{g.memberCount}명 재직</p>
                <span className="mt-4 text-sm text-brand-green">팀 보기 ›</span>
              </Link>
            );
          })}
          {divisionNames.length === 0 && (
            <p className="text-slate-500">아직 등록된 팀이 없습니다.</p>
          )}
        </div>
      </div>
    );
  }

  const teamsInDivision = teams.filter(
    (t) => (t.division || UNASSIGNED) === division
  );
  const memberCount = teamsInDivision.reduce(
    (sum, t) => sum + t._count.members,
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/platform/org-chart" className="text-sm text-slate-500 hover:underline">
        ← 조직도
      </Link>

      <div className="rounded-lg border border-brand-green-dark bg-brand-green px-8 py-6 text-white">
        <p className="text-sm text-white/80">한국삼공 · {division}</p>
        <p className="mt-1 text-2xl font-bold">{division}</p>
        <div className="mt-4 flex gap-8 text-sm">
          <span>
            <strong className="text-lg">{memberCount}</strong>명 재직
          </span>
          <span>
            <strong className="text-lg">{teamsInDivision.length}</strong>개 팀
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teamsInDivision.map((t) => (
          <div
            key={t.id}
            className="flex flex-col rounded-lg border border-slate-200 bg-white p-5"
          >
            <p className="text-lg font-semibold">{t.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t.leader ? `${t.leader.name} 팀장` : "팀장 미지정"}
            </p>
            <p className="mt-3 text-sm text-slate-500">{t._count.members}명</p>
            <Link
              href={`/platform/org-chart/${t.id}`}
              className="mt-4 text-sm text-brand-green hover:underline"
            >
              구성원 보기 ›
            </Link>
          </div>
        ))}
        {teamsInDivision.length === 0 && (
          <p className="text-slate-500">이 본부에 속한 팀이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
