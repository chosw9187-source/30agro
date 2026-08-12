import { POSITION_LABEL, type Position } from "@/lib/permission-constants";
import { ageInYears, tenureInYears } from "@/lib/hr-analytics";
import { formatKSTDate } from "@/lib/format-kst";
import { Avatar } from "@/components/avatar";
import {
  deleteEducationRecord,
  addEducationRecord,
  addAppointmentRecord,
  deleteAppointmentRecord,
  addPerformanceHistory,
  deletePerformanceHistory,
} from "@/app/platform/data-upload/actions";
import {
  updateUserBirthDate,
  updateUserHireDate,
  updateUserTerminationDate,
  updateUserEmploymentType,
  updateUserJobFamily,
  updateUserBusinessUnit,
  updateUserDivision,
} from "@/app/admin/users/actions";
import { GenderSelect } from "@/app/admin/users/gender-select";
import { PositionSelect } from "@/app/admin/users/position-select";
import { TextFieldEditor } from "@/app/admin/users/text-field-editor";
import { DateFieldEditor } from "@/app/admin/users/date-field-editor";

export type EmployeeCardData = {
  id: string;
  name: string;
  employeeNumber: string;
  email: string | null;
  gender: string | null;
  birthDate: Date | null;
  hireDate: Date | null;
  terminationDate: Date | null;
  businessUnit: string | null;
  division: string | null;
  position: string;
  employmentType: string | null;
  jobFamily: string | null;
  jobGrade: string | null;
  photo: unknown;
  team: { name: string; businessUnit: string | null; division: string | null } | null;
  educationRecords: { id: string; level: string; school: string | null; major: string | null; degree: string | null }[];
  appointmentRecords: {
    id: string;
    date: Date;
    type: string | null;
    title: string | null;
    department: string | null;
    positionTitle: string | null;
    jobGrade: string | null;
    note: string | null;
  }[];
  performanceHistory: { id: string; year: number; grade: string | null; score: number | null; note: string | null }[];
};

function fmtDate(d: Date | null) {
  return d ? formatKSTDate(d) : "-";
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

export function EmployeeCardContent({ employee, isAdmin }: { employee: EmployeeCardData; isAdmin: boolean }) {
  const hasPhoto = !!employee.photo;
  const isCeo = employee.position === "CEO";

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-5 border-b border-slate-100 bg-brand-green-light p-6">
          <Avatar
            userId={employee.id}
            name={employee.name}
            hasPhoto={hasPhoto}
            className="h-20 w-20 border-2 border-white"
          />
          <div>
            {!hasPhoto && <p className="text-xs text-slate-500">사진 미등록</p>}
            <h1 className="text-2xl font-semibold text-brand-black">{employee.name}</h1>
            <p className="mt-1 text-slate-600">
              {isCeo ? (
                employee.jobGrade || "CEO"
              ) : (
                <>
                  {employee.team?.name ?? "팀 미지정"} · {POSITION_LABEL[employee.position as Position]}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 p-6 sm:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">기본 정보</h2>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="사번" value={employee.employeeNumber} />
              <Field label="이메일" value={employee.email} />
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-slate-400">성별</dt>
                <dd className="text-sm text-slate-800">
                  {isAdmin ? <GenderSelect userId={employee.id} gender={employee.gender} /> : employee.gender || "-"}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-slate-400">생년월일</dt>
                <dd className="text-sm text-slate-800">
                  {isAdmin ? (
                    <div className="flex items-center gap-2">
                      <DateFieldEditor userId={employee.id} value={employee.birthDate} action={updateUserBirthDate} />
                      {employee.birthDate && (
                        <span className="text-xs text-slate-400">만 {ageInYears(employee.birthDate)}세</span>
                      )}
                    </div>
                  ) : (
                    fmtBirthDate(employee.birthDate)
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-slate-400">입사일</dt>
                <dd className="text-sm text-slate-800">
                  {isAdmin ? (
                    <div className="flex items-center gap-2">
                      <DateFieldEditor userId={employee.id} value={employee.hireDate} action={updateUserHireDate} />
                      {employee.hireDate && (
                        <span className="text-xs text-slate-400">근속 {tenureInYears(employee.hireDate).toFixed(1)}년</span>
                      )}
                    </div>
                  ) : (
                    fmtHireDate(employee.hireDate)
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-slate-400">퇴사일</dt>
                <dd className="text-sm text-slate-800">
                  {isAdmin ? (
                    <DateFieldEditor userId={employee.id} value={employee.terminationDate} action={updateUserTerminationDate} />
                  ) : (
                    fmtDate(employee.terminationDate)
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {!isCeo && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-700">조직 정보</h2>
              <dl className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-slate-400">사업단위</dt>
                  <dd className="text-sm text-slate-800">
                    {employee.team ? (
                      employee.team.businessUnit ?? "-"
                    ) : isAdmin ? (
                      <TextFieldEditor userId={employee.id} value={employee.businessUnit} action={updateUserBusinessUnit} width="w-28" />
                    ) : (
                      employee.businessUnit ?? "-"
                    )}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-slate-400">본부</dt>
                  <dd className="text-sm text-slate-800">
                    {employee.team ? (
                      employee.team.division ?? "-"
                    ) : isAdmin ? (
                      <TextFieldEditor userId={employee.id} value={employee.division} action={updateUserDivision} width="w-28" />
                    ) : (
                      employee.division ?? "-"
                    )}
                  </dd>
                </div>
                <Field label="팀" value={employee.team?.name} />
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-slate-400">직책</dt>
                  <dd className="text-sm text-slate-800">
                    {isAdmin ? (
                      <PositionSelect userId={employee.id} position={employee.position as Position} />
                    ) : (
                      POSITION_LABEL[employee.position as Position]
                    )}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-slate-400">사원구분</dt>
                  <dd className="text-sm text-slate-800">
                    {isAdmin ? (
                      <TextFieldEditor userId={employee.id} value={employee.employmentType} action={updateUserEmploymentType} width="w-20" />
                    ) : (
                      employee.employmentType ?? "-"
                    )}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-slate-400">직군</dt>
                  <dd className="text-sm text-slate-800">
                    {isAdmin ? (
                      <TextFieldEditor userId={employee.id} value={employee.jobFamily} action={updateUserJobFamily} width="w-20" />
                    ) : (
                      employee.jobFamily ?? "-"
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-medium">학력 정보</h2>
        {employee.educationRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">학력구분</th>
                  <th className="px-3 py-2 font-medium">학교명</th>
                  <th className="px-3 py-2 font-medium">전공</th>
                  <th className="px-3 py-2 font-medium">학위</th>
                  {isAdmin && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {employee.educationRecords.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium">{r.level}</td>
                    <td className="px-3 py-2 text-slate-500">{r.school || "-"}</td>
                    <td className="px-3 py-2 text-slate-500">{r.major ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-500">{r.degree ?? "-"}</td>
                    {isAdmin && (
                      <td className="px-3 py-2 text-right">
                        <form action={deleteEducationRecord.bind(null, r.id)}>
                          <button type="submit" className="text-xs text-red-600 hover:underline">
                            삭제
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">등록된 학력 정보가 없습니다.</p>
        )}
        {isAdmin && (
          <form
            action={addEducationRecord.bind(null, employee.id)}
            className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">학력구분</label>
              <select name="level" required className="rounded border border-slate-300 px-2 py-1 text-sm">
                <option value="고등학교">고등학교</option>
                <option value="대학교">대학교</option>
                <option value="대학원(석사)">대학원(석사)</option>
                <option value="대학원(박사)">대학원(박사)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">학교명</label>
              <input name="school" className="w-32 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">전공</label>
              <input name="major" className="w-28 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">학위</label>
              <input name="degree" className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <button type="submit" className="rounded bg-brand-green px-3 py-1.5 text-sm text-white hover:bg-brand-green-dark">
              추가
            </button>
          </form>
        )}
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
                  {isAdmin && <th className="px-3 py-2"></th>}
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
                    {isAdmin && (
                      <td className="px-3 py-2 text-right">
                        <form action={deleteAppointmentRecord.bind(null, r.id)}>
                          <button type="submit" className="text-xs text-red-600 hover:underline">
                            삭제
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isAdmin && (
          <form
            action={addAppointmentRecord.bind(null, employee.id)}
            className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">발령일</label>
              <input type="date" name="date" required className="rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">구분</label>
              <input name="type" className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">발령명</label>
              <input name="title" className="w-28 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">부서</label>
              <input name="department" className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">직책</label>
              <input name="positionTitle" className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">직급</label>
              <input name="jobGrade" className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">비고</label>
              <input name="note" className="w-28 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <button type="submit" className="rounded bg-brand-green px-3 py-1.5 text-sm text-white hover:bg-brand-green-dark">
              추가
            </button>
          </form>
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
                  <th className="px-3 py-2 font-medium">점수</th>
                  <th className="px-3 py-2 font-medium">비고</th>
                  {isAdmin && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {employee.performanceHistory.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium">{r.year}년</td>
                    <td className="px-3 py-2">{r.grade ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-500">{r.score ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-500">{r.note ?? "-"}</td>
                    {isAdmin && (
                      <td className="px-3 py-2 text-right">
                        <form action={deletePerformanceHistory.bind(null, r.id)}>
                          <button type="submit" className="text-xs text-red-600 hover:underline">
                            삭제
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isAdmin && (
          <form
            action={addPerformanceHistory.bind(null, employee.id)}
            className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">연도</label>
              <input type="number" name="year" required className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">등급</label>
              <input name="grade" className="w-16 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">점수</label>
              <input type="number" step="0.1" name="score" className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">비고</label>
              <input name="note" className="w-32 rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <button type="submit" className="rounded bg-brand-green px-3 py-1.5 text-sm text-white hover:bg-brand-green-dark">
              추가/수정
            </button>
          </form>
        )}
      </div>
    </>
  );
}
