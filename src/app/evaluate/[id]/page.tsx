import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { saveEvaluation, submitEvaluation } from "../actions";
import { CommentThread } from "@/components/comment-thread";
import { ScaleLegend } from "@/components/scale-legend";
import { GradeField } from "@/components/grade-field";
import { RadarChart } from "@/components/radar-chart";
import { itemsForEvaluatee, isScorableFor } from "@/lib/template-items";
import { buildComparison } from "@/lib/evaluation-report";
import { buildPerformanceComparison, compositeScore } from "@/lib/performance-report";

const evalStatusLabel: Record<string, string> = {
  PENDING: "대기",
  IN_PROGRESS: "작성중",
  SUBMITTED: "제출완료",
};

const selfStatusLabel: Record<string, string> = {
  PENDING: "미작성",
  IN_PROGRESS: "작성중",
  SUBMITTED: "제출완료",
};

export default async function EvaluationFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      evaluatee: true,
      cycle: {
        include: {
          template: {
            include: {
              items: { orderBy: { order: "asc" }, include: { assignee: true } },
            },
          },
        },
      },
      scores: true,
    },
  });

  if (!evaluation || evaluation.evaluatorId !== session!.user.id) {
    notFound();
  }

  const scoreByItem = new Map(evaluation.scores.map((s) => [s.templateItemId, s]));
  const items = itemsForEvaluatee(
    evaluation.cycle.template.items,
    evaluation.evaluatee,
    evaluation.cycle.template.kind
  );

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.category || "미분류";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const editable =
    !evaluation.cycle.resultsReleased && evaluation.cycle.status === "OPEN";
  const isPerformance = evaluation.cycle.template.kind === "PERFORMANCE";
  const showReport = evaluation.status === "SUBMITTED";

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{evaluation.evaluatee.name} 평가</h1>
        <p className="mt-1 text-slate-600">
          {evaluation.cycle.name} · {evalStatusLabel[evaluation.status]} · 자기평가{" "}
          {selfStatusLabel[evaluation.selfStatus]}
        </p>
      </div>

      {editable && !isPerformance && <ScaleLegend />}
      {!editable && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-700">
          {evaluation.cycle.resultsReleased
            ? "결과가 공개되어 더 이상 수정할 수 없습니다."
            : "사이클이 진행중 상태가 아니어서 편집할 수 없습니다."}
        </p>
      )}
      {editable && evaluation.status === "SUBMITTED" && (
        <p className="rounded bg-brand-green-light p-3 text-sm text-brand-green-dark">
          이미 제출한 평가입니다. 결과가 공개되기 전까지 자유롭게 수정 후 다시
          제출할 수 있습니다.
        </p>
      )}

      <form className="flex flex-col gap-8 rounded-lg border border-slate-200 bg-white p-6">
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
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        name={`score-${item.id}`}
                        min={1}
                        max={item.maxScore}
                        defaultValue={existing?.score ?? undefined}
                        disabled={!editable}
                        className="w-32 rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                      />
                      {existing?.selfScore != null && (
                        <span className="text-sm text-slate-500">
                          자기평가: {existing.selfScore}점
                        </span>
                      )}
                    </div>
                  ) : item.type === "GRADE" ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                        <span>현수준: {item.currentLevel || "-"}</span>
                        <span>목표치: {item.targetLevel || "-"}</span>
                        <span>가중치: {item.weight ?? 0}</span>
                        {existing?.selfGrade && (
                          <span>자기평가: {existing.selfGrade}등급</span>
                        )}
                      </div>
                      {isScorableFor(item, evaluation.evaluatee) ? (
                        <GradeField
                          name={`grade-${item.id}`}
                          criteria={item.gradeCriteria}
                          defaultValue={existing?.grade}
                          disabled={!editable}
                        />
                      ) : (
                        <p className="rounded bg-slate-100 px-3 py-2 text-sm text-slate-500">
                          {item.assignee?.name ?? "다른 팀원"} 담당 목표입니다.
                          평가 대상이 아닙니다.
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <textarea
                        name={`text-${item.id}`}
                        rows={3}
                        defaultValue={existing?.comment ?? ""}
                        disabled={!editable}
                        className="rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                      />
                      {existing?.selfComment && (
                        <p className="text-sm text-slate-500">
                          자기평가: {existing.selfComment}
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div className="flex flex-col gap-2 border-t border-slate-200 pt-6">
          <label className="font-medium">전체 코멘트</label>
          <textarea
            name="managerComment"
            rows={4}
            defaultValue={evaluation.managerComment ?? ""}
            disabled={!editable}
            placeholder="피평가자에 대한 종합적인 의견을 남겨주세요."
            className="rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
          />
        </div>

        {editable && (
          <div className="flex gap-3 border-t border-slate-200 pt-6">
            <button
              type="submit"
              formAction={saveEvaluation.bind(null, evaluation.id)}
              className="rounded border border-slate-300 px-4 py-2 hover:bg-slate-100"
            >
              임시저장
            </button>
            <button
              type="submit"
              formAction={submitEvaluation.bind(null, evaluation.id)}
              className="rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark"
            >
              {evaluation.status === "SUBMITTED" ? "다시 제출하기" : "제출하기"}
            </button>
          </div>
        )}
      </form>

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
        </section>
      )}

      <CommentThread evaluationId={evaluation.id} currentUserId={session!.user.id} />
    </div>
  );
}
