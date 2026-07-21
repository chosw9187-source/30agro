"use server";

import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

type ImportResult = {
  created: number;
  updated: number;
  errors: string[];
};

export async function importUsersFromExcel(
  _prevState: ImportResult | undefined,
  formData: FormData
): Promise<ImportResult> {
  await requireRole("ADMIN");

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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const name = String(row["이름"] ?? "").trim();
    const employeeNumber = String(row["사번"] ?? "").trim();
    const email = String(row["이메일주소"] ?? "").trim();
    const teamName = String(row["팀명"] ?? "").trim();

    if (!name || !employeeNumber || !email) {
      errors.push(`${rowNum}행: 이름/사번/이메일주소는 필수입니다.`);
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

      const existing = await prisma.user.findUnique({ where: { email } });

      if (existing) {
        await prisma.user.update({
          where: { email },
          data: { name, employeeNumber, teamId },
        });
        updated++;
      } else {
        const passwordHash = await bcrypt.hash(employeeNumber, 10);
        await prisma.user.create({
          data: {
            name,
            email,
            employeeNumber,
            passwordHash,
            role: "EMPLOYEE",
            teamId,
          },
        });
        created++;
      }
    } catch {
      errors.push(`${rowNum}행: 저장 실패 (이메일 또는 사번이 다른 사용자와 중복될 수 있습니다).`);
    }
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/teams");

  return { created, updated, errors };
}
