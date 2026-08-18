export function TrafficTrendChart({
  points,
}: {
  points: { label: string; shortLabel: string; views: number; visitors: number }[];
}) {
  const width = Math.max(600, points.length * 36);
  const height = 220;
  const padding = 40;
  const max = Math.max(1, ...points.map((p) => Math.max(p.views, p.visitors)));
  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  function toXY(value: number, index: number) {
    const x = padding + index * stepX;
    const y = height - padding - (value / max) * (height - padding * 2);
    return [x, y] as const;
  }

  function pathFor(key: "views" | "visitors") {
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
        <path d={pathFor("views")} fill="none" stroke="#1f9a44" strokeWidth={2} />
        <path d={pathFor("visitors")} fill="none" stroke="#3b82f6" strokeWidth={2} />
        {points.map((p, i) => {
          const [vx, vy] = toXY(p.views, i);
          const [ux, uy] = toXY(p.visitors, i);
          return (
            <g key={p.label}>
              <circle cx={vx} cy={vy} r={3} fill="#1f9a44" />
              <circle cx={ux} cy={uy} r={3} fill="#3b82f6" />
              {i % Math.ceil(points.length / 15 || 1) === 0 && (
                <text x={vx} y={height + 26} fontSize={12} textAnchor="middle" fill="#64748b">
                  {p.shortLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-sm text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-green" />
          총 조회수
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
          순 방문자
        </span>
      </div>
    </div>
  );
}
