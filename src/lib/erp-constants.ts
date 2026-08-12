/**
 * 클라이언트 컴포넌트에서도 안전하게 쓸 수 있는 작은 상수만 모아둔 파일.
 * erp-import.ts는 xlsx/adm-zip처럼 Node 전용 모듈을 쓰기 때문에 클라이언트
 * 번들에 절대 들어가면 안 된다 — 그쪽에서 값만 필요한 곳은 이 파일에서
 * import한다.
 */
export const TEAM_MAPPING_NONE = "__NONE__";
