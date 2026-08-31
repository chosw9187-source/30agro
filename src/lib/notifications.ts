import { prisma } from "@/lib/prisma";

type NotificationType =
  | "SELF_ASSESSMENT_SUBMITTED"
  | "COMMENT_ADDED"
  | "ONBOARDING_BOOKING_REQUESTED"
  | "ONBOARDING_BOOKING_DECIDED"
  | "ONBOARDING_SCHEDULE_CHANGED"
  | "ONBOARDING_NOTICE_POSTED";

/**
 * 알림 한 건을 남긴다. `link`를 주면 알림 목록에서 그 화면으로 바로 갈 수
 * 있다 — 평가 알림은 evaluationId로 상세를 찾지만, 온보딩처럼 평가와 무관한
 * 알림은 갈 곳을 직접 담아야 한다.
 */
export async function notifyUser(
  recipientId: string,
  type: NotificationType,
  message: string,
  evaluationId?: string,
  link?: string
) {
  await prisma.notification.create({
    data: { recipientId, type, message, evaluationId, link },
  });
}

/**
 * 여러 명에게 같은 알림을 남긴다. 온보딩 확정처럼 기수 전원에게 같은 내용을
 * 보내는 경우가 있어 한 번의 쿼리로 처리한다.
 */
export async function notifyUsers(
  recipientIds: string[],
  type: NotificationType,
  message: string,
  link?: string
) {
  if (recipientIds.length === 0) return;
  await prisma.notification.createMany({
    data: recipientIds.map((recipientId) => ({ recipientId, type, message, link })),
  });
}
