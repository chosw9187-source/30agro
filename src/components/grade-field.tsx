import { GRADE_ORDER, GRADE_POINTS, parseGradeCriteria } from "@/lib/grade";

export function GradeField({
  name,
  criteria,
  defaultValue,
  disabled,
}: {
  name: string;
  criteria: string | null;
  defaultValue?: string | null;
  disabled?: boolean;
}) {
  const parsed = parseGradeCriteria(criteria);

  return (
    <div className="flex flex-col gap-2">
      {GRADE_ORDER.map((g) => (
        <label
          key={g}
          className="flex items-start gap-2 rounded border border-slate-200 p-2 text-sm"
        >
          <input
            type="radio"
            name={name}
            value={g}
            defaultChecked={defaultValue === g}
            disabled={disabled}
            className="mt-1"
          />
          <span>
            <span className="font-medium">
              {g} ({GRADE_POINTS[g]}점)
            </span>
            {parsed[g] && (
              <span className="ml-2 text-slate-500">{parsed[g]}</span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}
