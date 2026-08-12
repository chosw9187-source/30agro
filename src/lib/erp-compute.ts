import { prisma } from "@/lib/prisma";
import {
  parseErpWorkbook,
  transformErpRow,
  resolvePosition,
  resolveTeam,
  computeDiff,
  toJsonSafe,
  type RawErpRow,
  type FieldDiff,
} from "@/lib/erp-import";
import type { Prisma } from "@/generated/prisma/client";

export const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  gender: true,
  birthDate: true,
  hireDate: true,
  terminationDate: true,
  employmentType: true,
  jobGrade: true,
  jobFamily: true,
  educationLevel: true,
  school: true,
  major: true,
  degree: true,
  position: true,
  teamId: true,
  businessUnit: true,
  division: true,
  hiddenFromDirectory: true,
} as const;

export type ExistingUserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }> & {
  employeeNumber: string;
};

export type MappingContext = {
  positionMap: Map<string, string>;
  teamMap: Map<string, string>;
  hiddenMap: Map<string, boolean>;
  teamsByName: Map<string, string>;
  teamsById: Map<string, { businessUnit: string | null; division: string | null }>;
};

export async function loadMappingContext(): Promise<MappingContext> {
  const [mappings, teams] = await Promise.all([
    prisma.erpFieldMapping.findMany(),
    prisma.team.findMany({
      select: { id: true, name: true, businessUnit: true, division: true },
    }),
  ]);
  const positionMap = new Map<string, string>();
  const teamMap = new Map<string, string>();
  const hiddenMap = new Map<string, boolean>();
  for (const m of mappings) {
    if (m.field === "POSITION") positionMap.set(m.rawValue, m.targetValue);
    if (m.field === "TEAM") teamMap.set(m.rawValue, m.targetValue);
    if (m.field === "HIDDEN") hiddenMap.set(m.rawValue, m.targetValue === "true");
  }
  return {
    positionMap,
    teamMap,
    hiddenMap,
    teamsByName: new Map(teams.map((t) => [t.name, t.id])),
    teamsById: new Map(teams.map((t) => [t.id, { businessUnit: t.businessUnit, division: t.division }])),
  };
}

export type RowComputation = {
  status: "NEW" | "CHANGED" | "UNCHANGED" | "TERMINATION" | "NEEDS_MAPPING" | "SKIPPED" | "ERROR";
  diff: FieldDiff[];
  errorMessage?: string;
  name: string;
  /** NEW/CHANGED/UNCHANGED일 때만 채워짐 — 검토 화면의 미리보기 카드를 만드는 데 쓰인다. */
  next?: Record<string, unknown>;
};

/**
 * 원본 한 행 + 현재 매핑/기존 사용자 상태를 가지고 신규/변경/변동없음/퇴직전환/
 * 매핑필요/오류 중 하나로 분류하고 diff를 계산한다. 업로드 시 미리보기를
 * 만들 때, 매핑 지정 후 재분류할 때, 반영 직전 재검증할 때 모두 이 함수를 쓴다.
 */
export function computeRow(
  raw: RawErpRow,
  ctx: MappingContext,
  existing: ExistingUserRow | null
): RowComputation {
  const t = transformErpRow(raw);
  const name = t.name || raw["사원"] || "";

  if (!t.employeeNumber || !t.name) {
    return { status: "ERROR", diff: [], errorMessage: "사번/사원명이 비어 있습니다.", name };
  }

  if (!t.isActive) {
    if (!existing || existing.terminationDate) {
      return { status: "SKIPPED", diff: [], name };
    }
    const diff = computeDiff(existing, { terminationDate: t.terminationDateRaw ?? new Date() });
    return { status: "TERMINATION", diff, name };
  }

  const posResult = resolvePosition(t.positionRawKey, ctx.positionMap);
  const teamResult = resolveTeam(t.teamRawKey, ctx.teamsByName, ctx.teamMap);

  if (posResult.needsMapping || teamResult.needsMapping) {
    return { status: "NEEDS_MAPPING", diff: [], name };
  }

  const teamInfo = teamResult.teamId ? ctx.teamsById.get(teamResult.teamId) : null;

  const next: Record<string, unknown> = {
    name: t.name,
    email: t.email,
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
    position: posResult.position ?? undefined,
    teamId: teamResult.teamId,
    hiddenFromDirectory: ctx.hiddenMap.get(t.positionRawKey) ?? false,
    ...(teamInfo ? { businessUnit: teamInfo.businessUnit, division: teamInfo.division } : {}),
  };

  const diff = computeDiff(existing, next);
  if (!existing) return { status: "NEW", diff, name, next };
  return { status: diff.length > 0 ? "CHANGED" : "UNCHANGED", diff, name, next };
}

/** NEEDS_MAPPING 행이 직책/직위 때문인지 팀명 때문인지(혹은 둘 다인지) 판별. */
export function whichMappingNeeded(
  raw: RawErpRow,
  ctx: MappingContext
): { positionRawKey?: string; teamRawKey?: string } {
  const t = transformErpRow(raw);
  const posResult = resolvePosition(t.positionRawKey, ctx.positionMap);
  const teamResult = resolveTeam(t.teamRawKey, ctx.teamsByName, ctx.teamMap);
  return {
    positionRawKey: posResult.needsMapping ? t.positionRawKey : undefined,
    teamRawKey: teamResult.needsMapping ? t.teamRawKey : undefined,
  };
}

export type CreateBatchResult = {
  batchId: string;
  totalRows: number;
  counts: Record<string, number>;
};

/**
 * ERP 원본 엑셀 버퍼를 파싱해서 검토 대기(PENDING_REVIEW) 배치로 스테이징한다.
 * 화면에서 올리는 uploadErpBatch(Server Action)와, 로컬 자동 업로드 스크립트가
 * 부르는 /api/erp-import/auto-upload 둘 다 이 함수 하나를 공유한다 — 어느
 * 경로로 들어와도 절대 자동으로 반영(applyErpBatch)까지 가지 않고 항상
 * 검토 대기 상태로만 멈춘다.
 */
export async function createErpImportBatch(
  buffer: Buffer,
  fileName: string,
  uploadedById: string
): Promise<CreateBatchResult> {
  const rawRows = parseErpWorkbook(buffer);
  if (rawRows.length === 0) {
    throw new Error("처리할 행이 없습니다.");
  }

  const ctx = await loadMappingContext();
  const employeeNumbers = [...new Set(rawRows.map((r) => (r["사번"] ?? "").trim()).filter(Boolean))];
  const existingUsersWithNumber = await prisma.user.findMany({
    where: { employeeNumber: { in: employeeNumbers } },
    select: { ...USER_SELECT, employeeNumber: true },
  });
  const byEmpNo = new Map(existingUsersWithNumber.map((u) => [u.employeeNumber, u]));

  const batch = await prisma.erpImportBatch.create({
    data: { uploadedById, fileName, totalRows: 0, status: "PENDING_REVIEW" },
  });

  const rowsToInsert = [];
  const counts: Record<string, number> = {};
  for (const raw of rawRows) {
    const employeeNumber = (raw["사번"] ?? "").trim();
    const existing = byEmpNo.get(employeeNumber) ?? null;
    const result = computeRow(raw, ctx, existing);
    if (result.status === "SKIPPED") continue;
    counts[result.status] = (counts[result.status] ?? 0) + 1;

    rowsToInsert.push({
      batchId: batch.id,
      employeeNumber,
      name: result.name,
      status: result.status,
      rawData: toJsonSafe(raw),
      diff: result.diff.length > 0 ? toJsonSafe(result.diff) : undefined,
      errorMessage: result.errorMessage,
      approved: result.status === "NEW" || result.status === "CHANGED" || result.status === "TERMINATION",
    });
  }

  if (rowsToInsert.length > 0) {
    await prisma.erpImportRow.createMany({ data: rowsToInsert });
  }
  await prisma.erpImportBatch.update({
    where: { id: batch.id },
    data: { totalRows: rowsToInsert.length },
  });

  return { batchId: batch.id, totalRows: rowsToInsert.length, counts };
}
