import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { TeamFilterSelect } from "./team-filter-select";
import { getVisibleHomeBlocks, type Position } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "좋은 아침입니다";
  if (hour < 18) return "좋은 오후입니다";
  return "좋은 저녁입니다";
}

export default async function PlatformHomePage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string }>;
}) {
  const session = await auth();
  const role = session!.user.role;

  const evalHref =
    role === "ADMIN" ? "/admin/evaluation" : role === "EVALUATOR" ? "/evaluate" : "/my-evaluations";

  const params = await searchParams;
  const selectedTeamId = params.teamId ?? "";

  const [employeeCount, allTeams, openCycles, totalAssignments, dbUser] = await Promise.all([
    prisma.user.count(),
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: { leader: true, _count: { select: { members: true } } },
    }),
    prisma.evaluationCycle.count({ where: { status: "OPEN" } }),
    prisma.evaluation.count(),
    prisma.user.findUnique({ where: { id: session!.user.id }, select: { position: true } }),
  ]);

  const position = (dbUser?.position ?? "STAFF") as Position;
  const visibleBlocks = await getVisibleHomeBlocks(role, position);

  const teams = selectedTeamId
    ? allTeams.filter((t) => t.id === selectedTeamId)
    : allTeams;

  const showTeamSummary = visibleBlocks.has("TEAM_SUMMARY");
  const showOverallSummary = visibleBlocks.has("OVERALL_SUMMARY");
  const showQuickLinks = visibleBlocks.has("QUICK_LINKS");
  const showSideColumn = showOverallSummary || showQuickLinks;

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
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-medium">팀별 종합</h2>
            <p className="text-sm text-slate-500">
              행 = 팀. 근속·연령·입퇴사 등 항목은 관련 정보가 등록되면 추후
              업데이트됩니다.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-slate-500">팀</span>
              <TeamFilterSelect
                teams={allTeams.map((t) => ({ id: t.id, name: t.name }))}
                selected={selectedTeamId}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">팀</th>
                  <th className="px-4 py-3 font-medium">인원</th>
                  <th className="px-4 py-3 font-medium">팀장</th>
                  <th className="px-4 py-3 font-medium">평균 근속</th>
                  <th className="px-4 py-3 font-medium">55세 이상</th>
                  <th className="px-4 py-3 font-medium">최근 1년 입사</th>
                  <th className="px-4 py-3 font-medium">최근 1년 퇴사</th>
                  <th className="px-4 py-3 font-medium">퇴사율</th>
                  <th className="px-4 py-3 font-medium">비고</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium">{t.name}</td>
                    <td className="px-4 py-3">{t._count.members}명</td>
                    <td className="px-4 py-3">{t.leader?.name ?? "미지정"}</td>
                    <td className="px-4 py-3 text-slate-400">-</td>
                    <td className="px-4 py-3 text-slate-400">-</td>
                    <td className="px-4 py-3 text-slate-400">-</td>
                    <td className="px-4 py-3 text-slate-400">-</td>
                    <td className="px-4 py-3 text-slate-400">-</td>
                    <td className="px-4 py-3 text-slate-400">-</td>
                  </tr>
                ))}
                {teams.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={9}>
                      아직 등록된 팀이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {showSideColumn && (
        <section className="flex flex-col gap-4">
          {showOverallSummary && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-700">전체 요약</h3>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">재직 인원</dt>
                <dd className="font-semibold">{employeeCount}명</dd>
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
