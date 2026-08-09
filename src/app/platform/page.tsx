import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getVisibleHomeBlocks, type Position } from "@/lib/permissions";
import {
  computeAgeDistribution,
  computeTenureDistribution,
  computeMonthlyHiresTerminations,
  computeJobFamilySummary,
  isActive,
  ageInYears,
  tenureInYears,
  regularOrExceptionTeamWhere,
} from "@/lib/hr-analytics";
import { BarChart } from "@/components/bar-chart";
import { TrendChart } from "@/components/trend-chart";

export const dynamic = "force-dynamic";

function fmtPct(v: number | null) {
  return v === null ? "데이터 없음" : `${v.toFixed(1)}%`;
}

export default async function PlatformHomePage() {
  const session = await auth();
  const role = session!.user.role;

  const [allTeams, dbUser, allUsers] = await Promise.all([
    prisma.team.findMany({ select: { id: true } }),
    prisma.user.findUnique({ where: { id: session!.user.id }, select: { position: true } }),
    prisma.user.findMany({
      where: regularOrExceptionTeamWhere(),
      select: {
        id: true,
        teamId: true,
        birthDate: true,
        hireDate: true,
        terminationDate: true,
        jobFamily: true,
      },
    }),
  ]);

  const position = (dbUser?.position ?? "STAFF") as Position;
  const visibleBlocks = await getVisibleHomeBlocks(role, position);

  const showTeamSummary = visibleBlocks.has("TEAM_SUMMARY");
  const showOverallSummary = visibleBlocks.has("OVERALL_SUMMARY");
  const showQuickLinks = visibleBlocks.has("QUICK_LINKS");
  const showSideColumn = showOverallSummary || showQuickLinks;

  const activeUsers = allUsers.filter((u) => isActive(u));

  const CANONICAL_JOB_FAMILIES = ["영업직", "사무직", "생산직", "연구직"];
  const WORKPLACE_LABEL: Record<string, string> = {
    영업직: "지점",
    사무직: "본사",
    생산직: "공장",
    연구직: "연구소",
  };
  const jobFamilyRows = computeJobFamilySummary(allUsers)
    .filter((r) => CANONICAL_JOB_FAMILIES.includes(r.name))
    .map((r) => ({ ...r, name: WORKPLACE_LABEL[r.name] ?? r.name }));
  const totalRecentHires = allUsers.filter(
    (u) => u.hireDate && u.hireDate >= new Date(new Date().setFullYear(new Date().getFullYear() - 1))
  ).length;
  const totalRecentTerminations = allUsers.filter(
    (u) =>
      u.terminationDate &&
      u.terminationDate >= new Date(new Date().setFullYear(new Date().getFullYear() - 1))
  ).length;

  const ageDist = computeAgeDistribution(activeUsers);
  const tenureDist = computeTenureDistribution(activeUsers);
  const monthlyTrend = computeMonthlyHiresTerminations(allUsers, 12);

  const withAge = activeUsers.filter((u) => u.birthDate);
  const avgAge =
    withAge.length > 0
      ? withAge.reduce((s, u) => s + ageInYears(u.birthDate!), 0) / withAge.length
      : null;
  const withTenure = activeUsers.filter((u) => u.hireDate);
  const avgTenure =
    withTenure.length > 0
      ? withTenure.reduce((s, u) => s + tenureInYears(u.hireDate!), 0) / withTenure.length
      : null;
  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-slate-500">안녕하세요,</p>
        <h1 className="text-2xl font-semibold">{session?.user.name}님</h1>
      </div>

      <div
        className={`grid grid-cols-1 gap-6 ${
          showTeamSummary && showSideColumn ? "lg:grid-cols-[1fr_280px]" : ""
        }`}
      >
        {showTeamSummary && (
          <div className="flex flex-col gap-6">
            <section className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                지금 관심이 필요한 것 <span className="font-normal text-amber-600">· 근무지 기준 · 예외만 표시</span>
              </p>
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
                개발 중
              </span>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-lg font-medium">
                  근무지별 종합 <span className="text-sm font-normal text-slate-400">· 정규직 기준</span>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">근무지</th>
                      <th className="px-4 py-3 font-medium">인원</th>
                      <th className="px-4 py-3 font-medium">팀당 인원</th>
                      <th className="px-4 py-3 font-medium">평균 근속</th>
                      <th className="px-4 py-3 font-medium">55세 이상</th>
                      <th className="px-4 py-3 font-medium">최근 1년 입사</th>
                      <th className="px-4 py-3 font-medium">최근 1년 퇴사</th>
                      <th className="px-4 py-3 font-medium">퇴사율</th>
                      <th className="px-4 py-3 font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobFamilyRows.map((r) => (
                      <tr key={r.name} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 font-medium">{r.name}</td>
                        <td className="px-4 py-3">{r.headcount}명</td>
                        <td className="px-4 py-3 text-slate-500">
                          {r.avgTeamSize === null ? "데이터 없음" : `${r.avgTeamSize.toFixed(1)}명`}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {r.avgTenureYears === null
                            ? "데이터 없음"
                            : `${r.avgTenureYears.toFixed(1)}년`}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{fmtPct(r.pct55)}</td>
                        <td className="px-4 py-3 text-slate-500">{r.recentHires}명</td>
                        <td className="px-4 py-3 text-slate-500">{r.recentTerminations}명</td>
                        <td className="px-4 py-3 text-slate-500">{fmtPct(r.turnoverRate)}</td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    ))}
                    {jobFamilyRows.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={9}>
                          아직 등록된 직원이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-lg border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-medium">연령 · 근속 구성</h2>
                <p className="mb-4 text-sm text-slate-500">
                  재직 {activeUsers.length}명
                  {ageDist.missing > 0 && ` · 생년월일 미입력 ${ageDist.missing}명 제외`}
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center justify-center rounded border border-slate-100 p-4">
                    <BarChart title="연령" bars={ageDist.buckets} showPercent color="#3b82f6" />
                  </div>
                  <div className="flex items-center justify-center rounded border border-slate-100 p-4">
                    <BarChart title="근속" bars={tenureDist.buckets} showPercent color="#1f9a44" />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-medium">최근 12개월 입퇴사 현황</h2>
                <p className="mb-4 text-sm text-slate-500">
                  {monthlyTrend[0]?.label} ~ {monthlyTrend[monthlyTrend.length - 1]?.label}
                </p>
                <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xl font-semibold text-brand-green-dark">
                      {totalRecentHires}명
                    </p>
                    <p className="text-xs text-slate-500">입사</p>
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-amber-600">
                      {totalRecentTerminations}명
                    </p>
                    <p className="text-xs text-slate-500">퇴사</p>
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-slate-700">
                      {totalRecentHires - totalRecentTerminations >= 0 ? "+" : ""}
                      {totalRecentHires - totalRecentTerminations}명
                    </p>
                    <p className="text-xs text-slate-500">순증감</p>
                  </div>
                </div>
                <TrendChart points={monthlyTrend} />
              </section>
            </div>
          </div>
        )}

        {showSideColumn && (
          <section className="flex flex-col gap-4">
            {showOverallSummary && (
              <>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 text-sm font-medium text-slate-700">
                    전체 요약 <span className="font-normal text-slate-400">· 정규직 기준</span>
                  </h3>
                  <dl className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">평균 연령</dt>
                      <dd className="font-semibold">
                        {avgAge === null ? "데이터 없음" : `${avgAge.toFixed(1)}세`}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">평균 근속</dt>
                      <dd className="font-semibold">
                        {avgTenure === null ? "데이터 없음" : `${avgTenure.toFixed(1)}년`}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">팀</dt>
                      <dd className="font-semibold">{allTeams.length}개</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 text-sm font-medium text-slate-700">오늘 처리할 일</h3>
                  <p className="text-sm text-slate-500">
                    데이터 없음 — 업무 관리 기능이 준비되면 표시됩니다.
                  </p>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
