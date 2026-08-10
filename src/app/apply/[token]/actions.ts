"use server";

import { prisma } from "@/lib/prisma";
import { computeCompetencyScores, overallScore, SURVEY_ITEMS } from "@/lib/competency-survey";
import { revalidatePath } from "next/cache";

function parseAnswers(formData: FormData): Record<string, number> {
  const answers: Record<string, number> = {};
  for (const item of SURVEY_ITEMS) {
    const raw = Number(formData.get(item.id));
    if (raw >= 1 && raw <= 5) answers[item.id] = raw;
  }
  return answers;
}

export async function submitApplicantResponse(token: string, formData: FormData) {
  const invite = await prisma.surveyInviteLink.findUnique({ where: { token }, include: { response: true } });
  if (!invite || invite.response) return;

  const respondentName = String(formData.get("respondentName") ?? "").trim();
  if (!respondentName) return;

  const answers = parseAnswers(formData);
  const scores = computeCompetencyScores(answers);

  await prisma.competencyAssessmentResponse.create({
    data: {
      inviteLinkId: invite.id,
      respondentName,
      answers,
      scores,
      overallScore: overallScore(scores),
    },
  });
  revalidatePath(`/apply/${token}`);
}
