import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { Avatar } from "@/components/avatar";
import { CompanyLogo } from "@/components/company-logo";

export const dynamic = "force-dynamic";

type Exec = { id: string; name: string; jobGrade: string | null; hasPhoto: boolean };
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
    <div className="flex w-full overflow-hidden rounded-lg border border-brand-black shadow-sm">
      <div className="w-2 shrink-0 bg-brand-green" />
      <div className="flex flex-1 flex-wrap items-center gap-6 bg-brand-black px-8 py-6 text-white">
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

function CardShell({
  href,
  avatarNode,
  title,
  subtitle,
  headcount,
  subCount,
  subLabel,
}: {
  href: string;
  avatarNode: React.ReactNode;
  title: string;
  subtitle: string;
  headcount: number;
  subCount: number;
  subLabel: string;
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
        <span>
          <strong className="text-brand-green-dark">{subCount}</strong>
          {subLabel}
        </span>
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
        {team.leaderName ? `${team.leaderName} 팀장` : "팀장 미지정"} · {team.memberCount}명
      </p>
    </Link>
  );
}

function DrillCard({
  href,
  title,
  leader,
  headcount,
  subCount,
  subLabel,
}: {
  href: string;
  title: string;
  leader?: Exec;
  headcount: number;
  subCount: number;
  subLabel: string;
}) {
  return (
    <CardShell
      href={href}
      avatarNode={<LeaderAvatarOrInitial leader={leader} fallbackText={title} />}
      title={title}
      subtitle={leader ? `${leader.name}${leader.jobGrade ? ` ${leader.jobGrade}` : ""}` : "리더 미지정"}
      headcount={headcount}
      subCount={subCount}
      subLabel={subLabel}
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

function LeaderBanner({
  eyebrow,
  title,
  leaderId,
  leaderName,
  headcount,
  subCount,
  subLabel,
}: {
  eyebrow: string;
  title: string;
  leaderId?: string | null;
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
      <div className="mt-4 flex items-center gap-8 text-sm">
        <span>
          <strong className="text-lg">{headcount}</strong>명 재직
        </span>
        <span>
          <strong className="text-lg">{subCount}</strong>
          {subLabel}
        </span>
        {leaderId && (
          <Link
            href={`/platform/employees/${leaderId}`}
            className="rounded border border-white/40 px-3 py-1.5 hover:bg-white/10"
          >
            상세보기 ›
          </Link>
        )}
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
      select: { id: true, name: true, jobGrade: true, businessUnit: true, division: true, photo: true },
    }),
    prisma.user.findMany({
      where: { position: "SENIOR_STAFF" },
      select: { id: true, name: true, jobGrade: true, businessUnit: true, division: true, photo: true },
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
    leaderId: t.leader?.id ?? null,
    leaderName: t.leader?.name ?? null,
    leaderHasPhoto: !!t.leader?.photo,
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
    const leader: Exec = { id: l.id, name: l.name, jobGrade: l.jobGrade, hasPhoto: !!l.photo };
    if (l.businessUnit) ensureUnit(l.businessUnit).leader = leader;
  }
  for (const l of seniors) {
    const leader: Exec = { id: l.id, name: l.name, jobGrade: l.jobGrade, hasPhoto: !!l.photo };
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
          leaderId={division.leader?.id}
          headcount={divisionHeadcount(division)}
          subCount={division.teams.length}
          subLabel="개 팀"
        />
        <div>
          <h2 className="mb-3 text-lg font-medium">소속 팀</h2>
          <ConnectorRow count={division.teams.length} minWidth={division.teams.length * 200}>
            {division.teams.map((t) => (
              <TeamChip key={t.id} team={t} />
            ))}
          </ConnectorRow>
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
          <Breadcrumb items={[{ label: "전체", href: "/platform/org-chart" }, { label: "찾을 수 없음" }]} />
          <p className="text-slate-500">해당 사업단위를 찾을 수 없습니다.</p>
        </div>
      );
    }

    const unitChildCount = unit.divisions.length + unit.directTeams.length;

    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[{ label: "전체", href: "/platform/org-chart" }, { label: unit.name }]} />
        <LeaderBanner
          eyebrow="사업단위"
          title={unit.leader ? `${unit.leader.name} ${unit.leader.jobGrade || ""}`.trim() : unit.name}
          leaderId={unit.leader?.id}
          headcount={unitHeadcount(unit)}
          subCount={unitChildCount}
          subLabel="개 하위 조직"
        />
        <div>
          <h2 className="mb-3 text-lg font-medium">하위 조직</h2>
          <ConnectorRow count={unitChildCount} minWidth={unitChildCount * 200}>
            {unit.divisions.map((d) => (
              <DrillCard
                key={d.name}
                href={`/platform/org-chart?unit=${encodeURIComponent(unit.name)}&division=${encodeURIComponent(d.name)}`}
                title={d.name}
                leader={d.leader}
                headcount={divisionHeadcount(d)}
                subCount={d.teams.length}
                subLabel="개 팀"
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
                subCount={u.divisions.length + u.directTeams.length}
                subLabel="개 하위 조직"
              />
            ))}
            {standaloneDivisions.map((d) => (
              <DrillCard
                key={d.name}
                href={`/platform/org-chart?division=${encodeURIComponent(d.name)}`}
                title={d.name}
                leader={d.leader}
                headcount={divisionHeadcount(d)}
                subCount={d.teams.length}
                subLabel="개 팀"
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
