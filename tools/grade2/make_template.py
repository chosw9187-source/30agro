"""직급 분류(신규 기준) 업로드 양식을 만든다.

사용법: python3 tools/grade2/make_template.py
결과: tools/grade2/직급분류_업로드양식.xlsx
"""
import pathlib

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

HERE = pathlib.Path(__file__).resolve().parent
H = ['사번', '이름', '생년월일', '나이', '부서', '직군', '직책', '현직급', '입사일', '현직급 발령일', '현직급 기간', '조정(±년)',
     '신입 여부', '경력인정(년)', '년차(수기)', '현 연봉', '인사평가', '직무 역할', '최종 확정', '2차 년차', '특이사항']
REQ = {'사번', '이름', '현직급', '입사일', '현직급 발령일', '신입 여부', '현 연봉'}          # 필수
ONE = {'생년월일', '나이'}                                         # 둘 중 하나 필수 (남은 정년 · 정년 최종연봉)
W = [9, 9, 12, 6, 12, 8, 8, 7, 12, 13, 11, 9, 8, 10, 9, 13, 8, 15, 9, 8, 8]

wb = openpyxl.Workbook()
ws = wb.active
ws.title = '기본정보'
ws.append(H)
ws.append(['260001', '홍길동', '1990-03-15', None, '작물보호팀', '일반직', '담당', 'G2', '2018-01-02', '2022-04-01', None, 0, '경력', 2, None,
           52000000, 'A', None, None, None, None])
ws.append(['260002', '김예시', None, 27, '생산팀', '기술직', '담당', 'G1', '2024-03-04', '2024-03-04', None, None, '신입', None, None,
           41000000, 'S', None, None, None, None])
fill = {'req': PatternFill('solid', fgColor='0C6A3D'), 'one': PatternFill('solid', fgColor='B85F0C'),
        'opt': PatternFill('solid', fgColor='173A5E')}
thin = Side(style='thin', color='B9C7BF')
for i, h in enumerate(H, 1):
    c = ws.cell(1, i)
    c.font = Font(bold=True, color='FFFFFF')
    c.fill = fill['req'] if h in REQ else fill['one'] if h in ONE else fill['opt']
    c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    ws.column_dimensions[c.column_letter].width = W[i - 1]
for r in (2, 3):
    for i in range(1, len(H) + 1):
        c = ws.cell(r, i)
        c.font = Font(color='8A8A8A', italic=True)
        c.border = Border(top=thin, bottom=thin, left=thin, right=thin)
for r in range(2, 501):
    ws[f'A{r}'].number_format = '@'
    ws[f'P{r}'].number_format = '#,##0'


def listv(formula, rng, msg):
    d = DataValidation(type='list', formula1=formula, allow_blank=True, showErrorMessage=True, errorTitle='입력 확인', error=msg)
    ws.add_data_validation(d)
    d.add(rng)


listv('"G1,G2,G3,G4,G5,G6"', 'H2:H500', '현직급은 G1~G6 중에서 고르세요')
listv('"신입,경력"', 'M2:M500', '신입 여부는 신입 또는 경력')
listv('"S,A+,A,B,C"', 'Q2:Q500', '인사평가는 S, A+, A, B, C 중에서 고르세요')
listv('"정형 업무,자율 · 기획 업무,과제 리딩,전략적 판단"', 'R2:R500', '직무 역할 4개 중에서 고르거나 비워 두세요')
listv('"G1,G2,G3,G4"', 'S2:S500', '최종 확정은 G1~G4 중에서 고르거나 비워 두세요')
listv('"특이"', 'U2:U500', '특이사항은 「특이」 또는 빈칸')
ws.freeze_panes = 'C2'
ws.auto_filter.ref = 'A1:U1'

g = wb.create_sheet('작성 안내')
rows = [
    ['열', '필수', '입력 방법 · 사용처'],
    ['사번', '필수', '앞자리 0을 유지하려면 텍스트로 입력 (이 양식은 텍스트 서식)'],
    ['이름', '필수', '이름이 비어 있는 행은 읽지 않음'],
    ['생년월일 / 나이', '둘 중 하나', '생년월일(1990-03-15)을 넣으면 나이 자동 = 나이 기준연도 − 출생연도 → 참고사항 「남은 정년 · 정년 최종연봉」'],
    ['부서 · 직군 · 직책', '선택', '표시 · 검색용'],
    ['현직급', '필수', 'G1 ~ G6 (목록 선택) → (1) 현직급 변환 · (3) 현직급별 직무 역할 직급'],
    ['입사일', '필수', '2018-01-02 형식 → 입사일 ~ 현직급 발령일 기간 → (2) 년차'],
    ['현직급 발령일', '필수', '→ 현직급 기간 자동 → (2) 년차. 발령일이 없으면 「현직급 기간」에 0년0개월 형식으로 입력 (신입은 입사일과 같게)'],
    ['현직급 기간', '선택', '발령일이 없을 때만 사용 (예: 4년3개월)'],
    ['조정(±년)', '선택', '현직급 기간에 더할 연수 (예: 3, −1) → (2) 년차'],
    ['신입 여부', '필수', '신입 / 경력 (목록 선택) → 신입은 입사일부터 년차 계산, 경력인정 없음'],
    ['년차(수기)', '선택', '자동 계산 대신 쓸 년차 숫자 (비우면 자동 계산)'],
    ['경력인정(년)', '경력직', '입사 전 인정 경력 연수 (예: 2, 1.5) → (2) 년차 / 신입은 비움'],
    ['※ 년차', '', '기준일(2027.01.01) 연도 − 입사 연도 + 1 (입사 연도 = 1년차, 예: 25년 입사 → 27년 3년차) / 경력직은 + 경력인정 / 조정(±년) 반영'],
    ['현 연봉', '필수', '원 단위 숫자 → (4) 연봉 Pay-band · 밴드 이탈(빨간 표시) · 정년 최종연봉'],
    ['인사평가', '선택', 'S · A+ · A · B · C → 정년 최종연봉 · 생애연봉 승진 누락 (비우면 S)'],
    ['직무 역할', '선택', '비우면 분류 기준 (3) 현직급별 직무 역할 직급 일괄 적용 / 넣으면 개인 값 우선'],
    ['최종 확정', '선택', 'G1 ~ G4 (비우면 종합 등급 적용, 현 연봉이 해당 밴드 밖이면 빨간 표시)'],
    ['2차 년차', '선택', '숫자 (비우면 현 연봉 기준 자동)'],
    ['특이사항', '선택', '「특이」 입력 시 보고용 특이인원'],
    [],
    ['※ 머리글 색: 초록 = 필수 / 주황 = 둘 중 하나 필수 / 남색 = 선택'],
    ['※ 머리글 이름으로 열을 찾으므로 열 순서는 바꿔도 됨'],
    ['※ 2~3행은 가상 예시 인원 → 지우고 입력'],
    ['※ 사이트 [1차 분류 › 기본정보 › 엑셀 다운로드] 파일도 그대로 다시 올릴 수 있음'],
]
for r in rows:
    g.append(r)
for c in g[1]:
    c.font = Font(bold=True, color='FFFFFF')
    c.fill = fill['opt']
g.column_dimensions['A'].width = 18
g.column_dimensions['B'].width = 11
g.column_dimensions['C'].width = 90
out = HERE / '직급분류_업로드양식.xlsx'
wb.save(out)
print(out)
