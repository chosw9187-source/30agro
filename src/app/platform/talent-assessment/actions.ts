"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { computeCompetencyScores, overallScore, SURVEY_ITEMS } from "@/lib/competency-survey";
import { revalidatePath } from "next/cache";

const ALL_ROLES = ["ADMIN", "EVALUATOR", "EMPLOYEE"] as const;
const PATH = "/platform/talent-assessment";

export async function toggleKeyTalent(userId: string, isKeyTalent: boolean) {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id: userId }, data: { isKeyTalent } });
  revalidatePath(PATH);
}

export async function createInviteLink(formData: FormData) {
  const session = await requireRole("ADMIN");
  const applicantName = String(formData.get("applicantName") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  await prisma.surveyInviteLink.create({
    data: {
      applicantName: applicantName || null,
      note: note || null,
      createdById: session.user.id,
    },
  });
  revalidatePath(PATH);
}

export async function deleteInviteLink(id: string) {
  await requireRole("ADMIN");
  await prisma.surveyInviteLink.delete({ where: { id } });
  revalidatePath(PATH);
}

function parseAnswers(formData: FormData): Record<string, number> {
  const answers: Record<string, number> = {};
  for (const item of SURVEY_ITEMS) {
    const raw = Number(formData.get(item.id));
    if (raw >= 1 && raw <= 5) answers[item.id] = raw;
  }
  return answers;
}

export async function submitSelfAssessment(formData: FormData) {
  const session = await requireRole(...ALL_ROLES);

  const answers = parseAnswers(formData);
  const scores = computeCompetencyScores(answers);
  const data = { answers, scores, overallScore: overallScore(scores) };

  await prisma.competencyAssessmentResponse.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  });
  revalidatePath(PATH);
}
