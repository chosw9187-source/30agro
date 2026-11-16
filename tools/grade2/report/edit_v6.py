"""v5 → v6 : 1장 설정 근거 문구 (① 단계 통합 원칙, ③ 직무 능력 정의). 실행: python3 edit_v6.py 입력(v5).pptx 출력.pptx"""
import sys
from pptx import Presentation
from sgdeck import C
from sgdeck import _fill_tf

src, out = sys.argv[1], sys.argv[2]
p = Presentation(src)
s = p.slides[1]
tbl = next(x.table for x in s.shapes if x.has_table and x.table.cell(0, len(x.table.columns) - 1).text.strip() == "설정 근거")
new = {1: (["기존 승진 이력 인정 · 6→4단계 통합", "(양 끝 단독 유지, 중간 인접 2단계 통합)"], False),
       3: (["직급별 직무 능력 정의", "(정형 → 자율·기획 → 과제 리딩 → 전략적 판단)"], True)}
col = len(tbl.columns) - 1
for r, (lines, bold) in new.items():
    tf = tbl.cell(r, col).text_frame
    for par in list(tf.paragraphs)[1:]: par._p.getparent().remove(par._p)
    for run in list(tf.paragraphs[0].runs): run._r.getparent().remove(run._r)
    _fill_tf(tf, lines, 12, C["INK"], bold, "l", "ctr", None, 1.05, 0.05)
p.save(out); print("saved", out)
