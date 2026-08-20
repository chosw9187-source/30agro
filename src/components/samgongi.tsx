/**
 * 삼공이 — 한국삼공 마스코트.
 *
 * 공식 캐릭터 원화(비트맵) 대신 벡터로 그려둔 이유: 챗봇 화면에서
 * 히어로(120px+)와 말풍선 아바타(28px)로 같은 그림을 쓰는데, 비트맵은
 * 둘 중 한쪽에서 반드시 뭉개진다. 또 public/에 바이너리를 두지 않아
 * 오프라인·저대역 환경에서도 추가 요청 없이 즉시 뜬다.
 *
 * 어디까지나 원화를 보고 옮긴 그림이라 완전히 같지는 않다. 공식 파일을
 * 받으면 이 컴포넌트 내부만 <img src="/samgongi.svg">로 바꾸면 되고,
 * 호출부(size/className)는 그대로 두면 된다.
 */
export function Samgongi({
  className,
  title = "삼공이",
}: {
  className?: string;
  /** 아바타처럼 장식으로만 쓸 때는 ""를 넘겨 스크린리더에서 숨긴다. */
  title?: string;
}) {
  const decorative = title === "";

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
    >
      <defs>
        {/* 왼쪽 위에서 빛을 받는 몸통. 원화의 광택감이 여기서 나온다. */}
        <radialGradient id="sg-body" cx="34%" cy="20%" r="82%">
          <stop offset="0%" stopColor="#cbf578" />
          <stop offset="38%" stopColor="#95d92e" />
          <stop offset="72%" stopColor="#63bb12" />
          <stop offset="100%" stopColor="#3d8c05" />
        </radialGradient>
        <radialGradient id="sg-limb" cx="35%" cy="25%" r="85%">
          <stop offset="0%" stopColor="#9ade36" />
          <stop offset="100%" stopColor="#4a9a08" />
        </radialGradient>
        <radialGradient id="sg-bead" cx="32%" cy="26%" r="78%">
          <stop offset="0%" stopColor="#eafaff" />
          <stop offset="42%" stopColor="#8fd8f2" />
          <stop offset="100%" stopColor="#2790c4" />
        </radialGradient>
        <linearGradient id="sg-leaf" x1="12%" y1="92%" x2="88%" y2="8%">
          <stop offset="0%" stopColor="#2f7d10" />
          <stop offset="55%" stopColor="#57ab1c" />
          <stop offset="100%" stopColor="#8ccc42" />
        </linearGradient>
      </defs>

      {/* 바닥 그림자 — 원화처럼 오른쪽으로 살짝 흘린다. */}
      <ellipse cx="105" cy="192" rx="41" ry="6.5" fill="#1f2937" opacity="0.17" />

      {/* 잎사귀: 몸통 오른쪽에서 위로 뻗는다. 몸통보다 뒤에 둬야 겹침이 자연스럽다. */}
      <g>
        <path
          d="M130 122 C132 96 152 70 186 58 C186 96 168 124 142 131 C136 132 131 129 130 122 Z"
          fill="url(#sg-leaf)"
        />
        <path
          d="M136 126 C146 108 162 86 183 63"
          fill="none"
          stroke="#24660b"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.45"
        />
      </g>

      {/* 뒤쪽 팔·다리는 몸통 뒤에 깔아 걷는 자세를 만든다. */}
      <path
        d="M74 122 C58 126 44 138 41 152 C40 158 46 161 51 157 C60 149 69 138 78 130 Z"
        fill="#4f9e0a"
      />
      <rect x="73" y="150" width="26" height="36" rx="13" fill="#4a9608" />

      {/* 몸통 + 머리 한 덩어리. 머리가 크고 몸이 살짝 좁은 조롱박 실루엣. */}
      <path
        d="M100 24
           C129 24 149 47 149 75
           C149 94 140 108 127 116
           C133 123 136 133 135 143
           C133 158 119 166 100 166
           C81 166 67 158 65 143
           C64 133 67 123 73 116
           C60 108 51 94 51 75
           C51 47 71 24 100 24 Z"
        fill="url(#sg-body)"
      />

      {/* 머리 위 뿔 — 원화의 왼쪽 뾰족한 돌기. */}
      <path d="M71 36 C61 22 68 11 80 18 C81 27 78 33 71 36 Z" fill="#7ac71c" />

      {/* 앞쪽 다리 — 뒤쪽보다 낮고 앞으로 나와 걷는 동작이 된다. */}
      <rect x="103" y="153" width="27" height="37" rx="13.5" fill="url(#sg-limb)" />
      {/* 앞쪽 팔 */}
      <path
        d="M126 124 C140 130 149 141 150 152 C150 158 144 160 140 155 C133 147 127 138 122 131 Z"
        fill="url(#sg-limb)"
      />

      {/* 광택 — 큰 덩어리 하나와 작고 밝은 점 하나로 유약 바른 느낌을 낸다. */}
      <ellipse
        cx="77"
        cy="53"
        rx="19"
        ry="13"
        fill="#ffffff"
        opacity="0.34"
        transform="rotate(-30 77 53)"
      />
      <ellipse
        cx="70"
        cy="46"
        rx="7"
        ry="4.5"
        fill="#ffffff"
        opacity="0.6"
        transform="rotate(-30 70 46)"
      />

      {/* 머리 위 물방울 구슬 — 삼공이의 식별 포인트. */}
      <circle cx="133" cy="37" r="16" fill="url(#sg-bead)" />
      <ellipse
        cx="127"
        cy="30"
        rx="5.5"
        ry="3.6"
        fill="#ffffff"
        opacity="0.8"
        transform="rotate(-32 127 30)"
      />

      {/* 얼굴 — 큰 눈 두 개와 넓고 순한 미소. */}
      <g fill="#12300a">
        <ellipse cx="84" cy="78" rx="6.2" ry="8" />
        <ellipse cx="114" cy="78" rx="6.2" ry="8" />
      </g>
      <circle cx="86" cy="74.6" r="2" fill="#ffffff" opacity="0.92" />
      <circle cx="116" cy="74.6" r="2" fill="#ffffff" opacity="0.92" />
      <path
        d="M83 94 Q99 106 115 94"
        fill="none"
        stroke="#12300a"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
