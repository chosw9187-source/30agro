import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { RegulationChat } from "./regulation-chat";

export const dynamic = "force-dynamic";

export default async function LegalLibraryPage() {
  if (!(await checkModuleAccess("LEGAL_LIBRARY"))) {
    return <NoModuleAccess title="인사 규정 챗봇" />;
  }

  // 규정 파일 등록·삭제는 관리자 > 데이터 업로드 화면으로 옮겼다. 여기서는
  // 챗봇에게 물어볼 규정이 하나라도 있는지만 알면 된다.
  const activeCount = await prisma.regulation.count({ where: { isActive: true } });

  return (
    <div className="flex flex-col gap-8">
      {/* 인사말은 삼공이 말풍선이 하므로 제목은 접근성·페이지 식별용으로만 둔다. */}
      <h1 className="sr-only">인사 규정 챗봇</h1>

      <RegulationChat hasRegulations={activeCount > 0} />
    </div>
  );
}
