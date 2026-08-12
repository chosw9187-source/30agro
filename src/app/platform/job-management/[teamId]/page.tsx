import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { saveJobDescription } from "../actions";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { JobFileUploadForm } from "../job-file-upload-form";
import { isActive } from "@/lib/hr-analytics";
import { formatKSTDate } from "@/lib/format-kst";

export const dynamic = "force-dynamic";

function Field({
  label,
  name,
  value,
  editable,
  rows = 3,
}: {
  label: string;
  name: string;
  value: string | null | undefined;
  editable: boolean;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {editable ? (
        <textarea
          name={name}
          rows={rows}
          defaultValue={value ?? ""}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
      ) : (
        <p className="whitespace-pre-wrap rounded border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {value || "미입력"}
        </p>
      )}
    </div>
  );
}

export default async function JobDescriptionDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  if (!(await checkModuleAccess("JOB_MANAGEMENT"))) {
    return <NoModuleAccess title="직무관리" />;
  }

  const { teamId } = await params;
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      leader: true,
      jobDescription: {
        select: {
          responsibilities: true,
          purpose: true,
          relatedDepartments: true,
          qualifications: true,
          languages: true,
          fileName: true,
          fileType: true,
          fileUpdatedAt: true,
        },
      },
    },
  });

  if (!team) notFound();

  const jd = team.jobDescription;

  const fields = (
    <div className="flex flex-col gap-4">
      <Field
        label="담당업무"
        name="responsibilities"
        value={jd?.responsibilities}
        editable={isAdmin}
      />
      <Field label="직무목적" name="purpose" value={jd?.purpose} editable={isAdmin} />
      <Field
        label="직무역량"
        name="relatedDepartments"
        value={jd?.relatedDepartments}
        editable={isAdmin}
        rows={1}
      />
      <Field
        label="자격사항"
        name="qualifications"
        value={jd?.qualifications}
        editable={isAdmin}
      />
      <Field
        label="외국어"
        name="languages"
        value={jd?.languages}
        editable={isAdmin}
        rows={1}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/platform/job-management"
        className="text-sm text-slate-500 hover:underline"
      >
        ← 직무관리
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{team.name} — 직무기술서</h1>
        <p className="mt-1 text-slate-600">
          {team.leader && isActive(team.leader) ? `${team.leader.name} 팀장` : "팀장 미지정"}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">직무기술서 첨부파일</h2>
        {jd?.fileName ? (
          <p className="text-sm text-slate-600">
            📎{" "}
            <a
              href={`/api/job-description/${team.id}/file`}
              className="text-brand-green hover:underline"
            >
              {jd.fileName}
            </a>
            {jd.fileUpdatedAt && (
              <span className="ml-2 text-slate-400">
                업데이트: {formatKSTDate(jd.fileUpdatedAt)}
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-slate-500">아직 첨부된 파일이 없습니다.</p>
        )}
        {isAdmin && <JobFileUploadForm teamId={team.id} />}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">요약 정보</h2>
        <p className="mb-4 text-sm text-slate-500">
          PDF 첨부파일을 업로드하면 직무목적·담당업무·자격사항·외국어는
          파일에서 자동으로 추출을 시도합니다(이미 입력되어 있으면 덮어쓰지
          않습니다). 문서 구조상 완벽하지 않을 수 있으니 내용을 확인 후
          필요하면 수정해주세요. 직무역량은 원본 문서에 정형화된 값이 없어
          자동 추출이 되지 않으니 직접 입력해주세요.
        </p>
        {isAdmin ? (
          <form action={saveJobDescription.bind(null, team.id)} className="flex flex-col gap-4">
            {fields}
            <button
              type="submit"
              className="self-start rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark"
            >
              저장
            </button>
          </form>
        ) : (
          fields
        )}
      </section>
    </div>
  );
}
