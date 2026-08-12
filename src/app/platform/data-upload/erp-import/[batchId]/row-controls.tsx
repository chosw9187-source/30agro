"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { POSITIONS, POSITION_LABEL, type Position } from "@/lib/permission-constants";
import { TEAM_MAPPING_NONE } from "@/lib/erp-constants";
import {
  toggleRowApproval,
  resolvePositionMapping,
  resolveTeamMapping,
  createTeamAndMapErp,
  applyErpBatch,
  discardBatch,
  deleteErpBatch,
  rollbackErpBatch,
} from "../actions";

export function ApprovalToggle({ rowId, approved }: { rowId: string; approved: boolean }) {
  const [isPending, startTransition] = useTransition();
  return (
    <label className="flex shrink-0 items-center gap-2 text-sm">
      <input
        type="checkbox"
        defaultChecked={approved}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(() => {
            toggleRowApproval(rowId, next);
          });
        }}
      />
      반영 승인
    </label>
  );
}

export function PositionMappingPicker({ batchId, rawKey }: { batchId: string; rawKey: string }) {
  const [isPending, startTransition] = useTransition();
  const [jikchaek, jikwi] = rawKey.split("|");
  const [position, setPosition] = useState<Position | "">("");
  const [hidden, setHidden] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
      <span>
        직책 <strong>{jikchaek || "—"}</strong> / 직위 <strong>{jikwi || "—"}</strong> → 시스템 직책:
      </span>
      <select
        disabled={isPending}
        value={position}
        className="rounded border border-slate-300 px-2 py-1"
        onChange={(e) => setPosition(e.target.value as Position)}
      >
        <option value="">선택</option>
        {POSITIONS.map((p) => (
          <option key={p} value={p}>
            {POSITION_LABEL[p]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
        조직도·직원조회에서 숨김 (감사·자문위원 등 일반 조직 구성원이 아닌 경우)
      </label>
      <button
        type="button"
        disabled={isPending || !position}
        onClick={() => {
          startTransition(() => {
            resolvePositionMapping(batchId, rawKey, position as Position, hidden);
          });
        }}
        className="rounded bg-brand-green px-3 py-1 text-white hover:bg-brand-green-dark disabled:opacity-50"
      >
        적용
      </button>
    </div>
  );
}

export function TeamMappingPicker({
  batchId,
  rawKey,
  teams,
}: {
  batchId: string;
  rawKey: string;
  teams: { id: string; name: string; businessUnit: string | null; division: string | null }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState(rawKey);
  const [businessUnit, setBusinessUnit] = useState("");
  const [division, setDivision] = useState("");

  return (
    <div className="flex flex-col gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          ERP 부서명 <strong>{rawKey || "(없음)"}</strong> → 팀:
        </span>
        <select
          disabled={isPending}
          defaultValue=""
          className="rounded border border-slate-300 px-2 py-1"
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            if (value === "__CREATE__") {
              setShowCreate(true);
              return;
            }
            startTransition(() => {
              resolveTeamMapping(batchId, rawKey, value);
            });
          }}
        >
          <option value="">선택</option>
          <option value={TEAM_MAPPING_NONE}>팀 배정 안 함</option>
          <option value="__CREATE__">새 팀 만들기...</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.businessUnit || t.division ? ` (${[t.businessUnit, t.division].filter(Boolean).join(" / ")})` : ""}
            </option>
          ))}
        </select>
      </div>

      {showCreate && (
        <div className="flex flex-wrap items-center gap-2 border-t border-amber-200 pt-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="팀명"
            className="w-32 rounded border border-slate-300 px-2 py-1"
          />
          <input
            value={businessUnit}
            onChange={(e) => setBusinessUnit(e.target.value)}
            placeholder="사업단위"
            className="w-32 rounded border border-slate-300 px-2 py-1"
          />
          <input
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            placeholder="본부"
            className="w-32 rounded border border-slate-300 px-2 py-1"
          />
          <button
            type="button"
            disabled={isPending || !name.trim()}
            onClick={() => {
              startTransition(() => {
                createTeamAndMapErp(batchId, rawKey, name.trim(), businessUnit.trim(), division.trim());
              });
              setShowCreate(false);
            }}
            className="rounded bg-brand-green px-3 py-1 text-white hover:bg-brand-green-dark disabled:opacity-50"
          >
            팀 생성 및 연결
          </button>
        </div>
      )}
    </div>
  );
}

export function ApplyBatchButton({
  batchId,
  count,
  dryRun = false,
}: {
  batchId: string;
  count: number;
  dryRun?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending || count === 0}
        onClick={() => {
          if (
            !dryRun &&
            !window.confirm(`승인된 ${count}건을 실제 직원 데이터에 반영할까요? 다른 직원에게도 즉시 노출됩니다.`)
          )
            return;
          startTransition(async () => {
            const r = await applyErpBatch(batchId, dryRun);
            const parts = [`생성 ${r.created}`, `수정 ${r.updated}`, `퇴직전환 ${r.terminated}`];
            if (r.skippedStale.length > 0) parts.push(`건너뜀(변경됨) ${r.skippedStale.length}`);
            if (r.errors.length > 0) parts.push(`오류 ${r.errors.length}`);
            setResult((dryRun ? "[테스트, 저장 안 됨] " : "") + parts.join(" · "));
            if (!dryRun) router.refresh();
          });
        }}
        className={
          dryRun
            ? "rounded border border-brand-green px-4 py-2 text-sm text-brand-green-dark hover:bg-brand-green-light/40 disabled:opacity-50"
            : "rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark disabled:opacity-50"
        }
      >
        {isPending
          ? dryRun
            ? "테스트 중..."
            : "반영 중..."
          : dryRun
            ? `테스트 반영 (저장 안 함, ${count}건)`
            : `승인된 ${count}건 반영`}
      </button>
      {result && <p className="text-xs text-slate-500">{result}</p>}
    </div>
  );
}

export function DiscardBatchButton({ batchId }: { batchId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm("이 배치를 폐기할까요? 반영되지 않습니다.")) return;
        startTransition(() => {
          discardBatch(batchId);
        });
      }}
      className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      폐기
    </button>
  );
}

/**
 * 폐기와 다르게 이 배치의 원본 데이터를 DB에서 완전히 삭제한다.
 * 되돌릴 수 없으니, 원본 파일에 민감정보가 섞여 있었던 경우처럼
 * 데이터 자체를 지워야 할 때만 사용.
 */
export function DeleteBatchButton({ batchId }: { batchId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (
          !window.confirm(
            "이 배치의 원본 데이터를 DB에서 완전히 삭제할까요? 되돌릴 수 없습니다."
          )
        )
          return;
        startTransition(() => {
          deleteErpBatch(batchId);
        });
      }}
      className="rounded border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      완전 삭제
    </button>
  );
}

export function RollbackBatchButton({ batchId }: { batchId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (
            !window.confirm(
              "이 배치를 되돌릴까요? 변경/퇴직전환 항목은 이전 값으로 복구됩니다. 단, 신규 생성된 사람과 팀장 교체 관련 권한 변경은 자동으로 되돌려지지 않으니 목록으로 따로 확인해야 합니다."
            )
          )
            return;
          startTransition(async () => {
            const r = await rollbackErpBatch(batchId);
            const parts = [`복구 ${r.restored}건`];
            if (r.createdNeedsReview.length > 0) {
              parts.push(`신규 생성분 확인 필요 ${r.createdNeedsReview.length}건: ${r.createdNeedsReview.join(", ")}`);
            }
            if (r.errors.length > 0) parts.push(`오류 ${r.errors.length}`);
            setResult(parts.join(" · "));
            router.refresh();
          });
        }}
        className="rounded border border-rose-300 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        {isPending ? "되돌리는 중..." : "이 배치 되돌리기"}
      </button>
      {result && <p className="text-xs text-slate-500">{result}</p>}
    </div>
  );
}
