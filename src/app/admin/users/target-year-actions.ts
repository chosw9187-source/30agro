"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

export async function toggleTargetYear(
  userId: string,
  year: number,
  active: boolean
) {
  await requireRole("ADMIN");

  if (active) {
    await prisma.userTargetYear.upsert({
      where: { userId_year: { userId, year } },
      update: {},
      create: { userId, year },
    });
  } else {
    await prisma.userTargetYear.deleteMany({ where: { userId, year } });
  }

  revalidatePath("/admin/users");
}

export async function clearYearTargets(year: number) {
  await requireRole("ADMIN");
  await prisma.userTargetYear.deleteMany({ where: { year } });
  revalidatePath("/admin/users");
}
