-- 시연이 끝난 뒤 테스트 계정과 삼공팀을 지운다.
-- 셸을 쓸 수 있으면 `npm run demo:accounts:remove` 쪽이 안전하다.
--
-- 권한 override와 알림은 User가 지워질 때 함께 지워진다(ON DELETE CASCADE).
-- 이 계정으로 만든 자료(예: 온보딩 기수)가 남아 있으면 삭제가 막힌다 —
-- 그때는 그 자료를 먼저 지우거나 다른 사람 앞으로 옮긴 뒤 다시 실행한다.

BEGIN;

-- 팀장으로 걸려 있으면 사용자가 지워지지 않으므로 먼저 푼다.
UPDATE "Team" SET "leaderId" = NULL WHERE name = '삼공팀';

DELETE FROM "User" WHERE email IN ('leader@demo.kr', 'staff1@demo.kr', 'staff2@demo.kr');

-- 다른 팀원이 남아 있으면 팀은 지우지 않는다.
DELETE FROM "Team" t
WHERE t.name = '삼공팀'
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."teamId" = t.id);

COMMIT;
