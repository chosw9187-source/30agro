# SG ERP 매일 10시 엑셀 자동 다운로드

매일 10:00에 http://www.sgerp.com/ 에 로그인해 지정 화면을 엑셀로 내려받고
**바탕화면\ERP자동업로드** 폴더에 `SGERP_날짜_시간.xlsx` 로 저장합니다.

> 사내망(회사 와이파이)에 연결된 **이 PC에서** 실행되어야 합니다.

## 최초 설치 (1회, 약 15분)

| 순서 | 파일 | 하는 일 |
|---|---|---|
| 사전 | Python 설치 | https://www.python.org/downloads/ → 설치 시 **"Add python.exe to PATH" 체크** |
| 0 | `0_설치.bat` | 필요한 프로그램(playwright, keyring) 설치 |
| 1 | `1_계정등록.bat` | ERP 아이디/비밀번호를 **Windows 자격 증명 관리자**에 암호화 저장 (파일에 남지 않음) |
| 2 | `2_화면녹화.bat` | Edge 창이 열리면 평소처럼 로그인 → 메뉴 → 조회 → 엑셀 클릭. 녹화 창의 코드를 복사 |
| ↳ | `config.json` | 녹화 코드를 보고 각 단계 `selector` 를 채움 (녹화 코드를 담당자/Claude에게 전달하면 대신 채워드립니다. **코드 속 비밀번호는 지우고 전달**) |
| 3 | `3_테스트실행.bat` | 브라우저가 보이는 상태로 1회 실행 → 바탕화면 폴더에 파일 생성 확인 |
| 4 | `4_매일10시_등록.bat` | Windows 작업 스케줄러에 매일 10:00 등록 |

해제: `5_자동실행_해제.bat`

## 운영 기준
- **PC 전원**: 10시에 PC가 켜져 있고 Windows에 로그인된 상태여야 합니다. 절전 상태면 깨워서 실행하고, 꺼져 있었다면 켜진 직후 실행합니다.
- **실패 시**: 자동으로 2회 재시도합니다. 최종 실패하면 저장 폴더에 `[실패]_날짜.txt` 가 생기고,
  `logs\` 폴더에 로그와 오류 화면 캡처(png)가 남습니다.
- **비밀번호 변경 시**: `1_계정등록.bat` 만 다시 실행합니다.
- **ERP 화면 변경 시**: `2_화면녹화.bat` 로 다시 녹화해 `config.json` 을 수정합니다.

## config.json 단계(action) 종류
| action | 용도 | 필요 값 |
|---|---|---|
| `fill` | 입력칸에 값 입력 | `selector`, `value` (`{ID}` `{PW}` `{TODAY}` `{YESTERDAY}` 사용 가능) |
| `click` | 버튼/메뉴 클릭 | `selector` |
| `select` | 드롭다운 선택 | `selector`, `value` |
| `press` | 키 입력 | `selector`, `key` (예: `Enter`) |
| `wait` | 대기 | `ms` |
| `wait_for` | 요소가 나타날 때까지 대기 | `selector` |
| `goto` | 주소로 이동 | `url` |
| `download` | 클릭해 파일 저장 (마지막 단계) | `selector` |

화면이 iframe 안에 있으면 단계에 `"frames": ["iframe#main"]` 처럼 추가합니다.
Edge 가 없으면 `config.json` 의 `browser_channel` 을 `""` 로 바꾸고 `python -m playwright install chromium` 실행.
