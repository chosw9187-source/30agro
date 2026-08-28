-- 시연용 테스트 계정 만들기 — 셸 없이 DB 콘솔에서 붙여넣어 쓰는 판.
-- 되도록 `npm run demo:accounts` 쪽을 쓰고, Railway 웹 콘솔처럼 SQL만
-- 넣을 수 있는 자리에서 이 파일을 쓴다. 두 번 실행해도 같은 결과다.
--
-- 지울 때는 scripts/demo-accounts-remove.sql.
--
-- 비밀번호는 세 계정 모두 demo1234! — 아래 해시가 그 값의 bcrypt다.

BEGIN;

INSERT INTO "Team" (id, name, active, "sortOrder")
VALUES ('demo-team-samgong', '삼공팀', true, 900)
ON CONFLICT (name) DO UPDATE SET active = true;

INSERT INTO "User" (id, name, email, "employeeNumber", "passwordHash", role, position, "teamId", "mustChangePassword")
VALUES
  ('demo-user-leader', '김팀장', 'leader@demo.kr', 'DEMO001',
   '$2b$10$Z9KJ8hZiI847NCLDz3c7VO08gVycBf8wH./J.7DjoVNb/GzT7K.BW',
   'EMPLOYEE', 'TEAM_LEADER', (SELECT id FROM "Team" WHERE name = '삼공팀'), false),
  ('demo-user-staff1', '김담당', 'staff1@demo.kr', 'DEMO002',
   '$2b$10$Z9KJ8hZiI847NCLDz3c7VO08gVycBf8wH./J.7DjoVNb/GzT7K.BW',
   'EMPLOYEE', 'STAFF', (SELECT id FROM "Team" WHERE name = '삼공팀'), false),
  ('demo-user-staff2', '이담당', 'staff2@demo.kr', 'DEMO003',
   '$2b$10$Z9KJ8hZiI847NCLDz3c7VO08gVycBf8wH./J.7DjoVNb/GzT7K.BW',
   'EMPLOYEE', 'STAFF', (SELECT id FROM "Team" WHERE name = '삼공팀'), false)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  "employeeNumber" = EXCLUDED."employeeNumber",
  "passwordHash" = EXCLUDED."passwordHash",
  role = EXCLUDED.role,
  position = EXCLUDED.position,
  "teamId" = EXCLUDED."teamId",
  "mustChangePassword" = false,
  "terminationDate" = NULL;

UPDATE "Team" SET "leaderId" = (SELECT id FROM "User" WHERE email = 'leader@demo.kr')
WHERE name = '삼공팀';

-- 모듈 10개를 이 세 사람에게만 «전체(FULL)»로 연다. 직책별 권한 매트릭스는
-- 건드리지 않는다 — 그쪽을 고치면 시연과 무관한 직원들 화면까지 바뀐다.
INSERT INTO "UserPermissionOverride" (id, "userId", module, scope)
SELECT 'demo-perm-' || u.id || '-' || m::text, u.id, m, 'FULL'
FROM "User" u
CROSS JOIN unnest(ARRAY[
  'EMPLOYEES','ORG_CHART','JOB_MANAGEMENT','TASK_MANAGEMENT','LEGAL_LIBRARY',
  'HR_REPORT','EVALUATION','EVALUATION_V2','TALENT_ASSESSMENT','ONBOARDING'
]::"Module"[]) m
WHERE u.email IN ('leader@demo.kr', 'staff1@demo.kr', 'staff2@demo.kr')
ON CONFLICT ("userId", module) DO UPDATE SET scope = 'FULL';

COMMIT;

-- 사이드바에는 관문이 하나 더 있다: 관리자가 [화면 구성]에서 «숨김»으로 꺼 둔
-- 모듈은 관리자가 아닌 사람에게 아예 안 보인다. 아래로 확인하고, 켜야 한다면
-- 그 아래 UPDATE를 실행한다(전 직원에게 함께 적용되므로 시연 뒤 되돌릴 것).
--
--   SELECT module FROM "ModuleUiConfig" WHERE hidden;
--   UPDATE "ModuleUiConfig" SET hidden = false WHERE hidden;
