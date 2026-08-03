"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

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
