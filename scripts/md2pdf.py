# -*- coding: utf-8 -*-
"""MANUAL.md → MANUAL.pdf (reportlab, 맑은 고딕). 헤더·문단·리스트·표·코드블록·수평선 처리.

문서 빌드 전용 스크립트다(서버 런타임과 무관 — 의존성 제로 원칙은 server/에만 적용).
사용:  pip install reportlab  →  python scripts/md2pdf.py
MANUAL.md를 수정한 뒤 이걸 다시 돌리면 MANUAL.pdf가 갱신된다. Windows 맑은 고딕 폰트 필요.
"""
import sys, io, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                Preformatted, HRFlowable, KeepTogether)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # scripts/의 상위 = 프로젝트 루트
SRC = os.path.join(ROOT, "MANUAL.md")
OUT = os.path.join(ROOT, "MANUAL.pdf")

pdfmetrics.registerFont(TTFont("Malgun", r"C:\Windows\Fonts\malgun.ttf"))
pdfmetrics.registerFont(TTFont("MalgunBd", r"C:\Windows\Fonts\malgunbd.ttf"))
pdfmetrics.registerFont(TTFont("Mono", r"C:\Windows\Fonts\consola.ttf"))

INK = colors.HexColor("#1a2233")
ACC = colors.HexColor("#2a4d8f")
MUT = colors.HexColor("#5b6b80")

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def inline(s):
    s = esc(s)
    s = re.sub(r"\*\*(.+?)\*\*", r'<font name="MalgunBd">\1</font>', s)
    s = re.sub(r"`(.+?)`", r'<font name="Mono" size=8.5 backcolor="#eef1f6">\1</font>', s)
    s = re.sub(r"\[(.+?)\]\((.+?)\)", r'<font color="#2a4d8f">\1</font>', s)  # 링크는 텍스트만
    return s

styles = getSampleStyleSheet()
body = ParagraphStyle("body", parent=styles["Normal"], fontName="Malgun", fontSize=9.7,
                      leading=15, textColor=INK, spaceAfter=5)
h1 = ParagraphStyle("h1", fontName="MalgunBd", fontSize=19, leading=24, textColor=ACC, spaceBefore=6, spaceAfter=10)
h2 = ParagraphStyle("h2", fontName="MalgunBd", fontSize=14, leading=19, textColor=ACC, spaceBefore=14, spaceAfter=6)
h3 = ParagraphStyle("h3", fontName="MalgunBd", fontSize=11.5, leading=16, textColor=INK, spaceBefore=10, spaceAfter=4)
li = ParagraphStyle("li", parent=body, leftIndent=13, bulletIndent=3, spaceAfter=3)
cell = ParagraphStyle("cell", parent=body, fontSize=8.6, leading=12, spaceAfter=0)
cellh = ParagraphStyle("cellh", parent=cell, fontName="MalgunBd", textColor=colors.white)

flow = []
lines = open(SRC, encoding="utf-8").read().splitlines()
i = 0

def flush_table(rows):
    if not rows:
        return
    header, data = rows[0], rows[1:]
    ncol = len(header)
    tdata = [[Paragraph(inline(c), cellh) for c in header]]
    for r in data:
        r = (r + [""] * ncol)[:ncol]
        tdata.append([Paragraph(inline(c), cell) for c in r])
    avail = 170 * mm
    # 첫 열은 좁게, 나머지 균등 (대부분 '항목|설명' 형태)
    if ncol >= 2:
        w0 = min(45 * mm, avail * 0.28)
        rest = (avail - w0) / (ncol - 1)
        widths = [w0] + [rest] * (ncol - 1)
    else:
        widths = [avail]
    t = Table(tdata, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACC),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f6fa")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c5d0e0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(Spacer(1, 3))
    flow.append(t)
    flow.append(Spacer(1, 7))

while i < len(lines):
    ln = lines[i]
    if ln.startswith("```"):
        buf = []
        i += 1
        while i < len(lines) and not lines[i].startswith("```"):
            buf.append(lines[i]); i += 1
        code = "\n".join(buf)
        # 코드블록에 한글 주석이 섞이므로 한글 지원 폰트(Malgun)로 — Consolas는 한글 글리프가 없어 공백이 된다
        pre = Preformatted(code, ParagraphStyle("code", fontName="Malgun", fontSize=8.3,
                           leading=12, textColor=INK, backColor=colors.HexColor("#f0f2f6"),
                           borderPadding=6, leftIndent=2))
        flow.append(Spacer(1, 2)); flow.append(pre); flow.append(Spacer(1, 6))
        i += 1
        continue
    if ln.startswith("|") and "|" in ln[1:]:
        rows = []
        while i < len(lines) and lines[i].startswith("|"):
            cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            if not re.match(r"^[\s\-:|]+$", lines[i]):  # 구분선 스킵
                rows.append(cells)
            i += 1
        flush_table(rows)
        continue
    if ln.startswith("### "):
        flow.append(Paragraph(inline(ln[4:]), h3))
    elif ln.startswith("## "):
        flow.append(Paragraph(inline(ln[3:]), h2))
    elif ln.startswith("# "):
        flow.append(Paragraph(inline(ln[2:]), h1))
    elif ln.strip() == "---":
        flow.append(Spacer(1, 3)); flow.append(HRFlowable(width="100%", thickness=0.6,
                    color=colors.HexColor("#c5d0e0"))); flow.append(Spacer(1, 5))
    elif re.match(r"^\s*[-*] ", ln):
        txt = re.sub(r"^\s*[-*] ", "", ln)
        flow.append(Paragraph("• " + inline(txt), li))
    elif ln.strip() == "":
        pass
    else:
        flow.append(Paragraph(inline(ln), body))
    i += 1

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Malgun", 8); canvas.setFillColor(MUT)
    canvas.drawString(20 * mm, 12 * mm, "One UI Agent — 사용 설명서")
    canvas.drawRightString(190 * mm, 12 * mm, "%d" % doc.page)
    canvas.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                        topMargin=18 * mm, bottomMargin=18 * mm,
                        title="One UI Agent 사용 설명서", author="One UI Agent")
doc.build(flow, onFirstPage=footer, onLaterPages=footer)
print("PDF 생성:", OUT, "(%d KB)" % (os.path.getsize(OUT) // 1024))
