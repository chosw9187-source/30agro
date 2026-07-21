import { prisma } from "@/lib/prisma";
import { createUser, deleteUser } from "./actions";
import { ImportUsersForm } from "./import-form";

const roleLabel: Record<string, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

export default async function UsersPage() {
  const [users, teams] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { team: true },
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">사용자 관리</h1>
        <p className="mt-1 text-slate-600">
          평가자와 직원 계정을 만들고 관리합니다. 로그인 아이디는 이메일이며,
          비밀번호는 사번입니다.
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
            className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 sm:col-span-2 sm:self-start"
          >
            추가
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">이메일</th>
              <th className="px-4 py-3 font-medium">사번</th>
              <th className="px-4 py-3 font-medium">역할</th>
              <th className="px-4 py-3 font-medium">팀</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3 text-slate-500">{u.employeeNumber}</td>
                <td className="px-4 py-3">{roleLabel[u.role]}</td>
                <td className="px-4 py-3 text-slate-500">{u.team?.name ?? "-"}</td>
                <td className="px-4 py-3 text-right">
                  <form action={deleteUser.bind(null, u.id)}>
                    <button
                      type="submit"
                      className="text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
