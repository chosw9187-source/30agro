export function TrendChart({
  points,
}: {
  points: { label: string; hires: number; terminations: number }[];
}) {
  const width = 600;
  const height = 160;
  const padding = 20;
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
      <svg viewBox={`0 0 ${width} ${height + 16}`} className="w-full">
        <path d={pathFor("hires")} fill="none" stroke="#1f9a44" strokeWidth={2} />
        <path d={pathFor("terminations")} fill="none" stroke="#f59e0b" strokeWidth={2} />
        {points.map((p, i) => {
          const [hx, hy] = toXY(p.hires, i);
          const [tx, ty] = toXY(p.terminations, i);
          return (
            <g key={p.label}>
              <circle cx={hx} cy={hy} r={3} fill="#1f9a44" />
              <circle cx={tx} cy={ty} r={3} fill="#f59e0b" />
              <text
                x={hx}
                y={height + 12}
                fontSize={9}
                textAnchor="middle"
                fill="#64748b"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-xs text-slate-500">
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
