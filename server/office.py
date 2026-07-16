# -*- coding: utf-8 -*-
"""xlsx/pptx 경량 파서 — 표준 라이브러리만 사용 (xlsx/pptx = zip + XML).
Office COM이 없는 환경(개인 PC, 서버)에서도 골든셋 업로드 등이 동작하게 한다.
셀 서식·수식 등 복잡한 기능은 다루지 않는다 — 값 읽기 전용.
"""
import re, zipfile
from xml.etree import ElementTree as ET

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


def _col_to_idx(col):
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def xlsx_rows(path, header_row=1):
    """첫 시트를 [{헤더: 값}] 목록으로. header_row행 = 헤더 (1부터)."""
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(M + "si"):
            shared.append("".join(t.text or "" for t in si.iter(M + "t")))
    sheet_name = next(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
    raw = []
    for row in ET.fromstring(z.read(sheet_name)).iter(M + "row"):
        cells = {}
        for c in row.iter(M + "c"):
            col = re.match(r"[A-Z]+", c.get("r", "A")).group(0)
            t = c.get("t")
            v = c.find(M + "v")
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter(M + "t"))
            else:
                val = (v.text or "") if v is not None else ""
            cells[_col_to_idx(col)] = str(val).strip()
        raw.append(cells)
    if len(raw) < header_row:
        return []
    hdr_cells = raw[header_row - 1]
    headers = {i: h for i, h in hdr_cells.items() if h}
    rows = []
    for cells in raw[header_row:]:
        if not any(v for v in cells.values()):
            continue
        rows.append({h: cells.get(i, "") for i, h in headers.items()})
    return rows


def xlsx_write(path, headers, rows):
    """최소 xlsx 생성 (inline string) — 양식 파일 제공용."""
    def esc(s):
        return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    def rowxml(r, vals):
        cs = ""
        for i, v in enumerate(vals):
            col = ""
            n = i
            while True:
                col = chr(65 + n % 26) + col
                n = n // 26 - 1
                if n < 0:
                    break
            cs += '<c r="%s%d" t="inlineStr"><is><t>%s</t></is></c>' % (col, r, esc(v))
        return '<row r="%d">%s</row>' % (r, cs)
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
             + rowxml(1, headers) + "".join(rowxml(i + 2, r) for i, r in enumerate(rows))
             + "</sheetData></worksheet>")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Default Extension="xml" ContentType="application/xml"/>'
                   '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                   '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        z.writestr("_rels/.rels",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr("xl/workbook.xml",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                   'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                   '<sheets><sheet name="골든셋" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr("xl/worksheets/sheet1.xml", sheet)


def pptx_slide_texts(path):
    """슬라이드별 텍스트 목록 [(슬라이드번호, 전체 텍스트)]."""
    z = zipfile.ZipFile(path)
    out = []
    slides = sorted((n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)),
                    key=lambda n: int(re.search(r"\d+", n).group(0)))
    for n in slides:
        num = int(re.search(r"\d+", n).group(0))
        texts = [t.text or "" for t in ET.fromstring(z.read(n)).iter(A + "t")]
        out.append((num, "\n".join(x for x in texts if x.strip())))
    return out
