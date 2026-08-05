export function TrendChart({
  points,
}: {
  points: { label: string; shortLabel: string; hires: number; terminations: number }[];
}) {
  const width = Math.max(600, points.length * 60);
  const height = 220;
  const padding = 40;
  const max = Math.max(1, ...points.map((p) => Math.max(p.hires, p.terminations)));
  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  function toXY(value: number, index: number) {
    const x = padding + index * stepX;
    const y = height - padding - (value / max) * (height - padding * 2);
    return [x, y] as const;
  }

  function pathFor(key: "hires" | "terminations") {
    return points
      .map((p, i) => {
        const [x, y] = toXY(p[key], i);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  }

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height + 34}`} className="w-full">
        <path d={pathFor("hires")} fill="none" stroke="#1f9a44" strokeWidth={2} />
        <path d={pathFor("terminations")} fill="none" stroke="#f59e0b" strokeWidth={2} />
        {points.map((p, i) => {
          const [hx, hy] = toXY(p.hires, i);
          const [tx, ty] = toXY(p.terminations, i);
          // Put each label on the side with more clearance from the other
          // series' point, so labels don't sit on top of the crossing line.
          const hireAbove = hy <= ty;
          return (
            <g key={p.label}>
              <circle cx={hx} cy={hy} r={4} fill="#1f9a44" />
              <circle cx={tx} cy={ty} r={4} fill="#f59e0b" />
              {p.hires > 0 && (
                <text
                  x={hx}
                  y={hireAbove ? hy - 12 : hy + 22}
                  fontSize={18}
                  textAnchor="middle"
                  fill="#1f9a44"
                >
                  {p.hires}
                </text>
              )}
              {p.terminations > 0 && (
                <text
                  x={tx}
                  y={hireAbove ? ty + 22 : ty - 12}
                  fontSize={18}
                  textAnchor="middle"
                  fill="#f59e0b"
                >
                  {p.terminations}
                </text>
              )}
              <text
                x={hx}
                y={height + 26}
                fontSize={14}
                textAnchor="middle"
                fill="#64748b"
              >
                {p.shortLabel}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-base text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-green" />
          입사
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          퇴사
        </span>
      </div>
    </div>
  );
}
