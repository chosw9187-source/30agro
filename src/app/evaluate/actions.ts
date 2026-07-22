"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { itemsForEvaluatee } from "@/lib/template-items";

async function getOwnedEvaluation(evaluationId: string, evaluatorId: string) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      evaluatee: true,
      cycle: { include: { template: { include: { items: true } } } },
    },
  });
  if (!evaluation || evaluation.evaluatorId !== evaluatorId) {
    redirect("/evaluate");
  }
  return evaluation;
}

async function upsertScoresFromForm(
  evaluationId: string,
  items: { id: string; type: string }[],
  formData: FormData
) {
  for (const item of items) {
    if (item.type === "SCORE") {
      const raw = formData.get(`score-${item.id}`);
      const score = raw && String(raw).trim() !== "" ? Number(raw) : null;
      await prisma.evaluationScore.upsert({
        where: {
          evaluationId_templateItemId: { evaluationId, templateItemId: item.id },
        },
        update: { score },
        create: { evaluationId, templateItemId: item.id, score },
      });
    } else if (item.type === "GRADE") {
      const grade = String(formData.get(`grade-${item.id}`) ?? "").trim();
      await prisma.evaluationScore.upsert({
        where: {
          evaluationId_templateItemId: { evaluationId, templateItemId: item.id },
        },
        update: { grade: grade || null },
        create: { evaluationId, templateItemId: item.id, grade: grade || null },
      });
    } else {
      const comment = String(formData.get(`text-${item.id}`) ?? "").trim();
      await prisma.evaluationScore.upsert({
        where: {
          evaluationId_templateItemId: { evaluationId, templateItemId: item.id },
        },
        update: { comment: comment || null },
        create: { evaluationId, templateItemId: item.id, comment: comment || null },
      });
    }
  }
}

export async function saveEvaluation(evaluationId: string, formData: FormData) {
  const session = await requireRole("EVALUATOR");
  const evaluation = await getOwnedEvaluation(evaluationId, session.user.id);

  const items = itemsForEvaluatee(evaluation.cycle.template.items, evaluation.evaluatee);
  await upsertScoresFromForm(evaluationId, items, formData);
  const managerComment = String(formData.get("managerComment") ?? "").trim();

  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: {
      status: evaluation.status === "PENDING" ? "IN_PROGRESS" : evaluation.status,
      managerComment: managerComment || null,
    },
  });

  revalidatePath(`/evaluate/${evaluationId}`);
}

export async function submitEvaluation(evaluationId: string, formData: FormData) {
  const session = await requireRole("EVALUATOR");
  const evaluation = await getOwnedEvaluation(evaluationId, session.user.id);

  const items = itemsForEvaluatee(evaluation.cycle.template.items, evaluation.evaluatee);
  await upsertScoresFromForm(evaluationId, items, formData);
  const managerComment = String(formData.get("managerComment") ?? "").trim();

  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      managerComment: managerComment || null,
    },
  });

  revalidatePath(`/evaluate/${evaluationId}`);
  revalidatePath("/evaluate");
}
