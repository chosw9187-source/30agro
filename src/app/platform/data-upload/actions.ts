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

export async function deleteEducationRecord(recordId: string) {
  await requireRole("ADMIN");
  const record = await prisma.educationRecord.delete({ where: { id: recordId } });
  revalidatePath(`/platform/employees/${record.userId}`);
}

export async function deleteAllEducationRecords(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: { deleted: number } | undefined
): Promise<{ deleted: number }> {
  await requireRole("ADMIN");
  const { count } = await prisma.educationRecord.deleteMany({});
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
  return { deleted: count };
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

/** 인사카드 화면에서 학력 한 건을 직접 추가/수정(같은 학력구분+학교명이면 갱신). */
export async function addEducationRecord(userId: string, formData: FormData) {
  await requireRole("ADMIN");
  const level = str(formData.get("level"));
  if (!level) return;

  const school = str(formData.get("school")) ?? "";
  const major = str(formData.get("major"));
  const degree = str(formData.get("degree"));
  const order = EDUCATION_LEVEL_ORDER[level] ?? 9;
  const admissionDate = parseExcelDate(formData.get("admissionDate"));
  const graduationDate = parseExcelDate(formData.get("graduationDate"));

  await prisma.educationRecord.upsert({
    where: { userId_level_school: { userId, level, school } },
    update: { major, degree, order, admissionDate, graduationDate },
    create: { userId, level, school, major, degree, order, admissionDate, graduationDate },
  });
  revalidatePath(`/platform/employees/${userId}`);
}

/** 인사카드 화면에서 경력사항 한 건을 직접 추가. */
export async function addCareerHistory(userId: string, formData: FormData) {
  await requireRole("ADMIN");
  const company = str(formData.get("company"));
  if (!company) return;

  await prisma.careerHistory.create({
    data: {
      userId,
      company,
      title: str(formData.get("title")),
      duties: str(formData.get("duties")),
      startDate: parseExcelDate(formData.get("startDate")),
      endDate: parseExcelDate(formData.get("endDate")),
    },
  });
  revalidatePath(`/platform/employees/${userId}`);
}

export async function deleteCareerHistory(recordId: string) {
  await requireRole("ADMIN");
  const record = await prisma.careerHistory.delete({ where: { id: recordId } });
  revalidatePath(`/platform/employees/${record.userId}`);
}

export async function addCertification(userId: string, formData: FormData) {
  await requireRole("ADMIN");
  const name = str(formData.get("name"));
  if (!name) return;

  await prisma.certification.create({
    data: {
      userId,
      name,
      issuer: str(formData.get("issuer")),
      certNumber: str(formData.get("certNumber")),
      acquiredDate: parseExcelDate(formData.get("acquiredDate")),
      expiryDate: parseExcelDate(formData.get("expiryDate")),
    },
  });
  revalidatePath(`/platform/employees/${userId}`);
}

export async function deleteCertification(recordId: string) {
  await requireRole("ADMIN");
  const record = await prisma.certification.delete({ where: { id: recordId } });
  revalidatePath(`/platform/employees/${record.userId}`);
}

export async function addCommendationDiscipline(userId: string, formData: FormData) {
  await requireRole("ADMIN");
  const type = str(formData.get("type"));
  if (!type) return;

  await prisma.commendationDiscipline.create({
    data: {
      userId,
      type,
      category: str(formData.get("category")),
      reason: str(formData.get("reason")),
      authority: str(formData.get("authority")),
      startDate: parseExcelDate(formData.get("startDate")),
      endDate: parseExcelDate(formData.get("endDate")),
    },
  });
  revalidatePath(`/platform/employees/${userId}`);
}

export async function deleteCommendationDiscipline(recordId: string) {
  await requireRole("ADMIN");
  const record = await prisma.commendationDiscipline.delete({ where: { id: recordId } });
  revalidatePath(`/platform/employees/${record.userId}`);
}

/** 인사카드 화면에서 발령 이력 한 건을 직접 추가. */
export async function addAppointmentRecord(userId: string, formData: FormData) {
  await requireRole("ADMIN");
  const date = parseExcelDate(formData.get("date"));
  if (!date) return;

  await prisma.appointmentRecord.create({
    data: {
      userId,
      date,
      type: str(formData.get("type")),
      title: str(formData.get("title")),
      department: str(formData.get("department")),
      positionTitle: str(formData.get("positionTitle")),
      jobGrade: str(formData.get("jobGrade")),
      note: str(formData.get("note")),
    },
  });
  revalidatePath(`/platform/employees/${userId}`);
}

export async function deleteAppointmentRecord(recordId: string) {
  await requireRole("ADMIN");
  const record = await prisma.appointmentRecord.delete({ where: { id: recordId } });
  revalidatePath(`/platform/employees/${record.userId}`);
}

/** 인사카드 화면에서 인사평가 이력 한 건을 직접 추가/수정(같은 연도면 갱신). */
export async function addPerformanceHistory(userId: string, formData: FormData) {
  await requireRole("ADMIN");
  const year = Number(formData.get("year"));
  if (!year || Number.isNaN(year)) return;

  const scoreRaw = str(formData.get("score"));
  const score = scoreRaw ? Number(scoreRaw) : null;

  await prisma.performanceHistory.upsert({
    where: { userId_year: { userId, year } },
    update: { grade: str(formData.get("grade")), score, note: str(formData.get("note")) },
    create: {
      userId,
      year,
      grade: str(formData.get("grade")),
      score,
      note: str(formData.get("note")),
    },
  });
  revalidatePath(`/platform/employees/${userId}`);
}

export async function deletePerformanceHistory(recordId: string) {
  await requireRole("ADMIN");
  const record = await prisma.performanceHistory.delete({ where: { id: recordId } });
  revalidatePath(`/platform/employees/${record.userId}`);
}

export type HrCardBulkUploadResult = {
  appointments: RowUploadResult;
  education: RowUploadResult;
  certifications: RowUploadResult;
  commendationDiscipline: RowUploadResult;
};

/**
 * 발령사항/학력사항/자격사항/상벌사항을 시트 4개짜리 엑셀 한 번에 업로드. 시트
 * 이름은 "발령사항"/"학력사항"/"자격사항"/"상벌사항" 중 있는 것만 처리하고,
 * 없는 시트는 건너뜁니다. 발령사항·학력사항은 upsert, 자격사항/상벌사항은
 * 매번 새로 추가합니다.
 */
export async function uploadHrCardBulk(
  _prevState: HrCardBulkUploadResult | undefined,
  formData: FormData
): Promise<HrCardBulkUploadResult> {
  await requireRole("ADMIN");

  const result: HrCardBulkUploadResult = {
    appointments: { applied: 0, errors: [] },
    education: { applied: 0, errors: [] },
    certifications: { applied: 0, errors: [] },
    commendationDiscipline: { applied: 0, errors: [] },
  };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    result.appointments.errors.push("파일을 선택해주세요.");
    return result;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  async function findUser(employeeNumber: string) {
    return prisma.user.findUnique({ where: { employeeNumber }, select: { id: true } });
  }

  const appointmentSheet = workbook.Sheets["발령사항"];
  if (appointmentSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(appointmentSheet);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const employeeNumber = str(row["사번"]);
      const date = parseExcelDate(row["발령일"]);
      if (!employeeNumber || !date) {
        result.appointments.errors.push(`${rowNum}행: 사번/발령일은 필수입니다.`);
        continue;
      }
      const user = await findUser(employeeNumber);
      if (!user) {
        result.appointments.errors.push(`${rowNum}행: 사번 ${employeeNumber}에 해당하는 직원이 없습니다.`);
        continue;
      }
      const data = {
        type: str(row["발령구분"]),
        title: str(row["발령명"]),
        department: str(row["근무부서"]) ?? str(row["부서"]),
        positionTitle: str(row["직책"]) ?? str(row["직위"]),
        jobGrade: str(row["직급"]),
        note: str(row["발령내역"]),
      };
      const existing = await prisma.appointmentRecord.findFirst({
        where: { userId: user.id, date },
        select: { id: true },
      });
      if (existing) {
        await prisma.appointmentRecord.update({ where: { id: existing.id }, data });
      } else {
        await prisma.appointmentRecord.create({ data: { userId: user.id, date, ...data } });
      }
      result.appointments.applied++;
    }
  }

  const educationSheet = workbook.Sheets["학력사항"];
  if (educationSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(educationSheet);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const employeeNumber = str(row["사번"]);
      const level = str(row["학력구분"]);
      if (!employeeNumber || !level) {
        result.education.errors.push(`${rowNum}행: 사번/학력구분은 필수입니다.`);
        continue;
      }
      const user = await findUser(employeeNumber);
      if (!user) {
        result.education.errors.push(`${rowNum}행: 사번 ${employeeNumber}에 해당하는 직원이 없습니다.`);
        continue;
      }
      const school = str(row["학교명"]) ?? str(row["학교"]) ?? "";
      const data = {
        major: str(row["전공"]),
        degree: str(row["학위"]),
        order: EDUCATION_LEVEL_ORDER[level] ?? 9,
        admissionDate: parseExcelDate(row["입학년월"]),
        graduationDate: parseExcelDate(row["졸업년월"]),
      };
      await prisma.educationRecord.upsert({
        where: { userId_level_school: { userId: user.id, level, school } },
        update: data,
        create: { userId: user.id, level, school, ...data },
      });
      result.education.applied++;
    }
  }

  const certSheet = workbook.Sheets["자격사항"];
  if (certSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(certSheet);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const employeeNumber = str(row["사번"]);
      const name = str(row["자격증"]);
      if (!employeeNumber || !name) {
        result.certifications.errors.push(`${rowNum}행: 사번/자격증은 필수입니다.`);
        continue;
      }
      const user = await findUser(employeeNumber);
      if (!user) {
        result.certifications.errors.push(`${rowNum}행: 사번 ${employeeNumber}에 해당하는 직원이 없습니다.`);
        continue;
      }
      await prisma.certification.create({
        data: {
          userId: user.id,
          name,
          issuer: str(row["발급기관"]),
          certNumber: str(row["자격번호"]),
          acquiredDate: parseExcelDate(row["취득일"]),
          expiryDate: parseExcelDate(row["만료일"]),
        },
      });
      result.certifications.applied++;
    }
  }

  const cdSheet = workbook.Sheets["상벌사항"];
  if (cdSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(cdSheet);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const employeeNumber = str(row["사번"]);
      const type = str(row["구분"]);
      if (!employeeNumber || !type) {
        result.commendationDiscipline.errors.push(`${rowNum}행: 사번/구분(상 또는 벌)은 필수입니다.`);
        continue;
      }
      const user = await findUser(employeeNumber);
      if (!user) {
        result.commendationDiscipline.errors.push(`${rowNum}행: 사번 ${employeeNumber}에 해당하는 직원이 없습니다.`);
        continue;
      }
      await prisma.commendationDiscipline.create({
        data: {
          userId: user.id,
          type,
          category: str(row["종류"]),
          reason: str(row["사유"]),
          authority: str(row["기관"]),
          startDate: parseExcelDate(row["시작일"]),
          endDate: parseExcelDate(row["종료일"]),
        },
      });
      result.commendationDiscipline.applied++;
    }
  }

  revalidatePath("/platform/employees/[userId]", "page");
  return result;
}
