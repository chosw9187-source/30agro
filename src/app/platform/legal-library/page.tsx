import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { RegulationSearch } from "./regulation-search";
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">인사 규정 챗봇</h1>
        <p className="mt-1 text-slate-600">
          사내규정을 조(條) 단위로 찾습니다. 검색어와 관련된 조문을 근거 조항 그대로 보여줍니다.
          자연어로 묻고 답하는 기능은 준비 중입니다.
        </p>
      </div>

      <RegulationSearch hasRegulations={activeCount > 0} />

      {isAdmin && <RegulationManager regulations={regulations} />}
    </div>
  );
}
