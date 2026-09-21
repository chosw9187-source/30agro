import { COMPETENCY_MAX, COMPETENCY_SCALE } from "@/lib/competency";

/**
 * 역량평가 방사형 차트 — 자기평가와 팀장평가의 **모양**을 겹쳐 본다.
 *
 * 막대나 점으로 늘어놓는 편이 값을 읽기에는 낫지만, 이 차트가 답해야 하는 물음은
 * «어느 역량이 몇 점인가»가 아니라 «자기평가와 팀장평가가 전체적으로 맞는가»다
 * (사내 결과지에 그렇게 적혀 있다). 두 겹의 모양이 포개지는지 어긋나는지는 방사형이
 * 한눈에 보여 준다. 정확한 값은 바로 옆 표가 맡는다.
 *
 * 구 평가 모듈의 `RadarChart`와 따로 두는 이유는 축의 뜻이 다르기 때문이다. 그쪽은
 * 문항마다 만점이 달라 비율로 그리고, 이쪽은 모든 축이 1~5 한 눈금이라 눈금을
 * 1~5로 그려 넣을 수 있다 — 점수가 곧 눈금이라 값을 되짚을 필요가 없다.
 *
 * 색은 두 계열뿐이다 — 자기평가 파랑, 팀장평가 주황. 빨강은 쓰지 않는다: 이 앱에서
 * 빨강은 «지연·미입력» 같은 상태를 뜻해서, 사람 계열에 쓰면 팀장평가가 경고처럼
 * 읽힌다. 파랑·주황은 색약에서도 갈리는 짝이다(ΔE 24 이상).
 *
 * 글자는 계열 색을 입지 않는다(회색 잉크). 색은 선과 점이 지고, 이름은 읽히기만
 * 하면 된다.
 */

export type CompetencyRadarAxis = {
  label: string;
  self: number | null;
  lead: number | null;
};

const SELF_COLOR = "#2a78d6";
const LEAD_COLOR = "#c98500";

/**
 * 축 이름을 **줄로 접는다 — 자르지 않는다.**
 *
 * 예전에는 일곱 자에서 「인사정보 보…」처럼 끊었다. 온전한 이름이 옆 표에 있다고는
 * 해도, 차트만 보는 사람에게는 어느 역량인지 모르는 축이 절반이었다. 띄어쓰기에서
 * 먼저 접고, 띄어쓰기가 없어 한 줄이 여전히 길면 글자 수로 접는다.
 */
export function wrapLabel(label: string, max = 9): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of label.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = word;
    else if (`${cur} ${word}`.length <= max) cur = `${cur} ${word}`;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);

  const out: string[] = [];
  for (const line of lines) {
    if (line.length <= max) {
      out.push(line);
      continue;
    }
    for (let i = 0; i < line.length; i += max) out.push(line.slice(i, i + max));
  }
  return out.length > 0 ? out : [label];
}

export function CompetencyRadar({
  axes,
  size = 300,
  className = "",
}: {
  axes: CompetencyRadarAxis[];
  size?: number;
  className?: string;
}) {
  const n = axes.length;
  if (n < 3) return null;

  /*
    라벨이 바깥으로 나가므로 그림 자리보다 뷰박스를 넉넉히 잡는다. 9시·3시 방향
    라벨이 가장 멀리 뻗으니 그 길이로 잡는다 — 한 줄 최대 글자 수 × 글자 크기에
    지름 바깥 여백을 더한 만큼. 좁게 잡았더니 「고객 충성도 유지」의 첫 자가 잘려
    나갔다.

    이름은 이제 자르지 않고 두 줄로 접으므로(`wrapLabel`) 한 줄은 아홉 자까지다 —
    그만큼 여백도 넓혔다. 뷰박스가 칸 너비에 맞춰 줄어드니 글자 «단위»가 커야
    화면에서 읽히는 크기가 나온다(10.5로 뒀을 때는 8px까지 내려가 읽을 수 없었다).
  */
  const LABEL_FONT = 15;
  const LABEL_MAX = 9;
  const LINE_HEIGHT = 17;
  const wrapped = axes.map((a) => wrapLabel(a.label, LABEL_MAX));
  const maxLines = Math.max(1, ...wrapped.map((w) => w.length));
  /*
    여백은 **좌우와 위아래를 따로** 잡는다. 이름이 가장 멀리 뻗는 곳은 9시·3시
    방향이라 좌우만 이름 길이만큼 필요하고, 위아래는 접힌 줄 수만큼이면 된다.
    네 변을 똑같이 주면 위아래가 통째로 비어 그림만 작아진다.
  */
  const padX = LABEL_MAX * LABEL_FONT + 20;
  const padY = 24 + maxLines * LINE_HEIGHT;
  const boxW = size + padX * 2;
  const boxH = size + padY * 2;
  const cx = boxW / 2;
  const cy = boxH / 2;
  const r = size / 2;

  /** 축 i의 값 v(1~5)가 놓이는 자리. 12시부터 시계방향으로 돈다. */
  const point = (i: number, v: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const radius = (r * v) / COMPETENCY_MAX;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  };

  const ringPath = (v: number) =>
    axes
      .map((_, i) => {
        const [x, y] = point(i, v);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z";

  const seriesPath = (pick: (a: CompetencyRadarAxis) => number | null) => {
    // 빈 축은 가운데로 떨어뜨리지 않고 건너뛴다 — 0으로 그리면 «못한다»로 읽힌다.
    const drawn = axes
      .map((a, i) => {
        const v = pick(a);
        return v == null ? null : point(i, v);
      })
      .filter((p): p is number[] => p !== null);
    if (drawn.length < 3) return null;
    return (
      drawn
        .map(
          ([x, y], i) =>
            `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`,
        )
        .join(" ") + " Z"
    );
  };

  const series = [
    {
      name: "자기평가",
      color: SELF_COLOR,
      path: seriesPath((a) => a.self),
      pick: (a: CompetencyRadarAxis) => a.self,
    },
    {
      name: "팀장평가",
      color: LEAD_COLOR,
      path: seriesPath((a) => a.lead),
      pick: (a: CompetencyRadarAxis) => a.lead,
    },
  ];

  return (
    <figure className={`m-0 flex flex-col items-center gap-1 ${className}`}>
      {/* 계열이 둘이면 범례는 늘 있다 — 색만으로 누구 점수인지 알게 두지 않는다. */}
      <figcaption className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true">
              <line
                x1="1"
                y1="4"
                x2="17"
                y2="4"
                stroke={s.color}
                strokeWidth="2"
              />
              <circle cx="9" cy="4" r="3.5" fill={s.color} />
            </svg>
            {s.name}
          </span>
        ))}
      </figcaption>

      <svg
        viewBox={`0 0 ${boxW} ${boxH}`}
        className="h-auto w-full max-w-[520px]"
        role="img"
        aria-label={`역량별 자기평가와 팀장평가 방사형 비교 — ${axes
          .map((a) => a.label)
          .join(", ")}`}
      >
        {/* 눈금 다섯 겹. 옅게 둬서 값이 앞에 서게 한다. */}
        {COMPETENCY_SCALE.map((row) => (
          <path
            key={`ring-${row.score}`}
            d={ringPath(row.score)}
            fill="none"
            stroke="#e2e8e4"
            strokeWidth="1"
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, COMPETENCY_MAX);
          return (
            <line
              key={`spoke-${i}`}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="#e2e8e4"
              strokeWidth="1"
            />
          );
        })}

        {/*
          눈금 이름 — 12시 축을 따라 1에서 5까지. **숫자로 적는다**: 축마다 찍힌
          점도 1~5이고 옆 표의 값도 1~5인데 눈금만 「부족·미흡·보통·우수·탁월」로
          적혀 있으면, 점이 어느 눈금에 놓였는지 눈으로 되짚어야 한다. 말뜻은
          눈금에 마우스를 올리면 나온다(「3 (보통)」).

          흰 테를 둘러 눈금선·계열선 위에서도 숫자가 읽히게 한다 — paintOrder를
          주지 않으면 테가 글자를 덮는다.
        */}
        {COMPETENCY_SCALE.map((row) => {
          const [, y] = point(0, row.score);
          return (
            <text
              key={`tick-${row.score}`}
              x={cx + 5}
              y={y + 4}
              className="fill-slate-500"
              fontSize="15"
              fontWeight="600"
              stroke="#ffffff"
              strokeWidth="3"
              paintOrder="stroke"
            >
              <title>{`${row.score} (${row.label})`}</title>
              {row.score}
            </text>
          );
        })}

        {/* 값 — 면은 옅게, 선은 2px. 두 겹이 겹쳐도 아래가 보이게 한다. */}
        {series.map(
          (s) =>
            s.path && (
              <path
                key={`area-${s.name}`}
                d={s.path}
                fill={s.color}
                fillOpacity="0.1"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            ),
        )}
        {series.map((s) =>
          axes.map((a, i) => {
            const v = s.pick(a);
            if (v == null) return null;
            const [x, y] = point(i, v);
            return (
              <circle
                key={`dot-${s.name}-${i}`}
                cx={x}
                cy={y}
                r="4.5"
                fill={s.color}
                /* 겹친 점끼리 붙어 보이지 않게 흰 테를 두른다. */
                stroke="#ffffff"
                strokeWidth="2"
              >
                <title>{`${a.label} · ${s.name} ${v}점`}</title>
              </circle>
            );
          }),
        )}

        {/*
          축 이름 — 바깥에. 왼쪽 축은 오른쪽 정렬해야 그림에 겹치지 않는다.
          긴 이름은 두 줄로 접어 **온전히** 적는다(`wrapLabel`). 여러 줄이면
          가운데가 축에 맞도록 위로 반 줄씩 올려 시작한다.
        */}
        {axes.map((a, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const lx = cx + (r + 18) * Math.cos(angle);
          const ly = cy + (r + 18) * Math.sin(angle);
          const cos = Math.cos(angle);
          const anchor =
            Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
          const lines = wrapped[i];
          const top = ly + 5 - ((lines.length - 1) * LINE_HEIGHT) / 2;
          return (
            <text
              key={`label-${i}`}
              x={lx}
              y={top}
              textAnchor={anchor}
              className="fill-slate-700"
              fontSize={LABEL_FONT}
              fontWeight="500"
            >
              <title>{a.label}</title>
              {lines.map((line, k) => (
                <tspan key={line + k} x={lx} dy={k === 0 ? 0 : LINE_HEIGHT}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </svg>
    </figure>
  );
}
