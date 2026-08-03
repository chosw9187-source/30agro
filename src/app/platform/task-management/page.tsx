import { ComingSoon } from "@/components/coming-soon";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";

export default async function TaskManagementPage() {
  if (!(await checkModuleAccess("TASK_MANAGEMENT"))) {
    return <NoModuleAccess title="업무 관리" />;
  }

  return (
    <ComingSoon
      title="업무 관리"
      description="팀/개인 업무 배정과 진행 현황을 관리할 예정입니다."
    />
  );
}
