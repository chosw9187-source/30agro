"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

type PhotoUploadResult = {
  matched: number;
  unmatched: string[];
};

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
