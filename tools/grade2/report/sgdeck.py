"""SG한국삼공 인사제도 개편 보고서 스타일 (Navy-Green) - python-pptx helper."""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn

C = dict(NAVY="1F4E79", NAVY2="2E5C8A", NAVY3="4F7FAE", LBLUE="D9E2F3", PBLUE="F7F9FC",
         GREEN="00A650", RED="C00000", PRED="FDECEC", YEL="FFD966", PYEL="FFF2CC", GOLD="A88A10",
         PURPLE="7030A0", INK="000000", BODY="404040", SUB="595959", GRAY="7F7F7F",
         LINE="BFBFBF", CELL="F2F2F2", HAIR="E3E3E3", WHITE="FFFFFF", OK="2E7D32")
FONT = "맑은 고딕"
W, H = 13.333, 7.5
L, R = 0.55, 12.78
CW = R - L
TOP, BOT = 1.70, 7.10


def rgb(h): return RGBColor.from_string(h)


def new_deck():
    p = Presentation(); p.slide_width, p.slide_height = Inches(W), Inches(H); return p


def blank(p): return p.slides.add_slide(p.slide_layouts[6])


def _runs(par, text, size, color, bold, hl=None):
    """'**' 구간은 Bold(+hl 색)."""
    for i, seg in enumerate(text.split("**")):
        if not seg: continue
        r = par.add_run(); r.text = seg
        f = r.font; f.name = FONT; f.size = Pt(size); f.bold = bold or (i % 2 == 1)
        f.color.rgb = rgb(hl if (i % 2 == 1 and hl) else color)
        rpr = r._r.get_or_add_rPr()
        el = rpr.find(qn("a:ea"))
        if el is None: el = rpr.makeelement(qn("a:ea"), {}); rpr.append(el)
        el.set("typeface", FONT)


def _fill_tf(tf, body, size, color, bold, align, anchor, hl, spacing, inset):
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(inset); tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "ctr": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
    for i, ln in enumerate(body if isinstance(body, list) else [body]):
        par = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        par.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[align]
        par.line_spacing = spacing
        lvl = {"• ": 0, "- ": 1, "→ ": 2}.get(ln[:2])
        if lvl is not None:   # • → - → 계단식 들여쓰기, 줄바꿈은 글자 아래 정렬
            pPr = par._p.get_or_add_pPr()
            pPr.set("marL", str(int(Inches(0.18 * lvl + 0.14)))); pPr.set("indent", str(int(-Inches(0.14))))
        _runs(par, ln, size, C.get(color, color), bold, C.get(hl, hl) if hl else None)


def text(s, x, y, w, h, body, size=13, color="BODY", bold=False, align="l", anchor="ctr",
         hl=None, spacing=1.2, inset=0.0):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    _fill_tf(tb.text_frame, body, size, color, bold, align, anchor, hl, spacing, inset)
    return tb


def box(s, x, y, w, h, fill="WHITE", line=None, lw=0.75, shape=MSO_SHAPE.RECTANGLE, body=None,
        size=13, color="BODY", bold=False, align="c", hl=None, inset=0.08):
    sh = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE: sh.adjustments[0] = 0.06
    if fill: sh.fill.solid(); sh.fill.fore_color.rgb = rgb(C.get(fill, fill))
    else: sh.fill.background()
    if line: sh.line.color.rgb = rgb(C.get(line, line)); sh.line.width = Pt(lw)
    else: sh.line.fill.background()
    sh.shadow.inherit = False
    if body is not None:
        _fill_tf(sh.text_frame, body, size, color, bold, align, "ctr", hl, 1.2, inset)
    return sh


def line(s, x1, y1, x2, y2, color="LINE", w=0.75, dash=False, arrow=False):
    c = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = rgb(C.get(color, color)); c.line.width = Pt(w)
    ln = c.line._get_or_add_ln()
    if dash: ln.append(ln.makeelement(qn("a:prstDash"), {"val": "dash"}))
    if arrow: ln.append(ln.makeelement(qn("a:tailEnd"), {"type": "triangle", "w": "med", "len": "med"}))
    return c


# ---------- 프레임 ----------
def title(s, t, msg=None):
    """제목 26B + 전폭 그린 선 + 네이비 헤드메시지 바(16pt, **노랑** 강조)."""
    text(s, L, 0.30, CW, 0.46, t, 26, "INK", True)
    box(s, L, 0.88, CW, 0.035, "GREEN")
    if msg: box(s, L, 1.04, CW, 0.46, "NAVY", body=msg, size=16, color="WHITE", hl="YEL")


def subhead(s, x, y, t, w=6.0, note=None):
    box(s, x, y + 0.03, 0.07, 0.26, "PURPLE")
    text(s, x + 0.16, y, w - 0.16, 0.32, t, 16, "INK", True)
    if note: text(s, x, y, w, 0.32, note, 12, "GRAY", align="r")


def conclusion(s, x, y, w, h, t, size=14):
    """⇒ 결론 박스: 연노랑 + 빨간 테두리, **빨강** 핵심어."""
    return box(s, x, y, w, h, "PYEL", "RED", 1, body="⇒ " + t, size=size, color="INK", bold=True,
               align="l", hl="RED", inset=0.15)


def callout_red(s, x, y, w, h, t, size=13):
    return box(s, x, y, w, h, "PRED", "RED", 1, body=t, size=size, color="RED", bold=True)


def down_tri(s, cx, y, w=0.36, h=0.26):
    box(s, cx - w / 2, y, w, h, "RED", shape=MSO_SHAPE.ISOSCELES_TRIANGLE).rotation = 180


def right_arrow(s, x, cy, w=0.32, h=0.46):
    box(s, x, cy - h / 2, w, h, "RED", shape=MSO_SHAPE.RIGHT_ARROW)


def num_badge(s, x, y, n, d=0.26, fill="RED"):
    box(s, x, y, d, d, fill, shape=MSO_SHAPE.OVAL, body=str(n), size=12, color="WHITE", bold=True, inset=0)


def footnote(s, t, y=7.05):
    text(s, L, y, CW, 0.26, t, 12, "GRAY")


# ---------- 표 ----------
def table(s, x, y, w, rows, col_w=None, row_h=0.30, size=13, header="NAVY", first_col_bold=True,
          aligns=None, styles=None):
    """rows[0]=헤더. header: 주 표 NAVY / 현행·보조 표 GRAY. aligns: 열별 'l','c','r' (숫자 'r').
    styles: {(r,c): dict(fill=, color=, bold=, size=)} 강조 셀(문제 수치 RED, 합계행 PYEL)."""
    nr, nc = len(rows), len(rows[0])
    gf = s.shapes.add_table(nr, nc, Inches(x), Inches(y), Inches(w), Inches(row_h * nr))
    tbl = gf.table; tblPr = tbl._tbl.tblPr
    for k in ("firstRow", "bandRow"): tblPr.set(k, "0")
    sid = tblPr.find(qn("a:tableStyleId"))
    if sid is not None: sid.text = "{5940675A-B579-460E-94D1-54222C63F5DA}"
    col_w = col_w or [1] * nc; tot = sum(col_w)
    for i, cw in enumerate(col_w): tbl.columns[i].width = Inches(w * cw / tot)
    for r in range(nr): tbl.rows[r].height = Inches(row_h)
    styles = styles or {}
    for r in range(nr):
        for c in range(nc):
            cell = tbl.cell(r, c); st = styles.get((r, c), {})
            fill, col, b = (header, "WHITE", True) if r == 0 else ("WHITE", "INK", first_col_bold and c == 0)
            fill = st.get("fill", fill); col = st.get("color", col); b = st.get("bold", b)
            cell.fill.solid(); cell.fill.fore_color.rgb = rgb(C.get(fill, fill))
            cell.margin_left = cell.margin_right = Inches(0.05); cell.margin_top = cell.margin_bottom = 0
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            al = aligns[c] if aligns and r > 0 else "c"
            par = cell.text_frame.paragraphs[0]; cell.text_frame.word_wrap = True
            par.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[al]
            _runs(par, str(rows[r][c]), st.get("size", size), C.get(col, col), b)
            tcPr = cell._tc.get_or_add_tcPr()
            for side in ("a:lnB", "a:lnT", "a:lnR", "a:lnL"):   # 0번 삽입 → 최종 순서 L,R,T,B (스키마 순서)
                ln = tcPr.makeelement(qn(side), {"w": "6350"})
                sf = ln.makeelement(qn("a:solidFill"), {}); sf.append(sf.makeelement(qn("a:srgbClr"), {"val": C["LINE"]}))
                ln.append(sf); tcPr.insert(0, ln)
    return gf


# ---------- 고정 장표 ----------
def cover(p, t, date_dept):
    s = blank(p)
    box(s, 0, 0, 0.35, H, "NAVY"); box(s, 0.35, 0, 0.08, H, "GREEN")
    text(s, 1.2, 3.05, 11.4, 0.70, t, 36, "INK", True)
    box(s, 1.2, 4.05, 6.5, 0.05, "GREEN")
    text(s, 1.2, 6.25, 11.0, 0.30, date_dept, 14, "GRAY")
    return s


def divider(p, n, name, sections):
    s = blank(p)
    box(s, 0, 0, 4.6, H, "NAVY"); box(s, 4.6, 0, 0.08, H, "GREEN")
    text(s, 0, 2.15, 4.6, 2.0, str(n), 120, "WHITE", True, align="c")
    text(s, 5.4, 2.45, 7.4, 0.75, name, 40, "NAVY", True)
    box(s, 5.4, 3.33, 5.0, 0.05, "GREEN")
    step = 7.4 / len(sections)
    for i, sec in enumerate(sections):
        cur = (i + 1 == n)
        text(s, 5.4 + i * step, 6.62, step - 0.05, 0.28, f"{i+1}  {sec}", 14, "RED" if cur else "LINE", cur)
    return s
