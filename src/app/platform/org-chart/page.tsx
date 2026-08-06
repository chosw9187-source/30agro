import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { Avatar } from "@/components/avatar";
import { CompanyLogo } from "@/components/company-logo";
import { BackPill } from "@/components/back-pill";
import {
  isActive,
  activePrismaWhere,
  isBranchTeam,
  regularOrExceptionTeamWhere,
  ageInYears,
  tenureInYears,
} from "@/lib/hr-analytics";

export const dynamic = "force-dynamic";

type Exec = {
  id: string;
  name: string;
  jobGrade: string | null;
  hasPhoto: boolean;
  birthDate?: Date | null;
  hireDate?: Date | null;
};
type CeoExec = Exec;
type TeamLite = {
  id: string;
  name: string;
  leaderId: string | null;
  leaderName: string | null;
  leaderHasPhoto: boolean;
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

type CompositionPart = { count: number; label: string };

function splitTeams(teamList: { name: string }[]) {
  let teamCount = 0;
  let branchCount = 0;
  for (const t of teamList) {
    if (isBranchTeam(t.name)) branchCount++;
    else teamCount++;
  }
  return { teamCount, branchCount };
}

function buildComposition({
  divisionCount = 0,
  teamCount = 0,
  branchCount = 0,
}: {
  divisionCount?: number;
  teamCount?: number;
  branchCount?: number;
}): CompositionPart[] {
  const parts: CompositionPart[] = [];
  if (divisionCount > 0) parts.push({ count: divisionCount, label: "책임" });
  if (teamCount > 0) parts.push({ count: teamCount, label: "팀" });
  if (branchCount > 0) parts.push({ count: branchCount, label: "지점" });
  return parts.length > 0 ? parts : [{ count: 0, label: "팀" }];
}

function unitComposition(unit: UnitNode): CompositionPart[] {
  const allTeams = [...unit.directTeams, ...unit.divisions.flatMap((d) => d.teams)];
  const { teamCount, branchCount } = splitTeams(allTeams);
  return buildComposition({ divisionCount: unit.divisions.length, teamCount, branchCount });
}

function divisionComposition(division: DivisionNode): CompositionPart[] {
  const { teamCount, branchCount } = splitTeams(division.teams);
  return buildComposition({ teamCount, branchCount });
}

function compositionText(parts: CompositionPart[]) {
  return parts.map((p) => `${p.count}${p.label}`).join(" ");
}

function CeoBanner({
  ceos,
  totalEmployees,
  teamCount,
  branchCount,
  opsHeadCount,
  seniorCount,
}: {
  ceos: CeoExec[];
  totalEmployees: number;
  teamCount: number;
  branchCount: number;
  opsHeadCount: number;
  seniorCount: number;
}) {
  return (
    <div className="flex w-full min-w-0 overflow-hidden rounded-lg border border-brand-black shadow-sm">
      <div className="w-2 shrink-0 bg-brand-green" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-6 bg-brand-black px-8 py-6 text-white">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white p-2">
          <CompanyLogo className="h-full w-full" />
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
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <strong className="text-lg">{totalEmployees}</strong>명 재직
          </span>
          <span>
            <strong className="text-lg">{opsHeadCount}</strong>운영책임
          </span>
          <span>
            <strong className="text-lg">{seniorCount}</strong>책임
          </span>
          <span>
            <strong className="text-lg">{teamCount}</strong>팀
          </span>
          <span>
            <strong className="text-lg">{branchCount}</strong>지점
          </span>
        </div>
      </div>
    </div>
  );
}

function CardShell({
  href,
  avatarNode,
  title,
  subtitle,
  headcount,
  parts,
}: {
  href: string;
  avatarNode: React.ReactNode;
  title: string;
  subtitle: string;
  headcount: number;
  parts: CompositionPart[];
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center rounded-lg border border-slate-200 bg-white p-4 text-center hover:border-brand-green hover:shadow-sm"
    >
      {avatarNode}
      <p className="mt-2 font-semibold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500">{subtitle}</p>
      <div className="mt-2 flex gap-3 text-xs text-slate-500">
        <span>
          <strong className="text-brand-green-dark">{headcount}</strong>명
        </span>
        <span>{compositionText(parts)}</span>
      </div>
      <span className="mt-3 w-full rounded bg-brand-green-light py-1.5 text-xs font-medium text-brand-green-dark">
        상세보기 ›
      </span>
    </Link>
  );
}

function LeaderAvatarOrInitial({ leader, fallbackText }: { leader?: Exec; fallbackText: string }) {
  if (leader) {
    return (
      <Avatar userId={leader.id} name={leader.name} hasPhoto={leader.hasPhoto} className="h-12 w-12 text-base" />
    );
  }
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-green-light text-sm font-semibold text-brand-green-dark">
      {fallbackText.slice(0, 1)}
    </span>
  );
}

function TeamChip({ team }: { team: TeamLite }) {
  const leaderTitle = isBranchTeam(team.name) ? "지점장" : "팀장";
  return (
    <Link
      href={`/platform/org-chart/${team.id}`}
      className="flex flex-col items-center rounded-lg border border-slate-200 bg-white p-4 text-center hover:border-brand-green hover:shadow-sm"
    >
      {team.leaderId ? (
        <Avatar
          userId={team.leaderId}
          name={team.leaderName ?? team.name}
          hasPhoto={team.leaderHasPhoto}
          className="h-10 w-10 text-sm"
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green-light text-sm font-semibold text-brand-green-dark">
          {team.name.slice(0, 1)}
        </span>
      )}
      <p className="mt-2 text-sm font-medium text-slate-800">{team.name}</p>
      <p className="text-xs text-slate-500">
        {team.leaderName ? `${team.leaderName} ${leaderTitle}` : `${leaderTitle} 미지정`} · {team.memberCount}명
      </p>
      <span className="mt-3 w-full rounded bg-brand-green-light py-1.5 text-xs font-medium text-brand-green-dark">
        상세보기 ›
      </span>
    </Link>
  );
}

function DrillCard({
  href,
  title,
  leader,
  headcount,
  parts,
}: {
  href: string;
  title: string;
  leader?: Exec;
  headcount: number;
  parts: CompositionPart[];
}) {
  return (
    <CardShell
      href={href}
      avatarNode={<LeaderAvatarOrInitial leader={leader} fallbackText={title} />}
      title={title}
      subtitle={leader ? `${leader.name}${leader.jobGrade ? ` ${leader.jobGrade}` : ""}` : "리더 미지정"}
      headcount={headcount}
      parts={parts}
    />
  );
}

/**
 * Tree connector: a stem down from the parent banner, a horizontal branch
 * spanning the first-to-last card center, and a vertical drop to each card.
 * The row below must use the same fixed N-column grid (no responsive
 * breakpoint reflow) so the drop points line up with card centers.
 */
function ConnectorRow({ count, minWidth, children }: { count: number; minWidth: number; children: React.ReactNode }) {
  if (count === 0) return null;
  const points = Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 100);

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth }}>
        <div className="relative h-6 w-full">
          <div className="absolute left-1/2 top-0 h-1/2 w-0.5 -translate-x-1/2 bg-slate-300" />
          {count > 1 && (
            <div
              className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-slate-300"
              style={{ left: `${points[0]}%`, right: `${100 - points[count - 1]}%` }}
            />
          )}
          {points.map((p, i) => (
            <div
              key={i}
              className="absolute bottom-0 h-1/2 w-0.5 bg-slate-300"
              style={{ left: `${p}%`, transform: "translateX(-50%)" }}
            />
          ))}
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps a long list of cards into several tree-connected rows instead of
 * one endlessly wide ConnectorRow, so a division with many teams (e.g.
 * many 지점) breaks onto multiple lines rather than forcing horizontal
 * scroll. Each node must already carry its own `key`.
 */
function TreeGrid({
  nodes,
  chunkSize = 6,
  cardWidth = 200,
}: {
  nodes: React.ReactNode[];
  chunkSize?: number;
  cardWidth?: number;
}) {
  if (nodes.length === 0) return null;
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < nodes.length; i += chunkSize) rows.push(nodes.slice(i, i + chunkSize));

  return (
    <div className="flex flex-col gap-8">
      {rows.map((row, i) => (
        <ConnectorRow key={i} count={row.length} minWidth={row.length * cardWidth}>
          {row}
        </ConnectorRow>
      ))}
    </div>
  );
}

function LeaderBanner({
  eyebrow,
  title,
  leader,
  headcount,
  parts,
}: {
  eyebrow: string;
  title: string;
  leader?: Exec | null;
  headcount: number;
  parts: CompositionPart[];
}) {
  return (
    <div className="flex w-full min-w-0 overflow-hidden rounded-lg border border-brand-black shadow-sm">
      <div className="w-2 shrink-0 bg-brand-green" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-6 bg-brand-black px-8 py-6 text-white">
        {leader ? (
          <Avatar
            userId={leader.id}
            name={leader.name}
            hasPhoto={!!leader.hasPhoto}
            className="h-16 w-16 shrink-0 border-2 border-white/50 text-lg"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white p-2">
            <CompanyLogo className="h-full w-full" />
          </div>
        )}
        <div className="min-w-[200px] flex-1">
          <p className="text-xs uppercase tracking-wide text-white/50">{eyebrow}</p>
          <p className="mt-1 text-xl font-bold">{title}</p>
          {leader && (leader.birthDate || leader.hireDate) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {leader.birthDate && (
                <span className="rounded-full bg-blue-400/20 px-2 py-0.5 text-xs font-medium text-blue-100">
                  만 {ageInYears(leader.birthDate)}세
                </span>
              )}
              {leader.hireDate && (
                <>
                  <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-medium text-amber-100">
                    근속 {tenureInYears(leader.hireDate).toFixed(1)}년
                  </span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-white/80">
                    입사 {leader.hireDate.toLocaleDateString("ko-KR")}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-8 text-sm">
          <span>
            <strong className="text-lg">{headcount}</strong>명 재직
          </span>
          {parts.map((p, i) => (
            <span key={i}>
              <strong className="text-lg">{p.count}</strong>
              {p.label}
            </span>
          ))}
          {leader && (
            <Link
              href={`/platform/employees/${leader.id}`}
              className="rounded border border-white/40 px-3 py-1.5 hover:bg-white/10"
            >
              상세보기 ›
            </Link>
          )}
        </div>
      </div>
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
      where: { active: true },
      orderBy: { name: "asc" },
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

  // DIVISION VIEW — unit+division, or a standalone division with no unit.
  if (divisionParam) {
    const division = unitParam
      ? unitMap.get(unitParam)?.divisions.find((d) => d.name === divisionParam)
      : standaloneDivisionMap.get(divisionParam);

    const divisionBackHref = unitParam
      ? `/platform/org-chart?unit=${encodeURIComponent(unitParam)}`
      : "/platform/org-chart";
    const divisionBackLabel = unitParam ?? "전체";

    if (!division) {
      return (
        <div className="flex flex-col gap-4">
          <BackPill href={divisionBackHref} label={divisionBackLabel} />
          <p className="text-slate-500">해당 본부를 찾을 수 없습니다.</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6">
        <BackPill href={divisionBackHref} label={divisionBackLabel} />
        <LeaderBanner
          eyebrow={division.name}
          title={division.leader ? `${division.leader.name} ${division.leader.jobGrade || ""}`.trim() : division.name}
          leader={division.leader}
          headcount={divisionHeadcount(division)}
          parts={divisionComposition(division)}
        />
        <div>
          <TreeGrid nodes={division.teams.map((t) => <TeamChip key={t.id} team={t} />)} />
          {division.teams.length === 0 && <p className="text-slate-500">소속 팀이 없습니다.</p>}
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
          <BackPill href="/platform/org-chart" label="전체" />
          <p className="text-slate-500">해당 사업단위를 찾을 수 없습니다.</p>
        </div>
      );
    }

    const unitChildCount = unit.divisions.length + unit.directTeams.length;

    return (
      <div className="flex flex-col gap-6">
        <BackPill href="/platform/org-chart" label="전체" />
        <LeaderBanner
          eyebrow={unit.name}
          title={unit.leader ? `${unit.leader.name} ${unit.leader.jobGrade || ""}`.trim() : unit.name}
          leader={unit.leader}
          headcount={unitHeadcount(unit)}
          parts={unitComposition(unit)}
        />
        <div>
          <ConnectorRow count={unitChildCount} minWidth={unitChildCount * 200}>
            {unit.divisions.map((d) => (
              <DrillCard
                key={d.name}
                href={`/platform/org-chart?unit=${encodeURIComponent(unit.name)}&division=${encodeURIComponent(d.name)}`}
                title={d.name}
                leader={d.leader}
                headcount={divisionHeadcount(d)}
                parts={divisionComposition(d)}
              />
            ))}
            {unit.directTeams.map((t) => (
              <TeamChip key={t.id} team={t} />
            ))}
          </ConnectorRow>
          {unitChildCount === 0 && <p className="text-slate-500">소속 조직이 없습니다.</p>}
        </div>
      </div>
    );
  }

  // ROOT VIEW
  const rootChildCount = units.length + standaloneDivisions.length;
  const { teamCount: companyTeamCount, branchCount: companyBranchCount } = splitTeams(teams);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">조직도</h1>
        <p className="mt-1 text-slate-600">
          한국삼공의 조직 구성입니다. 클릭하면 세부구성을 볼 수 있습니다.
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

      <div className="flex flex-col items-center gap-8">
        {rootChildCount > 0 && (
          <ConnectorRow count={rootChildCount} minWidth={rootChildCount * 200}>
            {units.map((u) => (
              <DrillCard
                key={u.name}
                href={`/platform/org-chart?unit=${encodeURIComponent(u.name)}`}
                title={u.name}
                leader={u.leader}
                headcount={unitHeadcount(u)}
                parts={unitComposition(u)}
              />
            ))}
            {standaloneDivisions.map((d) => (
              <DrillCard
                key={d.name}
                href={`/platform/org-chart?division=${encodeURIComponent(d.name)}`}
                title={d.name}
                leader={d.leader}
                headcount={divisionHeadcount(d)}
                parts={divisionComposition(d)}
              />
            ))}
          </ConnectorRow>
        )}

        {rootTeams.length > 0 && (
          <div className="w-full">
            <p className="mb-2 text-center text-xs font-medium text-slate-400">직속</p>
            <ConnectorRow count={rootTeams.length} minWidth={rootTeams.length * 180}>
              {rootTeams.map((t) => (
                <TeamChip key={t.id} team={t} />
              ))}
            </ConnectorRow>
          </div>
        )}

        {teams.length === 0 && <p className="text-slate-500">아직 등록된 팀이 없습니다.</p>}
      </div>
    </div>
  );
}
