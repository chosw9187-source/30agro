import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { isActive, activePrismaWhere, regularOrExceptionTeamWhere } from "@/lib/hr-analytics";
import { CeoBanner, LeaderBanner, OrgChartRoot } from "./tree-view";
import { type CeoExec, type DivisionNode, type Exec, type TeamLite, type UnitNode, splitTeams, buildComposition } from "./shared";

export const dynamic = "force-dynamic";

const EXEC_RANK: Record<string, number> = {
  회장: 0,
  부회장: 1,
  사장: 2,
  대표: 2,
  대표이사: 2,
};

function execSortKey(jobGrade: string | null) {
  return EXEC_RANK[jobGrade ?? ""] ?? 9;
}

export default async function OrgChartPage() {
  if (!(await checkModuleAccess("ORG_CHART"))) {
    return <NoModuleAccess title="조직도" />;
  }

  const [teams, totalEmployees, ceos, opsHeads, seniors] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        leader: true,
        _count: {
          select: {
            members: { where: { AND: [activePrismaWhere(), regularOrExceptionTeamWhere()] } },
          },
        },
      },
    }),
    prisma.user.count({ where: { AND: [activePrismaWhere(), regularOrExceptionTeamWhere()] } }),
    prisma.user.findMany({
      where: { AND: [{ position: "CEO" }, activePrismaWhere(), regularOrExceptionTeamWhere()] },
      select: { id: true, name: true, jobGrade: true, photo: true },
    }),
    prisma.user.findMany({
      where: {
        AND: [{ position: "OPERATIONS_HEAD" }, activePrismaWhere(), regularOrExceptionTeamWhere()],
      },
      select: {
        id: true,
        name: true,
        jobGrade: true,
        businessUnit: true,
        division: true,
        photo: true,
        birthDate: true,
        hireDate: true,
      },
    }),
    prisma.user.findMany({
      where: {
        AND: [{ position: "SENIOR_STAFF" }, activePrismaWhere(), regularOrExceptionTeamWhere()],
      },
      select: {
        id: true,
        name: true,
        jobGrade: true,
        businessUnit: true,
        division: true,
        photo: true,
        birthDate: true,
        hireDate: true,
      },
    }),
  ]);

  ceos.sort((a, b) => execSortKey(a.jobGrade) - execSortKey(b.jobGrade));
  const ceoExecs: CeoExec[] = ceos.map((c) => ({
    id: c.id,
    name: c.name,
    jobGrade: c.jobGrade,
    hasPhoto: !!c.photo,
  }));

  const toTeamLite = (t: (typeof teams)[number]): TeamLite => {
    const leader = t.leader && isActive(t.leader) ? t.leader : null;
    return {
      id: t.id,
      name: t.name,
      leaderId: leader?.id ?? null,
      leaderName: leader?.name ?? null,
      leaderHasPhoto: !!leader?.photo,
      memberCount: t._count.members,
    };
  };

  const unitOrder: string[] = [];
  const unitMap = new Map<string, UnitNode>();
  const standaloneDivisionOrder: string[] = [];
  const standaloneDivisionMap = new Map<string, DivisionNode>();
  const rootTeams: TeamLite[] = [];

  function ensureUnit(name: string): UnitNode {
    let u = unitMap.get(name);
    if (!u) {
      u = { name, divisions: [], directTeams: [] };
      unitMap.set(name, u);
      unitOrder.push(name);
    }
    return u;
  }
  function ensureDivisionIn(unit: UnitNode, name: string): DivisionNode {
    let d = unit.divisions.find((x) => x.name === name);
    if (!d) {
      d = { name, teams: [] };
      unit.divisions.push(d);
    }
    return d;
  }
  function ensureStandaloneDivision(name: string): DivisionNode {
    let d = standaloneDivisionMap.get(name);
    if (!d) {
      d = { name, teams: [] };
      standaloneDivisionMap.set(name, d);
      standaloneDivisionOrder.push(name);
    }
    return d;
  }

  for (const t of teams) {
    if (t.businessUnit && t.division) {
      ensureDivisionIn(ensureUnit(t.businessUnit), t.division).teams.push(toTeamLite(t));
    } else if (t.businessUnit) {
      ensureUnit(t.businessUnit).directTeams.push(toTeamLite(t));
    } else if (t.division) {
      ensureStandaloneDivision(t.division).teams.push(toTeamLite(t));
    } else {
      rootTeams.push(toTeamLite(t));
    }
  }

  for (const l of opsHeads) {
    const leader: Exec = {
      id: l.id,
      name: l.name,
      jobGrade: l.jobGrade,
      hasPhoto: !!l.photo,
      birthDate: l.birthDate,
      hireDate: l.hireDate,
    };
    if (l.businessUnit) ensureUnit(l.businessUnit).leader = leader;
  }
  for (const l of seniors) {
    const leader: Exec = {
      id: l.id,
      name: l.name,
      jobGrade: l.jobGrade,
      hasPhoto: !!l.photo,
      birthDate: l.birthDate,
      hireDate: l.hireDate,
    };
    if (l.businessUnit && l.division) {
      ensureDivisionIn(ensureUnit(l.businessUnit), l.division).leader = leader;
    } else if (l.division) {
      ensureStandaloneDivision(l.division).leader = leader;
    }
  }

  const UNIT_PRIORITY: Record<string, number> = {
    제품사업: 0,
    연구생산: 1,
    재무경영관리: 2,
  };
  const units = unitOrder
    .map((n) => unitMap.get(n)!)
    .sort((a, b) => (UNIT_PRIORITY[a.name] ?? 9) - (UNIT_PRIORITY[b.name] ?? 9));
  const standaloneDivisions = standaloneDivisionOrder.map((n) => standaloneDivisionMap.get(n)!);

  const { teamCount: companyTeamCount, branchCount: companyBranchCount } = splitTeams(teams);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">조직도</h1>
        <p className="mt-1 text-slate-600">
          한국삼공의 조직 구성입니다. 클릭하면 아래로 세부구성이 펼쳐집니다.
        </p>
      </div>

      {ceoExecs.length > 0 ? (
        <CeoBanner
          ceos={ceoExecs}
          totalEmployees={totalEmployees}
          teamCount={companyTeamCount}
          branchCount={companyBranchCount}
          opsHeadCount={opsHeads.length}
          seniorCount={seniors.length}
        />
      ) : (
        <LeaderBanner
          eyebrow="한국삼공"
          title="전체 조직"
          headcount={totalEmployees}
          parts={buildComposition({ teamCount: companyTeamCount, branchCount: companyBranchCount })}
        />
      )}

      <OrgChartRoot units={units} standaloneDivisions={standaloneDivisions} rootTeams={rootTeams} />
    </div>
  );
}
