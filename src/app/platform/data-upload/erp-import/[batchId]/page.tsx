import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NoModuleAccess } from "@/components/no-module-access";
import { loadMappingContext, whichMappingNeeded, computeRow, USER_SELECT } from "@/lib/erp-compute";
import type { RawErpRow, FieldDiff } from "@/lib/erp-import";
import { ageInYears, tenureInYears } from "@/lib/hr-analytics";
import { POSITION_LABEL, EXECUTIVE_POSITIONS, type Position } from "@/lib/permission-constants";
import {
  ApprovalToggle,
  PositionMappingPicker,
  TeamMappingPicker,
  ApplyBatchButton,
  DiscardBatchButton,
  RollbackBatchButton,
} from "./row-controls";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  NEEDS_MAPPING: "매핑 필요",
  NEW: "신규",
  CHANGED: "변경",
  TERMINATION: "퇴직 전환",
  ERROR: "오류",
  UNCHANGED: "변동없음",
};

const STATUS_ORDER = ["NEEDS_MAPPING", "NEW", "CHANGED", "TERMINATION", "ERROR", "UNCHANGED"];

const STATUS_COLOR: Record<string, string> = {
  NEEDS_MAPPING: "border-amber-300 bg-amber-50",
  NEW: "border-emerald-300 bg-emerald-50",
  CHANGED: "border-sky-300 bg-sky-50",
  TERMINATION: "border-rose-300 bg-rose-50",
  ERROR: "border-red-300 bg-red-50",
  UNCHANGED: "border-slate-200 bg-slate-50",
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "예" : "아니오";
  if (v instanceof Date) return v.toLocaleDateString("ko-KR");
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("ko-KR");
  }
  return String(v);
}

function DiffTable({ diff }: { diff: FieldDiff[] }) {
  if (diff.length === 0) return <span className="text-sm text-slate-400">변경 항목 없음</span>;
  return (
    <table className="text-sm">
      <tbody>
        {diff.map((d) => (
          <tr key={d.field}>
            <td className="pr-2 text-slate-500">{d.label}</td>
            <td className="pr-2 text-slate-400">{formatValue(d.before)}</td>
            <td className="pr-2 text-slate-400">→</td>
            <td className="font-medium text-slate-800">{formatValue(d.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function mergeDefined(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) merged[k] = v;
  }
  return merged;
}

type CardData = {
  name: string;
  teamName?: string | null;
  position?: string | null;
  birthDate?: Date | null;
  hireDate?: Date | null;
};

function EmployeePreviewCard({ label, data, muted }: { label: string; data: CardData; muted?: boolean }) {
  return (
    <div
      className={`min-w-[180px] rounded-lg border p-3 ${
        muted ? "border-slate-200 bg-slate-50 opacity-70" : "border-brand-green bg-white"
      }`}
    >
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium">{data.name}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {data.teamName && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {data.teamName}
          </span>
        )}
        {data.position && (
          <span className="rounded-full bg-brand-green-light px-2 py-0.5 text-xs font-medium text-brand-green-dark">
            {POSITION_LABEL[data.position as Position] ?? data.position}
          </span>
        )}
        {data.birthDate && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            만 {ageInYears(data.birthDate)}세
          </span>
        )}
        {data.hireDate && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            근속 {tenureInYears(data.hireDate).toFixed(1)}년
          </span>
        )}
      </div>
    </div>
  );
}

export default async function ErpBatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return <NoModuleAccess title="ERP 사원명부 연동" />;
  }

  const { batchId } = await params;
  const batch = await prisma.erpImportBatch.findUnique({
    where: { id: batchId },
    include: {
      uploadedBy: { select: { name: true } },
      rows: { orderBy: { name: "asc" } },
    },
  });
  if (!batch) notFound();

  const [ctx, teams] = await Promise.all([
    loadMappingContext(),
    prisma.team.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, businessUnit: true, division: true },
    }),
  ]);

  const teamNameByIdForCards = new Map(teams.map((t) => [t.id, t.name]));
  const employeeNumbers = batch.rows.map((r) => r.employeeNumber);
  const existingUsers = await prisma.user.findMany({
    where: { employeeNumber: { in: employeeNumbers } },
    select: { ...USER_SELECT, employeeNumber: true },
  });
  const existingByEmpNo = new Map(existingUsers.map((u) => [u.employeeNumber, u]));

  const cardsByRowId = new Map<string, CardData>();
  for (const row of batch.rows) {
    if (row.status !== "NEW") continue;
    const existing = existingByEmpNo.get(row.employeeNumber) ?? null;
    const computed = computeRow(row.rawData as RawErpRow, ctx, existing);
    if (!computed.next) continue;
    const afterRaw = mergeDefined(existing ?? {}, computed.next);
    cardsByRowId.set(row.id, {
      name: (afterRaw.name as string) ?? row.name,
      teamName: afterRaw.teamId ? teamNameByIdForCards.get(afterRaw.teamId as string) : null,
      position: afterRaw.position as string | null,
      birthDate: afterRaw.birthDate as Date | null,
      hireDate: afterRaw.hireDate as Date | null,
    });
  }

  const grouped = new Map<string, typeof batch.rows>();
  for (const status of STATUS_ORDER) grouped.set(status, []);
  for (const row of batch.rows) {
    if (!grouped.has(row.status)) grouped.set(row.status, []);
    grouped.get(row.status)!.push(row);
  }

  const actionableStatuses = new Set(["NEW", "CHANGED", "TERMINATION"]);
  const approvedActionableCount = batch.rows.filter(
    (r) => r.approved && actionableStatuses.has(r.status)
  ).length;
  const needsMappingCount = grouped.get("NEEDS_MAPPING")?.length ?? 0;

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const teamDeltas = new Map<string, { adds: string[]; removes: string[] }>();
  for (const row of batch.rows) {
    if (row.status !== "NEW" && row.status !== "CHANGED") continue;
    const diff = (row.diff as FieldDiff[] | null) ?? [];
    const teamDiff = diff.find((d) => d.field === "teamId");
    if (!teamDiff) continue;
    const before = teamDiff.before as string | null;
    const after = teamDiff.after as string | null;
    if (after) {
      if (!teamDeltas.has(after)) teamDeltas.set(after, { adds: [], removes: [] });
      teamDeltas.get(after)!.adds.push(row.name);
    }
    if (before) {
      if (!teamDeltas.has(before)) teamDeltas.set(before, { adds: [], removes: [] });
      teamDeltas.get(before)!.removes.push(row.name);
    }
  }

  const execChanges: { name: string; before: Position | null; after: Position }[] = [];
  for (const row of batch.rows) {
    if (row.status !== "NEW" && row.status !== "CHANGED") continue;
    const diff = (row.diff as FieldDiff[] | null) ?? [];
    const posDiff = diff.find((d) => d.field === "position");
    if (!posDiff) continue;
    const before = (posDiff.before as Position | null) ?? null;
    const after = posDiff.after as Position;
    if (EXECUTIVE_POSITIONS.includes(after) || (before && EXECUTIVE_POSITIONS.includes(before))) {
      execChanges.push({ name: row.name, before, after });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/platform/data-upload/erp-import" className="text-sm text-brand-green hover:underline">
          ← 업로드 이력으로
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">ERP 배치 검토</h1>
        <p className="mt-1 text-sm text-slate-500">
          {batch.fileName} · {batch.uploadedBy.name} 업로드 · {batch.createdAt.toLocaleString("ko-KR")} ·
          총 {batch.totalRows}행
        </p>
      </div>

      {batch.status !== "PENDING_REVIEW" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p>
            이 배치는 이미{" "}
            {batch.status === "APPLIED" ? "반영완료" : batch.status === "ROLLED_BACK" ? "되돌려짐" : "폐기됨"}{" "}
            상태입니다.
            {batch.appliedAt && ` (반영: ${batch.appliedAt.toLocaleString("ko-KR")})`}
            {batch.rolledBackAt && ` (되돌림: ${batch.rolledBackAt.toLocaleString("ko-KR")})`}
          </p>
          {batch.status === "APPLIED" && <RollbackBatchButton batchId={batch.id} />}
        </div>
      )}

      {batch.status === "PENDING_REVIEW" && execChanges.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-medium">경영진 구성 변경</h2>
          <p className="mb-3 text-sm text-slate-500">
            사장·운영책임·책임 직책이 걸린 사람은 조직도에서 팀 트리가 아니라 상단 경영진 영역에 따로
            표시돼요. 이번 배치로 그 영역 구성이 이렇게 바뀝니다.
          </p>
          <div className="flex flex-col gap-2">
            {execChanges.map((c, i) => (
              <div key={i} className="rounded border border-slate-100 p-3 text-sm">
                <span className="font-medium">{c.name}</span>: {c.before ? POSITION_LABEL[c.before] : "(신규)"} →{" "}
                <span className="font-medium text-brand-green-dark">{POSITION_LABEL[c.after]}</span>
                {EXECUTIVE_POSITIONS.includes(c.after) && !(c.before && EXECUTIVE_POSITIONS.includes(c.before)) && (
                  <span className="ml-2 text-emerald-700">(경영진 영역에 새로 표시됨)</span>
                )}
                {c.before && EXECUTIVE_POSITIONS.includes(c.before) && !EXECUTIVE_POSITIONS.includes(c.after) && (
                  <span className="ml-2 text-rose-700">(경영진 영역에서 빠짐)</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {batch.status === "PENDING_REVIEW" && teamDeltas.size > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-medium">팀 구성 변경 요약</h2>
          <div className="flex flex-col gap-2">
            {[...teamDeltas.entries()].map(([teamId, delta]) => (
              <div key={teamId} className="rounded border border-slate-100 p-3 text-sm">
                <p className="font-medium">{teamNameById.get(teamId) ?? "알 수 없는 팀"}</p>
                {delta.adds.length > 0 && (
                  <p className="text-emerald-700">영입: {delta.adds.join(", ")}</p>
                )}
                {delta.removes.length > 0 && (
                  <p className="text-rose-700">이탈: {delta.removes.join(", ")}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {batch.status === "PENDING_REVIEW" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">
            &ldquo;테스트 반영&rdquo;은 실제 반영과 완전히 동일한 로직을 실행하지만 끝에서 항상 취소되어
            데이터베이스에 저장되지 않습니다 — 다른 직원에게 노출되지 않고 결과만 확인할 수 있습니다.
          </p>
          {needsMappingCount > 0 && (
            <p className="text-sm text-amber-700">
              매핑 필요 {needsMappingCount}건이 남아있습니다. 먼저 지정해야 해당 행이 반영 대상에 포함됩니다.
            </p>
          )}
          <div className="ml-auto flex flex-wrap items-start gap-2">
            <DiscardBatchButton batchId={batch.id} />
            <ApplyBatchButton batchId={batch.id} count={approvedActionableCount} dryRun />
            <ApplyBatchButton batchId={batch.id} count={approvedActionableCount} />
          </div>
        </div>
      )}

      {STATUS_ORDER.map((status) => {
        const rows = grouped.get(status) ?? [];
        if (rows.length === 0) return null;
        return (
          <section key={status} className={`rounded-lg border p-4 ${STATUS_COLOR[status]}`}>
            <h2 className="mb-3 font-medium">
              {STATUS_LABEL[status]} ({rows.length})
            </h2>
            <div className="flex flex-col gap-3">
              {rows.map((row) => {
                const raw = row.rawData as RawErpRow;
                return (
                  <div
                    key={row.id}
                    className="flex flex-col gap-2 rounded border border-white/60 bg-white p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium">
                        {row.name} <span className="text-slate-400">({row.employeeNumber})</span>
                      </p>

                      {status === "NEEDS_MAPPING" &&
                        (() => {
                          const need = whichMappingNeeded(raw, ctx);
                          return (
                            <div className="flex flex-col gap-2">
                              {need.positionRawKey && (
                                <PositionMappingPicker batchId={batch.id} rawKey={need.positionRawKey} />
                              )}
                              {need.teamRawKey && (
                                <TeamMappingPicker batchId={batch.id} rawKey={need.teamRawKey} teams={teams} />
                              )}
                            </div>
                          );
                        })()}

                      {status === "NEW" && cardsByRowId.get(row.id) && (
                        <EmployeePreviewCard label="신규 생성" data={cardsByRowId.get(row.id)!} />
                      )}

                      {(status === "NEW" || status === "CHANGED" || status === "TERMINATION") && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-slate-500">바뀌는 항목</p>
                          <DiffTable diff={(row.diff as FieldDiff[] | null) ?? []} />
                        </div>
                      )}

                      {status === "ERROR" && (
                        <span className="text-sm text-red-600">{row.errorMessage}</span>
                      )}
                    </div>

                    {actionableStatuses.has(status) && batch.status === "PENDING_REVIEW" && (
                      <ApprovalToggle rowId={row.id} approved={row.approved} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
