"""사용자 수정본 v3 → v4 : 1차 기준 설정 근거 추가, 절차 문구 · 2차 분류 장 정리(통합). 실행: python3 edit_v4.py 입력.pptx 출력.pptx"""
import sys
from pptx import Presentation
from pptx.util import Inches
from sgdeck import *
from sgdeck import _fill_tf

src, out = sys.argv[1], sys.argv[2]
p = Presentation(src)
E = lambda v: int(Inches(v))

def shapes(s): return {x.name: x for x in s.shapes}
def drop(s, names):
    for x in list(s.shapes):
        if x.name in names: x._element.getparent().remove(x._element)
def put(sh, body, size=12, color="BODY", bold=False, align="l", hl=None, inset=0.0, anchor="ctr"):
    tf = sh.text_frame
    for par in list(tf.paragraphs)[1:]: par._p.getparent().remove(par._p)
    for r in list(tf.paragraphs[0].runs): r._r.getparent().remove(r._r)
    _fill_tf(tf, body, size, C.get(color, color), bold, align, anchor, C.get(hl, hl) if hl else None, 1.2, inset)

# ---------- 1. 기준 및 결과 : 설정 근거 열 추가 ----------
s = p.slides[1]; sh = shapes(s)
put(sh["TextBox 1"], "1. 직급 재분류 기준 및 결과", 26, "INK", True)
# 설정 근거 : 표 아래 별도 영역 (표는 원본 그대로)
Y = 5.42
subhead(s, L, Y, "1차 분류 기준 설정 근거", CW)
items = [("② 년차", "체류연수 + 누락 2년  (G1 · G2 4+2 · G3 5+2)", "RED"),
         ("① 현직급 · ③ 직무 역할", "동일 기준 적용  (현직급 수준 = 직무 역할 수준)", "RED"),
         ("④ 연봉", "신 Pay-band 기준  (개편안 설계값)", "NAVY")]
for i, (h, d, col) in enumerate(items):
    y = Y + 0.38 + i * 0.32
    box(s, L, y, 2.4, 0.30, col, body=h, size=12, color="WHITE", bold=True)
    box(s, L + 2.4, y, CW - 2.4, 0.30, "WHITE", "LINE", 0.75, body=d, size=12, color="INK", align="l", inset=0.12)
sh["Rectangle 31"].top = int(Inches(6.86))

# ---------- 2. 1차 특이인원 : 절차 문구 삭제 ----------
s = p.slides[2]; sh = shapes(s)
drop(s, {"Rectangle 8"})
sh["Rectangle 9"].top = E(5.72)
put(sh["TextBox 10"], "기준일 : 년차 2027.01.01  /  출처 : 직급 분류 시스템 1차 특이사항 보고", 12, "GRAY")
sh["TextBox 10"].top = E(6.35)

# ---------- 3. 2차 분류 장 → 2차 특이인원 장에 기준 한 줄로 통합 후 삭제 ----------
s = p.slides[4]; sh = shapes(s)
put(sh["TextBox 1"], "3. 2차 분류 결과 특이인원", 26, "INK", True)
drop(s, {"Rectangle 4", "TextBox 5"})
box(s, L, 1.60, 8.4, 0.34, "LBLUE", body="2차 기준 : 직급 년차 = **총 년차 − 하위 직급 체류연수**  (신 G2 −4 · G3 −8 · G4 −13년)",
    size=12, color="NAVY", hl="RED", align="l", inset=0.12)
put(sh["TextBox 14"], "출처 : 직급 분류 시스템 2차 특이사항 보고 (2026.11)  /  차이 = 연봉 기준 년차 − 년차 기준  /  체류연수 G1 4 · G2 4 · G3 5년", 12, "GRAY")
sldIdLst = p.slides._sldIdLst
sid = sldIdLst[3]; p.part.drop_rel(sid.rId); sldIdLst.remove(sid)

# ---------- 4. 시뮬레이션 번호 ----------
s = p.slides[4]; sh = shapes(s)
put(sh["TextBox 1"], "4. 승진 시 인상 방식 시뮬레이션 (샘플)", 26, "INK", True)
p.save(out); print("saved", out, len(p.slides), "slides")
