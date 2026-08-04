import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MatrixForm } from "./matrix-form";
import { UserOverrideForm } from "./user-override-form";
import { RecommendedScopeButton } from "./recommended-scope-button";
import { POSITION_LABEL, type PermissionScope } from "@/lib/permissions";

export const dynamic = "force-dynamic";

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
  const scopeByKey: Record<string, PermissionScope> = {};
  for (const r of rows) scopeByKey[`${r.module}:${r.position}`] = r.scope as PermissionScope;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm text-slate-600">
          직원정보조회 표준 설정: 사장=전체, 운영책임=사업단위, 책임=부문,
          팀장=팀, 담당=본인
        </p>
        <RecommendedScopeButton />
      </div>

      <MatrixForm scopeByKey={scopeByKey} />
    </div>
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

  const overrideByModule: Record<string, PermissionScope> = {};
  if (selected) {
    for (const o of selected.permissionOverrides) {
      overrideByModule[o.module] = o.scope as PermissionScope;
    }
  }

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
        <UserOverrideForm
          userId={selected.id}
          userName={selected.name}
          userPosition={selected.position}
          overrideByModule={overrideByModule}
        />
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
