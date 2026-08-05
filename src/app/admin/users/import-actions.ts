"use server";

import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import type { Position } from "@/lib/permissions";

type ImportResult = {
  created: number;
  updated: number;
  errors: string[];
};

const POSITION_TEXT_MAP: Record<string, Position> = {
  회장: "CEO",
  부회장: "CEO",
  사장: "CEO",
  대표: "CEO",
  대표이사: "CEO",
  운영책임: "OPERATIONS_HEAD",
  부사장: "OPERATIONS_HEAD",
  책임: "SENIOR_STAFF",
  이사: "SENIOR_STAFF",
  상무: "SENIOR_STAFF",
  전무: "SENIOR_STAFF",
  팀장: "TEAM_LEADER",
  담당: "STAFF",
  부장: "STAFF",
  차장: "STAFF",
  과장: "STAFF",
  대리: "STAFF",
  주임: "STAFF",
  사원: "STAFF",
};

function parsePosition(value: unknown): Position | undefined {
  const text = String(value ?? "").trim();
  return POSITION_TEXT_MAP[text];
}

function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export async function importUsersFromExcel(
  _prevState: ImportResult | undefined,
  formData: FormData
): Promise<ImportResult> {
  await requireRole("ADMIN");

  const file = formData.get("file");
  const year = Number(formData.get("year") ?? new Date().getFullYear());
  if (!(file instanceof File) || file.size === 0) {
    return { created: 0, updated: 0, errors: ["파일을 선택해주세요."] };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const name = String(row["이름"] ?? "").trim();
    const employeeNumber = String(row["사번"] ?? "").trim();
    const email = String(row["이메일주소"] ?? "").trim() || null;
    const teamName = String(row["팀명"] ?? "").trim();
    const businessUnit = String(row["사업단위"] ?? "").trim() || null;
    const division = String(row["본부"] ?? "").trim() || null;
    const birthDate = parseExcelDate(row["생년월일"]);
    const hireDate = parseExcelDate(row["입사일"]);
    const terminationDate = parseExcelDate(row["퇴사일"]);
    const position = parsePosition(row["직책"]);
    const employmentType = String(row["사원구분"] ?? "").trim() || null;
    const jobGrade = String(row["직급"] ?? "").trim() || null;
    const jobFamily = String(row["직군"] ?? "").trim() || null;
    const gender = String(row["성별"] ?? "").trim() || null;

    if (!name || !employeeNumber) {
      errors.push(`${rowNum}행: 이름/사번은 필수입니다.`);
      continue;
    }

    try {
      let teamId: string | null = null;
      if (teamName) {
        const team = await prisma.team.upsert({
          where: { name: teamName },
          update: {
            ...(businessUnit ? { businessUnit } : {}),
            ...(division ? { division } : {}),
          },
          create: {
            name: teamName,
            businessUnit,
            division,
          },
        });
        teamId = team.id;
      }

      const existing = await prisma.user.findUnique({ where: { employeeNumber } });
      let userId: string;

      if (existing) {
        await prisma.user.update({
          where: { employeeNumber },
          data: {
            name,
            teamId,
            birthDate,
            hireDate,
            terminationDate,
            employmentType,
            jobGrade,
            jobFamily,
            gender,
            businessUnit,
            division,
            ...(email ? { email } : {}),
            ...(position ? { position } : {}),
          },
        });
        userId = existing.id;
        updated++;
      } else {
        const passwordHash = await bcrypt.hash(employeeNumber, 10);
        const newUser = await prisma.user.create({
          data: {
            name,
            email,
            employeeNumber,
            passwordHash,
            role: "EMPLOYEE",
            birthDate,
            hireDate,
            terminationDate,
            employmentType,
            jobGrade,
            jobFamily,
            gender,
            businessUnit,
            division,
            ...(position ? { position } : {}),
            teamId,
          },
        });
        userId = newUser.id;
        created++;
      }

      await prisma.userTargetYear.upsert({
        where: { userId_year: { userId, year } },
        update: {},
        create: { userId, year },
      });

      if (position === "TEAM_LEADER" && teamId) {
        await prisma.team.update({ where: { id: teamId }, data: { leaderId: userId } });
        await prisma.user.updateMany({
          where: { id: userId, role: "EMPLOYEE" },
          data: { role: "EVALUATOR" },
        });
      }
    } catch {
      errors.push(`${rowNum}행: 저장 실패 (이메일 또는 사번이 다른 사용자와 중복될 수 있습니다).`);
    }
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/teams");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/org-chart");
  revalidatePath("/platform/org-chart/[teamId]", "page");
  revalidatePath("/platform/job-management");
  revalidatePath("/platform/job-management/[teamId]", "page");

  return { created, updated, errors };
}
