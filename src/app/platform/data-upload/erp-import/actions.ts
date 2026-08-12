"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { reassignTeamLeader, clearLeaderIfDeparting } from "@/lib/team-leader";
import {
  transformErpRow,
  resolvePosition,
  resolveTeam,
  normalizeForCompare,
  toJsonSafe,
  type RawErpRow,
  type FieldDiff,
} from "@/lib/erp-import";
import { TEAM_MAPPING_NONE } from "@/lib/erp-constants";
import { USER_SELECT, loadMappingContext, computeRow, createErpImportBatch } from "@/lib/erp-compute";
import type { Position } from "@/lib/permission-constants";

function revalidateAffected() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/teams");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/org-chart");
  revalidatePath("/platform/org-chart/[teamId]", "page");
  revalidatePath("/platform/job-management");
  revalidatePath("/platform/job-management/[teamId]", "page");
  revalidatePath("/platform/employees/[userId]", "page");
  revalidatePath("/platform/data-upload/erp-import");
  revalidatePath("/platform/data-upload/erp-import/[batchId]", "page");
}

export async function uploadErpBatch(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  const session = await requireRole("ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return "파일을 선택해주세요.";
  }

  let batchId: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await createErpImportBatch(buffer, file.name, session.user.id);
    batchId = result.batchId;
  } catch (e) {
    return e instanceof Error ? e.message : "파일을 읽는 중 문제가 발생했습니다.";
  }

  revalidatePath("/platform/data-upload/erp-import");
  redirect(`/platform/data-upload/erp-import/${batchId}`);
}

/**
 * hidden=true면 이 직책/직위 조합(예: 감사, 자문위원)은 계정은 정상 생성/
 * 갱신하되 조직도·직원조회에는 나타나지 않도록 표시한다.
 */
export async function resolvePositionMapping(
  batchId: string,
  rawKey: string,
  target: Position,
  hidden: boolean
) {
  await requireRole("ADMIN");
  await prisma.erpFieldMapping.upsert({
    where: { field_rawValue: { field: "POSITION", rawValue: rawKey } },
    update: { targetValue: target },
    create: { field: "POSITION", rawValue: rawKey, targetValue: target },
  });
  await prisma.erpFieldMapping.upsert({
    where: { field_rawValue: { field: "HIDDEN", rawValue: rawKey } },
    update: { targetValue: String(hidden) },
    create: { field: "HIDDEN", rawValue: rawKey, targetValue: String(hidden) },
  });
  await recomputeBatchMappingRows(batchId);
}

export async function resolveTeamMapping(
  batchId: string,
  rawKey: string,
  target: string | typeof TEAM_MAPPING_NONE
) {
  await requireRole("ADMIN");
  await prisma.erpFieldMapping.upsert({
    where: { field_rawValue: { field: "TEAM", rawValue: rawKey } },
    update: { targetValue: target },
    create: { field: "TEAM", rawValue: rawKey, targetValue: target },
  });
  await recomputeBatchMappingRows(batchId);
}

export async function createTeamAndMapErp(
  batchId: string,
  rawKey: string,
  name: string,
  businessUnit: string,
  division: string
) {
  await requireRole("ADMIN");
  const team = await prisma.team.upsert({
    where: { name },
    update: {},
    create: { name, businessUnit: businessUnit || null, division: division || null },
  });
  await prisma.erpFieldMapping.upsert({
    where: { field_rawValue: { field: "TEAM", rawValue: rawKey } },
    update: { targetValue: team.id },
    create: { field: "TEAM", rawValue: rawKey, targetValue: team.id },
  });
  await recomputeBatchMappingRows(batchId);
  revalidatePath("/admin/teams");
}

/** 매핑을 새로 지정한 뒤, 그 배치의 매핑필요 행들을 다시 분류한다. */
async function recomputeBatchMappingRows(batchId: string) {
  const [ctx, rows] = await Promise.all([
    loadMappingContext(),
    prisma.erpImportRow.findMany({
      where: { batchId, status: "NEEDS_MAPPING" },
    }),
  ]);
  if (rows.length === 0) return;

  const employeeNumbers = [...new Set(rows.map((r) => r.employeeNumber))];
  const existingUsers = await prisma.user.findMany({
    where: { employeeNumber: { in: employeeNumbers } },
    select: { ...USER_SELECT, employeeNumber: true },
  });
  const byEmpNo = new Map(existingUsers.map((u) => [u.employeeNumber, u]));

  for (const row of rows) {
    const raw = row.rawData as RawErpRow;
    const existing = byEmpNo.get(row.employeeNumber) ?? null;
    const result = computeRow(raw, ctx, existing);
    await prisma.erpImportRow.update({
      where: { id: row.id },
      data: {
        status: result.status,
        diff: result.diff.length > 0 ? toJsonSafe(result.diff) : undefined,
        errorMessage: result.errorMessage,
        approved: result.status === "NEW" || result.status === "CHANGED" || result.status === "TERMINATION",
      },
    });
  }

  revalidatePath("/platform/data-upload/erp-import/[batchId]", "page");
}

export async function toggleRowApproval(rowId: string, approved: boolean) {
  await requireRole("ADMIN");
  const row = await prisma.erpImportRow.update({ where: { id: rowId }, data: { approved } });
  revalidatePath(`/platform/data-upload/erp-import/${row.batchId}`);
}

export async function discardBatch(batchId: string) {
  await requireRole("ADMIN");
  await prisma.erpImportBatch.update({ where: { id: batchId }, data: { status: "DISCARDED" } });
  revalidatePath("/platform/data-upload/erp-import");
  redirect("/platform/data-upload/erp-import");
}

/**
 * 폐기와 다르게 배치와 그 안의 원본 데이터(rawData)를 DB에서 완전히
 * 삭제한다. 원본 파일에 실수로 민감정보가 포함됐던 경우처럼, 데이터
 * 자체를 지워야 할 때 쓴다. 반영완료/되돌림 배치는 되돌리기 이력
 * 추적을 위해 삭제 대상에서 제외한다.
 */
export async function deleteErpBatch(batchId: string) {
  await requireRole("ADMIN");
  const batch = await prisma.erpImportBatch.findUnique({ where: { id: batchId }, select: { status: true } });
  if (!batch || (batch.status !== "PENDING_REVIEW" && batch.status !== "DISCARDED")) {
    return;
  }
  await prisma.erpImportBatch.delete({ where: { id: batchId } });
  revalidatePath("/platform/data-upload/erp-import");
  redirect("/platform/data-upload/erp-import");
}

type ApplyResult = {
  created: number;
  updated: number;
  terminated: number;
  skippedStale: string[];
  errors: string[];
  dryRun: boolean;
};

/** dryRun 모드에서 실제 반영 로직을 다 실행한 뒤 일부러 던져서 트랜잭션을 롤백시키는 표식. */
class DryRunRollback extends Error {}

/**
 * 승인된 행만 실제 User/Team 데이터에 반영한다. dryRun=true면 똑같은 로직을
 * 그대로 실행하되 트랜잭션을 끝에서 항상 롤백해서, 실제로는 아무것도
 * 저장되지 않는다 — 다른 직원에게 노출되기 전에 "반영하면 어떻게 되는지"를
 * 안전하게 테스트해볼 수 있게 하기 위함.
 *
 * 미리보기 이후 시간이 지났을 수 있으므로, 반영 직전에 각 행을 다시
 * 계산해서 그 사이 관리자가 수동으로 값을 바꿔놓았다면(미리보기 당시의
 * "이전값"과 지금 DB 값이 다르면) 그 행은 건너뛰고 별도로 알려준다 — ERP가
 * 수동 수정을 덮어쓰지 않도록.
 */
export async function applyErpBatch(batchId: string, dryRun = false): Promise<ApplyResult> {
  await requireRole("ADMIN");

  const batch = await prisma.erpImportBatch.findUnique({
    where: { id: batchId },
    include: { rows: { where: { approved: true } } },
  });
  if (!batch || batch.status !== "PENDING_REVIEW") {
    return {
      created: 0,
      updated: 0,
      terminated: 0,
      skippedStale: [],
      errors: ["이미 처리된 배치입니다."],
      dryRun,
    };
  }

  const ctx = await loadMappingContext();
  const result: ApplyResult = { created: 0, updated: 0, terminated: 0, skippedStale: [], errors: [], dryRun };

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const row of batch.rows) {
          if (row.status !== "NEW" && row.status !== "CHANGED" && row.status !== "TERMINATION") continue;

          const raw = row.rawData as RawErpRow;
          const existing = await tx.user.findUnique({
            where: { employeeNumber: row.employeeNumber },
            select: { ...USER_SELECT, employeeNumber: true },
          });
          const fresh = computeRow(raw, ctx, existing ?? null);

          const originalDiff = (row.diff as FieldDiff[] | null) ?? [];
          const staleField = originalDiff.find(
            (d) =>
              existing &&
              normalizeForCompare((existing as unknown as Record<string, unknown>)[d.field]) !==
                normalizeForCompare(d.before)
          );
          if (staleField && (fresh.status === "CHANGED" || fresh.status === "TERMINATION")) {
            result.skippedStale.push(
              `${row.name}(${row.employeeNumber}): ${staleField.label}이(가) 미리보기 이후 변경됨`
            );
            if (!dryRun) {
              await tx.erpImportRow.update({
                where: { id: row.id },
                data: { appliedOutcome: "SKIPPED_STALE" },
              });
            }
            continue;
          }
          if (fresh.status === "NEEDS_MAPPING" || fresh.status === "UNCHANGED" || fresh.status === "SKIPPED") {
            continue;
          }

          try {
            if (fresh.status === "TERMINATION") {
              if (!existing) continue;
              const terminationDate =
                fresh.diff.find((d) => d.field === "terminationDate")?.after ?? new Date();
              await tx.user.update({
                where: { id: existing.id },
                data: { terminationDate: terminationDate as Date },
              });
              await clearLeaderIfDeparting(tx, existing.id);
              result.terminated++;
              if (!dryRun) {
                await tx.erpImportRow.update({
                  where: { id: row.id },
                  data: { appliedOutcome: "TERMINATED", appliedUserId: existing.id },
                });
              }
              continue;
            }

            const t = transformErpRow(raw);
            const posResult = resolvePosition(t.positionRawKey, ctx.positionMap);
            const teamResult = resolveTeam(t.teamRawKey, ctx.teamsByName, ctx.teamMap);
            const teamInfo = teamResult.teamId ? ctx.teamsById.get(teamResult.teamId) : null;
            const position = posResult.position;

            const data = {
              name: t.name,
              gender: t.gender,
              birthDate: t.birthDate,
              hireDate: t.hireDate,
              terminationDate: null,
              employmentType: t.employmentType,
              jobGrade: t.jobGrade,
              jobFamily: t.jobFamily,
              educationLevel: t.educationLevel,
              school: t.school,
              major: t.major,
              degree: t.degree,
              teamId: teamResult.teamId,
              hiddenFromDirectory: ctx.hiddenMap.get(t.positionRawKey) ?? false,
              ...(teamInfo ? { businessUnit: teamInfo.businessUnit, division: teamInfo.division } : {}),
              ...(position ? { position } : {}),
              ...(t.email ? { email: t.email } : {}),
            };

            let userId: string;
            let outcome: "CREATED" | "UPDATED";
            if (existing) {
              await tx.user.update({ where: { id: existing.id }, data });
              userId = existing.id;
              outcome = "UPDATED";
              result.updated++;
            } else {
              const passwordHash = await bcrypt.hash(row.employeeNumber, 10);
              const created = await tx.user.create({
                data: {
                  ...data,
                  employeeNumber: row.employeeNumber,
                  email: t.email ?? null,
                  passwordHash,
                  role: "EMPLOYEE",
                },
              });
              userId = created.id;
              outcome = "CREATED";
              result.created++;
            }

            if (position === "TEAM_LEADER" && teamResult.teamId) {
              await reassignTeamLeader(tx, teamResult.teamId, userId);
            }

            if (!dryRun) {
              await tx.erpImportRow.update({
                where: { id: row.id },
                data: { appliedOutcome: outcome, appliedUserId: userId },
              });
            }
          } catch (e) {
            result.errors.push(`${row.name}(${row.employeeNumber}): ${e instanceof Error ? e.message : "반영 실패"}`);
            if (!dryRun) {
              await tx.erpImportRow.update({
                where: { id: row.id },
                data: { appliedOutcome: "ERROR" },
              });
            }
          }
        }

        if (dryRun) {
          throw new DryRunRollback();
        }
        await tx.erpImportBatch.update({
          where: { id: batchId },
          data: { status: "APPLIED", appliedAt: new Date() },
        });
      },
      { timeout: 30_000 }
    );
  } catch (e) {
    if (!(e instanceof DryRunRollback)) throw e;
  }

  if (!dryRun) revalidateAffected();
  return result;
}

const DATE_FIELDS = new Set(["birthDate", "hireDate", "terminationDate"]);

/** rawData/diff는 JSON 왕복을 거쳐 날짜가 ISO 문자열로 저장돼있어 Date로 복원해야 한다. */
function coerceFieldValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (DATE_FIELDS.has(field)) {
    const d = new Date(value as string);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return value;
}

type RollbackResult = {
  restored: number;
  createdNeedsReview: string[];
  errors: string[];
};

/**
 * 반영된(APPLIED) 배치를 되돌린다. 변경/퇴직전환 행은 diff에 저장해둔
 * "이전값"으로 필드를 정확히 복구한다. 신규 생성된 사람은 삭제가 더 위험한
 * 동작이라 자동으로 되돌리지 않고, 확인이 필요한 목록으로만 알려준다.
 *
 * 주의: 팀장 교체로 인한 역할(EVALUATOR) 승격/강등이나 팀 leaderId 변경
 * 같은 부수 효과는 자동으로 되돌리지 않는다 — 팀장 관련 변경이 있었다면
 * 되돌리기 후 권한 매트릭스/팀 관리에서 별도로 확인이 필요하다.
 */
export async function rollbackErpBatch(batchId: string): Promise<RollbackResult> {
  await requireRole("ADMIN");

  const batch = await prisma.erpImportBatch.findUnique({
    where: { id: batchId },
    include: { rows: true },
  });
  if (!batch || batch.status !== "APPLIED") {
    return { restored: 0, createdNeedsReview: [], errors: ["되돌릴 수 없는 배치입니다."] };
  }

  const result: RollbackResult = { restored: 0, createdNeedsReview: [], errors: [] };

  await prisma.$transaction(
    async (tx) => {
      for (const row of batch.rows) {
        if (row.appliedOutcome === "CREATED" && row.appliedUserId) {
          result.createdNeedsReview.push(`${row.name}(${row.employeeNumber})`);
          continue;
        }
        if ((row.appliedOutcome === "UPDATED" || row.appliedOutcome === "TERMINATED") && row.appliedUserId) {
          const diff = (row.diff as FieldDiff[] | null) ?? [];
          if (diff.length === 0) continue;
          const restoreData: Record<string, unknown> = {};
          for (const d of diff) {
            restoreData[d.field] = coerceFieldValue(d.field, d.before);
          }
          try {
            await tx.user.update({ where: { id: row.appliedUserId }, data: restoreData });
            result.restored++;
          } catch (e) {
            result.errors.push(`${row.name}(${row.employeeNumber}): ${e instanceof Error ? e.message : "복구 실패"}`);
          }
        }
      }

      await tx.erpImportBatch.update({
        where: { id: batchId },
        data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
      });
    },
    { timeout: 30_000 }
  );

  revalidateAffected();
  return result;
}
