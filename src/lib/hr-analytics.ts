export type AnalyticsUser = {
  id: string;
  teamId: string | null;
  birthDate: Date | null;
  hireDate: Date | null;
  terminationDate: Date | null;
  jobFamily: string | null;
};

const UNCLASSIFIED = "미분류";
const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

export function isActive(u: Pick<AnalyticsUser, "terminationDate">, at = new Date()) {
  return !u.terminationDate || u.terminationDate > at;
}

/**
 * Prisma `where` fragment matching `isActive` — wrap in an `AND` array
 * alongside other filters rather than spreading directly, since this
 * returns a top-level `OR` key that would silently clobber another
 * filter's own `OR` key if both were spread into the same object.
 */
export function activePrismaWhere(at = new Date()) {
  return { OR: [{ terminationDate: null }, { terminationDate: { gt: at } }] };
}

/** Teams named "OO지점" are branches/sites, led by a 지점장 rather than a 팀장. */
export function isBranchTeam(teamName: string) {
  return teamName.trim().endsWith("지점");
}

export function ageInYears(birthDate: Date, at = new Date()) {
  let age = at.getFullYear() - birthDate.getFullYear();
  const m = at.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birthDate.getDate())) age--;
  return age;
}

export function tenureInYears(hireDate: Date, at = new Date()) {
  return (at.getTime() - hireDate.getTime()) / MS_PER_YEAR;
}

const AGE_BUCKETS = [
  { label: "20대", test: (a: number) => a < 30 },
  { label: "30대", test: (a: number) => a >= 30 && a < 40 },
  { label: "40대", test: (a: number) => a >= 40 && a < 50 },
  { label: "50대", test: (a: number) => a >= 50 && a < 60 },
  { label: "60대+", test: (a: number) => a >= 60 },
];

const TENURE_BUCKETS = [
  { label: "~3년", test: (t: number) => t < 3 },
  { label: "3~5년", test: (t: number) => t >= 3 && t < 6 },
  { label: "6~10년", test: (t: number) => t >= 6 && t < 11 },
  { label: "11~20년", test: (t: number) => t >= 11 && t < 21 },
  { label: "21년+", test: (t: number) => t >= 21 },
];

export function computeAgeDistribution(users: AnalyticsUser[], at = new Date()) {
  const withAge = users.filter((u) => u.birthDate);
  const buckets = AGE_BUCKETS.map((b) => ({
    label: b.label,
    count: withAge.filter((u) => b.test(ageInYears(u.birthDate!, at))).length,
  }));
  return { buckets, missing: users.length - withAge.length, total: users.length };
}

export function computeTenureDistribution(users: AnalyticsUser[], at = new Date()) {
  const withTenure = users.filter((u) => u.hireDate);
  const buckets = TENURE_BUCKETS.map((b) => ({
    label: b.label,
    count: withTenure.filter((u) => b.test(tenureInYears(u.hireDate!, at))).length,
  }));
  return { buckets, missing: users.length - withTenure.length, total: users.length };
}

export function computeMonthlyHiresTerminations(
  users: AnalyticsUser[],
  months = 12,
  at = new Date()
) {
  const points: { label: string; hires: number; terminations: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(at.getFullYear(), at.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const label = `${String(y).slice(2)}-${String(m + 1).padStart(2, "0")}`;
    const hires = users.filter(
      (u) => u.hireDate && u.hireDate.getFullYear() === y && u.hireDate.getMonth() === m
    ).length;
    const terminations = users.filter(
      (u) =>
        u.terminationDate &&
        u.terminationDate.getFullYear() === y &&
        u.terminationDate.getMonth() === m
    ).length;
    points.push({ label, hires, terminations });
  }
  return points;
}

export type JobFamilyRow = {
  name: string;
  headcount: number;
  teamCount: number;
  avgTeamSize: number | null;
  avgTenureYears: number | null;
  pct55: number | null;
  recentHires: number;
  recentTerminations: number;
  turnoverRate: number | null;
  flags: string[];
  remark: string;
};

export function computeJobFamilySummary(
  users: AnalyticsUser[],
  at = new Date()
): JobFamilyRow[] {
  const groups = new Map<string, AnalyticsUser[]>();
  for (const u of users) {
    const key = u.jobFamily || UNCLASSIFIED;
    const arr = groups.get(key) ?? [];
    arr.push(u);
    groups.set(key, arr);
  }

  const oneYearAgo = new Date(at);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const rows: JobFamilyRow[] = [];
  for (const [name, allMembers] of groups.entries()) {
    const members = allMembers.filter((m) => isActive(m, at));
    const headcount = members.length;
    const teamCount = new Set(members.map((m) => m.teamId).filter(Boolean)).size;
    const avgTeamSize = teamCount > 0 ? headcount / teamCount : null;

    const withTenure = members.filter((m) => m.hireDate);
    const avgTenureYears =
      withTenure.length > 0
        ? withTenure.reduce((s, m) => s + tenureInYears(m.hireDate!, at), 0) / withTenure.length
        : null;

    const withAge = members.filter((m) => m.birthDate);
    const pct55 =
      withAge.length > 0
        ? (withAge.filter((m) => ageInYears(m.birthDate!, at) >= 55).length / withAge.length) * 100
        : null;

    const recentHires = allMembers.filter((m) => m.hireDate && m.hireDate >= oneYearAgo).length;
    const recentTerminations = allMembers.filter(
      (m) => m.terminationDate && m.terminationDate >= oneYearAgo
    ).length;
    const turnoverRate = headcount > 0 ? (recentTerminations / headcount) * 100 : null;

    const flags: string[] = [];
    let remark: string;
    if (headcount < 30) {
      remark = "판정 보류";
    } else {
      if (avgTeamSize !== null && (avgTeamSize < 4 || avgTeamSize > 12)) {
        flags.push("팀당 인원 이상");
      }
      if (pct55 !== null && pct55 > 20) {
        flags.push("55세 이상 초과");
      }
      if (turnoverRate !== null && turnoverRate > 20) {
        flags.push("퇴사율 초과");
      }
      remark = flags.length === 0 ? "정상" : `주의 ${flags.length}건`;
    }

    rows.push({
      name,
      headcount,
      teamCount,
      avgTeamSize,
      avgTenureYears,
      pct55,
      recentHires,
      recentTerminations,
      turnoverRate,
      flags,
      remark,
    });
  }

  return rows.sort((a, b) => b.headcount - a.headcount);
}

export type AttentionAlert = { title: string; detail: string };

export function computeAttentionAlerts(rows: JobFamilyRow[]): AttentionAlert[] {
  const alerts: AttentionAlert[] = [];
  for (const row of rows) {
    if (row.remark === "판정 보류" || row.remark === "정상") continue;
    if (row.pct55 !== null && row.pct55 > 20) {
      alerts.push({
        title: `${row.name}은(는) ${row.headcount}명인데 55세 이상이 ${row.pct55.toFixed(1)}%입니다.`,
        detail: "20%를 넘으면 다섯에 하나가 5년 안에 정년(만 60세)에 이릅니다 — 승계 준비가 필요합니다.",
      });
    }
    if (row.turnoverRate !== null && row.turnoverRate > 20) {
      alerts.push({
        title: `${row.name}의 최근 1년 퇴사율이 ${row.turnoverRate.toFixed(1)}%입니다.`,
        detail: "20%를 넘는 퇴사율은 조직 안정성에 위험 신호일 수 있습니다.",
      });
    }
    if (row.avgTeamSize !== null && (row.avgTeamSize < 4 || row.avgTeamSize > 12)) {
      alerts.push({
        title: `${row.name}의 팀당 평균 인원이 ${row.avgTeamSize.toFixed(1)}명입니다.`,
        detail: "적정 범위(4~12명)를 벗어나 조직 재설계가 필요할 수 있습니다.",
      });
    }
  }
  return alerts;
}
