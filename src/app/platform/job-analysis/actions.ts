"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { parseWorkbookGrids } from "@/lib/job-analysis-import";
import { normalizeName, type ParsedJobTaskRow, type SheetGrid } from "@/lib/job-analysis-fields";

function revalidateJobAnalysis() {
  revalidatePath("/platform/job-analysis");
  revalidatePath("/platform/job-analysis/[teamId]", "page");
}

export type ParseResult =
  | { ok: true; fileName: string; sheets: SheetGrid[] }
  | { ok: false; error: string };

/**
 * 1단계: 업로드한 엑셀을 격자로만 읽어 매핑 화면에 돌려준다. 이 시점엔
 * 아무것도 저장하지 않는다 — 컬럼 의미가 확정되기 전에 저장하면 잘못
 * 해석된 데이터가 그대로 쌓이기 때문.
 */
export async function parseJobAnalysisWorkbook(
  _prevState: ParseResult | undefined,
  formData: FormData
): Promise<ParseResult | undefined> {
  await requireRole("ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "파일을 선택하세요." };
  }

  try {
    const sheets = parseWorkbookGrids(Buffer.from(await file.arrayBuffer()));
    const nonEmpty = sheets.filter((s) => s.rows.length > 0);
    if (nonEmpty.length === 0) {
      return { ok: false, error: "읽을 수 있는 시트가 없습니다." };
    }
    return { ok: true, fileName: file.name, sheets: nonEmpty };
  } catch (err) {
    console.error("[job-analysis] 워크북 파싱 실패:", err);
    return { ok: false, error: "엑셀을 읽지 못했습니다. .xlsx / .xls 파일인지 확인하세요." };
  }
}

export type ImportPayload = {
  rows: ParsedJobTaskRow[];
  /** 정규화된 엑셀 팀명 → teamId. 엑셀에 팀 컬럼이 있을 때 쓴다. */
  teamByName: Record<string, string>;
  /** 팀 컬럼이 없거나 매칭 안 된 행을 몰아넣을 팀. null이면 그 행은 건너뛴다. */
  fallbackTeamId: string | null;
  /** replace: 해당 팀의 기존 단위업무를 지우고 새로 넣음 / append: 이어붙임 */
  mode: "replace" | "append";
};

export type ImportResult = {
  imported: number;
  /** 기존 단위업무를 지우고 덮어쓴 팀 수. */
  replacedTeams: number;
  /** 팀을 정하지 못해 저장하지 않은 행 수. */
  unassigned: number;
  perTeam: { teamName: string; count: number }[];
};

export async function importJobTasks(payload: ImportPayload): Promise<ImportResult> {
  await requireRole("ADMIN");

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const validTeamIds = new Set(teams.map((t) => t.id));

  const byTeam = new Map<string, ParsedJobTaskRow[]>();
  let unassigned = 0;

  for (const row of payload.rows) {
    const mapped = row.teamName ? payload.teamByName[normalizeName(row.teamName)] : undefined;
    const teamId = mapped ?? payload.fallbackTeamId ?? null;
    if (!teamId || !validTeamIds.has(teamId)) {
      unassigned++;
      continue;
    }
    const list = byTeam.get(teamId);
    if (list) list.push(row);
    else byTeam.set(teamId, [row]);
  }

  let imported = 0;
  let replacedTeams = 0;
  const perTeam: { teamName: string; count: number }[] = [];

  for (const [teamId, rows] of byTeam) {
    // 팀 단위로 트랜잭션을 건다 — 중간에 실패해도 "지우기만 하고 못 채운"
    // 팀이 남지 않도록.
    await prisma.$transaction(async (tx) => {
      let startOrder = 0;
      if (payload.mode === "replace") {
        const deleted = await tx.jobTask.deleteMany({ where: { teamId } });
        if (deleted.count > 0) replacedTeams++;
      } else {
        const last = await tx.jobTask.findFirst({
          where: { teamId },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        startOrder = last ? last.order + 1 : 0;
      }

      await tx.jobTask.createMany({
        data: rows.map((r, i) => ({
          teamId,
          category: r.category,
          name: r.name,
          detail: r.detail,
          requiredGrade: r.requiredGrade,
          outputs: r.outputs,
          relatedDept: r.relatedDept,
          legalBasis: r.legalBasis,
          frequency: r.frequency,
          annualCount: r.annualCount,
          hoursPerRun: r.hoursPerRun,
          performerCount: r.performerCount,
          source: "EXCEL_IMPORT" as const,
          order: startOrder + i,
        })),
      });
    });

    imported += rows.length;
    perTeam.push({ teamName: teamNameById.get(teamId) ?? teamId, count: rows.length });
  }

  perTeam.sort((a, b) => b.count - a.count);
  revalidateJobAnalysis();

  return { imported, replacedTeams, unassigned, perTeam };
}

export type SeedFromJdResult = {
  teamsFilled: number;
  tasksCreated: number;
  /** 이미 단위업무가 있어 건드리지 않은 팀 수. */
  teamsSkipped: number;
  /** 직무기술서에 담당업무 텍스트 자체가 없는 팀 수. */
  teamsWithoutText: number;
};

/**
 * 엑셀이 아직 없을 때의 출발점: 기존 직무기술서(JobDescription.responsibilities)의
 * 줄바꿈 텍스트를 단위업무 행으로 옮긴다. 어디까지나 초안이라 source를
 * PDF_EXTRACT로 남기고, 이미 단위업무가 있는 팀은 건드리지 않는다.
 */
export async function seedJobTasksFromJobDescriptions(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: SeedFromJdResult | undefined
): Promise<SeedFromJdResult> {
  await requireRole("ADMIN");

  const teams = await prisma.team.findMany({
    where: { active: true },
    select: {
      id: true,
      jobDescription: { select: { responsibilities: true } },
      _count: { select: { jobTasks: true } },
    },
  });

  const result: SeedFromJdResult = {
    teamsFilled: 0,
    tasksCreated: 0,
    teamsSkipped: 0,
    teamsWithoutText: 0,
  };

  for (const team of teams) {
    if (team._count.jobTasks > 0) {
      result.teamsSkipped++;
      continue;
    }
    const text = team.jobDescription?.responsibilities ?? "";
    const names = text
      .split("\n")
      .map((line) => line.replace(/^[•\-*\s]+/, "").trim())
      .filter(Boolean);

    if (names.length === 0) {
      result.teamsWithoutText++;
      continue;
    }

    await prisma.jobTask.createMany({
      data: names.map((name, i) => ({
        teamId: team.id,
        name,
        source: "PDF_EXTRACT" as const,
        order: i,
      })),
    });
    result.teamsFilled++;
    result.tasksCreated += names.length;
  }

  revalidateJobAnalysis();
  return result;
}

/** 인라인 편집에서 건드릴 수 있는 컬럼만 허용한다. */
const EDITABLE_TEXT_FIELDS = [
  "category",
  "name",
  "detail",
  "requiredGrade",
  "outputs",
  "relatedDept",
  "legalBasis",
  "frequency",
] as const;

export type EditableTextField = (typeof EDITABLE_TEXT_FIELDS)[number];

export async function updateJobTaskField(
  taskId: string,
  field: EditableTextField,
  value: string
): Promise<void> {
  await requireRole("ADMIN");
  if (!EDITABLE_TEXT_FIELDS.includes(field)) return;

  const trimmed = value.trim();
  // 단위업무명이 비면 그 행은 목록에서 식별이 불가능해지므로 거부한다.
  if (field === "name" && !trimmed) return;

  await prisma.jobTask.update({
    where: { id: taskId },
    data: { [field]: field === "name" ? trimmed : trimmed || null },
  });
  revalidateJobAnalysis();
}

export async function addJobTask(teamId: string, formData: FormData): Promise<void> {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const last = await prisma.jobTask.findFirst({
    where: { teamId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.jobTask.create({
    data: {
      teamId,
      name,
      category: String(formData.get("category") ?? "").trim() || null,
      order: last ? last.order + 1 : 0,
    },
  });
  revalidateJobAnalysis();
}

export async function deleteJobTask(taskId: string): Promise<void> {
  await requireRole("ADMIN");
  await prisma.jobTask.delete({ where: { id: taskId } });
  revalidateJobAnalysis();
}

export async function deleteAllJobTasksForTeam(teamId: string): Promise<void> {
  await requireRole("ADMIN");
  await prisma.jobTask.deleteMany({ where: { teamId } });
  revalidateJobAnalysis();
}
