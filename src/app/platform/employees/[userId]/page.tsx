import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { POSITION_LABEL, type Position } from "@/lib/permission-constants";

export const dynamic = "force-dynamic";

const roleLabel: Record<string, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

function fmtDate(d: Date | null) {
  return d ? d.toLocaleDateString("ko-KR") : "-";
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
  const employee = await prisma.user.findUnique({
    where: { id: userId },
    include: { team: true },
  });

  if (!employee) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/platform/employees" className="text-sm text-slate-500 hover:underline">
        ← 직원정보 조회
      </Link>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-5 border-b border-slate-100 bg-brand-green-light p-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-brand-green/40 bg-white text-2xl font-semibold text-brand-green-dark">
            {employee.name.slice(0, 1)}
          </div>
          <div>
            <p className="text-xs text-slate-500">사진 등록 (추가 예정)</p>
            <h1 className="text-2xl font-semibold text-brand-black">{employee.name}</h1>
            <p className="mt-1 text-slate-600">
              {employee.team?.name ?? "팀 미지정"} ·{" "}
              {POSITION_LABEL[employee.position as Position]}
            </p>
          </div>
          <span className="ml-auto rounded bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
            {roleLabel[employee.role] ?? employee.role}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-8 p-6 sm:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">기본 정보</h2>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="사번" value={employee.employeeNumber} />
              <Field label="이메일" value={employee.email} />
              <Field label="성별" value={employee.gender} />
              <Field label="생년월일" value={fmtDate(employee.birthDate)} />
              <Field label="입사일" value={fmtDate(employee.hireDate)} />
              <Field label="퇴사일" value={fmtDate(employee.terminationDate)} />
            </dl>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">조직 정보</h2>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="사업단위" value={employee.team?.businessUnit} />
              <Field label="본부" value={employee.team?.division} />
              <Field label="팀" value={employee.team?.name} />
              <Field
                label="직책"
                value={POSITION_LABEL[employee.position as Position]}
              />
              <Field label="사원구분" value={employee.employmentType} />
              <Field label="직급" value={employee.jobGrade} />
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
    </div>
  );
}
