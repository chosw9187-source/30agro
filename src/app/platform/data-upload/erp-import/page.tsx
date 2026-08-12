import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NoModuleAccess } from "@/components/no-module-access";
import { ErpUploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: "검토중",
  APPLIED: "반영완료",
  DISCARDED: "폐기됨",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING_REVIEW: "bg-amber-100 text-amber-700",
  APPLIED: "bg-emerald-100 text-emerald-700",
  DISCARDED: "bg-slate-100 text-slate-500",
};

export default async function ErpImportIndexPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return <NoModuleAccess title="ERP 사원명부 연동" />;
  }

  const batches = await prisma.erpImportBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      uploadedBy: { select: { name: true } },
      _count: { select: { rows: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/platform/data-upload" className="text-sm text-brand-green hover:underline">
          ← 데이터 업로드로 돌아가기
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">ERP 사원명부 연동</h1>
        <p className="mt-1 text-slate-600">
          ERP 원본 사원명부를 매일 업로드해서 재직자 기준으로 직원 정보를
          자동 갱신합니다.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">새 배치 업로드</h2>
        <ErpUploadForm />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">업로드 이력</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-slate-500">아직 업로드된 배치가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-4">업로드 일시</th>
                  <th className="py-2 pr-4">파일명</th>
                  <th className="py-2 pr-4">업로더</th>
                  <th className="py-2 pr-4">행 수</th>
                  <th className="py-2 pr-4">상태</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      <Link
                        href={`/platform/data-upload/erp-import/${b.id}`}
                        className="text-brand-green-dark hover:underline"
                      >
                        {b.createdAt.toLocaleString("ko-KR")}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{b.fileName}</td>
                    <td className="py-2 pr-4">{b.uploadedBy.name}</td>
                    <td className="py-2 pr-4">{b._count.rows}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[b.status]}`}>
                        {STATUS_LABEL[b.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
