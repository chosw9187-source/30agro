import { ComingSoon } from "@/components/coming-soon";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";

export default async function HrReportPage() {
  if (!(await checkModuleAccess("HR_REPORT"))) {
    return <NoModuleAccess title="HR REPORT" />;
  }

  return (
    <ComingSoon
      title="HR REPORT"
      description="법인별/조직별 인원 현황과 리포트를 제공할 예정입니다."
    />
  );
}
