/**
 * 평가 진행 현황 **벤 다이어그램** — 세 가지 일이 어디까지 겹쳐 끝났는가.
 *
 * 「17명 중 4명 완료」 한 줄로는 *무엇이* 안 끝났는지 알 수 없다. 시즌의 일감은
 * 세 갈래이고(본인 자기평가 · 1차 평가자 점수 · 역량평가), 사람마다 끝낸 조합이
 * 다르다 — 자기평가만 한 사람, 평가자만 적은 사람, 둘 다 끝냈는데 역량이 빈 사람.
 * 겹치는 칸이 그대로 그 조합의 사람 수다.
 *
 * 세 가지 색은 앱의 계열색을 그대로 쓴다(초록 · 보라 · 주황). 색약에서도 갈리는
 * 짝이고(ΔE 29.5), 원마다 이름을 직접 붙여 색만으로 구분하게 두지 않는다.
 *
 * 아무 일감도 없는 사람(목표 미등록)은 원 밖이다 — 그 수는 그림 아래에 적는다.
 */

export type VennCounts = {
  /** 세 집합 각각에 «든» 사람 수가 아니라, 사람마다의 세 가지 참/거짓 목록. */
  rows: { a: boolean; b: boolean; c: boolean }[];
  labels: { a: string; b: string; c: string };
};

const COLOR = {
  a: "#1f9a44", // brand-green — 본인이 할 일
  b: "#4a3aa7", // goal-4 — 1차 평가자가 할 일
  c: "#c98500", // goal-3 — 역량평가
};

export function EvalVenn({ rows, labels }: VennCounts) {
  const n = (f: (r: VennCounts["rows"][number]) => boolean) =>
    rows.filter(f).length;

  const only = {
    a: n((r) => r.a && !r.b && !r.c),
    b: n((r) => !r.a && r.b && !r.c),
    c: n((r) => !r.a && !r.b && r.c),
    ab: n((r) => r.a && r.b && !r.c),
    ac: n((r) => r.a && !r.b && r.c),
    bc: n((r) => !r.a && r.b && r.c),
    abc: n((r) => r.a && r.b && r.c),
    none: n((r) => !r.a && !r.b && !r.c),
  };
  const total = rows.length;
  const totals = {
    a: n((r) => r.a),
    b: n((r) => r.b),
    c: n((r) => r.c),
  };

  /* 원 셋을 정삼각으로 놓는다 — 겹치는 칸 일곱 개가 모두 같은 넓이로 열린다. */
  const R = 66;
  const cx = 170;
  const cy = 150;
  const pos = {
    a: { x: cx - 38, y: cy - 26 },
    b: { x: cx + 38, y: cy - 26 },
    c: { x: cx, y: cy + 40 },
  };

  /** 칸 안의 숫자. 0이면 흐리게 — 빈 칸이 눈에 걸리면 겹침이 안 읽힌다. */
  const count = (x: number, y: number, value: number, key: string) => (
    <text
      key={key}
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize="17"
      fontWeight="700"
      className={value > 0 ? "fill-slate-900" : "fill-slate-300"}
    >
      {value}
    </text>
  );

  const legend = [
    { key: "a", label: labels.a, color: COLOR.a, done: totals.a },
    { key: "b", label: labels.b, color: COLOR.b, done: totals.b },
    { key: "c", label: labels.c, color: COLOR.c, done: totals.c },
  ];

  return (
    <figure className="m-0 flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 340 300"
        className="h-auto w-full max-w-[340px]"
        role="img"
        aria-label={`평가 진행 현황 벤 다이어그램 — 대상 ${total}명, 세 가지 모두 끝낸 사람 ${only.abc}명`}
      >
        {(["a", "b", "c"] as const).map((k) => (
          <circle
            key={k}
            cx={pos[k].x}
            cy={pos[k].y}
            r={R}
            fill={COLOR[k]}
            fillOpacity="0.14"
            stroke={COLOR[k]}
            strokeWidth="2"
          />
        ))}

        {/* 홑칸 · 두 칸 겹침 · 세 칸 겹침 — 자리는 정삼각의 대칭점들이다. */}
        {count(pos.a.x - 34, pos.a.y - 20, only.a, "a")}
        {count(pos.b.x + 34, pos.b.y - 20, only.b, "b")}
        {count(pos.c.x, pos.c.y + 38, only.c, "c")}
        {count(cx, cy - 44, only.ab, "ab")}
        {count(cx - 44, cy + 20, only.ac, "ac")}
        {count(cx + 44, cy + 20, only.bc, "bc")}
        {count(cx, cy - 2, only.abc, "abc")}

        {/* 원 이름은 바깥에 직접 붙인다 — 색만으로 구분하게 두지 않는다. */}
        <text
          x={pos.a.x - 58}
          y={pos.a.y - 56}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fill={COLOR.a}
        >
          {labels.a}
        </text>
        <text
          x={pos.b.x + 58}
          y={pos.b.y - 56}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fill={COLOR.b}
        >
          {labels.b}
        </text>
        <text
          x={pos.c.x}
          y={pos.c.y + 84}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fill={COLOR.c}
        >
          {labels.c}
        </text>
      </svg>

      <figcaption className="flex flex-col items-center gap-1">
        <span className="text-xs break-keep text-slate-600">
          가운데 <b className="text-slate-900">{only.abc}명</b>이 세 가지를 모두
          끝냈습니다 · 대상 {total}명
        </span>
        <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {legend.map((l) => (
            <span
              key={l.key}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-600"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: l.color }}
                aria-hidden="true"
              />
              {l.label} {l.done}명
            </span>
          ))}
        </span>
        {only.none > 0 && (
          <span className="text-[11px] break-keep text-status-critical">
            원 밖 {only.none}명은 아직 아무 칸도 끝내지 못했습니다
          </span>
        )}
      </figcaption>
    </figure>
  );
}
