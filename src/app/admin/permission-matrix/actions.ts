"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { MODULES, POSITIONS } from "@/lib/permissions";

export async function savePermissionMatrix(formData: FormData) {
  await requireRole("ADMIN");

  const checked = new Set(formData.getAll("cell").map(String));

  for (const position of POSITIONS) {
    for (const mod of MODULES) {
      const key = `${mod}:${position}`;
      if (checked.has(key)) {
        await prisma.permissionMatrixEntry.deleteMany({
          where: { position, module: mod },
        });
      } else {
        await prisma.permissionMatrixEntry.upsert({
          where: { position_module: { position, module: mod } },
          update: { visible: false },
          create: { position, module: mod, visible: false },
        });
      }
    }
  }

  revalidatePath("/admin/permission-matrix");
  revalidatePath("/platform");
}
