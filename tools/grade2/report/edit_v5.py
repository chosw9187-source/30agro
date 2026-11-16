"""v4 → v5 : 1장(기준 + 설정 근거 열, 분류 결과 행·열 전환), 2차 분류 기준 장 추가, 시뮬레이션 4개 안 비교.
실행: python3 edit_v5.py 입력(v4).pptx 출력.pptx sim5.json"""
import copy, json, sys
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_MARKER_STYLE
from sgdeck import *
from sgdeck import _fill_tf

src, out, simf = sys.argv[1], sys.argv[2], sys.argv[3]
SIM = json.load(open(simf, encoding="utf-8"))
p = Presentation(src)
man = lambda v: f"{round(v / 1e4):,}"

def keep_only(s, names):
    for x in list(s.shapes):
        if x.name not in names: x._element.getparent().remove(x._element)
def put(sh, body, size=12, color="BODY", bold=False, align="l", hl=None, inset=0.0):
    tf = sh.text_frame
    for par in list(tf.paragraphs)[1:]: par._p.getparent().remove(par._p)
    for r in list(tf.paragraphs[0].runs): r._r.getparent().remove(r._r)
    _fill_tf(tf, body, size, C.get(color, color), bold, align, "ctr", C.get(hl, hl) if hl else None, 1.2, inset)
def cells(tbl): return [[tbl.cell(r, c).text.strip() for c in range(len(tbl.columns))] for r in range(len(tbl.rows))]
def sh(s): return {x.name: x for x in s.shapes}

# ================= 1. 직급 재분류 기준 및 결과 =================
s = p.slides[1]; S1 = sh(s)
crit = cells(S1["Table 22"].table); mat = cells(S1["Table 30"].table)
keep_only(s, {"TextBox 1", "Rectangle 2", "Rectangle 3"})
subhead(s, L, 1.62, "1차 분류 기준 · 설정 근거", CW, "★ = 핵심 기준")
basis = {1: "현직급 수준 = 직무 역할 수준 (③과 동일 기준)", 2: "직급별 체류연수 + 누락 2년  (G1 · G2 4+2 · G3 5+2)",
         3: "현직급과 동일 기준 (직급별 역할 정의)", 4: "신 Pay-band 기준 (개편안 설계값)"}
rows = [crit[0] + ["설정 근거"]] + [crit[r] + [basis[r]] for r in range(1, len(crit))]
st = {(0, 6): dict(fill="RED")}
for r in (2, 3):
    st[(r, 0)] = dict(fill="RED", color="WHITE", bold=True); st[(r, 1)] = dict(fill="RED", color="WHITE", bold=True)
    for k in range(2, 6): st[(r, k)] = dict(fill="PRED", color="RED", bold=True)
for r in (1, 4): st[(r, 1)] = dict(bold=True)
for r in range(1, 5): st[(r, 6)] = dict(fill="PYEL", color="INK", bold=r in (2, 3))
table(s, L, 1.98, CW, rows, [1.3, 0.55, 1.15, 1.15, 1.15, 1.15, 3.6], 0.42, 12,
      aligns=["l", "c", "c", "c", "c", "c", "l"], styles=st)

# 분류 결과 : 행 = 산출 직급, 열 = 현직급 (원본 표 값 그대로 전치)
subhead(s, L, 4.22, "분류 결과 (산출 직급 × 현직급)", CW, "단위 : 명  ·  파란 칸 = ① 현직급 변환 기준  ·  빨간 칸 = 년차 · 역할로 이동")
hdr_cur = [r[0] for r in mat[1:]]                    # G6 ~ G1, 계
hdr_new = mat[0][1:]                                 # 신 G4 ~ 신 G1, 계
T = [["산출 \\ 현직급"] + hdr_cur]
for j, g in enumerate(hdr_new):
    T.append([g] + [mat[i + 1][j + 1] for i in range(len(hdr_cur))])
gmap = {"G6": "신 G4", "G5": "신 G3", "G4": "신 G3", "G3": "신 G2", "G2": "신 G2", "G1": "신 G1"}
st = {}
nr, nc = len(T), len(T[0])
for r in range(1, nr):
    for c in range(1, nc):
        cur, new, v = T[0][c], T[r][0], T[r][c]
        if new == "계" or cur == "계": st[(r, c)] = dict(fill="PYEL", bold=True); continue
        if v and gmap.get(cur) == new: st[(r, c)] = dict(fill="LBLUE", bold=True)
        elif v: st[(r, c)] = dict(fill="PRED", color="RED", bold=True)
st[(nr - 1, 0)] = dict(fill="PYEL", bold=True)
table(s, L, 4.58, CW, T, [1.6] + [1.48] * (nc - 1), 0.28, 12, aligns=["l"] + ["c"] * (nc - 1), styles=st)
conclusion(s, L, 6.45, CW, 0.42, "**년차 · 직무 역할(각 30%)** 중심으로 산출 → 기준 일치 인원 확정, 엇갈리는 인원은 **검토 후 재배치**", 14)

# ================= 3. 2차 분류 기준 (신규 장, 2차 특이인원 앞) =================
lay = p.slides[3].slide_layout
s = p.slides.add_slide(lay)
for x in list(s.placeholders): x._element.getparent().remove(x._element)
title(s, "3. 2차 분류 기준 (직급 년차)",
      "1차 확정 직급 기준으로 **직급 년차 = 총 년차 − 하위 직급 체류연수** → 연봉 기준 년차와 차이 큰 인원은 특이사항")
WL = 6.0
subhead(s, L, 1.62, "직급 년차 산정", WL)
rows = [["기 준", "신 G4", "신 G3", "신 G2", "신 G1"],
        ["하위 직급 체류연수", "-", "5년", "4년", "4년"],
        ["차감 연수 (합계)", "13년", "8년", "4년", "0년"],
        ["직급 년차", "총 − 13", "총 − 8", "총 − 4", "총 − 0"]]
table(s, L, 1.98, WL, rows, [1.6, 1.1, 1.1, 1.1, 1.1], 0.62, 12, aligns=["l", "c", "c", "c", "c"],
      styles={(3, 0): dict(fill="PYEL", bold=True), **{(3, k): dict(fill="PYEL", bold=True, color="RED") for k in range(1, 5)}})
box(s, L, 4.66, WL, 0.50, "PBLUE", "HAIR", 0.75, body="예) 신 G3 · 총 12년차 → 12 − 8 = **G3 4년차**", size=12, color="BODY", hl="NAVY")
X2 = L + WL + 0.3; W2 = R - X2
subhead(s, X2, 1.62, "용어 · 판단 기준", W2)
rows = [["구 분", "내 용"],
        ["년차 기준 (적용)", "직급 년차 = 최종 년차 (특이사항에서 수기 확정 시 우선)"],
        ["연봉 기준 (참고)", "현 연봉 이하인 기준연봉 중 가장 높은 년차"],
        ["차이", "연봉 기준 − 년차 기준 (+ 연봉 높음 / − 낮음)"],
        ["체류 초과", "직급 년차가 해당 직급 체류연수를 넘은 인원"],
        ["2차 특이인원", "체류 초과 · 차이가 큰 인원 → 최종 년차 개별 판단"]]
table(s, X2, 1.98, W2, rows, [1.5, 4.43], 0.53, 12, aligns=["l", "l"],
      styles={(1, 0): dict(fill="RED", color="WHITE", bold=True), (5, 0): dict(fill="PYEL", bold=True), (5, 1): dict(fill="PYEL", bold=True)})
conclusion(s, L, 5.60, CW, 0.50, "직급은 1차에서 확정, 2차는 **년차만 산정** → 년차 기준과 연봉 기준이 크게 다른 인원만 **최종 년차 개별 판단**", 14)
footnote(s, "기준 : 2차 분류 기준 (체류연수 G1 4 · G2 4 · G3 5년)  /  기준연봉표 1년차 = 신 Pay-band 하한, 연 2.5% 상승", 6.85)
# 순서 : 2차 특이인원 앞
lst = p.slides._sldIdLst; ids = list(lst); new = ids[-1]; lst.remove(new); lst.insert(3, new)

# ================= 4. 2차 분류 결과 특이인원 : 기준 한 줄 삭제 · 번호 =================
s = p.slides[4]; S4 = sh(s)
put(S4["TextBox 1"], "4. 2차 분류 결과 특이인원", 26, "INK", True)
for x in list(s.shapes):
    if x.has_text_frame and x.text_frame.text.startswith("2차 기준 :"): x._element.getparent().remove(x._element)

# ================= 5. 승진 시 인상 방식 시뮬레이션 =================
s = p.slides[5]
keep_only(s, {"TextBox 1", "Rectangle 2", "Rectangle 3"})
S5 = sh(s)
put(S5["TextBox 1"], "5. 승진 시 인상 방식 시뮬레이션 (샘플)", 26, "INK", True)
P = [("정액(1)", "350 · 400 · 350만원", "NAVY"), ("정액(2)", "400 · 450 · 400만원", "NAVY2"),
     ("정률(1)", "7 · 8 · 6%", "RED"), ("정률(2)", "8 · 9 · 7%", "GOLD")]
put(S5["Rectangle 3"], f"정년(55세) 연봉 **{man(SIM['정액(1)']['final'])} ~ {man(SIM['정률(2)']['final'])}만원** → 9,900만원 미도달 기준 **정액(2) · 정률(1) 수준까지 가능**",
    16, "WHITE", align="c", hl="YEL", inset=0.08)
conds = ["27세 · 4,000만원 입사", "연 2.5% 인상", "승진 대상 4 · 4 · 5년차", "진급누락 2 · 4 · 5회", "승진 G2 32 · G3 39 · G4 48세", "상한 미적용"]
cw = [2.25, 1.45, 2.15, 1.95, 2.68, 1.25]; x = L
for t, w in zip(conds, cw):
    box(s, x, 1.62, w, 0.32, "LBLUE", body=t, size=12, color="NAVY", bold=True, inset=0.03); x += w + 0.1
subhead(s, L, 2.08, "정년 연봉 비교 (55세)", 6.3, "단위 : 만원")
rows = [["안", "승진 인상", "55세 연봉", "9,900 대비", "생애 총연봉"]]
st = {}
for i, (n, rule, col) in enumerate(P, 1):
    d = SIM[n]; gap = d["final"] - 99000000
    rows.append([n, rule, man(d["final"]), ("+" if gap > 0 else "") + man(gap), f"{d['sum'] / 1e8:.2f}억"])
    st[(i, 0)] = dict(fill=col, color="WHITE", bold=True)
    st[(i, 2)] = dict(bold=True, color="RED" if gap > 0 else "INK")
    st[(i, 3)] = dict(bold=True, color="RED" if gap > 0 else "OK")
for k in range(5): st[(2, k)] = dict(st.get((2, k), {}), fill=st.get((2, k), {}).get("fill", "PYEL"))
for k in range(5): st[(3, k)] = dict(st.get((3, k), {}), fill=st.get((3, k), {}).get("fill", "PYEL"))
table(s, L, 2.44, 6.3, rows, [0.95, 1.85, 1.15, 1.1, 1.25], 0.40, 12, aligns=["c", "l", "r", "r", "r"], styles=st)
text(s, L, 4.48, 6.3, 0.26, "노란 줄 = 9,900만원 미도달 범위 안에서 가장 높은 안 (권고 상한)", 12, "GRAY")
# 차트
X2 = L + 6.3 + 0.3; W2 = R - X2
subhead(s, X2, 2.08, "생애 연봉 추이 (27 → 55세, 만원)", W2)
cd = CategoryChartData(); ages = list(range(27, 56))
cd.categories = [f"{a}" if (a - 27) % 4 == 0 else " " for a in ages]
for n, _, _ in P: cd.add_series(n, [round(v / 1e4) for v in SIM[n]["W"]])
gf = s.shapes.add_chart(XL_CHART_TYPE.LINE, Inches(X2), Inches(2.40), Inches(W2), Inches(2.40), cd)
ch = gf.chart; ch.has_legend = True; ch.legend.position = XL_LEGEND_POSITION.TOP; ch.legend.include_in_layout = False
ch.legend.font.size = Pt(12); ch.legend.font.name = FONT
for i, col in enumerate(["1F4E79", "4F7FAE", "C00000", "A88A10"]):
    ser = ch.series[i]; ser.format.line.color.rgb = rgb(col); ser.format.line.width = Pt(2.0); ser.smooth = False; ser.marker.style = XL_MARKER_STYLE.NONE
ca = ch.category_axis; ca.tick_labels.font.size = Pt(12)
va = ch.value_axis; va.tick_labels.font.size = Pt(12); va.minimum_scale = 4000; va.maximum_scale = 10500; va.major_unit = 1500
va.has_major_gridlines = True; va.major_gridlines.format.line.color.rgb = rgb("E3E3E3")
va.tick_labels.number_format = '#,##0'; va.tick_labels.number_format_is_linked = False
# 의견 · CAP 운영
Y = 4.92
box(s, L, Y, 6.3, 0.30, "NAVY", body="인사팀 의견", size=12, color="WHITE", bold=True)
box(s, L, Y + 0.30, 6.3, 0.82, "WHITE", "NAVY", 1, size=12, color="BODY", align="l", hl="NAVY", inset=0.12,
    body=["• **정액(2) · 정률(1) 수준까지 가능** (55세 9,835 · 9,736만원)",
          "• 정률(2)는 55세 10,005만원으로 **9,900만원 초과** → 권고 범위 밖"])
box(s, X2, Y, W2, 0.30, "RED", body="상한(CAP) 운영 (안)", size=12, color="WHITE", bold=True)
box(s, X2, Y + 0.30, W2, 0.82, "WHITE", "RED", 1, size=12, color="BODY", align="l", hl="RED", inset=0.12,
    body=["• 기존 상한 일괄 적용(동결) 대신 **상한 도달 시 인사평가로 조정**",
          "• 상한 대상자를 소속 임원에게 통보 → **인사팀 최종 조정**"])
conclusion(s, L, 6.25, CW, 0.46, "승진 인상은 **9,900만원 미도달 범위(정액(2) · 정률(1))** 안에서 결정, 상한 도달자는 **인사평가 기반 개별 조정**", 14)
footnote(s, "기준 : 직급 분류 시스템 샘플 시뮬레이션 (2026.11)  /  상한 미적용 계산  /  승진 연도 연봉 = 전년 × 1.025 + 정액 · 또는 전년 × (1.025 + 정률)", 6.85)
p.save(out); print("saved", out, len(p.slides), "slides")
