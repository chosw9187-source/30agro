"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { TARGET_EXCLUDE_TAG } from "@/lib/goals";

const ADMIN_PATH = "/admin/eval-targets";
const VIEW_PATH = "/platform/evaluation2";

function str(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function revalidate() {
  revalidatePath(ADMIN_PATH);
  revalidatePath(VIEW_PATH);
}

/**
 * 한 사람을 이 사이클의 평가대상에 넣거나 뺀다.
 *
 * 명단만 바꾸고 끝내지 않는다 — 제외로 바꾸면 그 사람이 이 사이클에서 가진
 * 목표의 집계 제외(Goal.excluded)도 같이 켠다. 명단에서 뺐는데 상위 달성률은
 * 그대로면 "뺐다"는 말이 화면에서 거짓이 된다. 다시 포함으로 돌리면 이 화면이
 * 걸어 둔 제외만 풀고(사유가 이 화면 것일 때), 담당자가 손으로 걸어 둔 제외는
 * 건드리지 않는다.
 */
export async function setEvalTarget(formData: FormData) {
  const session = await requireRole("ADMIN");
  const cycleId = str(formData.get("cycleId"));
  const userId = str(formData.get("userId"));
  const included = str(formData.get("included")) === "true";
  const reason = str(formData.get("reason")) || null;
  if (!cycleId || !userId) throw new Error("사이클과 대상자를 확인해 주세요.");

  await prisma.goalCycleTarget.upsert({
    where: { cycleId_userId: { cycleId, userId } },
    create: { cycleId, userId, included, reason, setById: session.user.id },
    update: { included, reason, setById: session.user.id },
  });

  if (included) {
    await prisma.goal.updateMany({
      where: { cycleId, ownerId: userId, excludeReason: { startsWith: TARGET_EXCLUDE_TAG } },
      data: { excluded: false, excludeReason: null },
    });
  } else {
    await prisma.goal.updateMany({
      where: { cycleId, ownerId: userId },
      data: { excluded: true, excludeReason: `${TARGET_EXCLUDE_TAG}${reason ? ` · ${reason}` : ""}` },
    });
  }

  revalidate();
}

/** 제외해 둔 사람을 한 번에 되돌린다. */
export async function includeAllEvalTargets(formData: FormData) {
  await requireRole("ADMIN");
  const cycleId = str(formData.get("cycleId"));
  if (!cycleId) throw new Error("사이클을 확인해 주세요.");

  await prisma.goalCycleTarget.updateMany({
    where: { cycleId, included: false },
    data: { included: true, reason: null },
  });
  await prisma.goal.updateMany({
    where: { cycleId, excludeReason: { startsWith: TARGET_EXCLUDE_TAG } },
    data: { excluded: false, excludeReason: null },
  });

  revalidate();
}
