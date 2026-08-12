/**
 * 서버가 한국이 아닌 리전(Railway 등)에서 돌 수 있어서, `timeZone` 없이
 * toLocaleString/toLocaleDateString을 쓰면 화면에 서버 로컬 시간대로
 * 찍혀 실제 한국 시간과 몇 시간(심하면 날짜까지) 어긋난다. 날짜/시각을
 * 표시할 땐 항상 이 함수들을 통해 Asia/Seoul로 고정해서 렌더링한다.
 */
export function formatKSTDateTime(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(date).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", ...options });
}

export function formatKSTDate(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(date).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", ...options });
}
