import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NoModuleAccess } from "@/components/no-module-access";
import { ImportUsersForm } from "@/app/admin/users/import-form";
import { PhotoUploadForm } from "./photo-upload-form";
import { HrCardBulkUploadForm } from "./hr-card-bulk-upload-form";
import { PerformanceHistoryUploadForm } from "./performance-history-upload-form";
import { uploadJobDescriptionFileForTeam } from "@/app/platform/job-management/actions";
import { RegulationManager } from "@/app/platform/legal-library/regulation-manager";

export const dynamic = "force-dynamic";

export default async function DataUploadPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return <NoModuleAccess title="데이터 업로드" />;
  }

  const thisYear = new Date().getFullYear();
  const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">데이터 업로드</h1>
        <p className="mt-1 text-slate-600">
          사원명부, 직원 사진, 직무기술서, 발령사항, 인사평가 이력, 인사
          규정을 이 화면에서 한 번에 업로드하세요.
        </p>
      </div>

      <section className="rounded-lg border border-brand-green bg-brand-green-light/30 p-6">
        <h2 className="mb-2 text-lg font-medium">ERP 사원명부 연동 (일일 갱신)</h2>
        <p className="mb-3 text-sm text-slate-600">
          ERP에서 뽑은 원본 사원명부를 그대로 업로드하면 재직자 기준으로
          신규/변경/퇴직전환을 자동 분류해서 미리보기로 보여주고, 승인한
          내용만 반영합니다. 매일 올리는 용도로는 이쪽을 사용하세요.
        </p>
        <Link
          href="/platform/data-upload/erp-import"
          className="inline-block rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark"
        >
          ERP 연동 화면으로 이동
        </Link>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-2 text-lg font-medium">인사카드 PDF 업로드</h2>
        <p className="mb-3 text-sm text-slate-500">
          인사기록카드 PDF에서 경력사항·발령사항·학력사항만 추출합니다(주소·연락처·가족정보는 자동으로
          가려짐). 자주 있는 일이 아니라 수동 업로드용입니다.
        </p>
        <Link
          href="/platform/data-upload/hr-card-import"
          className="inline-block rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark"
        >
          인사카드 업로드 화면으로 이동
        </Link>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">사원명부 일괄 업로드</h2>
        <p className="mb-2 text-sm text-slate-500">
          정해진 양식(사번/이름/이메일주소/팀명 등 표준 헤더)에 맞춰 만든
          엑셀을 즉시 반영할 때 사용하세요. ERP 원본 파일은 위 &ldquo;ERP 사원명부
          연동&rdquo;을 이용하세요.
        </p>
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
        <h2 className="mb-3 text-lg font-medium">발령/학력/경력/자격/상벌 일괄 업로드</h2>
        <HrCardBulkUploadForm />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">인사평가 이력 업로드</h2>
        <PerformanceHistoryUploadForm />
      </section>

      {/* 인사 규정 챗봇(삼공이) 화면에 있던 관리자 패널을 여기로 옮겼다.
          RegulationManager가 제목과 카드까지 직접 그리므로 감싸지 않는다. */}
      <RegulationManager regulations={regulations} />
    </div>
  );
}
