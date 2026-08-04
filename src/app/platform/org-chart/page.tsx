import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { POSITION_LABEL, type Position } from "@/lib/permission-constants";

export const dynamic = "force-dynamic";

type Exec = { id: string; name: string; jobGrade: string | null };
type TeamLite = {
  id: string;
  name: string;
  leaderName: string | null;
  memberCount: number;
};
type DivisionNode = { name: string; leader?: Exec; teams: TeamLite[] };
type UnitNode = {
  name: string;
  leader?: Exec;
  divisions: DivisionNode[];
  directTeams: TeamLite[];
};

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

function ExecBox({ exec, fallbackLabel }: { exec: Exec; fallbackLabel: string }) {
  return (
    <Link
      href={`/platform/employees/${exec.id}`}
      className="rounded-lg bg-brand-black px-6 py-3 text-center text-white shadow-sm hover:bg-brand-black/90"
    >
      <p className="text-xs text-white/70">{exec.jobGrade || fallbackLabel}</p>
      <p className="font-semibold">{exec.name}</p>
    </Link>
  );
}

function TeamChip({ team }: { team: TeamLite }) {
  return (
    <Link
      href={`/platform/org-chart/${team.id}`}
      className="rounded border border-slate-200 bg-white px-3 py-2 text-sm hover:border-brand-green hover:bg-brand-green-light"
    >
      <p className="font-medium text-slate-800">{team.name}</p>
      <p className="text-xs text-slate-500">
        {team.leaderName ? `${team.leaderName} 팀장` : "팀장 미지정"} ·{" "}
        {team.memberCount}명
      </p>
    </Link>
  );
}

function LeaderTag({ leader, fallback }: { leader?: Exec; fallback: string }) {
  if (!leader) return <p className="text-xs text-white/70">{fallback}</p>;
  return (
    <Link
      href={`/platform/employees/${leader.id}`}
      className="text-xs text-white/90 underline decoration-white/40 hover:decoration-white"
    >
      {leader.name} {leader.jobGrade || ""}
    </Link>
  );
}

function DivisionBlock({ division }: { division: DivisionNode }) {
  return (
    <div className="overflow-hidden rounded border border-brand-green-dark/20">
      <div className="bg-brand-green px-3 py-2 text-white">
        <p className="text-sm font-semibold">{division.name} 본부</p>
        <LeaderTag leader={division.leader} fallback="리더 미지정" />
      </div>
      <div className="flex flex-col gap-1.5 bg-brand-green-light/40 p-2">
        {division.teams.map((t) => (
          <TeamChip key={t.id} team={t} />
        ))}
        {division.teams.length === 0 && (
          <p className="px-1 py-1 text-xs text-slate-400">소속 팀 없음</p>
        )}
      </div>
    </div>
  );
}

function UnitColumn({ unit, shade }: { unit: UnitNode; shade: string }) {
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className={`rounded px-4 py-3 text-white ${shade}`}>
        <p className="font-semibold">{unit.name} 사업단위</p>
        <LeaderTag leader={unit.leader} fallback="리더 미지정" />
      </div>
      <div className="flex flex-col gap-2">
        {unit.divisions.map((d) => (
          <DivisionBlock key={d.name} division={d} />
        ))}
        {unit.directTeams.map((t) => (
          <TeamChip key={t.id} team={t} />
        ))}
        {unit.divisions.length === 0 && unit.directTeams.length === 0 && (
          <p className="px-1 py-1 text-xs text-slate-400">소속 조직 없음</p>
        )}
      </div>
    </div>
  );
}

export default async function OrgChartPage() {
  if (!(await checkModuleAccess("ORG_CHART"))) {
    return <NoModuleAccess title="조직도" />;
  }

  const [teams, totalEmployees, ceos, opsHeads, seniors] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: { leader: true, _count: { select: { members: true } } },
    }),
    prisma.user.count(),
    prisma.user.findMany({
      where: { position: "CEO" },
      select: { id: true, name: true, jobGrade: true },
    }),
    prisma.user.findMany({
      where: { position: "OPERATIONS_HEAD" },
      select: { id: true, name: true, jobGrade: true, businessUnit: true, division: true },
    }),
    prisma.user.findMany({
      where: { position: "SENIOR_STAFF" },
      select: { id: true, name: true, jobGrade: true, businessUnit: true, division: true },
    }),
  ]);

  ceos.sort((a, b) => execSortKey(a.jobGrade) - execSortKey(b.jobGrade));

  const toTeamLite = (t: (typeof teams)[number]): TeamLite => ({
    id: t.id,
    name: t.name,
    leaderName: t.leader?.name ?? null,
    memberCount: t._count.members,
  });

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
    const leader: Exec = { id: l.id, name: l.name, jobGrade: l.jobGrade };
    if (l.businessUnit) ensureUnit(l.businessUnit).leader = leader;
  }
  for (const l of seniors) {
    const leader: Exec = { id: l.id, name: l.name, jobGrade: l.jobGrade };
    if (l.businessUnit && l.division) {
      ensureDivisionIn(ensureUnit(l.businessUnit), l.division).leader = leader;
    } else if (l.division) {
      ensureStandaloneDivision(l.division).leader = leader;
    }
  }

  const units = unitOrder.map((n) => unitMap.get(n)!);
  const standaloneDivisions = standaloneDivisionOrder.map((n) => standaloneDivisionMap.get(n)!);
  const unitShades = ["bg-brand-green-dark", "bg-emerald-700", "bg-teal-700", "bg-brand-green-dark"];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">조직도</h1>
        <p className="mt-1 text-slate-600">
          한국삼공의 조직 구성입니다. 이름을 클릭하면 인사카드를, 팀을 클릭하면
          구성원을 볼 수 있습니다.
        </p>
      </div>

      <div className="rounded-lg border border-brand-green-dark bg-brand-green px-8 py-6 text-white">
        <p className="text-sm text-white/80">한국삼공</p>
        <p className="mt-1 text-2xl font-bold">전체 조직</p>
        <div className="mt-4 flex gap-8 text-sm">
          <span>
            <strong className="text-lg">{totalEmployees}</strong>명 재직
          </span>
          <span>
            <strong className="text-lg">{teams.length}</strong>개 팀
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max flex-col items-center gap-6 pb-2">
          {ceos.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3">
              {ceos.map((c) => (
                <ExecBox key={c.id} exec={c} fallbackLabel={POSITION_LABEL.CEO as Position} />
              ))}
            </div>
          )}

          {rootTeams.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {rootTeams.map((t) => (
                <TeamChip key={t.id} team={t} />
              ))}
            </div>
          )}

          {units.length > 0 && (
            <div className="flex w-full flex-col gap-4 sm:flex-row">
              {units.map((u, i) => (
                <UnitColumn key={u.name} unit={u} shade={unitShades[i % unitShades.length]} />
              ))}
            </div>
          )}

          {standaloneDivisions.length > 0 && (
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {standaloneDivisions.map((d) => (
                <DivisionBlock key={d.name} division={d} />
              ))}
            </div>
          )}

          {teams.length === 0 && (
            <p className="text-slate-500">아직 등록된 팀이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
