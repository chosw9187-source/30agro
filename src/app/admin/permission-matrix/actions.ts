"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { MODULES, POSITIONS, PERMISSION_SCOPES, type PermissionScope } from "@/lib/permissions";

export async function savePermissionMatrix(formData: FormData) {
  await requireRole("ADMIN");

  for (const position of POSITIONS) {
    for (const mod of MODULES) {
      const key = `${mod}:${position}`;
      const raw = formData.get(key);
      const scope: PermissionScope = PERMISSION_SCOPES.includes(raw as PermissionScope)
        ? (raw as PermissionScope)
        : "FULL";

      if (scope === "FULL") {
        await prisma.permissionMatrixEntry.deleteMany({
          where: { position, module: mod },
        });
      } else {
        await prisma.permissionMatrixEntry.upsert({
          where: { position_module: { position, module: mod } },
          update: { scope },
          create: { position, module: mod, scope },
        });
      }
    }
  }

  revalidatePath("/admin/permission-matrix");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
}
