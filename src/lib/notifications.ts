import { prisma } from "@/lib/prisma";

type NotificationType = "SELF_ASSESSMENT_SUBMITTED" | "COMMENT_ADDED";

export async function notifyUser(
  recipientId: string,
  type: NotificationType,
  message: string,
  evaluationId?: string
) {
  await prisma.notification.create({
    data: { recipientId, type, message, evaluationId },
  });
}
