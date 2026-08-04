import { checkModuleAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  if (!(await checkModuleAccess("EMPLOYEES"))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { photo: true, photoType: true },
  });

  if (!user?.photo) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const body = new Uint8Array(user.photo);
  return new Response(body, {
    headers: {
      "Content-Type": user.photoType || "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
