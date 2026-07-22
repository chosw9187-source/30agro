import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { createUser, deleteUser, resetUserPassword } from "./actions";
import { ImportUsersForm } from "./import-form";
import { RoleSelect } from "./role-select";

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
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const sortKey: SortKey = columns.some((c) => c.key === params.sort)
    ? (params.sort as SortKey)
    : "name";
  const sortDir: SortDir = params.dir === "desc" ? "desc" : "asc";

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
  const [users, teams] = await Promise.all([
    prisma.user.findMany({ orderBy, include: { team: true } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
  ]);

  function sortHref(key: SortKey) {
    const nextDir: SortDir = sortKey === key && sortDir === "asc" ? "desc" : "asc";
    return `/admin/users?sort=${key}&dir=${nextDir}`;
  }

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

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">엑셀로 일괄 등록</h2>
        <ImportUsersForm />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">새 사용자 추가</h2>
        <form
          action={createUser}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
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
            추가
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
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
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
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
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <form action={resetUserPassword.bind(null, u.id)}>
                      <button
                        type="submit"
                        className="text-slate-500 hover:underline"
                        title="비밀번호를 사번으로 초기화하고 다음 로그인 시 변경을 요구합니다"
                      >
                        비밀번호 초기화
                      </button>
                    </form>
                    <form action={deleteUser.bind(null, u.id)}>
                      <button
                        type="submit"
                        className="text-red-600 hover:underline"
                      >
                        삭제
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
