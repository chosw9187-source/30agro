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

/**
 * 사장→전 직원, 운영책임→해당 사업단위만, 책임→본인 부문만, 팀장→본인
 * 팀만, 담당→본인만: 직원정보조회(EMPLOYEES)에 대해 자주 쓰이는 표준
 * 직책별 조회 범위를 한 번에 적용.
 */
const RECOMMENDED_EMPLOYEES_SCOPE: Record<(typeof POSITIONS)[number], PermissionScope> = {
  CEO: "FULL",
  OPERATIONS_HEAD: "BUSINESS_UNIT",
  SENIOR_STAFF: "DIVISION",
  TEAM_LEADER: "TEAM",
  STAFF: "SELF",
};

export async function applyRecommendedEmployeeScope() {
  await requireRole("ADMIN");

  for (const position of POSITIONS) {
    const scope = RECOMMENDED_EMPLOYEES_SCOPE[position];
    if (scope === "FULL") {
      await prisma.permissionMatrixEntry.deleteMany({
        where: { position, module: "EMPLOYEES" },
      });
    } else {
      await prisma.permissionMatrixEntry.upsert({
        where: { position_module: { position, module: "EMPLOYEES" } },
        update: { scope },
        create: { position, module: "EMPLOYEES", scope },
      });
    }
  }

  revalidatePath("/admin/permission-matrix");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
}

const DEFAULT_SENTINEL = "DEFAULT";

export async function saveUserPermissionOverrides(userId: string, formData: FormData) {
  await requireRole("ADMIN");

  for (const mod of MODULES) {
    const raw = formData.get(mod);
    if (raw === DEFAULT_SENTINEL || !raw) {
      await prisma.userPermissionOverride.deleteMany({ where: { userId, module: mod } });
      continue;
    }
    const scope = PERMISSION_SCOPES.includes(raw as PermissionScope) ? (raw as PermissionScope) : null;
    if (!scope) continue;

    await prisma.userPermissionOverride.upsert({
      where: { userId_module: { userId, module: mod } },
      update: { scope },
      create: { userId, module: mod, scope },
    });
  }

  revalidatePath("/admin/permission-matrix");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
}
