"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { CompanyLogo } from "@/components/company-logo";
import { isBranchTeam, ageInYears, tenureInYears } from "@/lib/hr-analytics";
import { formatKSTDate } from "@/lib/format-kst";
import {
  type CeoExec,
  type Exec,
  type TeamLite,
  type DivisionNode,
  type UnitNode,
  type CompositionPart,
  unitHeadcount,
  divisionHeadcount,
  unitComposition,
  divisionComposition,
  compositionText,
} from "./shared";

export function CeoBanner({
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

/** Root-level unit/standalone-division card: click toggles inline drilldown instead of navigating. */
function DrillButton({
  title,
  leader,
  headcount,
  parts,
  active,
  onClick,
}: {
  title: string;
  leader?: Exec;
  headcount: number;
  parts: CompositionPart[];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center rounded-lg border bg-white p-4 text-center hover:border-brand-green hover:shadow-sm ${
        active ? "border-brand-green shadow-sm ring-1 ring-brand-green" : "border-slate-200"
      }`}
    >
      <LeaderAvatarOrInitial leader={leader} fallbackText={title} />
      <p className="mt-2 font-semibold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500">
        {leader ? `${leader.name}${leader.jobGrade ? ` ${leader.jobGrade}` : ""}` : "리더 미지정"}
      </p>
      <div className="mt-2 flex gap-3 text-xs text-slate-500">
        <span>
          <strong className="text-brand-green-dark">{headcount}</strong>명
        </span>
        <span>{compositionText(parts)}</span>
      </div>
      <span className="mt-3 w-full rounded bg-brand-green-light py-1.5 text-xs font-medium text-brand-green-dark">
        {active ? "접기 ˄" : "상세보기 ›"}
      </span>
    </button>
  );
}

export function TeamChip({ team }: { team: TeamLite }) {
  const leaderTitle = isBranchTeam(team.name) ? "지점장" : "팀장";
  return (
    <Link
      href={`/platform/org-chart/${team.id}`}
      className="mx-auto flex w-44 shrink-0 flex-col items-center rounded-lg border border-slate-200 bg-white p-4 text-center hover:border-brand-green hover:shadow-sm"
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

export function LeaderBanner({
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
                  만 {ageInYears(leader.birthDate)}세 ({formatKSTDate(leader.birthDate)})
                </span>
              )}
              {leader.hireDate && (
                <>
                  <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-medium text-amber-100">
                    근속 {tenureInYears(leader.hireDate).toFixed(1)}년
                  </span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-white/80">
                    입사 {formatKSTDate(leader.hireDate)}
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

/** Inline drilldown for a single division: banner + its teams, with a way to close. */
function DrilldownStem() {
  return <div className="mx-auto h-4 w-0.5 bg-slate-300" />;
}

function DivisionDrilldown({ division, onClose }: { division: DivisionNode; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <LeaderBanner
            eyebrow={division.name}
            title={division.leader ? `${division.leader.name} ${division.leader.jobGrade || ""}`.trim() : division.name}
            leader={division.leader}
            headcount={divisionHeadcount(division)}
            parts={divisionComposition(division)}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
        >
          접기 ˄
        </button>
      </div>
      {division.teams.length > 0 ? (
        <TreeGrid nodes={division.teams.map((t) => <TeamChip key={t.id} team={t} />)} />
      ) : (
        <p className="text-slate-500">소속 팀이 없습니다.</p>
      )}
    </div>
  );
}

/** Inline drilldown for a single unit: banner + its divisions (expandable further) + direct teams. */
function UnitDrilldown({ unit }: { unit: UnitNode }) {
  const [expandedDivision, setExpandedDivision] = useState<string | null>(null);
  const childCount = unit.divisions.length + unit.directTeams.length;

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4">
      <div className="flex flex-col gap-4">
        <LeaderBanner
          eyebrow={unit.name}
          title={unit.leader ? `${unit.leader.name} ${unit.leader.jobGrade || ""}`.trim() : unit.name}
          leader={unit.leader}
          headcount={unitHeadcount(unit)}
          parts={unitComposition(unit)}
        />
        {childCount > 0 ? (
          <ConnectorRow count={childCount} minWidth={childCount * 200}>
            {unit.divisions.map((d) => (
              <DrillButton
                key={d.name}
                title={d.name}
                leader={d.leader}
                headcount={divisionHeadcount(d)}
                parts={divisionComposition(d)}
                active={expandedDivision === d.name}
                onClick={() => setExpandedDivision((cur) => (cur === d.name ? null : d.name))}
              />
            ))}
            {unit.directTeams.map((t) => (
              <TeamChip key={t.id} team={t} />
            ))}
          </ConnectorRow>
        ) : (
          <p className="text-slate-500">소속 조직이 없습니다.</p>
        )}
      </div>
      {expandedDivision && (
        <div className="mt-4 flex flex-col items-center">
          <DrilldownStem />
          <DivisionDrilldown
            division={unit.divisions.find((d) => d.name === expandedDivision)!}
            onClose={() => setExpandedDivision(null)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 비서실/사업개발팀처럼 사업단위 없이 CEO 직속인 팀들: 유닛 카드와 나란한
 * 한 단(段)처럼 보이지 않도록, 중앙 트렁크 라인에서 오른쪽으로 갈라지는
 * 곁가지로 작게(TeamChip 그대로) 붙여서 그린다. 갈라지는 지점의 가로선
 * 폭은 실제 렌더된 카드 묶음 위치를 측정해서 정확히 맞춘다.
 */
function DirectTeamsBranch({ teams }: { teams: TeamLite[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState<number | null>(null);

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      const cluster = clusterRef.current;
      if (!container || !cluster) return;
      const c = container.getBoundingClientRect();
      const cl = cluster.getBoundingClientRect();
      setDx(cl.left + cl.width / 2 - (c.left + c.width / 2));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [teams]);

  if (teams.length === 0) return null;

  const BRANCH_Y = 20;
  const DROP_H = 18;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-slate-300" />
      {dx !== null && Math.abs(dx) > 1 && (
        <>
          <div
            className="absolute h-0.5 bg-slate-300"
            style={{
              top: BRANCH_Y,
              left: dx >= 0 ? "50%" : `calc(50% + ${dx}px)`,
              width: Math.abs(dx),
            }}
          />
          <div
            className="absolute w-0.5 bg-slate-300"
            style={{ top: BRANCH_Y, left: `calc(50% + ${dx}px)`, height: DROP_H, transform: "translateX(-50%)" }}
          />
        </>
      )}
      <div className="flex justify-end pr-[5%]" style={{ paddingTop: BRANCH_Y + DROP_H }}>
        <div ref={clusterRef} className="flex flex-col items-center gap-1.5">
          <p className="text-xs font-medium text-slate-400">직속</p>
          <div className="flex gap-3">
            {teams.map((t) => (
              <TeamChip key={t.id} team={t} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OrgChartRoot({
  units,
  standaloneDivisions,
  rootTeams,
}: {
  units: UnitNode[];
  standaloneDivisions: DivisionNode[];
  rootTeams: TeamLite[];
}) {
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const [expandedStandaloneDivision, setExpandedStandaloneDivision] = useState<string | null>(null);
  const rootChildCount = units.length + standaloneDivisions.length;

  return (
    <div className="flex flex-col items-center">
      <div className="flex w-full flex-col">
        <DirectTeamsBranch teams={rootTeams} />
        {rootChildCount > 0 && (
          <ConnectorRow count={rootChildCount} minWidth={rootChildCount * 200}>
            {units.map((u) => (
              <DrillButton
                key={u.name}
                title={u.name}
                leader={u.leader}
                headcount={unitHeadcount(u)}
                parts={unitComposition(u)}
                active={expandedUnit === u.name}
                onClick={() => setExpandedUnit((cur) => (cur === u.name ? null : u.name))}
              />
            ))}
            {standaloneDivisions.map((d) => (
              <DrillButton
                key={d.name}
                title={d.name}
                leader={d.leader}
                headcount={divisionHeadcount(d)}
                parts={divisionComposition(d)}
                active={expandedStandaloneDivision === d.name}
                onClick={() =>
                  setExpandedStandaloneDivision((cur) => (cur === d.name ? null : d.name))
                }
              />
            ))}
          </ConnectorRow>
        )}
      </div>

      {expandedUnit && (
        <div className="flex w-full flex-col items-center">
          <DrilldownStem />
          <UnitDrilldown unit={units.find((u) => u.name === expandedUnit)!} />
        </div>
      )}

      {expandedStandaloneDivision && (
        <div className={`flex w-full flex-col items-center ${expandedUnit ? "mt-8" : ""}`}>
          <DrilldownStem />
          <DivisionDrilldown
            division={standaloneDivisions.find((d) => d.name === expandedStandaloneDivision)!}
            onClose={() => setExpandedStandaloneDivision(null)}
          />
        </div>
      )}

      {rootChildCount === 0 && rootTeams.length === 0 && (
        <p className="mt-8 text-slate-500">아직 등록된 팀이 없습니다.</p>
      )}
    </div>
  );
}
