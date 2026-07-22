import Link from "next/link";
import { prisma } from "@/lib/prisma";

const statusLabel: Record<string, string> = {
  DRAFT: "준비중",
  OPEN: "진행중",
  CLOSED: "종료",
};

const kindLabel: Record<string, string> = {
  COMPETENCY: "역량평가",
  PERFORMANCE: "성과평가",
};

export default async function AdminDashboard() {
  const cycles = await prisma.evaluationCycle.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      template: true,
      evaluations: { select: { status: true, selfStatus: true } },
    },
  });

  const totalAssignments = cycles.reduce((sum, c) => sum + c.evaluations.length, 0);
  const totalSelfSubmitted = cycles.reduce(
    (sum, c) => sum + c.evaluations.filter((e) => e.selfStatus === "SUBMITTED").length,
    0
  );
  const totalManagerSubmitted = cycles.reduce(
    (sum, c) => sum + c.evaluations.filter((e) => e.status === "SUBMITTED").length,
    0
  );
  const openCycles = cycles.filter((c) => c.status === "OPEN").length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">대시보드</h1>
        <p className="mt-2 text-slate-600">전체 평가 진행현황을 한눈에 확인합니다.</p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">진행중인 사이클</p>
          <p className="text-2xl font-semibold">{openCycles}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">전체 배정 건수</p>
          <p className="text-2xl font-semibold">{totalAssignments}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">자기평가 제출</p>
          <p className="text-2xl font-semibold">
            {totalSelfSubmitted}/{totalAssignments}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">팀장평가 제출</p>
          <p className="text-2xl font-semibold">
            {totalManagerSubmitted}/{totalAssignments}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-medium">사이클별 진행현황</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">사이클</th>
              <th className="px-4 py-3 font-medium">유형</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">배정</th>
              <th className="px-4 py-3 font-medium">자기평가 제출</th>
              <th className="px-4 py-3 font-medium">팀장평가 제출</th>
              <th className="px-4 py-3 font-medium">결과공개</th>
            </tr>
          </thead>
          <tbody>
            {cycles.map((c) => {
              const total = c.evaluations.length;
              const selfDone = c.evaluations.filter(
                (e) => e.selfStatus === "SUBMITTED"
              ).length;
              const managerDone = c.evaluations.filter(
                (e) => e.status === "SUBMITTED"
              ).length;
              return (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/cycles/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    <p className="text-xs text-slate-400">{c.template.title}</p>
                  </td>
                  <td className="px-4 py-3">{kindLabel[c.template.kind]}</td>
                  <td className="px-4 py-3">{statusLabel[c.status]}</td>
                  <td className="px-4 py-3">{total}</td>
                  <td className="px-4 py-3">
                    {selfDone}/{total}
                  </td>
                  <td className="px-4 py-3">
                    {managerDone}/{total}
                  </td>
                  <td className="px-4 py-3">
                    {c.resultsReleased ? "공개됨" : "비공개"}
                  </td>
                </tr>
              );
            })}
            {cycles.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                  아직 사이클이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
