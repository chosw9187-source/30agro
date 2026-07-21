import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { saveSelfAssessment, submitSelfAssessment } from "../actions";
import { CommentThread } from "@/components/comment-thread";
import { ScaleLegend } from "@/components/scale-legend";
import { RadarChart } from "@/components/radar-chart";
import { GradeField } from "@/components/grade-field";
import { buildComparison } from "@/lib/evaluation-report";
import { buildPerformanceComparison, compositeScore } from "@/lib/performance-report";
import { itemsForTeam } from "@/lib/template-items";

const evalStatusLabel: Record<string, string> = {
  PENDING: "대기",
  IN_PROGRESS: "작성중",
  SUBMITTED: "제출완료",
};

export default async function MyEvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      evaluator: true,
      evaluatee: true,
      cycle: {
        include: {
          template: { include: { items: { orderBy: { order: "asc" } } } },
        },
      },
      scores: true,
    },
  });

  if (!evaluation || evaluation.evaluateeId !== session!.user.id) {
    notFound();
  }

  const scoreByItem = new Map(evaluation.scores.map((s) => [s.templateItemId, s]));
  const items = itemsForTeam(evaluation.cycle.template.items, evaluation.evaluatee.teamId);

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.category || "미분류";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const selfEditable =
    evaluation.selfStatus !== "SUBMITTED" && evaluation.cycle.status === "OPEN";
  const showReport =
    evaluation.cycle.resultsReleased && evaluation.status === "SUBMITTED";
  const isPerformance = evaluation.cycle.template.kind === "PERFORMANCE";

  const comparison =
    showReport && !isPerformance ? buildComparison(items, scoreByItem) : [];
  const scoreComparison = comparison.filter((c) => c.type === "SCORE");
  const strengths = scoreComparison.filter((c) => c.classification === "강점");
  const weaknesses = scoreComparison.filter((c) => c.classification === "약점");

  const perfComparison =
    showReport && isPerformance ? buildPerformanceComparison(items, scoreByItem) : [];
  const selfComposite = compositeScore(perfComparison, "self");
  const managerComposite = compositeScore(perfComparison, "manager");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{evaluation.cycle.name}</h1>
        <p className="mt-1 text-slate-600">
          평가자: {evaluation.evaluator.name} · 자기평가{" "}
          {evalStatusLabel[evaluation.selfStatus]}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">자기평가</h2>

        {selfEditable && !isPerformance && <ScaleLegend />}
        {!selfEditable && evaluation.selfStatus !== "SUBMITTED" && (
          <p className="mb-4 rounded bg-amber-50 p-3 text-sm text-amber-700">
            사이클이 진행중 상태가 아니어서 자기평가를 작성할 수 없습니다.
          </p>
        )}

        <form className="mt-4 flex flex-col gap-8">
          {[...groups.entries()].map(([category, categoryItems]) => (
            <div key={category} className="flex flex-col gap-6">
              <h3 className="text-sm font-semibold text-slate-500">{category}</h3>
              {categoryItems.map((item) => {
                const existing = scoreByItem.get(item.id);
                return (
                  <div key={item.id} className="flex flex-col gap-2">
                    <label className="font-medium">{item.label}</label>
                    {item.description && (
                      <p className="text-sm text-slate-500">{item.description}</p>
                    )}
                    {item.type === "SCORE" ? (
                      <input
                        type="number"
                        name={`score-${item.id}`}
                        min={1}
                        max={item.maxScore}
                        defaultValue={existing?.selfScore ?? undefined}
                        disabled={!selfEditable}
                        className="w-32 rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                      />
                    ) : item.type === "GRADE" ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                          <span>현수준: {item.currentLevel || "-"}</span>
                          <span>목표치: {item.targetLevel || "-"}</span>
                          <span>가중치: {item.weight ?? 0}</span>
                        </div>
                        <GradeField
                          name={`grade-${item.id}`}
                          criteria={item.gradeCriteria}
                          defaultValue={existing?.selfGrade}
                          disabled={!selfEditable}
                        />
                      </div>
                    ) : (
                      <textarea
                        name={`text-${item.id}`}
                        rows={3}
                        defaultValue={existing?.selfComment ?? ""}
                        disabled={!selfEditable}
                        className="rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {selfEditable && (
            <div className="flex gap-3 border-t border-slate-200 pt-6">
              <button
                type="submit"
                formAction={saveSelfAssessment.bind(null, evaluation.id)}
                className="rounded border border-slate-300 px-4 py-2 hover:bg-slate-100"
              >
                임시저장
              </button>
              <button
                type="submit"
                formAction={submitSelfAssessment.bind(null, evaluation.id)}
                className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
              >
                제출하기
              </button>
            </div>
          )}
        </form>
      </section>

      {showReport && !isPerformance && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-medium">평가 결과 리포트</h2>

          <RadarChart
            items={scoreComparison.map((c) => ({
              label: c.label,
              self: c.self,
              manager: c.manager,
              maxScore: c.maxScore,
            }))}
          />

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">영역</th>
                  <th className="py-2 pr-4 font-medium">자기평가</th>
                  <th className="py-2 pr-4 font-medium">팀장평가</th>
                  <th className="py-2 pr-4 font-medium">평균</th>
                  <th className="py-2 pr-4 font-medium">차이(팀장-자기)</th>
                  <th className="py-2 pr-4 font-medium">분류</th>
                  <th className="py-2 font-medium">피드백</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4">
                      <span className="text-xs text-slate-400">{c.category}</span>
                      <br />
                      {c.label}
                    </td>
                    {c.type === "SCORE" ? (
                      <>
                        <td className="py-2 pr-4">{c.self ?? "-"}</td>
                        <td className="py-2 pr-4">{c.manager ?? "-"}</td>
                        <td className="py-2 pr-4">{c.average ?? "-"}</td>
                        <td className="py-2 pr-4">{c.diff ?? "-"}</td>
                        <td className="py-2 pr-4">{c.classification ?? "-"}</td>
                        <td className="py-2 text-amber-700">{c.feedbackFlag ?? ""}</td>
                      </>
                    ) : (
                      <td className="py-2 pr-4 text-slate-600" colSpan={6}>
                        <p>자기: {c.selfComment || "미입력"}</p>
                        <p>평가자: {c.comment || "미입력"}</p>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-200 pt-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 font-medium text-slate-700">주요 강점 역량</h3>
              {strengths.length === 0 ? (
                <p className="text-sm text-slate-500">해당 없음</p>
              ) : (
                <ul className="list-inside list-disc text-sm text-slate-600">
                  {strengths.map((s) => (
                    <li key={s.id}>{s.label}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 font-medium text-slate-700">주요 약점 역량</h3>
              {weaknesses.length === 0 ? (
                <p className="text-sm text-slate-500">해당 없음</p>
              ) : (
                <ul className="list-inside list-disc text-sm text-slate-600">
                  {weaknesses.map((w) => (
                    <li key={w.id}>{w.label}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {evaluation.managerComment && (
            <div className="mt-6 border-t border-slate-200 pt-6">
              <h3 className="mb-2 font-medium text-slate-700">팀장의 코멘트</h3>
              <p className="whitespace-pre-wrap text-slate-600">
                {evaluation.managerComment}
              </p>
            </div>
          )}
        </section>
      )}

      {showReport && isPerformance && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-medium">평가 결과 리포트</h2>

          <div className="mb-6 flex gap-6">
            <div className="rounded border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500">자기평가 종합점수</p>
              <p className="text-xl font-semibold">{selfComposite ?? "-"}</p>
            </div>
            <div className="rounded border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500">팀장평가 종합점수</p>
              <p className="text-xl font-semibold">{managerComposite ?? "-"}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">목표</th>
                  <th className="py-2 pr-4 font-medium">가중치</th>
                  <th className="py-2 pr-4 font-medium">자기평가</th>
                  <th className="py-2 pr-4 font-medium">팀장평가</th>
                  <th className="py-2 pr-4 font-medium">자기 가중점수</th>
                  <th className="py-2 font-medium">팀장 가중점수</th>
                </tr>
              </thead>
              <tbody>
                {perfComparison.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4">
                      <span className="text-xs text-slate-400">{row.category}</span>
                      <br />
                      {row.label}
                      {row.description && (
                        <p className="mt-1 text-xs text-slate-500">{row.description}</p>
                      )}
                    </td>
                    <td className="py-2 pr-4">{row.weight}</td>
                    <td className="py-2 pr-4">{row.selfGrade ?? "-"}</td>
                    <td className="py-2 pr-4">{row.managerGrade ?? "-"}</td>
                    <td className="py-2 pr-4">
                      {row.selfPoints != null
                        ? Math.round(row.weight * row.selfPoints * 10) / 10
                        : "-"}
                    </td>
                    <td className="py-2">
                      {row.managerPoints != null
                        ? Math.round(row.weight * row.managerPoints * 10) / 10
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {evaluation.managerComment && (
            <div className="mt-6 border-t border-slate-200 pt-6">
              <h3 className="mb-2 font-medium text-slate-700">팀장의 코멘트</h3>
              <p className="whitespace-pre-wrap text-slate-600">
                {evaluation.managerComment}
              </p>
            </div>
          )}
        </section>
      )}

      {evaluation.cycle.resultsReleased && (
        <CommentThread evaluationId={evaluation.id} currentUserId={session!.user.id} />
      )}
    </div>
  );
}
