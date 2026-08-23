"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { MODULES, POSITIONS, PERMISSION_SCOPES, type PermissionScope } from "@/lib/permissions";

export type SaveResult = { savedAt: number };

export async function savePermissionMatrix(
  _prevState: SaveResult | undefined,
  formData: FormData
): Promise<SaveResult> {
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

  return { savedAt: Date.now() };
}

/**
 * 목록(직원정보조회 검색결과)은 팀장·담당을 포함해 전 직원이 볼 수 있고,
 * 인사카드 상세는 사장=전체, 운영책임=사업단위, 책임=부문까지. 팀장·담당은
 * LIST_ONLY로 목록만 보인다(팀장은 본인 팀 구성원에 한해 상세도 열림).
 *
 * 참고: 여기서 무엇을 고르든 인사카드 상세는 직책별 상한
 * (POSITION_CARD_SCOPE_CEILING)을 넘지 못한다. 즉 이 값은 상한을 좁히는
 * 용도로만 의미가 있고, 넓히려면 그 사람의 역할을 ADMIN으로 올려야 한다.
 */
const RECOMMENDED_EMPLOYEES_SCOPE: Record<(typeof POSITIONS)[number], PermissionScope> = {
  CEO: "FULL",
  OPERATIONS_HEAD: "BUSINESS_UNIT",
  SENIOR_STAFF: "DIVISION",
  TEAM_LEADER: "LIST_ONLY",
  STAFF: "LIST_ONLY",
};

export async function applyRecommendedEmployeeScope(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: SaveResult | undefined
): Promise<SaveResult> {
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

  return { savedAt: Date.now() };
}

const DEFAULT_SENTINEL = "DEFAULT";

export async function saveUserPermissionOverrides(
  userId: string,
  _prevState: SaveResult | undefined,
  formData: FormData
): Promise<SaveResult> {
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

  return { savedAt: Date.now() };
}
