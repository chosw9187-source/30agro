import { ComingSoon } from "@/components/coming-soon";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";

export default async function LegalLibraryPage() {
  if (!(await checkModuleAccess("LEGAL_LIBRARY"))) {
    return <NoModuleAccess title="AI 법률 라이브러리" />;
  }

  return (
    <ComingSoon
      title="AI 법률 라이브러리"
      description="노동법/인사 관련 법률 자료를 AI로 검색할 예정입니다."
    />
  );
}
