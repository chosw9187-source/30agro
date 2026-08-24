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
 * 옛 방식으로 목표에 직접 박아 둔 "평가대상 제외" 표시를 지운다.
 *
 * 처음에는 사람을 빼면 그 사람 목표의 Goal.excluded를 같이 켰다. 그런데 그러면
 * 조직도가 바뀌거나 입사일 기준일을 고칠 때마다 누가 다시 반영을 눌러줘야
 * 한다. 지금은 평가대상 여부를 조회할 때 계산하므로(evalTargetState) 목표에
 * 저장할 필요가 없다. 남아 있는 옛 표시만 걷어낸다 — 팀장이 손으로 건 개별
 * 제외는 사유 머리말이 달라서 건드리지 않는다.
 */
async function clearLegacyTargetFlags(cycleId: string) {
  await prisma.goal.updateMany({
    where: { cycleId, excludeReason: { startsWith: TARGET_EXCLUDE_TAG } },
    data: { excluded: false, excludeReason: null },
  });
}

/**
 * 한 사람을 이 사이클의 평가대상에 넣거나 뺀다.
 *
 * 여기서 정한 값은 입사일 기준일 규칙을 **이깁니다** — 기준일에 걸린 사람이라도
 * 관리자가 "이 사람은 넣는다"고 하면 넣고, 그 반대도 된다. 손대지 않은 사람은
 * 규칙과 조직도를 그대로 따라간다.
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
  await clearLegacyTargetFlags(cycleId);

  revalidate();
}

/**
 * 손으로 정해 둔 값을 지워 규칙(입사일 기준일)과 조직도만 따르게 되돌린다.
 * 제외를 푸는 것과는 다르다 — 기준일에 걸린 사람은 다시 자동 제외로 돌아간다.
 */
export async function resetEvalTarget(formData: FormData) {
  await requireRole("ADMIN");
  const cycleId = str(formData.get("cycleId"));
  const userId = str(formData.get("userId"));
  if (!cycleId || !userId) throw new Error("사이클과 대상자를 확인해 주세요.");

  await prisma.goalCycleTarget.deleteMany({ where: { cycleId, userId } });
  await clearLegacyTargetFlags(cycleId);

  revalidate();
}

/** 손으로 정해 둔 값을 통째로 지운다. 규칙과 조직도만 남는다. */
export async function resetAllEvalTargets(formData: FormData) {
  await requireRole("ADMIN");
  const cycleId = str(formData.get("cycleId"));
  if (!cycleId) throw new Error("사이클을 확인해 주세요.");

  await prisma.goalCycleTarget.deleteMany({ where: { cycleId } });
  await clearLegacyTargetFlags(cycleId);

  revalidate();
}
