type RadarItem = {
  label: string;
  self: number | null;
  manager: number | null;
  maxScore: number;
};

export function RadarChart({ items }: { items: RadarItem[] }) {
  const size = 340;
  const center = size / 2;
  const radius = size / 2 - 70;
  const angleStep = (2 * Math.PI) / items.length;

  function toXY(value: number, index: number, max: number) {
    const angle = angleStep * index - Math.PI / 2;
    const r = (Math.max(0, value) / max) * radius;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  }

  function ringPoints(fraction: number) {
    return items
      .map((_, i) => {
        const angle = angleStep * i - Math.PI / 2;
        const r = radius * fraction;
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
      })
      .join(" ");
  }

  const selfPoints = items
    .map((it, i) => toXY(it.self ?? 0, i, it.maxScore))
    .map(([x, y]) => `${x},${y}`)
    .join(" ");

  const managerPoints = items
    .map((it, i) => toXY(it.manager ?? 0, i, it.maxScore))
    .map(([x, y]) => `${x},${y}`)
    .join(" ");

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-sm">
        {[0.2, 0.4, 0.6, 0.8, 1].map((f) => (
          <polygon
            key={f}
            points={ringPoints(f)}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        ))}
        {items.map((_, i) => {
          const angle = angleStep * i - Math.PI / 2;
          const x = center + radius * Math.cos(angle);
          const y = center + radius * Math.sin(angle);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          );
        })}
        <polygon
          points={managerPoints}
          fill="#0f172a"
          fillOpacity={0.12}
          stroke="#0f172a"
          strokeWidth={2}
        />
        <polygon
          points={selfPoints}
          fill="#3b82f6"
          fillOpacity={0.18}
          stroke="#3b82f6"
          strokeWidth={2}
        />
        {items.map((it, i) => {
          const angle = angleStep * i - Math.PI / 2;
          const labelRadius = radius + 32;
          const x = center + labelRadius * Math.cos(angle);
          const y = center + labelRadius * Math.sin(angle);
          return (
            <text
              key={i}
              x={x}
              y={y}
              fontSize={10}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#475569"
            >
              {it.label}
            </text>
          );
        })}
      </svg>
      <div className="flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
          자기평가
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-900" />
          팀장평가
        </span>
      </div>
    </div>
  );
}
