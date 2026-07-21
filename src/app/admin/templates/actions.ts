"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createTemplate(formData: FormData) {
  const session = await requireRole("ADMIN");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title) return;

  const template = await prisma.evaluationTemplate.create({
    data: {
      title,
      description: description || null,
      createdById: session.user.id,
    },
  });
  revalidatePath("/admin/templates");
  redirect(`/admin/templates/${template.id}`);
}

export async function deleteTemplate(templateId: string) {
  await requireRole("ADMIN");
  await prisma.evaluationTemplate.delete({ where: { id: templateId } });
  revalidatePath("/admin/templates");
  redirect("/admin/templates");
}

export async function addTemplateItem(templateId: string, formData: FormData) {
  await requireRole("ADMIN");
  const category = String(formData.get("category") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? "SCORE") as "SCORE" | "TEXT";
  const maxScore = Number(formData.get("maxScore") ?? 5) || 5;
  const teamId = String(formData.get("teamId") ?? "").trim();
  if (!label) return;

  const count = await prisma.templateItem.count({ where: { templateId } });
  await prisma.templateItem.create({
    data: {
      templateId,
      category,
      label,
      description: description || null,
      type,
      maxScore,
      order: count,
      teamId: teamId || null,
    },
  });
  revalidatePath(`/admin/templates/${templateId}`);
}

export async function deleteTemplateItem(templateId: string, itemId: string) {
  await requireRole("ADMIN");
  await prisma.templateItem.delete({ where: { id: itemId } });
  revalidatePath(`/admin/templates/${templateId}`);
}
