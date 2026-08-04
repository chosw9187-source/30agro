export function DonutChart({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const size = 160;
  const radius = 58;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
        <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
          {total === 0 ? (
            <circle r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
          ) : (
            segments.map((seg) => {
              const fraction = seg.value / total;
              const dash = fraction * circumference;
              const offset = -(cumulative / total) * circumference;
              cumulative += seg.value;
              return (
                <circle
                  key={seg.label}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={offset}
                />
              );
            })
          )}
        </g>
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={18}
          fontWeight={600}
          fill="#334155"
        >
          {total}명
        </text>
      </svg>
      <div className="flex flex-col gap-2 text-sm">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            {seg.label} {seg.value}명
            {total > 0 && ` (${Math.round((seg.value / total) * 100)}%)`}
          </span>
        ))}
      </div>
    </div>
  );
}
