"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { HOME_BLOCKS, type Position } from "@/lib/permissions";

export async function saveHomeLayout(position: Position, formData: FormData) {
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
}
