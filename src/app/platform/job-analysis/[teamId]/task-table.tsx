"use client";

import { useState, useTransition } from "react";
import { deleteJobTask, updateJobTaskField, type EditableTextField } from "../actions";

export type JobTaskRow = {
  id: string;
  category: string | null;
  name: string;
  detail: string | null;
  requiredGrade: string | null;
  outputs: string | null;
  relatedDept: string | null;
  legalBasis: string | null;
  frequency: string | null;
  source: string;
};

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "직접 입력",
  PDF_EXTRACT: "직무기술서",
  EXCEL_IMPORT: "엑셀",
};

/** 편집 가능한 텍스트 필드는 하나도 빠짐없이 표에 둔다 — 임포트로 값이
 *  들어왔는데 화면에 없는 컬럼이 생기면 확인할 방법이 없어진다. */
const COLUMNS: { field: EditableTextField; label: string; width: string }[] = [
  { field: "category", label: "책임·역할", width: "w-32" },
  { field: "name", label: "단위업무명", width: "w-56" },
  { field: "detail", label: "세부 수행내용", width: "w-72" },
  { field: "requiredGrade", label: "적정직급", width: "w-24" },
  { field: "frequency", label: "수행주기", width: "w-24" },
  { field: "outputs", label: "산출물", width: "w-40" },
  { field: "relatedDept", label: "관련부서", width: "w-32" },
  { field: "legalBasis", label: "근거 규정", width: "w-40" },
];

export function TaskTable({ tasks, editable }: { tasks: JobTaskRow[]; editable: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="w-12 px-3 py-2 font-medium">#</th>
            {COLUMNS.map((c) => (
              <th key={c.field} className="px-3 py-2 font-medium">
                {c.label}
              </th>
            ))}
            <th className="w-24 px-3 py-2 font-medium">출처</th>
            {editable && <th className="w-16 px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, i) => (
            <tr key={task.id} className="border-t border-slate-100 align-top">
              <td className="px-3 py-2 text-slate-400">{i + 1}</td>
              {COLUMNS.map((c) => (
                <td key={c.field} className="px-3 py-2">
                  {editable ? (
                    <CellEditor
                      taskId={task.id}
                      field={c.field}
                      value={task[c.field]}
                      width={c.width}
                    />
                  ) : (
                    <span className="text-slate-700">{task[c.field] || "-"}</span>
                  )}
                </td>
              ))}
              <td className="px-3 py-2 text-xs text-slate-500">
                {SOURCE_LABEL[task.source] ?? task.source}
              </td>
              {editable && (
                <td className="px-3 py-2">
                  <DeleteButton taskId={task.id} name={task.name} />
                </td>
              )}
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 3} className="px-3 py-6 text-center text-slate-500">
                아직 등록된 단위업무가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CellEditor({
  taskId,
  field,
  value,
  width,
}: {
  taskId: string;
  field: EditableTextField;
  value: string | null;
  width: string;
}) {
  const [val, setVal] = useState(value ?? "");
  const [isPending, startTransition] = useTransition();

  function commit() {
    const trimmed = val.trim();
    if (trimmed === (value ?? "")) return;
    // 단위업무명은 비울 수 없다 — 서버에서도 거부하므로 화면 값을 되돌린다.
    if (field === "name" && !trimmed) {
      setVal(value ?? "");
      return;
    }
    startTransition(() => {
      updateJobTaskField(taskId, field, trimmed);
    });
  }

  return (
    <input
      value={val}
      placeholder="-"
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      disabled={isPending}
      className={`${width} rounded border border-transparent px-1.5 py-1 text-slate-700 hover:border-slate-300 focus:border-brand-green focus:outline-none disabled:opacity-50`}
    />
  );
}

function DeleteButton({ taskId, name }: { taskId: string; name: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm(`'${name}' 단위업무를 삭제할까요?`)) return;
        startTransition(() => {
          deleteJobTask(taskId);
        });
      }}
      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-red-400 hover:text-red-600 disabled:opacity-50"
    >
      삭제
    </button>
  );
}
