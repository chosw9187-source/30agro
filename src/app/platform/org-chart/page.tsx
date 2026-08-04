import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { POSITION_LABEL, type Position } from "@/lib/permission-constants";

export const dynamic = "force-dynamic";

type Leader = { name: string; jobGrade: string | null; position: Position };

function leaderLabel(leader?: Leader) {
  if (!leader) return null;
  return `${leader.name} ${leader.jobGrade || POSITION_LABEL[leader.position]}`;
}

function TeamCard({
  team,
}: {
  team: {
    id: string;
    name: string;
    leader: { name: string } | null;
    _count: { members: number };
  };
}) {
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-lg font-semibold">{team.name}</p>
      <p className="mt-1 text-sm text-slate-500">
        {team.leader ? `${team.leader.name} 팀장` : "팀장 미지정"}
      </p>
      <p className="mt-3 text-sm text-slate-500">{team._count.members}명</p>
      <Link
        href={`/platform/org-chart/${team.id}`}
        className="mt-4 text-sm text-brand-green hover:underline"
      >
        구성원 보기 ›
      </Link>
    </div>
  );
}

function GroupCard({
  name,
  role,
  leader,
  teamCount,
  memberCount,
  href,
}: {
  name: string;
  role: string;
  leader?: Leader;
  teamCount: number;
  memberCount: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 hover:border-brand-green"
    >
      <p className="text-lg font-semibold">
        {name} <span className="text-sm font-normal text-slate-500">{role}</span>
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {leaderLabel(leader) ?? "리더 미지정"}
      </p>
      <p className="mt-3 text-sm text-slate-500">{teamCount}개 팀</p>
      <p className="mt-1 text-sm text-slate-500">{memberCount}명 재직</p>
      <span className="mt-4 text-sm text-brand-green">하위 조직 보기 ›</span>
    </Link>
  );
}

export default async function OrgChartPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; division?: string }>;
}) {
  if (!(await checkModuleAccess("ORG_CHART"))) {
    return <NoModuleAccess title="조직도" />;
  }

  const { unit, division } = await searchParams;

  const [teams, totalEmployees, ceo, leaders] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        leader: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.user.count(),
    prisma.user.findFirst({ where: { position: "CEO" }, select: { name: true } }),
    prisma.user.findMany({
      where: { position: { in: ["OPERATIONS_HEAD", "SENIOR_STAFF"] } },
      select: { name: true, jobGrade: true, position: true, businessUnit: true, division: true },
    }),
  ]);

  function findLeader(
    role: "OPERATIONS_HEAD" | "SENIOR_STAFF",
    matchUnit: string | null,
    matchDivision: string | null
  ): Leader | undefined {
    const found = leaders.find(
      (l) =>
        l.position === role &&
        (l.businessUnit ?? null) === matchUnit &&
        (l.division ?? null) === matchDivision
    );
    return found
      ? { name: found.name, jobGrade: found.jobGrade, position: found.position as Position }
      : undefined;
  }

  const header = (title: string, breadcrumb: string, teamCount: number, memberCount: number) => (
    <div className="rounded-lg border border-brand-green-dark bg-brand-green px-8 py-6 text-white">
      <p className="text-sm text-white/80">{breadcrumb}</p>
      <p className="mt-1 text-2xl font-bold">{title}</p>
      <div className="mt-4 flex gap-8 text-sm">
        <span>
          <strong className="text-lg">{memberCount}</strong>명 재직
        </span>
        <span>
          <strong className="text-lg">{teamCount}</strong>개 팀
        </span>
      </div>
    </div>
  );

  // Level 3: unit + division both set -> leaf team cards
  if (unit && division) {
    const leafTeams = teams.filter(
      (t) => t.businessUnit === unit && t.division === division
    );
    const memberCount = leafTeams.reduce((s, t) => s + t._count.members, 0);
    const divisionLeader = findLeader("SENIOR_STAFF", unit, division);

    return (
      <div className="flex flex-col gap-6">
        <Link
          href={`/platform/org-chart?unit=${encodeURIComponent(unit)}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {unit} 사업단위
        </Link>
        {header(
          `${division} 본부${divisionLeader ? ` (${leaderLabel(divisionLeader)})` : ""}`,
          `한국삼공 · ${unit} 사업단위 · ${division} 본부`,
          leafTeams.length,
          memberCount
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leafTeams.map((t) => (
            <TeamCard key={t.id} team={t} />
          ))}
          {leafTeams.length === 0 && <p className="text-slate-500">소속된 팀이 없습니다.</p>}
        </div>
      </div>
    );
  }

  // Level 2a: only unit set -> division groups + direct teams under this unit
  if (unit) {
    const teamsUnderUnit = teams.filter((t) => t.businessUnit === unit);
    const divisionGroups = new Map<
      string,
      { teamCount: number; memberCount: number }
    >();
    const directTeams = [];
    for (const t of teamsUnderUnit) {
      if (t.division) {
        const g = divisionGroups.get(t.division) ?? { teamCount: 0, memberCount: 0 };
        g.teamCount += 1;
        g.memberCount += t._count.members;
        divisionGroups.set(t.division, g);
      } else {
        directTeams.push(t);
      }
    }
    // Divisions that only have an assigned leader so far (no teams yet) still show up.
    for (const l of leaders) {
      if (l.position === "SENIOR_STAFF" && l.businessUnit === unit && l.division) {
        if (!divisionGroups.has(l.division)) {
          divisionGroups.set(l.division, { teamCount: 0, memberCount: 0 });
        }
      }
    }
    const memberCount = teamsUnderUnit.reduce((s, t) => s + t._count.members, 0);
    const unitLeader = findLeader("OPERATIONS_HEAD", unit, null);

    return (
      <div className="flex flex-col gap-6">
        <Link href="/platform/org-chart" className="text-sm text-slate-500 hover:underline">
          ← 조직도
        </Link>
        {header(
          `${unit} 사업단위${unitLeader ? ` (${leaderLabel(unitLeader)})` : ""}`,
          `한국삼공 · ${unit} 사업단위`,
          teamsUnderUnit.length,
          memberCount
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from(divisionGroups.entries()).map(([name, g]) => (
            <GroupCard
              key={name}
              name={name}
              role="본부"
              leader={findLeader("SENIOR_STAFF", unit, name)}
              teamCount={g.teamCount}
              memberCount={g.memberCount}
              href={`/platform/org-chart?unit=${encodeURIComponent(unit)}&division=${encodeURIComponent(name)}`}
            />
          ))}
          {directTeams.map((t) => (
            <TeamCard key={t.id} team={t} />
          ))}
          {teamsUnderUnit.length === 0 && divisionGroups.size === 0 && (
            <p className="text-slate-500">소속된 팀이 없습니다.</p>
          )}
        </div>
      </div>
    );
  }

  // Level 2b: only division set (division directly under 사명, no business unit) -> leaf team cards
  if (division) {
    const leafTeams = teams.filter((t) => !t.businessUnit && t.division === division);
    const memberCount = leafTeams.reduce((s, t) => s + t._count.members, 0);
    const divisionLeader = findLeader("SENIOR_STAFF", null, division);

    return (
      <div className="flex flex-col gap-6">
        <Link href="/platform/org-chart" className="text-sm text-slate-500 hover:underline">
          ← 조직도
        </Link>
        {header(
          `${division} 본부${divisionLeader ? ` (${leaderLabel(divisionLeader)})` : ""}`,
          `한국삼공 · ${division} 본부`,
          leafTeams.length,
          memberCount
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leafTeams.map((t) => (
            <TeamCard key={t.id} team={t} />
          ))}
          {leafTeams.length === 0 && <p className="text-slate-500">소속된 팀이 없습니다.</p>}
        </div>
      </div>
    );
  }

  // Root: business-unit groups + direct division groups (no unit) + direct teams (no unit, no division)
  const unitGroups = new Map<string, { teamCount: number; memberCount: number }>();
  const directDivisionGroups = new Map<string, { teamCount: number; memberCount: number }>();
  const rootTeams = [];

  for (const t of teams) {
    if (t.businessUnit) {
      const g = unitGroups.get(t.businessUnit) ?? { teamCount: 0, memberCount: 0 };
      g.teamCount += 1;
      g.memberCount += t._count.members;
      unitGroups.set(t.businessUnit, g);
    } else if (t.division) {
      const g = directDivisionGroups.get(t.division) ?? { teamCount: 0, memberCount: 0 };
      g.teamCount += 1;
      g.memberCount += t._count.members;
      directDivisionGroups.set(t.division, g);
    } else {
      rootTeams.push(t);
    }
  }
  // Business units / standalone divisions that only have a leader assigned so far.
  for (const l of leaders) {
    if (l.position === "OPERATIONS_HEAD" && l.businessUnit && !unitGroups.has(l.businessUnit)) {
      unitGroups.set(l.businessUnit, { teamCount: 0, memberCount: 0 });
    }
    if (
      l.position === "SENIOR_STAFF" &&
      !l.businessUnit &&
      l.division &&
      !directDivisionGroups.has(l.division)
    ) {
      directDivisionGroups.set(l.division, { teamCount: 0, memberCount: 0 });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">조직도</h1>
        <p className="mt-1 text-slate-600">
          한국삼공의 조직 구성을 사명 → 사업단위 → 본부 → 팀 순으로 확인하세요.
        </p>
      </div>

      {header(
        ceo ? `CEO ${ceo.name}` : "전체 조직",
        "한국삼공",
        teams.length,
        totalEmployees
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from(unitGroups.entries()).map(([name, g]) => (
          <GroupCard
            key={name}
            name={name}
            role="사업단위"
            leader={findLeader("OPERATIONS_HEAD", name, null)}
            teamCount={g.teamCount}
            memberCount={g.memberCount}
            href={`/platform/org-chart?unit=${encodeURIComponent(name)}`}
          />
        ))}
        {Array.from(directDivisionGroups.entries()).map(([name, g]) => (
          <GroupCard
            key={name}
            name={name}
            role="본부"
            leader={findLeader("SENIOR_STAFF", null, name)}
            teamCount={g.teamCount}
            memberCount={g.memberCount}
            href={`/platform/org-chart?division=${encodeURIComponent(name)}`}
          />
        ))}
        {rootTeams.map((t) => (
          <TeamCard key={t.id} team={t} />
        ))}
        {teams.length === 0 && unitGroups.size === 0 && directDivisionGroups.size === 0 && (
          <p className="text-slate-500">아직 등록된 팀이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
