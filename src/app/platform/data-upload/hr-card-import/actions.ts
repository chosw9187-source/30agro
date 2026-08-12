"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { renderMaskedHrCardImage } from "@/lib/hr-card-mask";
import { extractHrCardFromImage, type ExtractedHrCard } from "@/lib/hr-card-extract";

export type HrCardExtractResult = {
  fileName: string;
  data?: ExtractedHrCard;
  matchedUserId?: string;
  matchedUserName?: string;
  error?: string;
};

function parseDateString(s: string | undefined): Date | null {
  if (!s) return null;
  const normalized = /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

const EDUCATION_LEVEL_ORDER: Record<string, number> = {
  고등학교: 0,
  고졸: 0,
  대학교: 1,
  대졸: 1,
  전문대졸: 1,
  "대학원(석사)": 2,
  "대학원졸업(석사)": 2,
  "대학원(박사)": 3,
  "대학원졸업(박사)": 3,
};

/**
 * PDF 여러 개를 한 번에 업로드해서, [개인사항]을 가리고 [가족사항] 이후를
 * 잘라낸 이미지만 Claude로 보내 발령사항/학력사항을 추출한다. DB에는
 * 아직 아무것도 저장하지 않는다 — 화면에서 검토 후 saveHrCardData를
 * 별도로 호출해야 실제 반영된다.
 */
export async function extractHrCardPdfs(formData: FormData): Promise<HrCardExtractResult[]> {
  await requireRole("ADMIN");

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return [];

  const results: HrCardExtractResult[] = [];
  for (const file of files) {
    try {
      const pdfBuffer = Buffer.from(await file.arrayBuffer());
      const maskedImage = await renderMaskedHrCardImage(pdfBuffer);
      const data = await extractHrCardFromImage(maskedImage);
      const user = await prisma.user.findUnique({
        where: { employeeNumber: data.employeeNumber },
        select: { id: true, name: true },
      });
      results.push({
        fileName: file.name,
        data,
        matchedUserId: user?.id,
        matchedUserName: user?.name,
      });
    } catch (e) {
      results.push({ fileName: file.name, error: e instanceof Error ? e.message : "추출 실패" });
    }
  }
  return results;
}

type SaveInput = {
  userId: string;
  data: ExtractedHrCard;
};

export type HrCardSaveResult = {
  saved: number;
  errors: string[];
};

/** 검토 화면에서 관리자가 승인한 사람들만 실제 DB에 반영한다. */
export async function saveHrCardData(inputs: SaveInput[]): Promise<HrCardSaveResult> {
  await requireRole("ADMIN");

  const result: HrCardSaveResult = { saved: 0, errors: [] };

  for (const { userId, data } of inputs) {
    try {
      for (const c of data.careerHistory) {
        await prisma.careerHistory.create({
          data: {
            userId,
            company: c.company,
            title: c.title || null,
            duties: c.duties || null,
            startDate: parseDateString(c.startDate),
            endDate: parseDateString(c.endDate),
          },
        });
      }

      for (const a of data.appointmentHistory) {
        const date = parseDateString(a.date);
        if (!date) continue;
        const positionTitle = [a.role, a.position].filter(Boolean).join(" / ") || null;
        const existing = await prisma.appointmentRecord.findFirst({
          where: { userId, date },
          select: { id: true },
        });
        const recordData = {
          type: a.type || null,
          department: a.department || null,
          positionTitle,
          jobGrade: a.jobGrade || null,
          note: a.note || null,
        };
        if (existing) {
          await prisma.appointmentRecord.update({ where: { id: existing.id }, data: recordData });
        } else {
          await prisma.appointmentRecord.create({ data: { userId, date, ...recordData } });
        }
      }

      for (const ed of data.education) {
        const school = ed.school || "";
        const order = EDUCATION_LEVEL_ORDER[ed.level] ?? 9;
        await prisma.educationRecord.upsert({
          where: { userId_level_school: { userId, level: ed.level, school } },
          update: {
            major: ed.major || null,
            degree: ed.degree || null,
            order,
            admissionDate: parseDateString(ed.admissionDate),
            graduationDate: parseDateString(ed.graduationDate),
          },
          create: {
            userId,
            level: ed.level,
            school,
            major: ed.major || null,
            degree: ed.degree || null,
            order,
            admissionDate: parseDateString(ed.admissionDate),
            graduationDate: parseDateString(ed.graduationDate),
          },
        });
      }

      result.saved++;
    } catch (e) {
      result.errors.push(`${data.name}(${data.employeeNumber}): ${e instanceof Error ? e.message : "저장 실패"}`);
    }
  }

  revalidatePath("/platform/employees/[userId]", "page");
  return result;
}
