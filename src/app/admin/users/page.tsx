import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { createUser, bulkDeleteUsers } from "./actions";
import { clearYearTargets } from "./target-year-actions";
import { ImportUsersForm } from "./import-form";
import { RoleSelect } from "./role-select";
import { UserRowActions } from "./user-row-actions";
import { TargetYearToggle } from "./target-year-toggle";

const roleLabel: Record<string, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

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
  }>;
}) {
  const params = await searchParams;
  const sortKey: SortKey = columns.some((c) => c.key === params.sort)
    ? (params.sort as SortKey)
    : "name";
  const sortDir: SortDir = params.dir === "desc" ? "desc" : "asc";

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
      orderBy,
      include: { team: true, targetYears: { where: { year: selectedYear } } },
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

  function sortHref(key: SortKey) {
    const nextDir: SortDir = sortKey === key && sortDir === "asc" ? "desc" : "asc";
    return `/admin/users?year=${selectedYear}&sort=${key}&dir=${nextDir}`;
  }

  const deletedCount = Number(params.deleted ?? 0);
  const skippedCount = Number(params.skipped ?? 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">사용자 관리</h1>
        <p className="mt-1 text-slate-600">
          평가자와 직원 계정을 만들고 관리합니다. 로그인 아이디는 이메일이며,
          최초 비밀번호는 사번입니다. 최초 로그인 시 비밀번호 변경이
          강제됩니다.
        </p>
      </div>

      {(deletedCount > 0 || skippedCount > 0) && (
        <p className="rounded bg-slate-50 p-3 text-sm text-slate-600">
          삭제 {deletedCount}건 완료
          {skippedCount > 0 &&
            ` · 평가 기록이 있어 건너뜀 ${skippedCount}건 (평가 기록이 있는 계정은 삭제할 수 없습니다)`}
        </p>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">연도별 대상자</h2>
        <p className="mb-4 text-sm text-slate-500">
          연도를 선택하면 아래 목록에서 그 해 평가 대상자 여부를 체크할 수
          있습니다. 매년 인원이 바뀌어도 이전 연도 기록은 그대로 남습니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {availableYears.map((y) => (
            <Link
              key={y}
              href={`/admin/users?year=${y}`}
              className={`rounded px-3 py-1.5 text-sm ${
                y === selectedYear
                  ? "bg-brand-green text-white"
                  : "border border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {y}년
            </Link>
          ))}
          <form method="GET" className="flex items-center gap-1">
            <input
              type="number"
              name="year"
              placeholder="연도 입력"
              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              type="submit"
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              이동
            </button>
          </form>
          <form
            action={clearYearTargets.bind(null, selectedYear)}
            className="ml-auto"
          >
            <button
              type="submit"
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              {selectedYear}년 대상자 전체 삭제
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">엑셀로 일괄 등록</h2>
        <ImportUsersForm defaultYear={selectedYear} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">새 사용자 추가</h2>
        <form
          action={createUser}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
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
          <select
            name="teamId"
            className="rounded border border-slate-300 px-3 py-2"
          >
            <option value="">팀 미지정</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            name="role"
            className="rounded border border-slate-300 px-3 py-2"
          >
            <option value="EVALUATOR">평가자</option>
            <option value="EMPLOYEE">직원</option>
            <option value="ADMIN">관리자</option>
          </select>
          <button
            type="submit"
            className="rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark sm:col-span-2 sm:self-start"
          >
            추가 ({selectedYear}년 대상자로 등록)
          </button>
        </form>
      </section>

      <form action={bulkDeleteUsers}>
        <input type="hidden" name="year" value={selectedYear} />
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-500">
              체크박스로 여러 명을 선택해 한번에 삭제할 수 있습니다. 평가
              기록이 있는 계정은 삭제되지 않습니다.
            </p>
            <button
              type="submit"
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              선택 삭제
            </button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-3"></th>
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3 font-medium">
                    <Link
                      href={sortHref(col.key)}
                      className="flex items-center gap-1 hover:text-slate-900"
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span>{sortDir === "asc" ? "▲" : "▼"}</span>
                      )}
                    </Link>
                  </th>
                ))}
                <th className="px-4 py-3">{selectedYear}년 대상자</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <input type="checkbox" name="userIds" value={u.id} />
                  </td>
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3 text-slate-500">{u.employeeNumber}</td>
                  <td className="px-4 py-3">
                    {u.id === session?.user.id ? (
                      roleLabel[u.role]
                    ) : (
                      <RoleSelect userId={u.id} role={u.role} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{u.team?.name ?? "-"}</td>
                  <td className="px-4 py-3">
                    <TargetYearToggle
                      userId={u.id}
                      year={selectedYear}
                      active={u.targetYears.length > 0}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <UserRowActions userId={u.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </form>
    </div>
  );
}
