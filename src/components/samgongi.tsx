/**
 * 삼공이 — 한국삼공 마스코트.
 *
 * 공식 캐릭터 이미지(비트맵) 대신 벡터로 그려둔 이유: 챗봇 화면에서
 * 히어로(120px+)와 말풍선 아바타(28px)로 같은 그림을 쓰는데, 비트맵은
 * 둘 중 한쪽에서 반드시 뭉개진다. 또 public/에 바이너리를 두지 않아
 * 오프라인·저대역 환경에서도 추가 요청 없이 즉시 뜬다.
 *
 * 공식 원화 파일로 교체할 때는 이 컴포넌트 내부만 <Image>로 바꾸면 되고,
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
        <radialGradient id="sg-body" cx="34%" cy="26%" r="80%">
          <stop offset="0%" stopColor="#c2ee79" />
          <stop offset="52%" stopColor="#7bc92a" />
          <stop offset="100%" stopColor="#4a9410" />
        </radialGradient>
        <radialGradient id="sg-ball" cx="32%" cy="26%" r="75%">
          <stop offset="0%" stopColor="#ecfaff" />
          <stop offset="50%" stopColor="#86d3ef" />
          <stop offset="100%" stopColor="#2f9ec9" />
        </radialGradient>
        <linearGradient id="sg-leaf" x1="10%" y1="90%" x2="90%" y2="10%">
          <stop offset="0%" stopColor="#4a9410" />
          <stop offset="100%" stopColor="#a3e055" />
        </linearGradient>
      </defs>

      {/* 바닥 그림자 — 캐릭터가 떠 보이지 않게 잡아준다. */}
      <ellipse cx="100" cy="187" rx="44" ry="7.5" fill="#111827" opacity="0.13" />

      {/* 잎사귀: 몸통 뒤에서 오른쪽으로 뻗는다. */}
      <g>
        <path
          d="M136 108 C150 86 174 80 192 84 C188 108 166 124 138 116 Z"
          fill="url(#sg-leaf)"
        />
        <path
          d="M141 113 C157 106 174 97 189 86"
          fill="none"
          stroke="#3d7d0c"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.55"
        />
      </g>

      {/* 뒤쪽 다리(걷는 자세라 살짝 뒤에 둔다) */}
      <rect x="74" y="152" width="21" height="30" rx="10.5" fill="#4a9410" />
      {/* 왼팔 */}
      <path
        d="M62 116 C46 116 36 127 39 139 C50 143 60 135 66 125 Z"
        fill="#5aa518"
      />

      {/* 몸통 + 머리 (한 덩어리) */}
      <path
        d="M100 28
           C126 28 147 49 147 75
           C147 92 139 106 127 115
           C136 123 141 134 141 145
           C141 160 123 170 100 170
           C77 170 59 160 59 145
           C59 134 64 123 73 115
           C61 106 53 92 53 75
           C53 49 74 28 100 28 Z"
        fill="url(#sg-body)"
      />

      {/* 머리 위 작은 뿔 */}
      <path d="M70 41 C63 27 71 18 82 24 C82 32 77 38 70 41 Z" fill="#6cbb22" />

      {/* 앞쪽 다리 */}
      <rect x="104" y="155" width="23" height="30" rx="11.5" fill="#63b01d" />

      {/* 광택 하이라이트 */}
      <ellipse
        cx="80"
        cy="55"
        rx="17"
        ry="12"
        fill="#ffffff"
        opacity="0.34"
        transform="rotate(-28 80 55)"
      />

      {/* 머리 위 물방울 구슬 — 삼공이의 식별 포인트 */}
      <circle cx="131" cy="35" r="15" fill="url(#sg-ball)" />
      <ellipse cx="126" cy="29" rx="5" ry="3.4" fill="#ffffff" opacity="0.75" transform="rotate(-30 126 29)" />

      {/* 얼굴 */}
      <g fill="#173a0c">
        <ellipse cx="85" cy="76" rx="5.4" ry="7" />
        <ellipse cx="113" cy="76" rx="5.4" ry="7" />
      </g>
      <circle cx="86.8" cy="73.4" r="1.8" fill="#ffffff" opacity="0.9" />
      <circle cx="114.8" cy="73.4" r="1.8" fill="#ffffff" opacity="0.9" />
      <path
        d="M89 92 Q100 102 111 92"
        fill="none"
        stroke="#173a0c"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
