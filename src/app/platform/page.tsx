import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getVisibleHomeBlocks, type Position } from "@/lib/permissions";
import {
  computeAgeDistribution,
  computeTenureDistribution,
  computeMonthlyHiresTerminations,
  computeJobFamilySummary,
  computeAttentionAlerts,
  isActive,
  ageInYears,
  tenureInYears,
} from "@/lib/hr-analytics";
import { BarChart } from "@/components/bar-chart";
import { TrendChart } from "@/components/trend-chart";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "좋은 아침입니다";
  if (hour < 18) return "좋은 오후입니다";
  return "좋은 저녁입니다";
}

function fmtPct(v: number | null) {
  return v === null ? "데이터 없음" : `${v.toFixed(1)}%`;
}

function fmtCount(v: number | null) {
  return v === null ? "데이터 없음" : `${v.toFixed(1)}명`;
}

export default async function PlatformHomePage() {
  const session = await auth();
  const role = session!.user.role;

  const evalHref =
    role === "ADMIN" ? "/admin/evaluation" : role === "EVALUATOR" ? "/evaluate" : "/my-evaluations";

  const [allTeams, openCycles, totalAssignments, dbUser, allUsers] = await Promise.all([
    prisma.team.findMany({ select: { id: true } }),
    prisma.evaluationCycle.count({ where: { status: "OPEN" } }),
    prisma.evaluation.count(),
    prisma.user.findUnique({ where: { id: session!.user.id }, select: { position: true } }),
    prisma.user.findMany({
      where: { employmentType: "정규직" },
      select: {
        id: true,
        teamId: true,
        birthDate: true,
        hireDate: true,
        terminationDate: true,
        jobFamily: true,
        gender: true,
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
  const jobFamilyRows = computeJobFamilySummary(allUsers).filter((r) =>
    CANONICAL_JOB_FAMILIES.includes(r.name)
  );
  const alerts = computeAttentionAlerts(jobFamilyRows);
  const allPending =
    jobFamilyRows.length > 0 && jobFamilyRows.every((r) => r.remark === "판정 보류");

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
  const distinctJobFamilies = new Set(
    activeUsers.map((u) => u.jobFamily).filter((v): v is string => !!v)
  ).size;

  const maleCount = activeUsers.filter((u) => u.gender === "남").length;
  const femaleCount = activeUsers.filter((u) => u.gender === "여").length;
  const genderKnownTotal = maleCount + femaleCount;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-slate-500">{greeting()},</p>
        <h1 className="text-2xl font-semibold">{session?.user.name}님</h1>
      </div>

      <div
        className={`grid grid-cols-1 gap-6 ${
          showTeamSummary && showSideColumn ? "lg:grid-cols-[1fr_280px]" : ""
        }`}
      >
        {showTeamSummary && (
          <div className="flex flex-col gap-6">
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                지금 관심이 필요한 것 <span className="font-normal text-amber-600">· 직군 기준 · 예외만 표시</span>
              </p>
              {allPending ? (
                <p className="mt-2 text-sm text-amber-700">
                  데이터 없음 — 직군별 인원이 30명 미만이라 판정을 보류합니다.
                </p>
              ) : alerts.length === 0 ? (
                <p className="mt-2 text-sm text-amber-700">현재 특이사항이 없습니다.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {alerts.slice(0, 2).map((a, i) => (
                    <li key={i} className="text-sm text-amber-800">
                      <p className="font-medium">{a.title}</p>
                      <p className="text-amber-600">{a.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-lg font-medium">
                  직군별 종합 <span className="text-sm font-normal text-slate-400">· 정규직 기준</span>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">직군</th>
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
                      <tr
                        key={r.name}
                        className={`border-b border-slate-100 last:border-0 ${
                          r.remark.startsWith("주의") ? "bg-red-50" : ""
                        }`}
                      >
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
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              r.remark === "정상"
                                ? "bg-brand-green-light text-brand-green-dark"
                                : r.remark === "판정 보류"
                                  ? "bg-slate-100 text-slate-500"
                                  : "bg-red-50 text-red-600"
                            }`}
                          >
                            {r.remark}
                          </span>
                        </td>
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

            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-medium">연령 · 근속 구성</h2>
              <p className="mb-4 text-sm text-slate-500">
                재직 {activeUsers.length}명
                {ageDist.missing > 0 && ` · 생년월일 미입력 ${ageDist.missing}명 제외`}
              </p>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <BarChart title="연령" bars={ageDist.buckets} />
                <BarChart title="근속" bars={tenureDist.buckets} />
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-medium">입퇴사자 현황</h2>
              <p className="mb-4 text-sm text-slate-500">
                최근 1년 · {monthlyTrend[0]?.label} ~ {monthlyTrend[monthlyTrend.length - 1]?.label}
              </p>
              <div className="mb-6 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-semibold text-brand-green-dark">
                    {totalRecentHires}명
                  </p>
                  <p className="text-xs text-slate-500">입사</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-amber-600">
                    {totalRecentTerminations}명
                  </p>
                  <p className="text-xs text-slate-500">퇴사</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-slate-700">
                    {totalRecentHires - totalRecentTerminations >= 0 ? "+" : ""}
                    {totalRecentHires - totalRecentTerminations}명
                  </p>
                  <p className="text-xs text-slate-500">순증감</p>
                </div>
              </div>
              <TrendChart points={monthlyTrend} />
            </section>
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
                      <dt className="text-slate-500">재직 인원</dt>
                      <dd className="font-semibold">{activeUsers.length}명</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">직군</dt>
                      <dd className="font-semibold">
                        {distinctJobFamilies > 0 ? `${distinctJobFamilies}개` : "데이터 없음"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">평균 연령</dt>
                      <dd className="font-semibold">{fmtCount(avgAge)}</dd>
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
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">진행중인 평가 사이클</dt>
                      <dd className="font-semibold">{openCycles}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">전체 평가 배정 건수</dt>
                      <dd className="font-semibold">{totalAssignments}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 text-sm font-medium text-slate-700">남녀 성비 현황</h3>
                  {genderKnownTotal === 0 ? (
                    <p className="text-sm text-slate-500">데이터 없음</p>
                  ) : (
                    <>
                      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="bg-blue-500"
                          style={{ width: `${(maleCount / genderKnownTotal) * 100}%` }}
                        />
                        <div
                          className="bg-rose-400"
                          style={{ width: `${(femaleCount / genderKnownTotal) * 100}%` }}
                        />
                      </div>
                      <div className="mt-3 flex justify-between text-sm">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                          남 {maleCount}명 (
                          {Math.round((maleCount / genderKnownTotal) * 100)}%)
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
                          여 {femaleCount}명 (
                          {Math.round((femaleCount / genderKnownTotal) * 100)}%)
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 text-sm font-medium text-slate-700">오늘 처리할 일</h3>
                  <p className="text-sm text-slate-500">
                    데이터 없음 — 업무 관리 기능이 준비되면 표시됩니다.
                  </p>
                </div>
              </>
            )}

            {showQuickLinks && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-medium text-slate-700">바로가기</h3>
                <div className="flex flex-col gap-2 text-sm">
                  <Link
                    href="/platform/employees"
                    className="rounded border border-slate-300 px-3 py-1.5 text-center hover:bg-slate-100"
                  >
                    직원정보 조회
                  </Link>
                  <Link
                    href={evalHref}
                    className="rounded border border-slate-300 px-3 py-1.5 text-center hover:bg-slate-100"
                  >
                    평가
                  </Link>
                  {role === "ADMIN" && (
                    <Link
                      href="/admin/users"
                      className="rounded border border-slate-300 px-3 py-1.5 text-center hover:bg-slate-100"
                    >
                      사용자 관리
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
