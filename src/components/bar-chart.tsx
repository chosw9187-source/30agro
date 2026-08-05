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
  const width = 280;
  const chartHeight = 200;
  const topPadding = showPercent ? 40 : 24;
  const bottomLabelHeight = 26;
  const barGap = 12;
  const barWidth = (width - barGap * (bars.length - 1)) / bars.length;

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-sm text-slate-500">{title}</p>
      <svg
        viewBox={`0 0 ${width} ${topPadding + chartHeight + bottomLabelHeight}`}
        className="w-full max-w-sm"
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
                  y={y - 21}
                  fontSize={12}
                  textAnchor="middle"
                  fill="#94a3b8"
                >
                  {pct.toFixed(1)}%
                </text>
              )}
              <text
                x={x + barWidth / 2}
                y={y - 6}
                fontSize={14}
                textAnchor="middle"
                fill="#334155"
              >
                {b.count}명
              </text>
              <text
                x={x + barWidth / 2}
                y={topPadding + chartHeight + 18}
                fontSize={13}
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
