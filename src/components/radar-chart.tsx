import { wrapLabel } from "@/components/competency-radar";

type RadarItem = {
  label: string;
  self: number | null;
  manager: number | null;
  maxScore: number;
};

/*
  축 이름은 **자르지도, 잘리지도 않게** 둔다. 예전에는 뷰박스를 정사각으로 좁게
  잡고 이름을 한 줄로 그려서, 「인사정보 보안 및 개인정보보호」처럼 긴 이름이
  그림 밖으로 나가 끝이 잘려 보였다. 이름은 두 줄로 접고(`wrapLabel`), 좌우
  여백은 한 줄 길이만큼 잡는다 — 평가2의 방사형과 같은 규칙이다.
*/
const LABEL_FONT = 12;
const LABEL_MAX = 9;
const LINE_HEIGHT = 14;

export function RadarChart({ items }: { items: RadarItem[] }) {
  const radius = 100;
  const angleStep = (2 * Math.PI) / items.length;
  const wrapped = items.map((it) => wrapLabel(it.label, LABEL_MAX));
  const maxLines = Math.max(1, ...wrapped.map((w) => w.length));
  const padX = LABEL_MAX * LABEL_FONT + 18;
  const padY = 22 + maxLines * LINE_HEIGHT;
  const boxW = radius * 2 + padX * 2;
  const boxH = radius * 2 + padY * 2;
  const cx = boxW / 2;
  const cy = boxH / 2;

  function toXY(value: number, index: number, max: number) {
    const angle = angleStep * index - Math.PI / 2;
    const r = (Math.max(0, value) / max) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function ringPoints(fraction: number) {
    return items
      .map((_, i) => {
        const angle = angleStep * i - Math.PI / 2;
        const r = radius * fraction;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
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
      <svg viewBox={`0 0 ${boxW} ${boxH}`} className="h-auto w-full max-w-md">
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
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
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
          const labelRadius = radius + 20;
          const x = cx + labelRadius * Math.cos(angle);
          const y = cy + labelRadius * Math.sin(angle);
          const cos = Math.cos(angle);
          /* 왼쪽 축은 오른쪽 정렬해야 그림에 겹치지 않는다. */
          const anchor =
            Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
          const lines = wrapped[i];
          const top = y - ((lines.length - 1) * LINE_HEIGHT) / 2;
          return (
            <text
              key={i}
              x={x}
              y={top}
              fontSize={LABEL_FONT}
              textAnchor={anchor}
              dominantBaseline="middle"
              fill="#475569"
            >
              <title>{it.label}</title>
              {lines.map((line, k) => (
                <tspan key={line + k} x={x} dy={k === 0 ? 0 : LINE_HEIGHT}>
                  {line}
                </tspan>
              ))}
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
          <span className="inline-block h-2 w-2 rounded-full bg-brand-green" />
          팀장평가
        </span>
      </div>
    </div>
  );
}
