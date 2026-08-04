"use server";

import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { extractJobDescriptionFieldsFromPdf } from "@/lib/job-description-extract";

const SEED_DIR = path.join(process.cwd(), "prisma", "seed-data", "job-descriptions");

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

/**
 * One-time bulk-load of the draft "직무기술서 종합" PDF (split per team,
 * bundled under prisma/seed-data/job-descriptions) as each team's baseline
 * attachment. Re-running overwrites with the same draft files — real
 * uploads via uploadJobDescriptionFile are untouched unless this is run again.
 */
export async function seedJobDescriptionsFromDraft() {
  await requireRole("ADMIN");

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const files = await fs.readdir(SEED_DIR);

  for (const file of files) {
    if (!file.endsWith(".pdf")) continue;
    const label = file.replace(/\.pdf$/, "");
    const buffer = await fs.readFile(path.join(SEED_DIR, file));

    const matches =
      label === "지점"
        ? teams.filter((t) => t.name.endsWith("지점"))
        : teams.filter((t) => t.name === label);

    if (matches.length === 0) continue;
    const extracted = await extractJobDescriptionFieldsFromPdf(buffer);

    for (const team of matches) {
      const existing = await prisma.jobDescription.findUnique({
        where: { teamId: team.id },
        select: { purpose: true, responsibilities: true },
      });
      const purpose = existing?.purpose ? undefined : extracted.purpose ?? undefined;
      const responsibilities = existing?.responsibilities
        ? undefined
        : extracted.responsibilities ?? undefined;

      await prisma.jobDescription.upsert({
        where: { teamId: team.id },
        update: {
          fileName: file,
          fileType: "application/pdf",
          fileData: buffer,
          fileUpdatedAt: new Date(),
          ...(purpose !== undefined ? { purpose } : {}),
          ...(responsibilities !== undefined ? { responsibilities } : {}),
        },
        create: {
          teamId: team.id,
          fileName: file,
          fileType: "application/pdf",
          fileData: buffer,
          fileUpdatedAt: new Date(),
          purpose: extracted.purpose,
          responsibilities: extracted.responsibilities,
        },
      });
    }
  }

  revalidatePath("/platform/job-management");
}

async function saveJobDescriptionFile(teamId: string, file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted =
    file.type === "application/pdf"
      ? await extractJobDescriptionFieldsFromPdf(buffer)
      : { purpose: null, responsibilities: null };

  const existing = await prisma.jobDescription.findUnique({
    where: { teamId },
    select: { purpose: true, responsibilities: true },
  });
  const purpose = existing?.purpose ? undefined : extracted.purpose ?? undefined;
  const responsibilities = existing?.responsibilities
    ? undefined
    : extracted.responsibilities ?? undefined;

  await prisma.jobDescription.upsert({
    where: { teamId },
    update: {
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileData: buffer,
      fileUpdatedAt: new Date(),
      ...(purpose !== undefined ? { purpose } : {}),
      ...(responsibilities !== undefined ? { responsibilities } : {}),
    },
    create: {
      teamId,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileData: buffer,
      fileUpdatedAt: new Date(),
      purpose: extracted.purpose,
      responsibilities: extracted.responsibilities,
    },
  });

  revalidatePath(`/platform/job-management/${teamId}`);
  revalidatePath("/platform/job-management");
}

export async function uploadJobDescriptionFile(teamId: string, formData: FormData) {
  await requireRole("ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;

  await saveJobDescriptionFile(teamId, file);
}

export async function uploadJobDescriptionFileForTeam(formData: FormData) {
  await requireRole("ADMIN");

  const teamId = String(formData.get("teamId") ?? "").trim();
  const file = formData.get("file");
  if (!teamId || !(file instanceof File) || file.size === 0) return;

  await saveJobDescriptionFile(teamId, file);
}
