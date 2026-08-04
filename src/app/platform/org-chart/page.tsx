import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { Avatar } from "@/components/avatar";

export const dynamic = "force-dynamic";

type Exec = { id: string; name: string; jobGrade: string | null };
type CeoExec = Exec & { hasPhoto: boolean };
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

function unitHeadcount(unit: UnitNode) {
  return (
    unit.directTeams.reduce((s, t) => s + t.memberCount, 0) +
    unit.divisions.reduce((s, d) => s + d.teams.reduce((s2, t) => s2 + t.memberCount, 0), 0)
  );
}

function divisionHeadcount(division: DivisionNode) {
  return division.teams.reduce((s, t) => s + t.memberCount, 0);
}

function CeoBanner({
  ceos,
  totalEmployees,
  teamCount,
  unitCount,
}: {
  ceos: CeoExec[];
  totalEmployees: number;
  teamCount: number;
  unitCount: number;
}) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-brand-black bg-brand-black text-white">
      <div className="flex flex-wrap items-center gap-6 px-8 py-6">
        <div className="flex -space-x-3">
          {ceos.map((c) => (
            <Avatar
              key={c.id}
              userId={c.id}
              name={c.name}
              hasPhoto={c.hasPhoto}
              className="h-16 w-16 border-2 border-brand-black text-lg"
            />
          ))}
        </div>
        <div className="min-w-[200px] flex-1">
          <p className="text-xs uppercase tracking-wide text-white/50">한국삼공 · CEO</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            {ceos.map((c) => (
              <Link key={c.id} href={`/platform/employees/${c.id}`} className="hover:underline">
                <span className="text-xl font-bold">{c.name}</span>{" "}
                <span className="text-sm text-white/60">{c.jobGrade || "CEO"}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex gap-8 text-sm">
          <span>
            <strong className="text-lg">{totalEmployees}</strong>명 재직
          </span>
          <span>
            <strong className="text-lg">{unitCount}</strong>개 사업단위
          </span>
          <span>
            <strong className="text-lg">{teamCount}</strong>개 팀
          </span>
        </div>
      </div>
    </div>
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

function DrillCard({
  href,
  title,
  leaderName,
  headcount,
  subCount,
  subLabel,
}: {
  href: string;
  title: string;
  leaderName?: string | null;
  headcount: number;
  subCount: number;
  subLabel: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-green"
    >
      <div>
        <p className="font-semibold text-slate-800">{title}</p>
        <p className="text-sm text-slate-500">{leaderName || "리더 미지정"}</p>
        <div className="mt-3 flex gap-4 text-sm text-slate-500">
          <span>
            <strong className="text-brand-green-dark">{headcount}</strong>명 재직
          </span>
          <span>
            <strong className="text-brand-green-dark">{subCount}</strong>
            {subLabel}
          </span>
        </div>
      </div>
      <span className="mt-3 self-start text-sm text-brand-green">상세보기 ›</span>
    </Link>
  );
}

function LeaderBanner({
  eyebrow,
  title,
  leaderName,
  headcount,
  subCount,
  subLabel,
}: {
  eyebrow: string;
  title: string;
  leaderName?: string | null;
  headcount: number;
  subCount: number;
  subLabel: string;
}) {
  return (
    <div className="rounded-lg border border-brand-green-dark bg-brand-green px-8 py-6 text-white">
      <p className="text-sm text-white/80">{eyebrow}</p>
      <p className="mt-1 text-2xl font-bold">{title}</p>
      {leaderName && <p className="mt-1 text-white/90">{leaderName}</p>}
      <div className="mt-4 flex gap-8 text-sm">
        <span>
          <strong className="text-lg">{headcount}</strong>명 재직
        </span>
        <span>
          <strong className="text-lg">{subCount}</strong>
          {subLabel}
        </span>
      </div>
    </div>
  );
}

function Breadcrumb({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-300">›</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-brand-green hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-700">{item.label}</span>
          )}
        </span>
      ))}
    </div>
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

  const { unit: unitParam, division: divisionParam } = await searchParams;

  const [teams, totalEmployees, ceos, opsHeads, seniors] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: { leader: true, _count: { select: { members: true } } },
    }),
    prisma.user.count(),
    prisma.user.findMany({
      where: { position: "CEO" },
      select: { id: true, name: true, jobGrade: true, photo: true },
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
  const ceoExecs: CeoExec[] = ceos.map((c) => ({
    id: c.id,
    name: c.name,
    jobGrade: c.jobGrade,
    hasPhoto: !!c.photo,
  }));

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

  const UNIT_PRIORITY: Record<string, number> = {
    제품사업: 0,
    연구생산: 1,
    재무경영관리: 2,
  };
  const units = unitOrder
    .map((n) => unitMap.get(n)!)
    .sort((a, b) => (UNIT_PRIORITY[a.name] ?? 9) - (UNIT_PRIORITY[b.name] ?? 9));
  const standaloneDivisions = standaloneDivisionOrder.map((n) => standaloneDivisionMap.get(n)!);

  // DIVISION VIEW — unit+division, or a standalone division with no unit.
  if (divisionParam) {
    const division = unitParam
      ? unitMap.get(unitParam)?.divisions.find((d) => d.name === divisionParam)
      : standaloneDivisionMap.get(divisionParam);

    if (!division) {
      return (
        <div className="flex flex-col gap-4">
          <Breadcrumb items={[{ label: "전체", href: "/platform/org-chart" }, { label: "찾을 수 없음" }]} />
          <p className="text-slate-500">해당 본부를 찾을 수 없습니다.</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb
          items={[
            { label: "전체", href: "/platform/org-chart" },
            ...(unitParam
              ? [{ label: unitParam, href: `/platform/org-chart?unit=${encodeURIComponent(unitParam)}` }]
              : []),
            { label: division.name },
          ]}
        />
        <LeaderBanner
          eyebrow={unitParam ? `${unitParam} · ${division.name}` : division.name}
          title={division.leader ? `${division.leader.name} ${division.leader.jobGrade || ""}`.trim() : division.name}
          headcount={divisionHeadcount(division)}
          subCount={division.teams.length}
          subLabel="개 팀"
        />
        <div>
          <h2 className="mb-3 text-lg font-medium">소속 팀</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {division.teams.map((t) => (
              <TeamChip key={t.id} team={t} />
            ))}
            {division.teams.length === 0 && <p className="text-slate-500">소속 팀이 없습니다.</p>}
          </div>
        </div>
      </div>
    );
  }

  // UNIT VIEW
  if (unitParam) {
    const unit = unitMap.get(unitParam);
    if (!unit) {
      return (
        <div className="flex flex-col gap-4">
          <Breadcrumb items={[{ label: "전체", href: "/platform/org-chart" }, { label: "찾을 수 없음" }]} />
          <p className="text-slate-500">해당 사업단위를 찾을 수 없습니다.</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[{ label: "전체", href: "/platform/org-chart" }, { label: unit.name }]} />
        <LeaderBanner
          eyebrow="사업단위"
          title={unit.leader ? `${unit.leader.name} ${unit.leader.jobGrade || ""}`.trim() : unit.name}
          headcount={unitHeadcount(unit)}
          subCount={unit.divisions.length + unit.directTeams.length}
          subLabel="개 하위 조직"
        />
        <div>
          <h2 className="mb-3 text-lg font-medium">하위 조직</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unit.divisions.map((d) => (
              <DrillCard
                key={d.name}
                href={`/platform/org-chart?unit=${encodeURIComponent(unit.name)}&division=${encodeURIComponent(d.name)}`}
                title={d.name}
                leaderName={d.leader ? `${d.leader.name} ${d.leader.jobGrade || ""}`.trim() : null}
                headcount={divisionHeadcount(d)}
                subCount={d.teams.length}
                subLabel="개 팀"
              />
            ))}
            {unit.directTeams.map((t) => (
              <TeamChip key={t.id} team={t} />
            ))}
            {unit.divisions.length === 0 && unit.directTeams.length === 0 && (
              <p className="text-slate-500">소속 조직이 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ROOT VIEW
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">조직도</h1>
        <p className="mt-1 text-slate-600">
          한국삼공의 조직 구성입니다. 사업단위를 클릭하면 하위 조직을, 팀을
          클릭하면 구성원을 볼 수 있습니다.
        </p>
      </div>

      {ceoExecs.length > 0 ? (
        <CeoBanner
          ceos={ceoExecs}
          totalEmployees={totalEmployees}
          teamCount={teams.length}
          unitCount={units.length}
        />
      ) : (
        <LeaderBanner
          eyebrow="한국삼공"
          title="전체 조직"
          headcount={totalEmployees}
          subCount={teams.length}
          subLabel="개 팀"
        />
      )}

      <div className="flex flex-col items-center gap-6">
        {rootTeams.length > 0 && (
          <div className="w-full">
            <p className="mb-2 text-center text-xs font-medium text-slate-400">직속</p>
            <div className="flex flex-wrap justify-center gap-2">
              {rootTeams.map((t) => (
                <TeamChip key={t.id} team={t} />
              ))}
            </div>
          </div>
        )}

        {(units.length > 0 || standaloneDivisions.length > 0) && (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {units.map((u) => (
              <DrillCard
                key={u.name}
                href={`/platform/org-chart?unit=${encodeURIComponent(u.name)}`}
                title={u.name}
                leaderName={u.leader ? `${u.leader.name} ${u.leader.jobGrade || ""}`.trim() : null}
                headcount={unitHeadcount(u)}
                subCount={u.divisions.length + u.directTeams.length}
                subLabel="개 하위 조직"
              />
            ))}
            {standaloneDivisions.map((d) => (
              <DrillCard
                key={d.name}
                href={`/platform/org-chart?division=${encodeURIComponent(d.name)}`}
                title={d.name}
                leaderName={d.leader ? `${d.leader.name} ${d.leader.jobGrade || ""}`.trim() : null}
                headcount={divisionHeadcount(d)}
                subCount={d.teams.length}
                subLabel="개 팀"
              />
            ))}
          </div>
        )}

        {teams.length === 0 && <p className="text-slate-500">아직 등록된 팀이 없습니다.</p>}
      </div>
    </div>
  );
}
