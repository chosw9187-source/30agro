"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { HOME_BLOCKS, SIDEBAR_MODULES, type Position } from "@/lib/permissions";

export type SaveResult = { savedAt: number };

export async function saveHomeLayout(
  position: Position,
  _prevState: SaveResult | undefined,
  formData: FormData
): Promise<SaveResult> {
  await requireRole("ADMIN");

  const checked = new Set(formData.getAll("block").map(String));

  for (const block of HOME_BLOCKS) {
    if (checked.has(block)) {
      await prisma.homeLayoutEntry.deleteMany({ where: { position, block } });
    } else {
      await prisma.homeLayoutEntry.upsert({
        where: { position_block: { position, block } },
        update: { visible: false },
        create: { position, block, visible: false },
      });
    }
  }

  revalidatePath("/admin/screen-config");
  revalidatePath("/platform");

  return { savedAt: Date.now() };
}

export async function saveSidebarConfig(
  _prevState: SaveResult | undefined,
  formData: FormData
): Promise<SaveResult> {
  await requireRole("ADMIN");

  for (const mod of SIDEBAR_MODULES) {
    const order = Number(formData.get(`order:${mod}`) ?? 0);
    const comingSoon = formData.get(`comingSoon:${mod}`) === "on";
    const hidden = formData.get(`hidden:${mod}`) === "on";

    await prisma.moduleUiConfig.upsert({
      where: { module: mod },
      update: { order, comingSoon, hidden },
      create: { module: mod, order, comingSoon, hidden },
    });
  }

  revalidatePath("/admin/screen-config");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/org-chart");
  revalidatePath("/platform/job-management");
  revalidatePath("/platform/task-management");
  revalidatePath("/platform/legal-library");
  revalidatePath("/platform/hr-report");

  return { savedAt: Date.now() };
}
