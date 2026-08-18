import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { addJobTask, deleteAllJobTasksForTeam } from "../actions";
import { TaskTable } from "./task-table";

export const dynamic = "force-dynamic";

export default async function JobAnalysisTeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  if (!(await checkModuleAccess("JOB_ANALYSIS"))) {
    return <NoModuleAccess title="직무분석" />;
  }

  const { teamId } = await params;
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      jobDescription: { select: { purpose: true } },
      jobTasks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          category: true,
          name: true,
          detail: true,
          requiredGrade: true,
          outputs: true,
          relatedDept: true,
          legalBasis: true,
          frequency: true,
          source: true,
        },
      },
    },
  });
  if (!team) notFound();

  async function addTask(formData: FormData) {
    "use server";
    await addJobTask(teamId, formData);
  }

  async function clearTasks() {
    "use server";
    await deleteAllJobTasksForTeam(teamId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/platform/job-analysis" className="text-sm text-slate-500 hover:underline">
          ← 직무분석
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{team.name}</h1>
        {team.jobDescription?.purpose && (
          <p className="mt-2 whitespace-pre-wrap rounded border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {team.jobDescription.purpose}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">단위업무 {team.jobTasks.length}건</h2>
          {isAdmin && team.jobTasks.length > 0 && (
            <form action={clearTasks}>
              <button
                type="submit"
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-red-400 hover:text-red-600"
              >
                전체 삭제
              </button>
            </form>
          )}
        </div>

        <TaskTable tasks={team.jobTasks} editable={isAdmin} />

        {isAdmin && (
          <form action={addTask} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500">책임·역할</span>
              <input
                name="category"
                className="w-40 rounded border border-slate-300 px-2 py-1"
                placeholder="선택"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500">단위업무명</span>
              <input
                name="name"
                required
                className="w-64 rounded border border-slate-300 px-2 py-1"
                placeholder="예: 채용계획 수립"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-brand-green px-4 py-1.5 text-sm text-white hover:bg-brand-green-dark"
            >
              추가
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
