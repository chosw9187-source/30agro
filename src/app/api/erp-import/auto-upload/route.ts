import { prisma } from "@/lib/prisma";
import { createErpImportBatch } from "@/lib/erp-compute";
import { sendEmail } from "@/lib/send-email";

const SITE_URL = process.env.NEXTAUTH_URL || "https://30agro-production.up.railway.app";

async function notifyIfConfigured(subject: string, html: string) {
  const to = process.env.ERP_ADMIN_NOTIFY_EMAIL;
  if (!to) return;
  await sendEmail({ to, subject, html });
}

/**
 * 로컬 자동 업로드 스크립트 전용 엔드포인트. 로그인 세션이 아니라
 * ERP_AUTO_UPLOAD_TOKEN 고정 토큰으로 인증한다. 어떤 경우에도
 * createErpImportBatch까지만 실행 — 실제 반영(applyErpBatch)은 절대
 * 자동으로 하지 않고 항상 관리자가 검토 화면에서 직접 승인해야 한다.
 */
export async function POST(request: Request) {
  const token = process.env.ERP_AUTO_UPLOAD_TOKEN;
  if (!token) {
    return Response.json({ error: "ERP_AUTO_UPLOAD_TOKEN이 설정되어 있지 않습니다." }, { status: 501 });
  }
  if (request.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json({ error: "인증 실패" }, { status: 401 });
  }

  const uploaderEmail = process.env.ERP_AUTO_UPLOAD_UPLOADER_EMAIL;
  const uploader = uploaderEmail
    ? await prisma.user.findUnique({ where: { email: uploaderEmail } })
    : await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!uploader) {
    return Response.json(
      { error: "업로드를 귀속시킬 관리자 계정을 찾을 수 없습니다 (ERP_AUTO_UPLOAD_UPLOADER_EMAIL 확인)." },
      { status: 500 }
    );
  }

  let file: File;
  try {
    const formData = await request.formData();
    const f = formData.get("file");
    if (!(f instanceof File) || f.size === 0) {
      return Response.json({ error: "파일이 없습니다." }, { status: 400 });
    }
    file = f;
  } catch (e) {
    const message = e instanceof Error ? e.message : "요청 본문을 읽는 중 오류가 발생했습니다.";
    await notifyIfConfigured(
      "[HR플랫폼] ERP 자동 업로드 실패",
      `<p>자동 업로드 요청을 처리하지 못했습니다 (파일 전송 형식 문제일 수 있습니다).</p><p>${message}</p>`
    );
    return Response.json({ error: message }, { status: 400 });
  }

  let result;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    result = await createErpImportBatch(buffer, file.name, uploader.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "파일 처리 중 오류가 발생했습니다.";
    await notifyIfConfigured(
      "[HR플랫폼] ERP 자동 업로드 실패",
      `<p>파일 <strong>${file.name}</strong> 자동 업로드 처리 중 오류가 발생했습니다.</p><p>${message}</p><p>ERP에서 다시 내려받아 <a href="${SITE_URL}/platform/data-upload/erp-import">ERP 연동 화면</a>에서 직접 업로드해주세요.</p>`
    );
    return Response.json({ error: message }, { status: 400 });
  }

  const errorCount = result.counts["ERROR"] ?? 0;
  const needsMappingCount = result.counts["NEEDS_MAPPING"] ?? 0;
  if (errorCount + needsMappingCount > 0) {
    await notifyIfConfigured(
      "[HR플랫폼] ERP 업로드 검토 필요",
      `<p>${file.name} 자동 업로드 결과 검토가 필요합니다.</p>
       <ul>
         <li>매핑 필요: ${needsMappingCount}건</li>
         <li>오류: ${errorCount}건</li>
       </ul>
       <p><a href="${SITE_URL}/platform/data-upload/erp-import/${result.batchId}">검토 화면 바로가기</a></p>`
    );
  }

  return Response.json({
    batchId: result.batchId,
    totalRows: result.totalRows,
    counts: result.counts,
  });
}
