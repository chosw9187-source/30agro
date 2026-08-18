import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { findDuplicateTasks } from "@/lib/job-analysis-stats";
import { ImportPanel } from "./import-panel";

export const dynamic = "force-dynamic";

export default async function JobAnalysisPage() {
  if (!(await checkModuleAccess("JOB_ANALYSIS"))) {
    return <NoModuleAccess title="직무분석" />;
  }

  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";

  const [teams, tasks] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { jobTasks: true, members: true } },
      },
    }),
    prisma.jobTask.findMany({
      select: { name: true, team: { select: { name: true } } },
    }),
  ]);

  const duplicates = findDuplicateTasks(
    tasks.map((t) => ({ name: t.name, teamName: t.team.name }))
  );
  const totalTasks = tasks.length;
  const teamsWithTasks = teams.filter((t) => t._count.jobTasks > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">직무분석</h1>
        <p className="mt-1 text-slate-600">
          직무기술서의 담당업무를 <strong>단위업무 단위로 쪼개서</strong> 관리합니다.
          여기 쌓인 단위업무가 이후 업무량(FTE) 산정·직무평가·역량모델의 기준
          데이터가 됩니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="단위업무 총계" value={`${totalTasks}건`} />
        <SummaryCard label="분석 완료 팀" value={`${teamsWithTasks} / ${teams.length}팀`} />
        <SummaryCard
          label="팀 간 중복 업무"
          value={`${duplicates.length}건`}
          tone={duplicates.length > 0 ? "warn" : "normal"}
        />
      </div>

      {isAdmin && <ImportPanel teams={teams.map((t) => ({ id: t.id, name: t.name }))} />}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">팀별 단위업무</h2>
        {teams.map((t) => (
          <Link
            key={t.id}
            href={`/platform/job-analysis/${t.id}`}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-green"
          >
            <div>
              <p className="font-medium">{t.name}</p>
              <p className="text-sm text-slate-500">구성원 {t._count.members}명</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                t._count.jobTasks > 0
                  ? "bg-brand-green-light text-brand-green-dark"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {t._count.jobTasks > 0 ? `단위업무 ${t._count.jobTasks}건` : "미분석"}
            </span>
          </Link>
        ))}
        {teams.length === 0 && <p className="text-slate-500">아직 등록된 팀이 없습니다.</p>}
      </section>

      {duplicates.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">팀 간 중복 업무</h2>
          <p className="text-sm text-slate-600">
            같은 이름의 단위업무가 둘 이상의 팀에 등록된 건입니다. 중복 자체가
            문제라는 뜻은 아니고, <strong>어느 팀 소관이 맞는지 검토할 목록</strong>입니다.
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">단위업무</th>
                  <th className="px-4 py-2 font-medium">등록된 팀</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((d) => (
                  <tr key={d.name} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium">{d.name}</td>
                    <td className="px-4 py-2 text-slate-600">{d.teamNames.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "warn";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${
          tone === "warn" ? "text-amber-600" : "text-slate-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
