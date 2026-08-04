import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess, canViewEmployeeCard } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { POSITION_LABEL, type Position } from "@/lib/permission-constants";
import { ageInYears, tenureInYears } from "@/lib/hr-analytics";
import { BackLink } from "@/components/back-link";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  return d ? d.toLocaleDateString("ko-KR") : "-";
}

function fmtBirthDate(d: Date | null) {
  if (!d) return "-";
  return `${fmtDate(d)} (만 ${ageInYears(d)}세)`;
}

function fmtHireDate(d: Date | null) {
  if (!d) return "-";
  return `${fmtDate(d)} (근속 ${tenureInYears(d).toFixed(1)}년)`;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-800">{value || "-"}</dd>
    </div>
  );
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  if (!(await checkModuleAccess("EMPLOYEES"))) {
    return <NoModuleAccess title="직원정보 조회" />;
  }

  const { userId } = await params;

  if (!(await canViewEmployeeCard(userId))) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink fallbackHref="/platform/employees" label="목록으로" />
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white text-center">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            접근 권한 없음
          </span>
          <p className="text-slate-500">
            이 직원의 상세 정보는 본인, 임원급, 인사팀, 또는 같은 팀의
            팀장만 볼 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  const employee = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      team: true,
      appointmentRecords: { orderBy: { date: "desc" } },
      performanceHistory: { orderBy: { year: "desc" } },
    },
  });

  if (!employee) notFound();
  const hasPhoto = !!employee.photo;

  return (
    <div className="flex flex-col gap-6">
      <BackLink fallbackHref="/platform/employees" label="목록으로" />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-5 border-b border-slate-100 bg-brand-green-light p-6">
          {hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/employees/${employee.id}/photo`}
              alt={employee.name}
              className="h-20 w-20 shrink-0 rounded-full border-2 border-white object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-brand-green/40 bg-white text-2xl font-semibold text-brand-green-dark">
              {employee.name.slice(0, 1)}
            </div>
          )}
          <div>
            {!hasPhoto && <p className="text-xs text-slate-500">사진 미등록</p>}
            <h1 className="text-2xl font-semibold text-brand-black">{employee.name}</h1>
            <p className="mt-1 text-slate-600">
              {employee.team?.name ?? "팀 미지정"} ·{" "}
              {POSITION_LABEL[employee.position as Position]}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 p-6 sm:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">기본 정보</h2>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="사번" value={employee.employeeNumber} />
              <Field label="이메일" value={employee.email} />
              <Field label="성별" value={employee.gender} />
              <Field label="생년월일" value={fmtBirthDate(employee.birthDate)} />
              <Field label="입사일" value={fmtHireDate(employee.hireDate)} />
              <Field label="퇴사일" value={fmtDate(employee.terminationDate)} />
            </dl>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">조직 정보</h2>
            <dl className="grid grid-cols-2 gap-4">
              <Field
                label="사업단위"
                value={employee.team?.businessUnit ?? employee.businessUnit}
              />
              <Field label="본부" value={employee.team?.division ?? employee.division} />
              <Field label="팀" value={employee.team?.name} />
              <Field
                label="직책"
                value={POSITION_LABEL[employee.position as Position]}
              />
              <Field label="사원구분" value={employee.employmentType} />
              <Field label="직군" value={employee.jobFamily} />
            </dl>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">학력 정보</h2>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="학력" value={employee.educationLevel} />
              <Field label="학교" value={employee.school} />
              <Field label="전공" value={employee.major} />
              <Field label="학위" value={employee.degree} />
            </dl>
          </section>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">발령 이력</h2>
        {employee.appointmentRecords.length === 0 ? (
          <p className="text-sm text-slate-500">등록된 발령 이력이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">발령일</th>
                  <th className="px-3 py-2 font-medium">구분</th>
                  <th className="px-3 py-2 font-medium">발령명</th>
                  <th className="px-3 py-2 font-medium">부서</th>
                  <th className="px-3 py-2 font-medium">직책</th>
                  <th className="px-3 py-2 font-medium">직급</th>
                  <th className="px-3 py-2 font-medium">비고</th>
                </tr>
              </thead>
              <tbody>
                {employee.appointmentRecords.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-500">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2">{r.type ?? "-"}</td>
                    <td className="px-3 py-2">{r.title ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-500">{r.department ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-500">{r.positionTitle ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-500">{r.jobGrade ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-500">{r.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">인사평가 이력</h2>
        {employee.performanceHistory.length === 0 ? (
          <p className="text-sm text-slate-500">등록된 인사평가 이력이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">연도</th>
                  <th className="px-3 py-2 font-medium">등급</th>
                </tr>
              </thead>
              <tbody>
                {employee.performanceHistory.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium">{r.year}년</td>
                    <td className="px-3 py-2">{r.grade ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
