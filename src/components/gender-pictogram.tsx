const WIDTH = 90;
const HEIGHT = 130;

function PersonSilhouette({ fill }: { fill: string }) {
  return (
    <g fill={fill}>
      <circle cx={45} cy={20} r={15} />
      <rect x={15} y={45} width={12} height={35} rx={6} />
      <rect x={63} y={45} width={12} height={35} rx={6} />
      <rect x={25} y={40} width={40} height={45} rx={12} />
      <rect x={27} y={85} width={15} height={40} rx={6} />
      <rect x={48} y={85} width={15} height={40} rx={6} />
    </g>
  );
}

function PersonFigure({
  percent,
  color,
  label,
}: {
  percent: number;
  color: string;
  label: string;
}) {
  const fillY = HEIGHT - (percent / 100) * HEIGHT;
  const clipId = `gender-fill-${label}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-xl font-bold" style={{ color }}>
        {Math.round(percent)}%
      </p>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={fillY} width={WIDTH} height={HEIGHT - fillY} />
          </clipPath>
        </defs>
        <PersonSilhouette fill="#d1d5db" />
        <g clipPath={`url(#${clipId})`}>
          <PersonSilhouette fill={color} />
        </g>
      </svg>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function GenderPictogram({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  return (
    <div className="flex items-end justify-center gap-8">
      {segments.map((seg) => (
        <PersonFigure
          key={seg.label}
          percent={total > 0 ? (seg.value / total) * 100 : 0}
          color={seg.color}
          label={seg.label}
        />
      ))}
    </div>
  );
}
