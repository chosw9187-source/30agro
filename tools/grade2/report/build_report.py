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
      "현직급 6단계 → 신 4단계 재분류 : **1차(직급) · 2차(년차) 2단계 분류 + 특이인원 개별 판단**으로 확정")
subhead(s, L, 1.66, "재분류 프로세스", 6.0, "■ 분류(산정)   □ 대표이사 보고   ■ 확정")
steps = [("STEP 1", "분류 기준 설정", ["1차 · 2차 기준 확정", "년차 기준일 2027.01.01"], "GRAY", "WHITE"),
         ("STEP 2", "1차 분류", ["4개 기준 종합 점수", "→ 산출 직급"], "NAVY", "WHITE"),
         ("STEP 3", "1차 특이사항 보고", ["기준 엇갈림 인원", "최종 직급 판단"], "WHITE", "RED"),
         ("STEP 4", "2차 분류", ["확정 직급 기준", "→ 직급 년차 산정"], "NAVY", "WHITE"),
         ("STEP 5", "2차 특이사항 보고", ["체류 초과 · 연봉 차이", "최종 년차 판단"], "WHITE", "RED"),
         ("STEP 6", "최종 직급 · 년차", ["신 G1~G4 · 년차", "Pay-band 위치 확인"], "RED", "WHITE")]
bw, gap, y0 = 1.83, 0.36, 2.08
for i, (n, nm, desc, fill, fc) in enumerate(steps):
    x = L + i * (bw + gap)
    line_c = "RED" if fill == "WHITE" else None
    box(s, x, y0, bw, 0.62, fill, line_c, 1.5, body=[n, f"**{nm}**"], size=13,
        color=("RED" if fill == "WHITE" else "WHITE"), bold=False)
    box(s, x, y0 + 0.66, bw, 0.70, "PBLUE", "HAIR", 0.75, body=["• " + d for d in desc], size=12, color="BODY", align="l", inset=0.08)
    if i < 5: right_arrow(s, x + bw + 0.04, y0 + 0.31, 0.28, 0.34)

subhead(s, L, 3.58, "1차 분류 기준 (직급 산정)", 7.2, "가중치 = 현재 설정값")
c = SIM["crit"]
rows1 = [["구 분", "신 G4", "신 G3", "신 G2", "신 G1", "가중치"],
         ["(1) 현직급 변환", "G6", "G5 · G4", "G3 · G2", "G1", f"{c['w'][0]}%"],
         ["(2) 년차", "20년차 이상", "13~19년차", "7~12년차", "0~6년차", f"{c['w'][1]}%"],
         ["(3) 직무 역할", "전략적 판단", "과제 리딩", "자율 · 기획", "정형 업무", f"{c['w'][2]}%"],
         ["(4) 연봉 Pay-band", "6,700~9,900", "5,600~8,100", "4,700~6,700", "4,000~5,500", f"{c['w'][3]}%"],
         ["(5) 종합 → 산출", "3.50 이상", "2.50~3.49", "1.50~2.49", "1.00~1.49", "-"]]
table(s, L, 3.93, 7.2, rows1, [1.55, 1.1, 1.1, 1.1, 1.1, 0.7], 0.34, 12, aligns=["l", "c", "c", "c", "c", "c"],
      styles={(5, 0): dict(fill="PYEL"), **{(5, k): dict(fill="PYEL", bold=True) for k in range(1, 6)}})
subhead(s, 8.05, 3.58, "2차 분류 기준 (년차 산정)", 4.73)
rows2 = [["구 분", "신 G4", "신 G3", "신 G2", "신 G1"],
         ["체류연수", "-", "5년", "4년", "4년"],
         ["차감 연수", "13년", "8년", "4년", "0년"],
         ["직급 년차", "총 년차 − 차감 연수 (1 미만 = 1년차)", "", "", ""],
         ["최종 년차", "직급 년차 적용 (특이사항 수기 우선)", "", "", ""],
         ["참고", "기준연봉 년차 = 현 연봉 기준 (차이만 참고)", "", "", ""]]
g = table(s, 8.05, 3.93, 4.73, rows2, [1.05, 0.92, 0.92, 0.92, 0.92], 0.34, 12)
for r in (3, 4, 5):
    t = g.table; t.cell(r, 1).merge(t.cell(r, 4))
conclusion(s, L, 6.12, CW, 0.50, "1차에서 **직급**, 2차에서 **년차**를 산정하고, 기준이 엇갈리는 인원은 **특이사항 보고 후 개별 확정**")
footnote(s, "기준 : 직급 분류 시스템 분류 기준 (2026.11)  /  년차 = 2027 − 입사 연도 + 경력인정 + 조정  /  Pay-band 단위 만원", 6.75)

# ---------------- 2. 1차 분류 결과 (1/2) ----------------
s = blank(p)
title(s, "2. 1차 분류 결과 (1/2)",
      "4개 기준 종합 점수로 산출 직급 결정 → **기준 일치 인원 확정, 엇갈리는 약 14명 개별 판단**")
chips = ["(1) 현직급 변환", "(2) 년차", "(3) 직무 역할", "(4) 연봉 Pay-band", "(5) 종합 (각 25%)", "산출 직급"]
cw_ = (CW - 5 * 0.22) / 6
for i, t in enumerate(chips):
    x = L + i * (cw_ + 0.22)
    last = i == 5
    box(s, x, 1.66, cw_, 0.38, "RED" if last else ("NAVY" if i == 4 else "LBLUE"), None, body=t, size=12,
        color="WHITE" if i >= 4 else "NAVY", bold=True)
    if i < 5: text(s, x + cw_, 1.66, 0.22, 0.38, "+" if i < 3 else "→", 14, "RED", True, "c")

subhead(s, L, 2.14, "기본 현황 (현직급)", 6.9, "단위 : 명")
rows = [["구 분", "계", "G6", "G5", "G4", "G3", "G2", "G1"],
        ["인원", TBD, "", "", "", "", "", ""], ["구성비", "100.0%", "", "", "", "", "", ""]]
table(s, L, 2.48, 6.9, rows, [1.0, 1.2, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8], 0.30, 12,
      styles={(1, 1): dict(color="RED", bold=True)})
subhead(s, L, 3.48, "분류 결과 (현직급 × 산출 직급)", 6.9, "단위 : 명")
gm = c["gmap"]
mrows = [["현직급 \\ 산출", "신 G4", "신 G3", "신 G2", "신 G1", "계", "기준 일치"]]
for gg in ["G6", "G5", "G4", "G3", "G2", "G1"]: mrows.append([gg, "", "", "", "", "", ""])
mrows.append(["계", "", "", "", "", TBD, ""])
st = {}
for i, gg in enumerate(["G6", "G5", "G4", "G3", "G2", "G1"]):
    col = {"G4": 1, "G3": 2, "G2": 3, "G1": 4}[gm[gg]]
    st[(i + 1, col)] = dict(fill="LBLUE")
for k in range(7): st[(7, k)] = dict(fill="PYEL", bold=True)
st[(7, 5)] = dict(fill="PYEL", bold=True, color="RED")
table(s, L, 3.84, 6.9, mrows, [1.2, 0.85, 0.85, 0.85, 0.85, 0.8, 1.0], 0.26, 12, styles=st)

# 우측: 특이사항
X2, W2 = 7.75, R - 7.75
subhead(s, X2, 2.14, "1차 분류 특이사항", W2)
box(s, X2, 2.48, W2, 1.50, "WHITE", "NAVY", 1, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
text(s, X2 + 0.15, 2.54, W2 - 0.3, 0.32, "**년차 · 직무 역할 중심의 재분류 결과**", 13, "NAVY")
text(s, X2 + 0.15, 2.86, W2 - 0.3, 1.10,
     ["• (1) 현직급 변환과 (2) 년차 · (3) 직무 역할이 다른 인원 → 종합 점수로 상 · 하향",
      "• 4개 기준이 엇갈리는 특이인원 **약 14명** → 개별 판단 (2/2)",
      "• 판단 기준 : 년차 · 직무 역할 우선, 연봉은 보완 지표"], 12, "BODY", anchor="t", spacing=1.15)
box(s, X2 + W2 - 2.45, 2.16, 2.45, 0.28, "PRED", "RED", 0.75, body="⚠ 년차 · 직무 고려 필요", size=12, color="RED", bold=True)
# 연봉 상한 CAP
box(s, X2, 4.08, W2, 1.45, "PRED", "RED", 1, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
text(s, X2 + 0.15, 4.13, W2 - 0.3, 0.30, "**연봉 기준 특이사항 : 직급 상한(CAP) 적용**", 13, "RED")
text(s, X2 + 0.15, 4.45, W2 - 0.3, 1.05,
     ["• 현 연봉 > 상한 → **삭감 없이 현 연봉 동결 (CAP)**",
      "• 현 연봉 < 하한 → 기본 인상으로 밴드 진입",
      f"• 대상 : 상한 초과 {TBD} / 하한 미만 {TBD}"], 12, "BODY", anchor="t", spacing=1.15)
box(s, X2, 5.62, W2, 0.62, "WHITE", "GRAY", 1, body=["**타사 사례 (상한 CAP 운영)** : 인사팀 조사 후 기입", "[첨부] 참조"],
    size=12, color="GRAY", shape=MSO_SHAPE.ROUNDED_RECTANGLE).line.dash_style = 4
conclusion(s, L, 6.38, CW, 0.46, "기준 일치 인원은 **산출 직급으로 확정**, 특이인원 약 14명은 **년차 · 직무 역할 기준 개별 판단**", 13)
footnote(s, f"파란 칸 = (1) 현직급 변환 직급  /  기준일 : 년차 2027.01.01  /  출처 : 직급 분류 시스템 1차 분류  /  {TBD} 칸은 실데이터 반영 후 기입", 6.95)

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
      f"27세 · 4,000만원 입사 → 55세 연봉 **정액 {man(A['final'])}만원 vs 정률 {man(B['final'])}만원** (차이 {man(d55)}만원, {d55 / A['final'] * 100:.1f}%)")
subhead(s, L, 1.66, "시뮬레이션 조건", 5.6)
rows = [["구 분", "조 건"],
        ["입사 · 정년", "27세 · 4,000만원 입사 (1년차) → 만 55세"],
        ["연 상승률", "2.5% (매년 전년 연봉 기준)"],
        ["승진 대상", "직급 근속 G1 4 · G2 4 · G3 5년차 이상"],
        ["진급 누락", "G1→G2 1회 · G2→G3 4회 · G3→G4 5회"],
        ["승진 경로", A["path"]],
        ["정액 인상", "전년 × 1.025 + 350 · 400 · 350만원"],
        ["정률 인상", "전년 × (1.025 + 7 · 8 · 6%)"],
        ["상한 (CAP)", "직급 Pay-band 상한에서 동결"]]
table(s, L, 2.02, 5.6, rows, [1.3, 4.3], 0.29, 12, header="GRAY", aligns=["c", "l"],
      styles={(6, 1): dict(color="NAVY", bold=True), (7, 1): dict(color="RED", bold=True)})
# 네이티브 꺾은선 차트
cd = CategoryChartData()
ages = list(range(27, 56))
cd.categories = [f"{a}" if (a - 27) % 4 == 0 else " " for a in ages]
cd.add_series("정액 (350·400·350만원) · 가로축 = 나이", [round(v / 1e4) for v in A["W"]])
cd.add_series("정률 (7·8·6%)", [round(v / 1e4) for v in B["W"]])
gf = s.shapes.add_chart(XL_CHART_TYPE.LINE, Inches(L), Inches(4.66), Inches(5.6), Inches(1.74), cd)
ch = gf.chart; ch.has_legend = True; ch.legend.position = XL_LEGEND_POSITION.TOP; ch.legend.include_in_layout = False
ch.legend.font.size = Pt(10); ch.legend.font.name = FONT
for i, col in enumerate(["1F4E79", "C00000"]):
    ser = ch.series[i]; ser.format.line.color.rgb = rgb(col); ser.format.line.width = Pt(2.25 if i < 2 else 1.5); ser.smooth = False
    ser.marker.style = None
    from pptx.enum.chart import XL_MARKER_STYLE
    ser.marker.style = XL_MARKER_STYLE.NONE
ca = ch.category_axis; ca.tick_labels.font.size = Pt(9); ca.tick_labels.font.name = FONT
nm_ = ca._element.find(qn("c:noMultiLvlLbl"))
for tag_, v_ in (("c:tickLblSkip", "4"), ("c:tickMarkSkip", "4")):
    el_ = ca._element.makeelement(qn(tag_), {"val": v_})
    (nm_.addprevious(el_) if nm_ is not None else ca._element.append(el_))
va = ch.value_axis; va.tick_labels.font.size = Pt(9); va.has_major_gridlines = True
va.major_gridlines.format.line.color.rgb = rgb("E3E3E3"); va.minimum_scale = 3000; va.maximum_scale = 10000
va.tick_labels.number_format = '#,##0'; va.tick_labels.number_format_is_linked = False

X2 = 6.45; W2 = R - X2
subhead(s, X2, 1.66, "생애 연봉 주기 비교 (누락 반영)", W2, "단위 : 만원")
mile = [(27, 1, "입사"), (31, 5, "G2 승진"), (35, 9, ""), (38, 12, "G3 승진"), (40, 14, ""), (45, 19, ""),
        (47, 21, "G4 승진"), (50, 24, ""), (55, 29, "정년")]
rows = [["연령 (근속)", "직급", "정액", "정률", "차이 (정률−정액)"]]
st = {}
for a, y, tag in mile:
    t = a - 27; dv = B["W"][t] - A["W"][t]
    rows.append([f"{a}세 ({y}년차)", f"G{A['G'][t]}" + (" 승진" if tag.endswith("승진") else (f" · {tag}" if tag else "")), man(A["W"][t]), man(B["W"][t]),
                 ("+" if dv > 0 else "") + man(dv) if round(dv / 1e4) != 0 else "-"])
    r = len(rows) - 1
    if tag.endswith("승진"): st[(r, 1)] = dict(color="RED", bold=True)
    if dv < 0: st[(r, 4)] = dict(color="RED", bold=True)
ds = B["sum"] - A["sum"]
rows.append(["생애 총연봉", "29년", f"{A['sum'] / 1e8:.2f}억", f"{B['sum'] / 1e8:.2f}억", f"+{ds / 1e4:,.0f}만"])
r = len(rows) - 1
for k in range(5): st[(r, k)] = dict(fill="PYEL", bold=True)
rows.append(["(참고) 누락 없음", f"{A0['path'].split(' → ')[-1]}", man(A0["final"]), man(B0["final"]),
             man(B0["final"] - A0["final"])])
r = len(rows) - 1
for k in range(5): st[(r, k)] = dict(fill="CELL", color="SUB")
st[(r, 4)] = dict(fill="CELL", color="RED", bold=True)
table(s, X2, 2.02, W2, rows, [1.45, 1.35, 1.0, 1.0, 1.3], 0.30, 12, aligns=["c", "c", "r", "r", "r"], styles=st)
text(s, X2, 5.68, W2, 0.62,
     ["※ 두 방식 모두 55세까지 G4 상한(9,900만원) 미도달 → CAP 영향 없음",
      "※ 승진 없음 : 40세 G1 상한 5,500만원 도달 후 동결"], 12, "GRAY", anchor="t")
conclusion(s, L, 6.45, CW, 0.46,
           "정액은 **하위 직급 승진(G2) 메리트가 크고**, 정률은 **상위 직급 승진(G4)에서 커짐** → 55세 기준 차이 0.8% 수준", 13)
footnote(s, "기준 : 직급 분류 시스템 샘플 시뮬레이션 (2026.11)  /  정액 350 · 400 · 350만원, 정률 7 · 8 · 6% = 개편(안) 승진 시 인상안  /  만원 미만 반올림", 6.95)

# ---------------- [첨부] 타사 사례 ----------------
s = blank(p)
title(s, "[첨부] 타사 사례 - 연봉 상한(CAP) 운영")
subhead(s, L, 1.10, "타사 연봉 상한(CAP) 운영 현황", 8.0, "인사팀 조사 후 기입 (동종업계 자료 미확보)")
rows = [["구 분", "회사", "업종 · 규모", "직급별 상한 운영", "상한 도달 시 처리", "승진 시 인상", "출처 · 연도"]] + \
       [["", "", "", "", "", "", ""] for _ in range(6)]
table(s, L, 1.50, CW, rows, [0.8, 1.4, 1.6, 1.9, 2.4, 1.6, 1.5], 0.46, 12)
box(s, L, 5.0, CW, 0.9, "PBLUE", "HAIR", 0.75, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
    body=["**당사 (안)** : 현 연봉이 산출 직급 상한 초과 시 삭감 없이 현 연봉 동결 (상한 CAP) · 하한 미만은 기본 인상으로 밴드 진입",
          "• 타사 사례 확인 후 「상한 도달 시 처리」(동결 / 일시금 / 상위 직급 조기 승진) 비교 예정"], size=12, color="BODY", align="l", inset=0.2)
footnote(s, "출처 : 인사팀 조사 예정  /  조사 항목 : 상한 운영 여부, 상한 도달 시 처리, 승진 시 인상 방식", 6.95)

out = "직급재분류_결과보고(안).pptx"
p.save(out); print("saved", out)
