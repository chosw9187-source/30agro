"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { itemsForEvaluatee } from "@/lib/template-items";

async function getOwnedEvaluation(evaluationId: string, evaluateeId: string) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      evaluatee: true,
      cycle: { include: { template: { include: { items: true } } } },
    },
  });
  if (!evaluation || evaluation.evaluateeId !== evaluateeId) {
    redirect("/my-evaluations");
  }
  return evaluation;
}

async function upsertSelfScoresFromForm(
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
        update: { selfScore: score },
        create: { evaluationId, templateItemId: item.id, selfScore: score },
      });
    } else if (item.type === "GRADE") {
      const grade = String(formData.get(`grade-${item.id}`) ?? "").trim();
      await prisma.evaluationScore.upsert({
        where: {
          evaluationId_templateItemId: { evaluationId, templateItemId: item.id },
        },
        update: { selfGrade: grade || null },
        create: { evaluationId, templateItemId: item.id, selfGrade: grade || null },
      });
    } else {
      const comment = String(formData.get(`text-${item.id}`) ?? "").trim();
      await prisma.evaluationScore.upsert({
        where: {
          evaluationId_templateItemId: { evaluationId, templateItemId: item.id },
        },
        update: { selfComment: comment || null },
        create: { evaluationId, templateItemId: item.id, selfComment: comment || null },
      });
    }
  }
}

export async function saveSelfAssessment(evaluationId: string, formData: FormData) {
  const session = await requireRole("EMPLOYEE");
  const evaluation = await getOwnedEvaluation(evaluationId, session.user.id);

  const items = itemsForEvaluatee(evaluation.cycle.template.items, evaluation.evaluatee);
  await upsertSelfScoresFromForm(evaluationId, items, formData);

  if (evaluation.selfStatus === "PENDING") {
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { selfStatus: "IN_PROGRESS" },
    });
  }

  revalidatePath(`/my-evaluations/${evaluationId}`);
}

export async function submitSelfAssessment(evaluationId: string, formData: FormData) {
  const session = await requireRole("EMPLOYEE");
  const evaluation = await getOwnedEvaluation(evaluationId, session.user.id);

  const items = itemsForEvaluatee(evaluation.cycle.template.items, evaluation.evaluatee);
  await upsertSelfScoresFromForm(evaluationId, items, formData);

  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: { selfStatus: "SUBMITTED", selfSubmittedAt: new Date() },
  });

  revalidatePath(`/my-evaluations/${evaluationId}`);
  revalidatePath("/my-evaluations");
}
