export function BarChart({
  title,
  bars,
  showPercent = false,
  color = "#3b82f6",
}: {
  title: string;
  bars: { label: string; count: number }[];
  showPercent?: boolean;
  color?: string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  const total = bars.reduce((s, b) => s + b.count, 0);
  const width = bars.length * 84;
  const chartHeight = 200;
  const topPadding = showPercent ? 66 : 42;
  const bottomLabelHeight = 40;
  const barGap = 14;
  const barWidth = (width - barGap * (bars.length - 1)) / bars.length;

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-lg text-slate-500">{title}</p>
      <svg
        viewBox={`0 0 ${width} ${topPadding + chartHeight + bottomLabelHeight}`}
        className="w-full"
      >
        {bars.map((b, i) => {
          const barHeight = (b.count / max) * chartHeight;
          const x = i * (barWidth + barGap);
          const y = topPadding + (chartHeight - barHeight);
          const pct = total > 0 ? (b.count / total) * 100 : 0;
          return (
            <g key={b.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={3}
                fill={color}
                fillOpacity={0.75}
              />
              {showPercent && (
                <text
                  x={x + barWidth / 2}
                  y={y - 36}
                  fontSize={17}
                  textAnchor="middle"
                  fill="#94a3b8"
                >
                  {pct.toFixed(1)}%
                </text>
              )}
              <text
                x={x + barWidth / 2}
                y={y - 10}
                fontSize={22}
                textAnchor="middle"
                fill="#334155"
              >
                {b.count}명
              </text>
              <text
                x={x + barWidth / 2}
                y={topPadding + chartHeight + 28}
                fontSize={18}
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
