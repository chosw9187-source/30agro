import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { saveEvaluation, submitEvaluation } from "../actions";
import { CommentThread } from "@/components/comment-thread";
import { ScaleLegend } from "@/components/scale-legend";
import { GradeField } from "@/components/grade-field";
import { itemsForTeam } from "@/lib/template-items";

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
          template: { include: { items: { orderBy: { order: "asc" } } } },
        },
      },
      scores: true,
    },
  });

  if (!evaluation || evaluation.evaluatorId !== session!.user.id) {
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

  const editable =
    evaluation.status !== "SUBMITTED" && evaluation.cycle.status === "OPEN";
  const isPerformance = evaluation.cycle.template.kind === "PERFORMANCE";

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
      {!editable && evaluation.status !== "SUBMITTED" && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-700">
          사이클이 진행중 상태가 아니어서 편집할 수 없습니다.
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
                      <GradeField
                        name={`grade-${item.id}`}
                        criteria={item.gradeCriteria}
                        defaultValue={existing?.grade}
                        disabled={!editable}
                      />
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
              className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
            >
              제출하기
            </button>
          </div>
        )}
      </form>

      <CommentThread evaluationId={evaluation.id} currentUserId={session!.user.id} />
    </div>
  );
}
