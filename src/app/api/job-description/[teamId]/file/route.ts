import { checkModuleAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  if (!(await checkModuleAccess("JOB_MANAGEMENT"))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { teamId } = await params;
  const jd = await prisma.jobDescription.findUnique({
    where: { teamId },
    select: { fileData: true, fileName: true, fileType: true },
  });

  if (!jd?.fileData) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const body = new Uint8Array(jd.fileData);
  return new Response(body, {
    headers: {
      "Content-Type": jd.fileType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(jd.fileName || "job-description")}`,
    },
  });
}
