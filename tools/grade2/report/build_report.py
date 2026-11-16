"""직급 재분류 결과 보고 (안) - 개편안 양식(Navy-Green). 실행: python3 build_report.py [sim.json]"""
import json, sys
from sgdeck import *
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION

SIM = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "sim.json", encoding="utf-8"))
TBD = "확인 필요"
man = lambda v: f"{round(v / 1e4):,}"          # 원 → 만원
p = new_deck()

# ---------------- 표지 ----------------
cover(p, "직급 재분류 결과 보고 (안)", "2026. 11.   |   인사팀")

# ---------------- 1. 프로세스 및 기준 ----------------
s = blank(p)
title(s, "1. 직급 재분류 프로세스 및 기준",
      "**1차에서 직급, 2차에서 년차**를 정하고 → 기준이 엇갈리는 인원은 **검토 후 재배치 확정**")
# 단계 흐름 (좌우 끝선 맞춤 · 축소)
steps = [("기준 설정", "GRAY"), ("1차 분류", "NAVY"), ("1차 특이사항 보고", "W"), ("2차 분류", "NAVY"),
         ("2차 특이사항 보고", "W"), ("최종 직급 · 년차", "RED")]
gap = 0.30; bw = (CW - 5 * gap) / 6; y0 = 1.66; bh = 0.58
for i, (nm, kind) in enumerate(steps):
    x = L + i * (bw + gap)
    box(s, x, y0, bw, bh, "WHITE" if kind == "W" else kind, "RED" if kind == "W" else None, 1.5,
        body=f"{'①②③④⑤⑥'[i]} {nm}", size=12, color="RED" if kind == "W" else "WHITE", bold=True)
    if i < 5: right_arrow(s, x + bw + 0.04, y0 + bh / 2, gap - 0.08, 0.28)
for (a, b, t) in [(1, 2, "직급 결정"), (3, 4, "년차 결정")]:
    xa = L + a * (bw + gap); xb = L + b * (bw + gap) + bw
    box(s, xa, y0 + bh + 0.06, xb - xa, 0.04, "NAVY")
    text(s, xa, y0 + bh + 0.10, xb - xa, 0.26, f"**{t}**", 12, "NAVY", align="c")

# ===== 메인 : 1차 · 2차 분류 기준 =====
Y = 3.05
W1 = 7.55
subhead(s, L, Y - 0.40, "1차 분류 : 4개 기준 종합 → 산출 직급", W1, "기준별 25%  ·  ★ = 핵심 기준")
rows1 = [["기 준", "신 G4", "신 G3", "신 G2", "신 G1"],
         ["① 현직급", "G6", "G5 · G4", "G3 · G2", "G1"],
         ["★ ② 년차", "20년 이상", "13~19년", "7~12년", "0~6년"],
         ["★ ③ 직무 역할", "전략적 판단", "과제 리딩", "자율 · 기획", "정형 업무"],
         ["④ 연봉 (만원)", "6,700~9,900", "5,600~8,100", "4,700~6,700", "4,000~5,500"],
         ["→ 산출 직급", "3.50 이상", "2.50~3.49", "1.50~2.49", "1.00~1.49"]]
st = {}
for r in (2, 3):
    st[(r, 0)] = dict(fill="RED", color="WHITE", bold=True)
    for k in range(1, 5): st[(r, k)] = dict(fill="PRED", color="RED", bold=True)
for k in range(5): st[(5, k)] = dict(fill="CELL", color="SUB")
st[(5, 0)] = dict(fill="CELL", color="SUB", bold=True)
table(s, L, Y, W1, rows1, [1.75, 1.45, 1.45, 1.45, 1.45], 0.46, 14, aligns=["l", "c", "c", "c", "c"], styles=st)
text(s, L, Y + 6 * 0.46 + 0.04, W1, 0.26, "※ 산출 직급 = 4개 기준 가중 평균 점수 (1.00 ~ 4.00) 구간", 12, "GRAY")

X2 = L + W1 + 0.35; W2 = R - X2
subhead(s, X2, Y - 0.40, "2차 분류 : 직급 년차 산정", W2)
box(s, X2, Y, W2, 0.55, "NAVY", body="직급 년차 = **총 년차 − 하위 직급 체류연수**", size=14, color="WHITE", hl="YEL", bold=True)
rows2 = [["기 준", "신 G4", "신 G3", "신 G2", "신 G1"],
         ["체류연수", "-", "5년", "4년", "4년"],
         ["차감 연수", "13년", "8년", "4년", "0년"],
         ["직급 년차", "총 − 13", "총 − 8", "총 − 4", "총 − 0"]]
st2 = {(3, 0): dict(fill="PYEL", bold=True), **{(3, k): dict(fill="PYEL", bold=True, color="RED") for k in range(1, 5)}}
table(s, X2, Y + 0.64, W2, rows2, [1.3, 0.85, 0.85, 0.85, 0.85], 0.46, 14, aligns=["l", "c", "c", "c", "c"], styles=st2)
box(s, X2, Y + 0.64 + 4 * 0.46 + 0.10, W2, 0.40, "PBLUE", "HAIR", 0.75,
    body="예) 신 G3 · 총 12년차 → 12 − 8 = **G3 4년차**", size=13, color="BODY", hl="NAVY")
conclusion(s, L, 6.25, CW, 0.48, "**년차 · 직무 역할**을 중심으로 직급을 정하고, 기준이 엇갈리는 인원은 **검토 후 재배치 확정**", 14)
footnote(s, "기준 : 직급 분류 시스템 분류 기준 (2026.11)  /  년차 = 2027 − 입사 연도 + 경력인정 + 조정  /  체류연수 G1 4 · G2 4 · G3 5년", 6.85)

# ---------------- 2. 1차 분류 결과 (1/2) ----------------
s = blank(p)
title(s, "2. 1차 분류 결과 (1/2)",
      "4개 기준 종합 점수로 산출 직급 결정 → **기준 일치 인원 확정, 엇갈리는 약 14명 검토 후 재배치**")
WL = 7.30
subhead(s, L, 1.68, "기본 현황 (현직급)", WL, "단위 : 명")
rows = [["구 분", "계", "G6", "G5", "G4", "G3", "G2", "G1"],
        ["인원", TBD, "", "", "", "", "", ""], ["구성비", "100.0%", "", "", "", "", "", ""]]
table(s, L, 2.04, WL, rows, [1.0, 1.2, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85], 0.36, 13,
      aligns=["l", "c", "c", "c", "c", "c", "c", "c"], styles={(1, 1): dict(color="RED", bold=True)})
subhead(s, L, 3.32, "분류 결과 (현직급 × 산출 직급)", WL, "단위 : 명  ·  파란 칸 = ① 현직급 변환 직급")
c = SIM["crit"]; gm = c["gmap"]
mrows = [["현직급 \\ 산출", "신 G4", "신 G3", "신 G2", "신 G1", "계", "기준 일치"]]
for gg in ["G6", "G5", "G4", "G3", "G2", "G1"]: mrows.append([gg, "", "", "", "", "", ""])
mrows.append(["계", "", "", "", "", TBD, ""])
st = {}
for i, gg in enumerate(["G6", "G5", "G4", "G3", "G2", "G1"]):
    col = {"G4": 1, "G3": 2, "G2": 3, "G1": 4}[gm[gg]]
    st[(i + 1, col)] = dict(fill="LBLUE")
for k in range(7): st[(7, k)] = dict(fill="PYEL", bold=True)
st[(7, 5)] = dict(fill="PYEL", bold=True, color="RED")
table(s, L, 3.68, WL, mrows, [1.3, 0.95, 0.95, 0.95, 0.95, 0.9, 1.1], 0.31, 13,
      aligns=["l", "c", "c", "c", "c", "c", "c"], styles=st)

# 우측: 1차 분류 특이사항
X2 = L + WL + 0.35; W2 = R - X2
subhead(s, X2, 1.68, "1차 분류 특이사항", W2)
box(s, X2, 2.04, W2, 0.62, "NAVY", body="년차 · 직무 역할 중심의 **재분류 결과**", size=15, color="WHITE", hl="YEL", bold=True)
box(s, X2, 2.66, W2, 2.05, "WHITE", "NAVY", 1)
text(s, X2 + 0.18, 2.78, W2 - 0.36, 1.85,
     ["• ① 현직급 변환 직급과 **② 년차 · ③ 직무 역할** 직급이 다른 인원 → 종합 점수로 상 · 하향",
      "• 4개 기준이 엇갈리는 특이인원 **약 14명**",
      "   → 검토 후 재배치 (2/2 명단)",
      "• 판단 우선순위 : **년차 · 직무 역할** > 현직급 > 연봉"], 13, "BODY", anchor="t", spacing=1.25, hl="NAVY")
box(s, X2, 4.85, W2, 0.95, "PRED", "RED", 1,
    body=["⚠ 년차 · 직무 역할 고려 필요", "특이인원은 산출 직급을 그대로 쓰지 않고 개별 검토"], size=13, color="RED", bold=True)
conclusion(s, L, 6.25, CW, 0.48, "기준 일치 인원은 **산출 직급으로 확정**, 특이인원 약 14명은 **년차 · 직무 역할 기준 검토 후 재배치**", 14)
footnote(s, f"기준일 : 년차 2027.01.01  /  출처 : 직급 분류 시스템 1차 분류  /  {TBD} 칸은 실데이터 반영 후 기입  /  연봉 상한(CAP)은 마지막 장에서 별도 보고", 6.85)

# ---------------- 2. 1차 분류 결과 (2/2) 특이인원 ----------------
s = blank(p)
title(s, "2. 1차 분류 결과 (2/2) - 특이인원",
      "특이인원 약 14명 : 기준 간 차이 발생 → **년차 · 직무 역할을 고려해 최종 직급 판단**")
TW = 8.75
subhead(s, L, 1.66, "1차 분류 특이인원 현황", TW, "⚠ = 판단 시 우선 고려")
hdr = ["No", "부서", "현직급", "총 년차", "(1) 현직급", "⚠ 년차", "⚠ 직무 역할", "(4) 연봉", "산출 직급", "최종 판단"]
rows = [hdr] + [[str(i), "", "", "", "", "", "", "", "", ""] for i in range(1, 15)]
st = {(0, 5): dict(fill="RED"), (0, 6): dict(fill="RED"), (0, 9): dict(fill="PYEL", color="INK")}
for r in range(1, 15):
    st[(r, 5)] = dict(fill="PRED"); st[(r, 6)] = dict(fill="PRED"); st[(r, 9)] = dict(fill="PYEL")
table(s, L, 2.02, TW, rows, [0.42, 1.0, 0.75, 0.75, 0.95, 0.85, 1.15, 0.85, 0.9, 0.95], 0.255, 12, styles=st,
      first_col_bold=False)
# 간략 정리 칸 (우측)
X3 = L + TW + 0.25; W3 = R - X3
subhead(s, X3, 1.66, "간략 정리", W3)
cols = [("상향 검토", ["• 년차 · 역할 ↑", "  (현직급보다 높은 기준)", "• "]), ("하향 검토", ["• 년차 · 역할 ↓", "  (현직급보다 낮은 기준)", "• "]),
        ("연봉 밴드 밖", ["• 상한 초과 → CAP 동결", "• 하한 미만 → 밴드 진입", "• "])]
for i, (h, d) in enumerate(cols):
    y = 2.02 + i * 1.40
    box(s, X3, y, W3, 0.30, "NAVY", body=f"{h}   (      명)", size=12, color="WHITE", bold=True)
    box(s, X3, y + 0.30, W3, 1.00, "WHITE", "LINE", 0.75, body=d, size=12, color="BODY", align="l", inset=0.1)
box(s, X3, 6.25, W3, 0.36, "PRED", "RED", 0.75, body="⚠ 년차 · 직무 역할 고려 필요", size=12, color="RED", bold=True)
footnote(s, "기준일 : 년차 2027.01.01  /  출처 : 1차 특이사항 보고 화면 (최종 직급 판단은 1차 분류 · 2차 분류에 자동 연동)  /  명단 실데이터 반영 후 기입", 6.95)

# ---------------- 3. 2차 분류 ----------------
s = blank(p)
title(s, "3. 2차 분류 (직급 년차)",
      "1차 확정 직급 기준으로 **직급 년차 산정** → 1차 확정 후 **2차 특이사항 별도 보고**")
subhead(s, L, 1.66, "2차 분류 기준", 6.0)
rows = [["구 분", "신 G4", "신 G3", "신 G2", "신 G1"],
        ["하위 직급 체류연수", "-", "5년", "4년", "4년"],
        ["차감 연수 (하위 합계)", "13년", "8년", "4년", "0년"],
        ["직급 년차 산정", "총 − 13", "총 − 8", "총 − 4", "총 − 0"]]
table(s, L, 2.02, 6.0, rows, [1.7, 1.0, 1.0, 1.0, 1.0], 0.32, 12,
      styles={(3, k): dict(fill="PYEL", bold=True) for k in range(5)})
box(s, L, 3.40, 6.0, 1.06, "PBLUE", "HAIR", 0.75, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
text(s, L + 0.15, 3.45, 5.7, 0.98,
     ["**산정 예** : 신 G3 배정 · 총 12년차 → 12 − 8 = **G3 4년차**",
      "• 최종 년차 = 직급 년차 (특이사항 보고에서 수기 확정 시 우선)",
      "• 기준연봉 년차(현 연봉 기준)는 차이만 참고 · 체류연수 초과 시 「체류 초과」"], 12, "BODY", anchor="t", spacing=1.15)
subhead(s, 6.95, 1.66, "기본 현황 및 분류 결과", R - 6.95, "단위 : 명")
rows = [["직급 \\ 년차", "1~2년차", "3~4년차", "5년차 이상", "계", "체류 초과"],
        ["신 G4", "", "", "", "", ""], ["신 G3", "", "", "", "", ""], ["신 G2", "", "", "", "", ""],
        ["신 G1", "", "", "", "", ""], ["계", "", "", "", TBD, ""]]
st = {(5, k): dict(fill="PYEL", bold=True) for k in range(6)}; st[(5, 4)] = dict(fill="PYEL", bold=True, color="RED")
st.update({(0, 5): dict(fill="GRAY")})
table(s, 6.95, 2.02, R - 6.95, rows, [1.15, 0.85, 0.85, 0.95, 1.0, 0.9], 0.32, 12, styles=st)
text(s, 6.95, 3.98, R - 6.95, 0.48, ["※ 수기 확정 인원 · 기준연봉 년차 차이 분포는 2차 특이사항 보고에서 별도 제시"], 12, "GRAY", anchor="t")
subhead(s, L, 4.62, "진행 순서", 6.0)
flow = [("1차 확정", "직급 확정 (특이인원 포함)", "NAVY"), ("2차 분류", "직급 년차 산정", "NAVY"),
        ("2차 특이사항 보고", "체류 초과 · 연봉 차이 인원", "RED"), ("최종 직급 · 년차", "Pay-band 위치 확인", "RED")]
fw = (CW - 3 * 0.42) / 4
for i, (h, d, col) in enumerate(flow):
    x = L + i * (fw + 0.42)
    box(s, x, 4.98, fw, 0.40, col if i != 2 else "WHITE", "RED" if i == 2 else None, 1.5, body=h, size=13,
        color="RED" if i == 2 else "WHITE", bold=True)
    text(s, x, 5.40, fw, 0.30, d, 12, "BODY", align="c")
    if i < 3: right_arrow(s, x + fw + 0.06, 5.18, 0.3, 0.34)
box(s, L + 2 * (fw + 0.42), 4.70, fw, 0.26, "PRED", None, body="1차 확정 후 보고 (예정)", size=12, color="RED", bold=True)
conclusion(s, L, 6.05, CW, 0.52, "2차는 **1차 확정 직급**을 기준으로 년차만 산정 → 2차 특이사항은 **1차 확정 후 별도 보고**")
footnote(s, "기준 : 2차 분류 기준 (체류연수 G1 4 · G2 4 · G3 5년)  /  출처 : 직급 분류 시스템 2차 분류  /  " + TBD + " 칸은 1차 확정 후 기입", 6.75)

# ---------------- 4. 승진 시 인상 시뮬레이션 ----------------
A, B, A0, B0, N = SIM["amt"], SIM["rate"], SIM["amt0"], SIM["rate0"], SIM["none"]
d55 = B["final"] - A["final"]
s = blank(p)
title(s, "4. 승진 시 인상 방식 시뮬레이션 (샘플)",
      f"정액 · 정률 모두 55세 연봉 **9,700만원 수준 (차이 {d55 / A['final'] * 100:.1f}%)** → 승진 시점별 유불리만 다름")
# 조건 칩
conds = ["27세 · 4,000만원 입사", "연 2.5% 인상", "진급누락 1 · 4 · 5회", "승진 31세 G2 → 38세 G3 → 47세 G4", "상한 CAP 적용"]
cwc = [2.15, 1.55, 2.0, 3.85, 1.8]; x = L
for t, w in zip(conds, cwc):
    box(s, x, 1.66, w, 0.34, "LBLUE", body=t, size=12, color="NAVY", bold=True); x += w + 0.12

# 좌 : KPI 카드 2개
KW = 3.95
def kpi(y, ttl, rule, v55, life, col):
    box(s, L, y, KW, 0.38, col, body=f"{ttl}  ·  {rule}", size=13, color="WHITE", bold=True)
    box(s, L, y + 0.38, KW, 1.42, "WHITE", col, 1.5)
    text(s, L + 0.2, y + 0.46, 1.6, 0.30, "55세 연봉", 12, "GRAY")
    text(s, L + 0.2, y + 0.72, KW - 0.4, 0.58, f"{man(v55)}만원", 30, col, True)
    text(s, L + 0.2, y + 1.36, KW - 0.4, 0.34, f"생애 총연봉  **{life / 1e8:.2f}억원**", 13, "BODY")
kpi(2.20, "정액 인상", "350 · 400 · 350만원", A["final"], A["sum"], "NAVY")
kpi(4.12, "정률 인상", "7 · 8 · 6%", B["final"], B["sum"], "RED")

# 우 : 차트
X2 = L + KW + 0.30; W2 = R - X2
subhead(s, X2, 2.16, "생애 연봉 추이 (27 → 55세, 만원)", W2)
cd = CategoryChartData()
ages = list(range(27, 56))
cd.categories = [f"{a}" if (a - 27) % 4 == 0 else " " for a in ages]
cd.add_series("정액 (350·400·350만원)", [round(v / 1e4) for v in A["W"]])
cd.add_series("정률 (7·8·6%)", [round(v / 1e4) for v in B["W"]])
gf = s.shapes.add_chart(XL_CHART_TYPE.LINE, Inches(X2), Inches(2.50), Inches(W2 * 0.56), Inches(3.45), cd)
ch = gf.chart; ch.has_legend = True; ch.legend.position = XL_LEGEND_POSITION.TOP; ch.legend.include_in_layout = False
ch.legend.font.size = Pt(12); ch.legend.font.name = FONT
from pptx.enum.chart import XL_MARKER_STYLE
for i, col in enumerate(["1F4E79", "C00000"]):
    ser = ch.series[i]; ser.format.line.color.rgb = rgb(col); ser.format.line.width = Pt(2.5); ser.smooth = False
    ser.marker.style = XL_MARKER_STYLE.NONE
ca = ch.category_axis; ca.tick_labels.font.size = Pt(12); ca.tick_labels.font.name = FONT
va = ch.value_axis; va.tick_labels.font.size = Pt(12); va.has_major_gridlines = True
va.major_gridlines.format.line.color.rgb = rgb("E3E3E3"); va.minimum_scale = 4000; va.maximum_scale = 10000; va.major_unit = 2000
va.tick_labels.number_format = '#,##0'; va.tick_labels.number_format_is_linked = False

# 우측 끝 : 승진 시점 비교 (핵심 4줄)
X3 = X2 + W2 * 0.56 + 0.15; W3 = R - X3
rows = [["시점", "정액", "정률", "차이"]]
st = {}
for a, lab in [(31, "31세 G2"), (38, "38세 G3"), (47, "47세 G4"), (55, "55세 정년")]:
    t = a - 27; dv = B["W"][t] - A["W"][t]
    rows.append([lab, man(A["W"][t]), man(B["W"][t]), ("+" if dv > 0 else "") + man(dv)])
    st[(len(rows) - 1, 3)] = dict(color="RED" if dv < 0 else "NAVY", bold=True)
for k in range(4): st[(4, k)] = dict(fill="PYEL", bold=True, color=st.get((4, k), {}).get("color", "INK"))
table(s, X3, 2.55, W3, rows, [1.2, 0.9, 0.9, 0.75], 0.42, 12, aligns=["c", "r", "r", "r"], styles=st)
box(s, X3, 4.80, W3, 1.15, "PBLUE", "HAIR", 0.75, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
    body=["**정액** : G2 · G3 승진 때 유리", "**정률** : G4 승진 이후 유리", "※ 55세까지 G4 상한 미도달"], size=12, color="BODY", align="l", inset=0.12, hl="NAVY")
conclusion(s, L, 6.20, CW, 0.50, "인상 방식에 따른 정년 연봉 차이는 **0.8%로 미미** → **승진 시점 · 직급별 동기 부여** 기준으로 선택")
footnote(s, "기준 : 직급 분류 시스템 샘플 시뮬레이션 (2026.11)  /  정률 7 · 8 · 6% = 개편(안) 승진 시 차등 인상안  /  만원 미만 반올림", 6.82)

# ---------------- [첨부] 타사 사례 ----------------
s = blank(p)
title(s, "[첨부] 타사 사례 - 연봉 상한(CAP) 운영")
subhead(s, L, 1.10, "타사 연봉 상한(CAP) 운영 현황", 8.0, "인사팀 조사 후 기입 (동종업계 자료 미확보)")
rows = [["구 분", "회사", "업종 · 규모", "직급별 상한 운영", "상한 도달 시 처리", "승진 시 인상", "출처 · 연도"]] + \
       [["", "", "", "", "", "", ""] for _ in range(6)]
table(s, L, 1.50, CW, rows, [0.8, 1.4, 1.6, 1.9, 2.4, 1.6, 1.5], 0.46, 12)
box(s, L, 4.95, CW, 1.30, "PRED", "RED", 1, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
text(s, L + 0.2, 5.02, CW - 0.4, 0.32, "**당사 (안) : 연봉 분류 시 직급 상한(CAP) 적용**", 14, "RED")
text(s, L + 0.2, 5.36, CW - 0.4, 0.85,
     ["• 현 연봉 > 산출 직급 상한 → **삭감 없이 현 연봉 동결 (CAP)**   /   현 연봉 < 하한 → 기본 인상으로 밴드 진입",
      f"• 대상 인원 : 상한 초과 {TBD} / 하한 미만 {TBD}   ·   타사 확인 후 「상한 도달 시 처리」(동결 / 일시금 / 상위 직급 조기 승진) 비교"], 13, "BODY", anchor="t", spacing=1.25)
footnote(s, "출처 : 인사팀 조사 예정  /  조사 항목 : 상한 운영 여부, 상한 도달 시 처리, 승진 시 인상 방식", 6.95)

out = "직급재분류_결과보고(안).pptx"
p.save(out); print("saved", out)
