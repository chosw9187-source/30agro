import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { savePermissionMatrix, saveUserPermissionOverrides } from "./actions";
import {
  MODULES,
  MODULE_LABEL,
  POSITIONS,
  POSITION_LABEL,
  PERMISSION_SCOPES,
  PERMISSION_SCOPE_LABEL,
  type PermissionScope,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

const DEFAULT_SENTINEL = "DEFAULT";

function TabLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded px-3 py-1.5 text-sm ${
        active
          ? "bg-brand-green text-white"
          : "border border-slate-300 text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );
}

async function MatrixTab() {
  const rows = await prisma.permissionMatrixEntry.findMany();
  const scopeByKey = new Map(rows.map((r) => [`${r.module}:${r.position}`, r.scope as PermissionScope]));

  return (
    <form action={savePermissionMatrix}>
      <p className="mb-3 text-sm text-slate-600">
        직책별로 각 메뉴에서 어디까지 볼 수 있는지 범위를 설정하세요:{" "}
        <strong>전체</strong>(회사 전체) → <strong>사업단위</strong> →{" "}
        <strong>부문</strong> → <strong>팀</strong> → <strong>본인</strong> →{" "}
        <strong>접근 불가</strong>(사이드바와 해당 화면 모두 숨김). 관리자(역할)는
        항상 전체 접근 가능합니다.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">모듈 \ 직책</th>
              {POSITIONS.map((p) => (
                <th key={p} className="px-4 py-3 text-center font-medium">
                  {POSITION_LABEL[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m) => (
              <tr key={m} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{MODULE_LABEL[m]}</td>
                {POSITIONS.map((p) => {
                  const key = `${m}:${p}`;
                  const current = scopeByKey.get(key) ?? "FULL";
                  return (
                    <td key={p} className="px-4 py-3 text-center">
                      <select
                        name={key}
                        defaultValue={current}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        {PERMISSION_SCOPES.map((s) => (
                          <option key={s} value={s}>
                            {PERMISSION_SCOPE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="submit"
        className="mt-4 rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark"
      >
        저장
      </button>
    </form>
  );
}

async function UserTab({ q, userId }: { q?: string; userId?: string }) {
  const matches = q
    ? await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { employeeNumber: { contains: q } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, employeeNumber: true, position: true, team: { select: { name: true } } },
        take: 10,
        orderBy: { name: "asc" },
      })
    : [];

  const selected = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          employeeNumber: true,
          position: true,
          team: { select: { name: true } },
          permissionOverrides: { select: { module: true, scope: true } },
        },
      })
    : null;

  const overrideByModule = new Map(
    selected?.permissionOverrides.map((o) => [o.module as string, o.scope as PermissionScope]) ?? []
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-700">
          다른 사용자 지정 권한 검색
        </h3>
        <form className="flex gap-2" action="/admin/permission-matrix">
          <input type="hidden" name="tab" value="user" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="이름 / 사번 / 이메일로 검색"
            className="w-64 rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-brand-green px-3 py-1.5 text-sm text-white hover:bg-brand-green-dark"
          >
            검색
          </button>
        </form>
        {q && (
          <div className="mt-3 flex flex-col gap-1">
            {matches.length === 0 && <p className="text-sm text-slate-500">검색 결과가 없습니다.</p>}
            {matches.map((u) => (
              <Link
                key={u.id}
                href={`/admin/permission-matrix?tab=user&q=${encodeURIComponent(q)}&userId=${u.id}`}
                className={`rounded px-3 py-2 text-sm hover:bg-slate-50 ${
                  u.id === userId ? "bg-brand-green-light" : ""
                }`}
              >
                {u.name} · {u.employeeNumber} · {POSITION_LABEL[u.position]}
                {u.team?.name ? ` · ${u.team.name}` : ""}
              </Link>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-1 text-sm font-medium text-slate-700">
            {selected.name}님 개별 권한 설정
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            직책 기본값({POSITION_LABEL[selected.position]}의 권한 매트릭스 설정)을 그대로 쓰려면
            &quot;직책 기본값&quot;을 선택하세요. 그 외 값을 선택하면 직책 기본값보다 우선 적용됩니다.
          </p>
          <form action={saveUserPermissionOverrides.bind(null, selected.id)} className="flex flex-col gap-2">
            {MODULES.map((m) => (
              <div key={m} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">{MODULE_LABEL[m]}</span>
                <select
                  name={m}
                  defaultValue={overrideByModule.get(m) ?? DEFAULT_SENTINEL}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value={DEFAULT_SENTINEL}>직책 기본값</option>
                  {PERMISSION_SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {PERMISSION_SCOPE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button
              type="submit"
              className="mt-2 self-start rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark"
            >
              저장
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default async function PermissionMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; userId?: string }>;
}) {
  const { tab, q, userId } = await searchParams;
  const activeTab = tab === "user" ? "user" : "matrix";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">권한 매트릭스</h1>
        <p className="mt-1 text-slate-600">
          직책 기준 기본 권한은 매트릭스에서, 특정 인원의 예외는 사용자별
          탭에서 설정하세요.
        </p>
      </div>

      <div className="flex gap-2">
        <TabLink href="/admin/permission-matrix?tab=matrix" label="매트릭스" active={activeTab === "matrix"} />
        <TabLink href="/admin/permission-matrix?tab=user" label="사용자별" active={activeTab === "user"} />
      </div>

      {activeTab === "matrix" ? <MatrixTab /> : <UserTab q={q} userId={userId} />}
    </div>
  );
}
