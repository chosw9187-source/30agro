"use server";

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

type PhotoUploadResult = {
  matched: number;
  unmatched: string[];
};

type RowUploadResult = {
  applied: number;
  errors: string[];
};

function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function str(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

export async function uploadEmployeePhotos(
  _prevState: PhotoUploadResult | undefined,
  formData: FormData
): Promise<PhotoUploadResult> {
  await requireRole("ADMIN");

  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  let matched = 0;
  const unmatched: string[] = [];

  for (const file of files) {
    const employeeNumber = file.name.replace(/\.[^./\\]+$/, "").trim();
    const user = await prisma.user.findUnique({ where: { employeeNumber } });

    if (!user) {
      unmatched.push(file.name);
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await prisma.user.update({
      where: { id: user.id },
      data: { photo: buffer, photoType: file.type || "image/jpeg" },
    });
    matched++;
  }

  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");

  return { matched, unmatched };
}

/**
 * 발령사항(인사발령 이력) 업로드. (사번, 발령일) 기준으로 upsert — 같은
 * 사번+발령일을 다시 올리면 그 기록이 갱신되고, 발령일이 다르면 새 이력으로
 * 누적됩니다.
 * 컬럼: 사번, 발령일, 발령구분, 발령명, 부서(또는 근무부서), 직위(또는 직책),
 * 직급, 발령내역.
 */
export async function uploadAppointmentRecords(
  _prevState: RowUploadResult | undefined,
  formData: FormData
): Promise<RowUploadResult> {
  await requireRole("ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { applied: 0, errors: ["파일을 선택해주세요."] };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  let applied = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const employeeNumber = str(row["사번"]);
    const date = parseExcelDate(row["발령일"]);

    if (!employeeNumber || !date) {
      errors.push(`${rowNum}행: 사번/발령일은 필수입니다.`);
      continue;
    }

    const user = await prisma.user.findUnique({ where: { employeeNumber } });
    if (!user) {
      errors.push(`${rowNum}행: 사번 ${employeeNumber}에 해당하는 직원이 없습니다.`);
      continue;
    }

    const type = str(row["발령구분"]);
    const title = str(row["발령명"]);
    const department = str(row["근무부서"]) ?? str(row["부서"]);
    const positionTitle = str(row["직책"]) ?? str(row["직위"]);
    const jobGrade = str(row["직급"]);
    const note = str(row["발령내역"]);

    const existing = await prisma.appointmentRecord.findFirst({
      where: { userId: user.id, date },
      select: { id: true },
    });
    if (existing) {
      await prisma.appointmentRecord.update({
        where: { id: existing.id },
        data: { type, title, department, positionTitle, jobGrade, note },
      });
    } else {
      await prisma.appointmentRecord.create({
        data: {
          userId: user.id,
          date,
          type,
          title,
          department,
          positionTitle,
          jobGrade,
          note,
        },
      });
    }
    applied++;
  }

  revalidatePath("/platform/employees/[userId]", "page");

  return { applied, errors };
}

/**
 * 이전(수정 전) 업로드 로직이 매번 새로 만들던 시절에 쌓인 중복 발령 이력을
 * 정리합니다. 같은 (사번, 발령일) 조합 중 가장 최근에 만들어진 것만 남기고
 * 나머지는 삭제합니다.
 */
export async function dedupeAppointmentRecords(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: { removed: number } | undefined
): Promise<{ removed: number }> {
  await requireRole("ADMIN");

  const all = await prisma.appointmentRecord.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, userId: true, date: true },
  });

  const seen = new Set<string>();
  const toDelete: string[] = [];
  for (const r of all) {
    const key = `${r.userId}|${r.date.toISOString()}`;
    if (seen.has(key)) {
      toDelete.push(r.id);
    } else {
      seen.add(key);
    }
  }

  if (toDelete.length > 0) {
    await prisma.appointmentRecord.deleteMany({ where: { id: { in: toDelete } } });
  }

  revalidatePath("/platform/employees/[userId]", "page");

  return { removed: toDelete.length };
}

const EDUCATION_LEVEL_ORDER: Record<string, number> = {
  고등학교: 0,
  대학교: 1,
  "대학원(석사)": 2,
  "대학원(박사)": 3,
};

/**
 * 학력 이력 업로드. (사번, 학력구분) 기준으로 upsert — 같은 학력구분을
 * 다시 올리면 갱신되고, 새 학력구분은 누적됩니다.
 * 컬럼: 사번, 학력구분(고등학교/대학교/대학원(석사)/대학원(박사)), 학교명,
 * 전공(선택), 학위(선택).
 */
export async function uploadEducationRecords(
  _prevState: RowUploadResult | undefined,
  formData: FormData
): Promise<RowUploadResult> {
  await requireRole("ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { applied: 0, errors: ["파일을 선택해주세요."] };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  let applied = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const employeeNumber = str(row["사번"]);
    const level = str(row["학력구분"]);

    if (!employeeNumber || !level) {
      errors.push(`${rowNum}행: 사번/학력구분은 필수입니다.`);
      continue;
    }

    const user = await prisma.user.findUnique({ where: { employeeNumber } });
    if (!user) {
      errors.push(`${rowNum}행: 사번 ${employeeNumber}에 해당하는 직원이 없습니다.`);
      continue;
    }

    const school = str(row["학교명"]) ?? str(row["학교"]);
    const major = str(row["전공"]);
    const degree = str(row["학위"]);
    const order = EDUCATION_LEVEL_ORDER[level] ?? 9;

    await prisma.educationRecord.upsert({
      where: { userId_level: { userId: user.id, level } },
      update: { school, major, degree, order },
      create: { userId: user.id, level, school, major, degree, order },
    });
    applied++;
  }

  revalidatePath("/platform/employees/[userId]", "page");

  return { applied, errors };
}

/**
 * 인사평가 이력 업로드. (사번, 연도) 기준으로 upsert — 같은 연도를 다시
 * 올리면 갱신되고, 새 연도는 누적됩니다.
 * 컬럼: 사번, 연도, 등급, 점수(선택), 비고(선택).
 */
export async function uploadPerformanceHistory(
  _prevState: RowUploadResult | undefined,
  formData: FormData
): Promise<RowUploadResult> {
  await requireRole("ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { applied: 0, errors: ["파일을 선택해주세요."] };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  let applied = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const employeeNumber = str(row["사번"]);
    const year = Number(row["연도"]);
    const grade = str(row["등급"]);
    const scoreRaw = row["점수"];
    const score =
      scoreRaw !== undefined && scoreRaw !== null && scoreRaw !== ""
        ? Number(scoreRaw)
        : null;
    const note = str(row["비고"]);

    if (!employeeNumber || !year || Number.isNaN(year)) {
      errors.push(`${rowNum}행: 사번/연도는 필수입니다.`);
      continue;
    }

    const user = await prisma.user.findUnique({ where: { employeeNumber } });
    if (!user) {
      errors.push(`${rowNum}행: 사번 ${employeeNumber}에 해당하는 직원이 없습니다.`);
      continue;
    }

    await prisma.performanceHistory.upsert({
      where: { userId_year: { userId: user.id, year } },
      update: { grade, score, note },
      create: { userId: user.id, year, grade, score, note },
    });
    applied++;
  }

  revalidatePath("/platform/employees/[userId]", "page");

  return { applied, errors };
}
