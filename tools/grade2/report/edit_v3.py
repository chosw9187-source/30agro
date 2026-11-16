"""사용자 수정본 v2 → 2차 특이인원 장 특이사항을 '설명' 톤으로. 실행: python3 edit_v3.py 입력.pptx 출력.pptx"""
import sys
from pptx import Presentation
from sgdeck import *
from sgdeck import _fill_tf

src, out = sys.argv[1], sys.argv[2]
p = Presentation(src)
s = p.slides[4]
sh = {x.name: x for x in s.shapes}

def put(name, body, size=12, color="BODY", bold=False, align="l", hl=None, inset=0.12):
    tf = sh[name].text_frame
    for par in list(tf.paragraphs)[1:]: par._p.getparent().remove(par._p)
    for r in list(tf.paragraphs[0].runs): r._r.getparent().remove(r._r)
    _fill_tf(tf, body, size, C.get(color, color), bold, align, "ctr", C.get(hl, hl) if hl else None, 1.2, inset)

put("Rectangle 6", "현직급 G5 · G4 8명 : 직급 년차 8~29년차로 **해당 직급 체류연수를 넘는 장기 근속 인원**",
    16, "WHITE", align="c", hl="YEL", inset=0.08)
put("Rectangle 9", "현직급 G5 → 신 G3 (4명)", 12, "WHITE", True, "c", inset=0.08)
put("Rectangle 10", ["• G3 직급 년차 **9~19년차** (체류연수 5년 초과)",
                     "• 현 연봉은 G3 밴드 **상단 (76~85%)**"], hl="NAVY")
put("Rectangle 11", "현직급 G4 → 신 G2 (4명)", 12, "WHITE", True, "c", inset=0.08)
put("Rectangle 12", ["• G2 직급 년차 **8~29년차** (체류연수 4년 초과)",
                     "• 현 연봉은 G2 밴드 **상단 (75~102%)**"], hl="RED")
put("Rectangle 13", "⇒ 2차 특이인원은 **현 직급 근속이 긴 인원**으로, 연봉 기준 년차와 **−14 ~ +4년** 차이 → 최종 년차 판단 시 참고",
    14, "INK", True, "l", hl="RED", inset=0.15)
put("TextBox 7", "단위 : 연봉 만원  ·  ▲ = 체류연수 초과 (전원)", 12, "GRAY", align="r", inset=0)
# 표 열 폭 : 현 연봉 · 차이 열 넓히고 비고 열에서 차감 (줄바꿈 방지)
from pptx.util import Inches
cols = sh["Table 8"].table.columns
cols[6].width += Inches(0.32); cols[10].width += Inches(0.14); cols[13].width -= Inches(0.46)
p.save(out); print("saved", out)
