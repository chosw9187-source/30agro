export function BarChart({
  title,
  bars,
}: {
  title: string;
  bars: { label: string; count: number }[];
}) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  const width = 280;
  const height = 140;
  const barGap = 12;
  const barWidth = (width - barGap * (bars.length - 1)) / bars.length;

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-xs text-slate-500">{title}</p>
      <svg viewBox={`0 0 ${width} ${height + 20}`} className="w-full max-w-xs">
        {bars.map((b, i) => {
          const barHeight = (b.count / max) * height;
          const x = i * (barWidth + barGap);
          const y = height - barHeight;
          return (
            <g key={b.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={3}
                fill="#3b82f6"
                fillOpacity={0.75}
              />
              <text
                x={x + barWidth / 2}
                y={y - 4}
                fontSize={11}
                textAnchor="middle"
                fill="#334155"
              >
                {b.count}
              </text>
              <text
                x={x + barWidth / 2}
                y={height + 14}
                fontSize={10}
                textAnchor="middle"
                fill="#64748b"
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
