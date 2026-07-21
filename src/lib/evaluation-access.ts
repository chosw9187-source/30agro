import { prisma } from "@/lib/prisma";

export async function getAccessibleEvaluation(
  evaluationId: string,
  user: { id: string; role: string }
) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: { cycle: true },
  });
  if (!evaluation) return null;

  if (user.role === "ADMIN") return evaluation;
  if (user.role === "EVALUATOR" && evaluation.evaluatorId === user.id) {
    return evaluation;
  }
  if (
    user.role === "EMPLOYEE" &&
    evaluation.evaluateeId === user.id &&
    evaluation.cycle.resultsReleased
  ) {
    return evaluation;
  }
  return null;
}
