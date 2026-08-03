import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { createUser, bulkDeleteUsers } from "./actions";
import { clearYearTargets } from "./target-year-actions";
import { ImportUsersForm } from "./import-form";
import { RoleSelect } from "./role-select";
import { UserRowActions } from "./user-row-actions";
import { TargetYearToggle } from "./target-year-toggle";
import { SelectAllCheckbox } from "./select-all-checkbox";
import { PositionSelect } from "./position-select";

export const dynamic = "force-dynamic";

const roleLabel: Record<string, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

const COMPANY_NAME = "한국삼공";

function fmtDate(d: Date | null | undefined) {
  return d ? d.toLocaleDateString("ko-KR") : "-";
}

type SortKey = "name" | "email" | "employeeNumber" | "role" | "team";
type SortDir = "asc" | "desc";

const columns: { key: SortKey; label: string }[] = [
  { key: "name", label: "이름" },
  { key: "email", label: "이메일" },
  { key: "employeeNumber", label: "사번" },
  { key: "role", label: "역할" },
  { key: "team", label: "팀" },
];

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
  }>;
}) {
  const params = await searchParams;
  const sortKey: SortKey = columns.some((c) => c.key === params.sort)
    ? (params.sort as SortKey)
    : "name";
  const sortDir: SortDir = params.dir === "desc" ? "desc" : "asc";
  const q = (params.q ?? "").trim();
  const filterTeamId = params.teamId ?? "";

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

  const session = await auth();
  const [users, teams, yearRows] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...(filterTeamId ? { teamId: filterTeamId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { employeeNumber: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy,
      include: {
        team: { include: { operationsHead: true, senior: true } },
        targetYears: { where: { year: selectedYear } },
      },
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.userTargetYear.findMany({
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    }),
  ]);

  const availableYears = Array.from(
    new Set([thisYear, selectedYear, ...yearRows.map((r) => r.year)])
  ).sort((a, b) => b - a);

  const filterQS = `${q ? `&q=${encodeURIComponent(q)}` : ""}${
    filterTeamId ? `&teamId=${filterTeamId}` : ""
  }`;

  function sortHref(key: SortKey) {
    const nextDir: SortDir = sortKey === key && sortDir === "asc" ? "desc" : "asc";
    return `/admin/users?year=${selectedYear}&sort=${key}&dir=${nextDir}${filterQS}`;
  }

  const deletedCount = Number(params.deleted ?? 0);
  const skippedCount = Number(params.skipped ?? 0);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">사용자 관리</h1>

      {(deletedCount > 0 || skippedCount > 0) && (
        <p className="text-sm text-slate-500">
          삭제 {deletedCount}건 완료
          {skippedCount > 0 &&
            ` · 평가 기록이 있어 ${skippedCount}건은 건너뜀`}
        </p>
      )}

      <details className="group rounded-lg border border-slate-200 bg-white open:pb-5">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900">
          + 새 직원 등록 / 엑셀 일괄 업로드
        </summary>
        <div className="flex flex-col gap-6 border-t border-slate-100 px-4 pt-4">
          <ImportUsersForm defaultYear={selectedYear} />

          <form
            action={createUser}
            className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2"
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
            <select name="teamId" className="rounded border border-slate-300 px-3 py-2">
              <option value="">팀 미지정</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select name="role" className="rounded border border-slate-300 px-3 py-2">
              <option value="EVALUATOR">평가자</option>
              <option value="EMPLOYEE">직원</option>
              <option value="ADMIN">관리자</option>
            </select>
            <button
              type="submit"
              className="rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark sm:col-span-2 sm:self-start"
            >
              {selectedYear}년 대상자로 추가
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
        <button
          type="submit"
          className="rounded bg-brand-green px-3 py-1.5 text-sm text-white hover:bg-brand-green-dark"
        >
          검색
        </button>
        {(q || filterTeamId) && (
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

          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs text-slate-400">
              <tr>
                <th className="w-8 px-3 py-2">
                  <SelectAllCheckbox />
                </th>
                {columns.map((col) => (
                  <th key={col.key} className="whitespace-nowrap px-3 py-2 font-medium">
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
                <th className="whitespace-nowrap px-3 py-2 font-medium">운영책임</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">책임</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">직책</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">생년월일</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">입사일</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">퇴사일</th>
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
                  <td className="whitespace-nowrap px-3 py-2">{u.name}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.email}</td>
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
                    {u.team?.operationsHead?.name ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                    {u.team?.senior?.name ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <PositionSelect userId={u.id} position={u.position} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{fmtDate(u.birthDate)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{fmtDate(u.hireDate)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{fmtDate(u.terminationDate)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.employmentType ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.jobGrade ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.educationLevel ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.school ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.major ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.degree ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{u.jobFamily ?? "-"}</td>
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
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={20}>
                    검색 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </section>
      </form>

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
