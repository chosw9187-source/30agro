"use server";

import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { extractJobDescriptionFieldsFromPdf } from "@/lib/job-description-extract";

const SEED_DIR = path.join(process.cwd(), "prisma", "seed-data", "job-descriptions");

function isPdf(fileName: string, fileType: string): boolean {
  return fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

export async function saveJobDescription(teamId: string, formData: FormData) {
  await requireRole("ADMIN");

  const responsibilities = String(formData.get("responsibilities") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  const relatedDepartments = String(formData.get("relatedDepartments") ?? "").trim();
  const qualifications = String(formData.get("qualifications") ?? "").trim();
  const languages = String(formData.get("languages") ?? "").trim();

  await prisma.jobDescription.upsert({
    where: { teamId },
    update: {
      responsibilities: responsibilities || null,
      purpose: purpose || null,
      relatedDepartments: relatedDepartments || null,
      qualifications: qualifications || null,
      languages: languages || null,
    },
    create: {
      teamId,
      responsibilities: responsibilities || null,
      purpose: purpose || null,
      relatedDepartments: relatedDepartments || null,
      qualifications: qualifications || null,
      languages: languages || null,
    },
  });

  revalidatePath(`/platform/job-management/${teamId}`);
  revalidatePath("/platform/job-management");
}

export type SeedDraftResult = {
  filesFound: number;
  teamsMatched: number;
  purposeFilled: number;
  responsibilitiesFilled: number;
  qualificationsFilled: number;
  languagesFilled: number;
  unmatchedFiles: string[];
};

type Extraction = {
  purpose: string | null;
  responsibilities: string | null;
  qualifications: string | null;
  languages: string | null;
};

type Existing = {
  purpose: string | null;
  responsibilities: string | null;
  qualifications: string | null;
  languages: string | null;
};

function fillFromExtraction(existing: Existing | null, extracted: Extraction) {
  return {
    purpose: existing?.purpose ? undefined : extracted.purpose ?? undefined,
    responsibilities: existing?.responsibilities ? undefined : extracted.responsibilities ?? undefined,
    qualifications: existing?.qualifications ? undefined : extracted.qualifications ?? undefined,
    languages: existing?.languages ? undefined : extracted.languages ?? undefined,
  };
}

/**
 * One-time bulk-load of the draft "직무기술서 종합" PDF (split per team,
 * bundled under prisma/seed-data/job-descriptions) as each team's baseline
 * attachment. Re-running overwrites with the same draft files — real
 * uploads via uploadJobDescriptionFile are untouched unless this is run again.
 */
export async function seedJobDescriptionsFromDraft(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: SeedDraftResult | undefined
): Promise<SeedDraftResult> {
  await requireRole("ADMIN");

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const files = (await fs.readdir(SEED_DIR)).filter((f) => f.endsWith(".pdf"));

  const result: SeedDraftResult = {
    filesFound: files.length,
    teamsMatched: 0,
    purposeFilled: 0,
    responsibilitiesFilled: 0,
    qualificationsFilled: 0,
    languagesFilled: 0,
    unmatchedFiles: [],
  };

  for (const file of files) {
    const label = file.replace(/\.pdf$/, "");
    const buffer = await fs.readFile(path.join(SEED_DIR, file));

    const matches =
      label === "지점"
        ? teams.filter((t) => t.name.endsWith("지점"))
        : teams.filter((t) => t.name === label);

    if (matches.length === 0) {
      result.unmatchedFiles.push(file);
      continue;
    }
    const extracted = await extractJobDescriptionFieldsFromPdf(buffer);

    for (const team of matches) {
      result.teamsMatched++;
      const existing = await prisma.jobDescription.findUnique({
        where: { teamId: team.id },
        select: { purpose: true, responsibilities: true, qualifications: true, languages: true },
      });
      const fill = fillFromExtraction(existing, extracted);
      if (fill.purpose) result.purposeFilled++;
      if (fill.responsibilities) result.responsibilitiesFilled++;
      if (fill.qualifications) result.qualificationsFilled++;
      if (fill.languages) result.languagesFilled++;

      await prisma.jobDescription.upsert({
        where: { teamId: team.id },
        update: {
          fileName: file,
          fileType: "application/pdf",
          fileData: buffer,
          fileUpdatedAt: new Date(),
          ...(fill.purpose !== undefined ? { purpose: fill.purpose } : {}),
          ...(fill.responsibilities !== undefined ? { responsibilities: fill.responsibilities } : {}),
          ...(fill.qualifications !== undefined ? { qualifications: fill.qualifications } : {}),
          ...(fill.languages !== undefined ? { languages: fill.languages } : {}),
        },
        create: {
          teamId: team.id,
          fileName: file,
          fileType: "application/pdf",
          fileData: buffer,
          fileUpdatedAt: new Date(),
          purpose: extracted.purpose,
          responsibilities: extracted.responsibilities,
          qualifications: extracted.qualifications,
          languages: extracted.languages,
        },
      });
    }
  }

  revalidatePath("/platform/job-management");
  revalidatePath("/platform/job-management/[teamId]", "page");

  return result;
}

export type FileUploadResult = {
  fileName: string;
  purposeExtracted: boolean;
  responsibilitiesExtracted: boolean;
  qualificationsExtracted: boolean;
  languagesExtracted: boolean;
};

async function saveJobDescriptionFile(teamId: string, file: File): Promise<FileUploadResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = isPdf(file.name, file.type)
    ? await extractJobDescriptionFieldsFromPdf(buffer)
    : { purpose: null, responsibilities: null, qualifications: null, languages: null };

  const existing = await prisma.jobDescription.findUnique({
    where: { teamId },
    select: { purpose: true, responsibilities: true, qualifications: true, languages: true },
  });
  const fill = fillFromExtraction(existing, extracted);

  await prisma.jobDescription.upsert({
    where: { teamId },
    update: {
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileData: buffer,
      fileUpdatedAt: new Date(),
      ...(fill.purpose !== undefined ? { purpose: fill.purpose } : {}),
      ...(fill.responsibilities !== undefined ? { responsibilities: fill.responsibilities } : {}),
      ...(fill.qualifications !== undefined ? { qualifications: fill.qualifications } : {}),
      ...(fill.languages !== undefined ? { languages: fill.languages } : {}),
    },
    create: {
      teamId,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileData: buffer,
      fileUpdatedAt: new Date(),
      purpose: extracted.purpose,
      responsibilities: extracted.responsibilities,
      qualifications: extracted.qualifications,
      languages: extracted.languages,
    },
  });

  revalidatePath(`/platform/job-management/${teamId}`);
  revalidatePath("/platform/job-management");

  return {
    fileName: file.name,
    purposeExtracted: !!fill.purpose,
    responsibilitiesExtracted: !!fill.responsibilities,
    qualificationsExtracted: !!fill.qualifications,
    languagesExtracted: !!fill.languages,
  };
}

export async function uploadJobDescriptionFile(
  teamId: string,
  _prevState: FileUploadResult | undefined,
  formData: FormData
): Promise<FileUploadResult | undefined> {
  await requireRole("ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return undefined;

  return saveJobDescriptionFile(teamId, file);
}

export async function uploadJobDescriptionFileForTeam(formData: FormData) {
  await requireRole("ADMIN");

  const teamId = String(formData.get("teamId") ?? "").trim();
  const file = formData.get("file");
  if (!teamId || !(file instanceof File) || file.size === 0) return;

  await saveJobDescriptionFile(teamId, file);
}
