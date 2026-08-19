import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { RegulationChat } from "./regulation-chat";
import { RegulationManager } from "./regulation-manager";

export const dynamic = "force-dynamic";

export default async function LegalLibraryPage() {
  if (!(await checkModuleAccess("LEGAL_LIBRARY"))) {
    return <NoModuleAccess title="인사 규정 챗봇" />;
  }

  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";

  const regulations = await prisma.regulation.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      articleCount: true,
      isActive: true,
      fileName: true,
    },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });

  const activeCount = regulations.filter((r) => r.isActive).length;

  return (
    <div className="flex flex-col gap-8">
      {/* 인사말은 삼공이 말풍선이 하므로 제목은 접근성·페이지 식별용으로만 둔다. */}
      <h1 className="sr-only">인사 규정 챗봇</h1>

      <RegulationChat hasRegulations={activeCount > 0} />

      {isAdmin && (
        <details className="mx-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-slate-700">
            규정 파일 관리 (관리자) · 등록 {regulations.length}건
          </summary>
          <div className="border-t border-slate-200 p-4">
            <RegulationManager regulations={regulations} />
          </div>
        </details>
      )}
    </div>
  );
}
