import { prisma } from "@/lib/prisma";

export async function logPageView(userId: string) {
  await prisma.pageView.create({ data: { userId } });
}
