"use server";

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { stringifyGradeCriteria } from "@/lib/grade";

type ImportResult = {
  created: number;
  updated: number;
  errors: string[];
};

export async function importTemplateItemsFromExcel(
  templateId: string,
  _prevState: ImportResult | undefined,
  formData: FormData
): Promise<ImportResult> {
  await requireRole("ADMIN");

  const template = await prisma.evaluationTemplate.findUniqueOrThrow({
    where: { id: templateId },
  });

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { created: 0, updated: 0, errors: ["파일을 선택해주세요."] };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  let nextOrder = await prisma.templateItem.count({ where: { templateId } });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const label = String(row["항목명"] ?? "").trim();
    const teamName = String(row["팀명"] ?? "").trim();
    const category = String(row["카테고리"] ?? "").trim();

    if (!label) {
      errors.push(`${rowNum}행: 항목명이 없습니다.`);
      continue;
    }

    try {
      let teamId: string | null = null;
      if (teamName) {
        const team = await prisma.team.upsert({
          where: { name: teamName },
          update: {},
          create: { name: teamName },
        });
        teamId = team.id;
      }

      const existing = await prisma.templateItem.findFirst({
        where: { templateId, label, teamId },
      });

      if (template.kind === "PERFORMANCE") {
        const description = String(row["KPI"] ?? "").trim();
        const currentLevel = String(row["현수준"] ?? "").trim();
        const targetLevel = String(row["목표치"] ?? "").trim();
        const weight = Number(row["가중치"] ?? 0) || 0;
        const kpiFormula = String(row["산출식"] ?? "").trim();
        const gradeCriteria = stringifyGradeCriteria({
          S: String(row["S기준"] ?? "").trim(),
          A: String(row["A기준"] ?? "").trim(),
          B: String(row["B기준"] ?? "").trim(),
          C: String(row["C기준"] ?? "").trim(),
          D: String(row["D기준"] ?? "").trim(),
        });

        const data = {
          category,
          label,
          description: description || null,
          type: "GRADE" as const,
          teamId,
          currentLevel: currentLevel || null,
          targetLevel: targetLevel || null,
          kpiFormula: kpiFormula || null,
          weight,
          gradeCriteria,
        };

        if (existing) {
          await prisma.templateItem.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.templateItem.create({
            data: { ...data, templateId, order: nextOrder++ },
          });
          created++;
        }
      } else {
        const description = String(row["설명"] ?? "").trim();
        const maxScore = Number(row["최대점수"] ?? 5) || 5;
        const type =
          String(row["유형"] ?? "SCORE").trim().toUpperCase() === "TEXT"
            ? ("TEXT" as const)
            : ("SCORE" as const);

        const data = {
          category,
          label,
          description: description || null,
          type,
          maxScore,
          teamId,
        };

        if (existing) {
          await prisma.templateItem.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.templateItem.create({
            data: { ...data, templateId, order: nextOrder++ },
          });
          created++;
        }
      }
    } catch (e) {
      errors.push(`${rowNum}행: 저장 실패 (${(e as Error).message})`);
    }
  }

  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath("/admin/teams");

  return { created, updated, errors };
}
