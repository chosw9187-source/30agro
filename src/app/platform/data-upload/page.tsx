import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NoModuleAccess } from "@/components/no-module-access";
import { ImportUsersForm } from "@/app/admin/users/import-form";
import { PhotoUploadForm } from "./photo-upload-form";
import { AppointmentUploadForm } from "./appointment-upload-form";
import { DedupeAppointmentForm } from "./dedupe-appointment-form";
import { PerformanceHistoryUploadForm } from "./performance-history-upload-form";
import { EducationUploadForm } from "./education-upload-form";
import { uploadJobDescriptionFileForTeam } from "@/app/platform/job-management/actions";

export const dynamic = "force-dynamic";

export default async function DataUploadPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return <NoModuleAccess title="데이터 업로드" />;
  }

  const thisYear = new Date().getFullYear();
  const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">데이터 업로드</h1>
        <p className="mt-1 text-slate-600">
          사원명부, 직원 사진, 직무기술서, 발령사항, 인사평가 이력을 이
          화면에서 한 번에 업로드하세요.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">사원명부 일괄 업로드</h2>
        <ImportUsersForm defaultYear={thisYear} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">직원 사진 일괄 업로드</h2>
        <PhotoUploadForm />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">직무기술서 업로드</h2>
        <form action={uploadJobDescriptionFileForTeam} className="flex flex-col gap-3">
          <p className="text-sm text-slate-500">
            팀을 선택하고 파일을 업로드하세요. 기존 파일이 있으면 덮어씁니다.
          </p>
          <select
            name="teamId"
            required
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">팀 선택</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.doc,.docx,.xls,.xlsx,.hwp,.hwpx"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="self-start rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark"
          >
            업로드
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">발령사항 업로드</h2>
        <AppointmentUploadForm />
        <div className="mt-6 border-t border-slate-100 pt-6">
          <DedupeAppointmentForm />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">인사평가 이력 업로드</h2>
        <PerformanceHistoryUploadForm />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">학력 업로드</h2>
        <EducationUploadForm />
      </section>
    </div>
  );
}
