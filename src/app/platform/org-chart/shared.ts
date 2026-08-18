import { isBranchTeam } from "@/lib/hr-analytics";

export type Exec = {
  id: string;
  name: string;
  jobGrade: string | null;
  hasPhoto: boolean;
  birthDate?: Date | null;
  hireDate?: Date | null;
};
export type CeoExec = Exec;
export type TeamLite = {
  id: string;
  name: string;
  leaderId: string | null;
  leaderName: string | null;
  leaderHasPhoto: boolean;
  memberCount: number;
};
export type DivisionNode = { name: string; leader?: Exec; teams: TeamLite[] };
export type UnitNode = {
  name: string;
  leader?: Exec;
  divisions: DivisionNode[];
  directTeams: TeamLite[];
};

export type CompositionPart = { count: number; label: string };

export function splitTeams(teamList: { name: string }[]) {
  let teamCount = 0;
  let branchCount = 0;
  for (const t of teamList) {
    if (isBranchTeam(t.name)) branchCount++;
    else teamCount++;
  }
  return { teamCount, branchCount };
}

export function buildComposition({
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

export function unitHeadcount(unit: UnitNode) {
  return (
    unit.directTeams.reduce((s, t) => s + t.memberCount, 0) +
    unit.divisions.reduce((s, d) => s + d.teams.reduce((s2, t) => s2 + t.memberCount, 0), 0)
  );
}

export function divisionHeadcount(division: DivisionNode) {
  return division.teams.reduce((s, t) => s + t.memberCount, 0);
}

export function unitComposition(unit: UnitNode): CompositionPart[] {
  const allTeams = [...unit.directTeams, ...unit.divisions.flatMap((d) => d.teams)];
  const { teamCount, branchCount } = splitTeams(allTeams);
  return buildComposition({ divisionCount: unit.divisions.length, teamCount, branchCount });
}

export function divisionComposition(division: DivisionNode): CompositionPart[] {
  const { teamCount, branchCount } = splitTeams(division.teams);
  return buildComposition({ teamCount, branchCount });
}

export function compositionText(parts: CompositionPart[]) {
  return parts.map((p) => `${p.count}${p.label}`).join(" ");
}
