import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "좋은 아침입니다";
  if (hour < 18) return "좋은 오후입니다";
  return "좋은 저녁입니다";
}

export default async function PlatformHomePage() {
  const session = await auth();

  const [employeeCount, teamCount, openCycles, totalAssignments] = await Promise.all([
    prisma.user.count(),
    prisma.team.count(),
    prisma.evaluationCycle.count({ where: { status: "OPEN" } }),
    prisma.evaluation.count(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-slate-500">{greeting()},</p>
        <h1 className="text-2xl font-semibold">{session?.user.name}님</h1>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Link
          href="/admin/employees"
          className="rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-green"
        >
          <p className="text-xs text-slate-500">전체 직원</p>
          <p className="text-2xl font-semibold">{employeeCount}</p>
        </Link>
        <Link
          href="/admin/teams"
          className="rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-green"
        >
          <p className="text-xs text-slate-500">팀 수</p>
          <p className="text-2xl font-semibold">{teamCount}</p>
        </Link>
        <Link
          href="/admin/evaluation"
          className="rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-green"
        >
          <p className="text-xs text-slate-500">진행중인 평가 사이클</p>
          <p className="text-2xl font-semibold">{openCycles}</p>
        </Link>
        <Link
          href="/admin/evaluation"
          className="rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-green"
        >
          <p className="text-xs text-slate-500">전체 평가 배정 건수</p>
          <p className="text-2xl font-semibold">{totalAssignments}</p>
        </Link>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">바로가기</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/admin/employees"
            className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
          >
            직원정보 조회
          </Link>
          <Link
            href="/admin/evaluation"
            className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
          >
            평가 현황
          </Link>
          <Link
            href="/admin/users"
            className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
          >
            사용자 관리
          </Link>
        </div>
      </section>
    </div>
  );
}
