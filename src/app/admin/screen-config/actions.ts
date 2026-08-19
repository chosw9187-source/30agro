"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { HOME_BLOCKS, SIDEBAR_MODULES, ADMIN_MENU_ITEMS, type Position } from "@/lib/permissions";

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

  // 사이드바는 /platform, /admin, /evaluate, /my-evaluations 레이아웃과
  // /notifications 페이지에서 각각 PlatformShell로 그려진다. 경로를 하나씩
  // 나열하면 새 레이아웃이 생길 때마다 빠뜨리고, 무엇보다 revalidatePath는
  // 기본이 page 단위라 레이아웃 안의 사이드바는 갱신되지 않는다 — 순서를
  // 바꿔도 화면이 그대로였던 원인. 루트 레이아웃을 갱신해 전부 덮는다.
  revalidatePath("/", "layout");

  return { savedAt: Date.now() };
}

export async function saveAdminMenuConfig(
  _prevState: SaveResult | undefined,
  formData: FormData
): Promise<SaveResult> {
  await requireRole("ADMIN");

  for (const item of ADMIN_MENU_ITEMS) {
    const hidden = formData.get(`hidden:${item.key}`) === "on";
    await prisma.adminMenuConfig.upsert({
      where: { key: item.key },
      update: { hidden },
      create: { key: item.key, hidden },
    });
  }

  // See saveSidebarConfig above — layout-level revalidate needed for the
  // sidebar (rendered inside PlatformShell) to actually pick up the change.
  revalidatePath("/", "layout");

  return { savedAt: Date.now() };
}
