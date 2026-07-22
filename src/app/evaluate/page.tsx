import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { itemsForEvaluatee } from "@/lib/template-items";
import { compositeScore, buildPerformanceComparison } from "@/lib/performance-report";

const evalStatusLabel: Record<string, string> = {
  PENDING: "대기",
  IN_PROGRESS: "작성중",
  SUBMITTED: "제출완료",
};

export default async function EvaluateDashboard() {
  const session = await auth();
  const evaluations = await prisma.evaluation.findMany({
    where: { evaluatorId: session!.user.id },
    include: {
      cycle: { include: { template: { include: { items: true } } } },
      evaluatee: true,
      scores: true,
    },
    orderBy: { createdAt: "desc" },
  });

  function resultSummary(e: (typeof evaluations)[number]): string | null {
    if (e.status !== "SUBMITTED") return null;

    const items = itemsForEvaluatee(
      e.cycle.template.items,
      e.evaluatee,
      e.cycle.template.kind
    );
    const scoreByItem = new Map(e.scores.map((s) => [s.templateItemId, s]));

    if (e.cycle.template.kind === "PERFORMANCE") {
      const rows = buildPerformanceComparison(items, scoreByItem);
      const composite = compositeScore(rows, "manager");
      return composite != null ? `종합점수 ${composite}` : null;
    }

    const scoreItems = items.filter((i) => i.type === "SCORE");
    const points = scoreItems
      .map((i) => scoreByItem.get(i.id)?.score)
      .filter((v): v is number => v != null);
    if (points.length === 0) return null;
    const avg = points.reduce((a, b) => a + b, 0) / points.length;
    return `평균 ${Math.round(avg * 10) / 10}점`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">내 평가 목록</h1>
        <p className="mt-1 text-slate-600">배정된 평가를 작성하고 제출하세요.</p>
      </div>
      <div className="flex flex-col gap-3">
        {evaluations.length === 0 && (
          <p className="text-slate-500">배정된 평가가 없습니다.</p>
        )}
        {evaluations.map((e) => {
          const summary = resultSummary(e);
          return (
            <Link
              key={e.id}
              href={`/evaluate/${e.id}`}
              className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{e.evaluatee.name}</p>
                  <p className="text-sm text-slate-500">{e.cycle.name}</p>
                </div>
                <div className="flex flex-col items-end gap-1 text-sm text-slate-500">
                  <span>
                    {evalStatusLabel[e.status]}
                    {summary ? ` · ${summary}` : ""}
                  </span>
                  <span>자기평가 {evalStatusLabel[e.selfStatus]}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
