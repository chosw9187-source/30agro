import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  createUser,
  bulkDeleteUsers,
  updateUserBirthDate,
  updateUserHireDate,
  updateUserTerminationDate,
  updateUserEmploymentType,
  updateUserJobFamily,
  updateUserBusinessUnit,
  updateUserDivision,
} from "./actions";
import { clearYearTargets } from "./target-year-actions";
import { RoleSelect } from "./role-select";
import { UserRowActions } from "./user-row-actions";
import { TargetYearToggle } from "./target-year-toggle";
import { SelectAllCheckbox } from "./select-all-checkbox";
import { PositionSelect } from "./position-select";
import { NameEditor } from "./name-editor";
import { JobGradeEditor } from "./job-grade-editor";
import { GenderSelect } from "./gender-select";
import { TextFieldEditor } from "./text-field-editor";
import { DateFieldEditor } from "./date-field-editor";
import { ResetAllPasswordsButton } from "./reset-all-passwords-button";
import { isActive, activePrismaWhere } from "@/lib/hr-analytics";
import { POSITIONS, POSITION_LABEL } from "@/lib/permission-constants";
import { SearchableSelect } from "@/components/searchable-select";

export const dynamic = "force-dynamic";

const roleLabel: Record<string, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

const COMPANY_NAME = "한국삼공";

type SortKey = "name" | "email" | "employeeNumber" | "role" | "team";
type SortDir = "asc" | "desc";

const columns: { key: SortKey; label: string }[] = [
  { key: "name", label: "이름" },
  { key: "email", label: "이메일" },
  { key: "employeeNumber", label: "사번" },
  { key: "role", label: "역할" },
  { key: "team", label: "팀" },
];

const PAGE_SIZE = 50;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string;
    dir?: string;
    year?: string;
    deleted?: string;
    skipped?: string;
    q?: string;
    teamId?: string;
    page?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const sortKey: SortKey = columns.some((c) => c.key === params.sort)
    ? (params.sort as SortKey)
    : "name";
  const sortDir: SortDir = params.dir === "desc" ? "desc" : "asc";
  const q = (params.q ?? "").trim();
  const filterTeamId = params.teamId ?? "";
  const page = Math.max(1, Math.trunc(Number(params.page)) || 1);
  const status: "active" | "terminated" | "all" =
    params.status === "terminated" || params.status === "all" ? params.status : "active";

  const thisYear = new Date().getFullYear();
  const selectedYear = Number(params.year) > 0 ? Number(params.year) : thisYear;

  let orderBy;
  switch (sortKey) {
    case "email":
      orderBy = { email: sortDir };
      break;
    case "employeeNumber":
      orderBy = { employeeNumber: sortDir };
      break;
    case "role":
      orderBy = { role: sortDir };
      break;
    case "team":
      orderBy = { team: { name: sortDir } };
      break;
    default:
      orderBy = { name: sortDir };
  }

  const whereConditions: Record<string, unknown>[] = [];
  if (filterTeamId) whereConditions.push({ teamId: filterTeamId });
  if (q) {
    whereConditions.push({
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
        { employeeNumber: { contains: q } },
      ],
    });
  }
  if (status === "active") whereConditions.push(activePrismaWhere());
  if (status === "terminated") whereConditions.push({ terminationDate: { lte: new Date() } });
  const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

  const session = await auth();
  const [users, totalCount, teams, activeTeams, yearRows] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      // photo/photoType are large binary blobs never rendered on this list —
      // select explicitly instead of include so they're never fetched here.
      select: {
        id: true,
        name: true,
        email: true,
        employeeNumber: true,
        role: true,
        position: true,
        gender: true,
        birthDate: true,
        hireDate: true,
        terminationDate: true,
        employmentType: true,
        jobGrade: true,
        educationLevel: true,
        school: true,
        major: true,
        degree: true,
        jobFamily: true,
        businessUnit: true,
        division: true,
        team: { select: { name: true, businessUnit: true, division: true } },
        targetYears: { where: { year: selectedYear }, select: { id: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.userTargetYear.findMany({
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const availableYears = Array.from(
    new Set([thisYear, selectedYear, ...yearRows.map((r) => r.year)])
  ).sort((a, b) => b - a);

  const businessUnitOptions = Array.from(
    new Set(teams.map((t) => t.businessUnit).filter((v): v is string => !!v))
  ).sort();
  const divisionOptions = Array.from(
    new Set(teams.map((t) => t.division).filter((v): v is string => !!v))
  ).sort();
  const EMPLOYMENT_TYPE_OPTIONS = ["정규직", "계약직", "파견직", "인턴"];
  const JOB_FAMILY_OPTIONS = ["영업직", "사무직", "생산직", "연구직"];

  const filterQS = `${q ? `&q=${encodeURIComponent(q)}` : ""}${
    filterTeamId ? `&teamId=${filterTeamId}` : ""
  }${status !== "active" ? `&status=${status}` : ""}`;

  function sortHref(key: SortKey) {
    const nextDir: SortDir = sortKey === key && sortDir === "asc" ? "desc" : "asc";
    return `/admin/users?year=${selectedYear}&sort=${key}&dir=${nextDir}${filterQS}`;
  }

  function pageHref(p: number) {
    return `/admin/users?year=${selectedYear}&sort=${sortKey}&dir=${sortDir}&page=${p}${filterQS}`;
  }

  const deletedCount = Number(params.deleted ?? 0);
  const skippedCount = Number(params.skipped ?? 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">사용자 관리</h1>
        <ResetAllPasswordsButton />
      </div>

      {(deletedCount > 0 || skippedCount > 0) && (
        <p className="text-sm text-slate-500">
          삭제 {deletedCount}건 완료
          {skippedCount > 0 &&
            ` · 평가 기록이 있어 ${skippedCount}건은 건너뜀`}
        </p>
      )}

      <p className="text-sm text-slate-500">
        엑셀 일괄 업로드는{" "}
        <Link href="/platform/data-upload" className="text-brand-green hover:underline">
          데이터 업로드
        </Link>{" "}
        화면으로 옮겨졌습니다.
      </p>

      <details className="group rounded-lg border border-slate-200 bg-white open:pb-5">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900">
          + 새 직원 등록 (인사카드 기본이력 입력)
        </summary>
        <div className="flex flex-col gap-6 border-t border-slate-100 px-4 pt-4">
          <p className="text-xs text-slate-500">
            여기서는 기본이력만 입력하고 등록하면 바로 그 직원의 인사카드
            화면으로 이동합니다 — 발령/학력/경력/자격/상벌사항은 거기서
            이어서 입력하세요.
          </p>
          <form
            action={createUser}
            className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2"
          >
            <input type="hidden" name="year" value={selectedYear} />
            <input
              name="name"
              required
              placeholder="이름"
              className="rounded border border-slate-300 px-3 py-2"
            />
            <input
              name="email"
              type="email"
              required
              placeholder="이메일 (로그인 아이디)"
              className="rounded border border-slate-300 px-3 py-2"
            />
            <input
              name="employeeNumber"
              required
              placeholder="사번 (비밀번호로 사용)"
              className="rounded border border-slate-300 px-3 py-2"
            />
            <SearchableSelect
              name="teamId"
              options={activeTeams.map((t) => ({ value: t.id, label: t.name }))}
              placeholder="팀 검색..."
              emptyLabel="팀 미지정"
            />
            <select name="role" className="rounded border border-slate-300 px-3 py-2">
              <option value="EVALUATOR">평가자</option>
              <option value="EMPLOYEE">직원</option>
              <option value="ADMIN">관리자</option>
            </select>
            <select name="position" className="rounded border border-slate-300 px-3 py-2" defaultValue="STAFF">
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABEL[p]}
                </option>
              ))}
            </select>
            <input
              name="jobGrade"
              placeholder="직급 (예: G1)"
              className="rounded border border-slate-300 px-3 py-2"
            />
            <select name="gender" className="rounded border border-slate-300 px-3 py-2" defaultValue="">
              <option value="">성별 미지정</option>
              <option value="남">남</option>
              <option value="여">여</option>
            </select>
            <input
              name="employmentType"
              placeholder="사원구분 (예: 정규직)"
              className="rounded border border-slate-300 px-3 py-2"
            />
            <input
              name="jobFamily"
              placeholder="직군 (예: 사무직)"
              className="rounded border border-slate-300 px-3 py-2"
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">생년월일</label>
              <input type="date" name="birthDate" className="rounded border border-slate-300 px-3 py-2" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">입사일 (입력 시 입사 발령이 자동 등록됩니다)</label>
              <input type="date" name="hireDate" className="rounded border border-slate-300 px-3 py-2" />
            </div>
            <button
              type="submit"
              className="rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark sm:col-span-2 sm:self-start"
            >
              등록하고 인사카드로 이동
            </button>
          </form>
        </div>
      </details>

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="year" value={selectedYear} />
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="이름 / 사번 / 이메일 검색"
          className="w-56 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          name="teamId"
          defaultValue={filterTeamId}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">전체 팀</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="active">재직자만</option>
          <option value="terminated">퇴직자만</option>
          <option value="all">전체(재직+퇴직)</option>
        </select>
        <button
          type="submit"
          className="rounded bg-brand-green px-3 py-1.5 text-sm text-white hover:bg-brand-green-dark"
        >
          검색
        </button>
        {(q || filterTeamId || status !== "active") && (
          <Link
            href={`/admin/users?year=${selectedYear}`}
            className="text-sm text-slate-500 hover:underline"
          >
            검색 초기화
          </Link>
        )}
      </form>

      <form action={bulkDeleteUsers}>
        <input type="hidden" name="year" value={selectedYear} />
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            {availableYears.map((y) => (
              <Link
                key={y}
                href={`/admin/users?year=${y}${filterQS}`}
                className={`rounded px-2.5 py-1 text-sm ${
                  y === selectedYear
                    ? "bg-brand-green text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {y}년
              </Link>
            ))}
            <input
              type="number"
              form="go-to-year"
              name="year"
              placeholder="연도"
              className="w-20 rounded border border-slate-200 px-2 py-1 text-sm text-slate-600"
            />
            <button
              type="submit"
              form="go-to-year"
              className="text-sm text-slate-500 hover:underline"
            >
              이동
            </button>

            <span className="ml-auto flex items-center gap-4 text-sm">
              <button type="submit" className="text-red-600 hover:underline">
                선택 삭제
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="submit"
                form="clear-year"
                className="text-slate-400 hover:text-red-600 hover:underline"
                title={`${selectedYear}년 대상자 기록만 삭제되며 계정은 유지됩니다`}
              >
                {selectedYear}년 대상자 전체 삭제
              </button>
            </span>
          </div>

          <datalist id="user-business-unit-options">
            {businessUnitOptions.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <datalist id="user-division-options">
            {divisionOptions.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <datalist id="user-employment-type-options">
            {EMPLOYMENT_TYPE_OPTIONS.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <datalist id="user-job-family-options">
            {JOB_FAMILY_OPTIONS.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>

          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs text-slate-400">
              <tr>
                <th className="w-8 px-3 py-2">
                  <SelectAllCheckbox />
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`whitespace-nowrap px-3 py-2 font-medium ${
                      col.key === "name" ? "sticky left-0 z-10 border-r border-slate-200 bg-white" : ""
                    }`}
                  >
                    <Link
                      href={sortHref(col.key)}
                      className="flex items-center gap-1 hover:text-slate-700"
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span>{sortDir === "asc" ? "▲" : "▼"}</span>
                      )}
                    </Link>
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 font-medium">사명</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">사업단위</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">본부</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">직책</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">성별</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">생년월일</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">입사일</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">퇴사일</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">재직상태</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">사원구분</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">직급</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">학력</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">학교</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">전공</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">학위</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">직군</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">{selectedYear}년 대상</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2">
                    <input type="checkbox" name="userIds" value={u.id} />
                  </td>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-r border-slate-200 bg-white px-3 py-2">
                    <NameEditor userId={u.id} name={u.name} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.email ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.employeeNumber}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {u.id === session?.user.id ? (
                      roleLabel[u.role]
                    ) : (
                      <RoleSelect userId={u.id} role={u.role} />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.team?.name ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{COMPANY_NAME}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                    {u.team ? (
                      u.team.businessUnit ?? "-"
                    ) : (
                      <TextFieldEditor
                        userId={u.id}
                        value={u.businessUnit}
                        action={updateUserBusinessUnit}
                        listId="user-business-unit-options"
                        width="w-24"
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                    {u.team ? (
                      u.team.division ?? "-"
                    ) : (
                      <TextFieldEditor
                        userId={u.id}
                        value={u.division}
                        action={updateUserDivision}
                        listId="user-division-options"
                        width="w-24"
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <PositionSelect userId={u.id} position={u.position} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <GenderSelect userId={u.id} gender={u.gender} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                    <DateFieldEditor userId={u.id} value={u.birthDate} action={updateUserBirthDate} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                    <DateFieldEditor userId={u.id} value={u.hireDate} action={updateUserHireDate} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                    <DateFieldEditor userId={u.id} value={u.terminationDate} action={updateUserTerminationDate} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {isActive(u) ? (
                      <span className="rounded-full bg-brand-green-light px-2 py-0.5 text-xs font-medium text-brand-green-dark">
                        재직중
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        퇴직
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <TextFieldEditor
                      userId={u.id}
                      value={u.employmentType}
                      action={updateUserEmploymentType}
                      listId="user-employment-type-options"
                      width="w-20"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <JobGradeEditor userId={u.id} jobGrade={u.jobGrade} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.educationLevel ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.school ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.major ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.degree ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <TextFieldEditor
                      userId={u.id}
                      value={u.jobFamily}
                      action={updateUserJobFamily}
                      listId="user-job-family-options"
                      width="w-20"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <TargetYearToggle
                      userId={u.id}
                      year={selectedYear}
                      active={u.targetYears.length > 0}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <UserRowActions userId={u.id} />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={21}>
                    검색 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </section>
      </form>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>
            총 {totalCount.toLocaleString()}명 중 {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, totalCount)}명 표시
          </span>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="rounded border border-slate-300 px-2.5 py-1 hover:bg-slate-100">
                이전
              </Link>
            ) : (
              <span className="rounded border border-slate-200 px-2.5 py-1 text-slate-300">이전</span>
            )}
            <span>
              {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="rounded border border-slate-300 px-2.5 py-1 hover:bg-slate-100">
                다음
              </Link>
            ) : (
              <span className="rounded border border-slate-200 px-2.5 py-1 text-slate-300">다음</span>
            )}
          </div>
        </div>
      )}

      {/* Standalone form for the year-clear action and the "이동" year jump, kept outside
          the bulk-delete form so their submits don't trigger account deletion. */}
      <form id="go-to-year" method="GET" className="hidden" />
      <form
        id="clear-year"
        action={clearYearTargets.bind(null, selectedYear)}
        className="hidden"
      />
    </div>
  );
}
