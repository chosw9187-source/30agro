import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";

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
  teamCount,
  memberCount,
  href,
}: {
  name: string;
  role: string;
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
      <p className="mt-1 text-sm text-slate-500">{teamCount}개 팀</p>
      <p className="mt-1 text-sm text-slate-500">{memberCount}명 재직</p>
      <span className="mt-4 text-sm text-brand-green">하위 조직 보기 ›</span>
    </Link>
  );
}

export default async function OrgChartPage({
  searchParams,
}: {
  searchParams: Promise<{ opsHead?: string; senior?: string }>;
}) {
  if (!(await checkModuleAccess("ORG_CHART"))) {
    return <NoModuleAccess title="조직도" />;
  }

  const { opsHead, senior } = await searchParams;

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      leader: true,
      operationsHead: true,
      senior: true,
      _count: { select: { members: true } },
    },
  });
  const totalEmployees = await prisma.user.count();

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

  // Level 3: opsHead + senior both set -> leaf team cards
  if (opsHead && senior) {
    const opsUser = teams.find((t) => t.operationsHeadId === opsHead)?.operationsHead;
    const seniorUser = teams.find((t) => t.seniorId === senior)?.senior;
    const leafTeams = teams.filter(
      (t) => t.operationsHeadId === opsHead && t.seniorId === senior
    );
    const memberCount = leafTeams.reduce((s, t) => s + t._count.members, 0);

    return (
      <div className="flex flex-col gap-6">
        <Link
          href={`/platform/org-chart?opsHead=${encodeURIComponent(opsHead)}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {opsUser?.name ?? "운영책임"} 운영책임
        </Link>
        {header(
          `${seniorUser?.name ?? "책임"} 책임`,
          `한국삼공 · ${opsUser?.name ?? "운영책임"} 운영책임 · ${seniorUser?.name ?? "책임"} 책임`,
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

  // Level 2a: only opsHead set -> senior groups + direct teams under this ops head
  if (opsHead) {
    const opsUser = teams.find((t) => t.operationsHeadId === opsHead)?.operationsHead;
    const teamsUnderHead = teams.filter((t) => t.operationsHeadId === opsHead);
    const seniorGroups = new Map<
      string,
      { name: string; teamCount: number; memberCount: number }
    >();
    const directTeams = [];
    for (const t of teamsUnderHead) {
      if (t.seniorId && t.senior) {
        const g = seniorGroups.get(t.seniorId) ?? {
          name: t.senior.name,
          teamCount: 0,
          memberCount: 0,
        };
        g.teamCount += 1;
        g.memberCount += t._count.members;
        seniorGroups.set(t.seniorId, g);
      } else {
        directTeams.push(t);
      }
    }
    const memberCount = teamsUnderHead.reduce((s, t) => s + t._count.members, 0);

    return (
      <div className="flex flex-col gap-6">
        <Link href="/platform/org-chart" className="text-sm text-slate-500 hover:underline">
          ← 조직도
        </Link>
        {header(
          `${opsUser?.name ?? "운영책임"} 운영책임`,
          `한국삼공 · ${opsUser?.name ?? "운영책임"} 운영책임`,
          teamsUnderHead.length,
          memberCount
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from(seniorGroups.entries()).map(([id, g]) => (
            <GroupCard
              key={id}
              name={g.name}
              role="책임"
              teamCount={g.teamCount}
              memberCount={g.memberCount}
              href={`/platform/org-chart?opsHead=${encodeURIComponent(opsHead)}&senior=${encodeURIComponent(id)}`}
            />
          ))}
          {directTeams.map((t) => (
            <TeamCard key={t.id} team={t} />
          ))}
          {teamsUnderHead.length === 0 && (
            <p className="text-slate-500">소속된 팀이 없습니다.</p>
          )}
        </div>
      </div>
    );
  }

  // Level 2b: only senior set (책임 directly under 사명, no 운영책임) -> leaf team cards
  if (senior) {
    const seniorUser = teams.find((t) => t.seniorId === senior)?.senior;
    const leafTeams = teams.filter((t) => !t.operationsHeadId && t.seniorId === senior);
    const memberCount = leafTeams.reduce((s, t) => s + t._count.members, 0);

    return (
      <div className="flex flex-col gap-6">
        <Link href="/platform/org-chart" className="text-sm text-slate-500 hover:underline">
          ← 조직도
        </Link>
        {header(
          `${seniorUser?.name ?? "책임"} 책임`,
          `한국삼공 · ${seniorUser?.name ?? "책임"} 책임`,
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

  // Root: 운영책임 groups + direct 책임 groups (no ops head) + direct teams (no ops head, no senior)
  const opsGroups = new Map<
    string,
    { name: string; teamCount: number; memberCount: number }
  >();
  const directSeniorGroups = new Map<
    string,
    { name: string; teamCount: number; memberCount: number }
  >();
  const rootTeams = [];

  for (const t of teams) {
    if (t.operationsHeadId && t.operationsHead) {
      const g = opsGroups.get(t.operationsHeadId) ?? {
        name: t.operationsHead.name,
        teamCount: 0,
        memberCount: 0,
      };
      g.teamCount += 1;
      g.memberCount += t._count.members;
      opsGroups.set(t.operationsHeadId, g);
    } else if (t.seniorId && t.senior) {
      const g = directSeniorGroups.get(t.seniorId) ?? {
        name: t.senior.name,
        teamCount: 0,
        memberCount: 0,
      };
      g.teamCount += 1;
      g.memberCount += t._count.members;
      directSeniorGroups.set(t.seniorId, g);
    } else {
      rootTeams.push(t);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">조직도</h1>
        <p className="mt-1 text-slate-600">
          한국삼공의 조직 구성을 사명 → 운영책임 → 책임 → 팀 순으로 확인하세요.
        </p>
      </div>

      {header(
        "전체 조직",
        "한국삼공",
        teams.length,
        totalEmployees
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from(opsGroups.entries()).map(([id, g]) => (
          <GroupCard
            key={id}
            name={g.name}
            role="운영책임"
            teamCount={g.teamCount}
            memberCount={g.memberCount}
            href={`/platform/org-chart?opsHead=${encodeURIComponent(id)}`}
          />
        ))}
        {Array.from(directSeniorGroups.entries()).map(([id, g]) => (
          <GroupCard
            key={id}
            name={g.name}
            role="책임"
            teamCount={g.teamCount}
            memberCount={g.memberCount}
            href={`/platform/org-chart?senior=${encodeURIComponent(id)}`}
          />
        ))}
        {rootTeams.map((t) => (
          <TeamCard key={t.id} team={t} />
        ))}
        {teams.length === 0 && <p className="text-slate-500">아직 등록된 팀이 없습니다.</p>}
      </div>
    </div>
  );
}
