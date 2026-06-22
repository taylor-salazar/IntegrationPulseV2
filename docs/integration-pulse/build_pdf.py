from pathlib import Path
from datetime import date
import re

try:
    from reportlab.lib import colors
except ModuleNotFoundError as exc:
    if exc.name == 'reportlab':
        raise SystemExit(
            'Missing PDF dependency: reportlab\n'
            'Install documentation dependencies from the repository root with:\n'
            '  python -m pip install -r docs\\integration-pulse\\requirements.txt\n'
            'Then rerun:\n'
            '  python docs\\integration-pulse\\build_pdf.py'
        ) from exc
    raise
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, Preformatted
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib.utils import simpleSplit

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'source'
OUT = ROOT / 'Integration_Pulse_Operations_Guide.pdf'
BLUE = colors.HexColor('#0A6ED1')
DARK = colors.HexColor('#1D2D3E')
LIGHT_BLUE = colors.HexColor('#EAF4FF')
RED = colors.HexColor('#D00000')
GRAY = colors.HexColor('#F3F5F7')

class GuideDoc(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            text = flowable.getPlainText()
            if style == 'Heading1':
                key = 'h1-%s' % len(getattr(self, '_h1', []))
                self._h1 = getattr(self, '_h1', []) + [key]
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(text, key, level=0, closed=False)
                self.notify('TOCEntry', (0, text, self.page))
            elif style == 'Heading2':
                key = 'h2-%s' % len(getattr(self, '_h2', []))
                self._h2 = getattr(self, '_h2', []) + [key]
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(text, key, level=1, closed=True)
                self.notify('TOCEntry', (1, text, self.page))

def esc(s):
    return (s or '').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

def inline(s):
    s = esc(s)
    s = re.sub(r'`([^`]+)`', r'<font name="Courier">\1</font>', s)
    return s

def make_styles():
    base = getSampleStyleSheet()
    return {
        'Title': ParagraphStyle('Title', parent=base['Title'], fontSize=30, leading=36, textColor=BLUE, alignment=TA_CENTER, spaceAfter=18),
        'Subtitle': ParagraphStyle('Subtitle', parent=base['Normal'], fontSize=15, leading=20, textColor=DARK, alignment=TA_CENTER, spaceAfter=12),
        'Meta': ParagraphStyle('Meta', parent=base['Normal'], fontSize=10, leading=14, textColor=colors.HexColor('#52677A'), alignment=TA_CENTER),
        'Heading1': ParagraphStyle('Heading1', parent=base['Heading1'], fontSize=18, leading=22, textColor=BLUE, spaceBefore=10, spaceAfter=8),
        'Heading2': ParagraphStyle('Heading2', parent=base['Heading2'], fontSize=13.5, leading=17, textColor=DARK, spaceBefore=8, spaceAfter=5),
        'Heading3': ParagraphStyle('Heading3', parent=base['Heading3'], fontSize=11.5, leading=14, textColor=BLUE, spaceBefore=6, spaceAfter=3),
        'Body': ParagraphStyle('Body', parent=base['BodyText'], fontSize=9.4, leading=12.3, textColor=DARK, spaceAfter=5),
        'TableCell': ParagraphStyle('TableCell', parent=base['BodyText'], fontSize=8.0, leading=9.6, textColor=DARK, spaceAfter=0),
        'Bullet': ParagraphStyle('Bullet', parent=base['BodyText'], fontSize=9.2, leading=12, leftIndent=14, firstLineIndent=-8, bulletIndent=4, spaceAfter=3),
        'Code': ParagraphStyle('Code', parent=base['Code'], fontName='Courier', fontSize=7.6, leading=9.2, textColor=colors.HexColor('#222222'), backColor=colors.HexColor('#F7F7F7'), borderPadding=5, spaceBefore=4, spaceAfter=6),
        'Caption': ParagraphStyle('Caption', parent=base['Italic'], fontSize=8.2, leading=10, textColor=colors.HexColor('#52677A'), spaceAfter=6),
        'TOC': ParagraphStyle('TOC', parent=base['Normal'], fontSize=10, leading=13),
    }

def split_cells(line):
    line = line.strip()
    if line.startswith('|'): line = line[1:]
    if line.endswith('|'): line = line[:-1]
    return [c.strip() for c in line.split('|')]

def make_table(lines, styles):
    rows = [split_cells(l) for l in lines]
    if len(rows) > 1 and all(re.fullmatch(r':?-{3,}:?', c.replace(' ','')) for c in rows[1]):
        rows = [rows[0]] + rows[2:]
    max_cols = max(len(r) for r in rows)
    rows = [r + ['']*(max_cols-len(r)) for r in rows]
    data = [[Paragraph(inline(c), styles['TableCell']) for c in r] for r in rows]
    total = 7.0 * inch
    col_widths = [total / max_cols] * max_cols
    t = Table(data, colWidths=col_widths, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BLUE),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.25, colors.HexColor('#C8D2DC')),
        ('BACKGROUND', (0,1), (-1,-1), colors.white),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#FAFBFC')]),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    return t

def make_table_flowables(lines, styles):
    rows = [split_cells(l) for l in lines]
    separator = len(rows) > 1 and all(re.fullmatch(r':?-{3,}:?', c.replace(' ','')) for c in rows[1])
    header = rows[0]
    body = rows[2:] if separator else rows[1:]
    if len(body) <= 7:
        return [make_table(lines, styles), Spacer(1,7)]

    flowables = []
    for start in range(0, len(body), 7):
        chunk = [header]
        if separator:
            chunk.append(['---'] * len(header))
        chunk.extend(body[start:start + 7])
        chunk_lines = ['| ' + ' | '.join(row) + ' |' for row in chunk]
        flowables.append(make_table(chunk_lines, styles))
        flowables.append(Spacer(1,7))
    return flowables

def architecture_box(story, styles):
    data = [[Paragraph('<b>Browser / SAPUI5</b><br/>Integration Pulse UI', styles['Body']), Paragraph('<b>SAP BTP Integration Suite</b><br/>Runtime artifacts, configurations, MPLs', styles['Body'])],
            [Paragraph('<b>Optional FastAPI Proxy</b><br/>OAuth token handling, CORS, CSP', styles['Body']), Paragraph('<b>PostgreSQL</b><br/>Payload summaries, seven-day retention', styles['Body'])]]
    t = Table(data, colWidths=[3.35*inch,3.35*inch], rowHeights=[0.8*inch,0.8*inch])
    t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),0.6,BLUE),('BACKGROUND',(0,0),(-1,-1),LIGHT_BLUE),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('BOX',(0,0),(-1,-1),1,BLUE)]))
    story += [Spacer(1,4), t, Paragraph('Figure: Logical architecture based on current repository evidence. Mermaid source is included in assets/diagrams.', styles['Caption'])]

def parse_md(text, styles):
    story = []
    lines = text.splitlines()
    i = 0
    in_code = False
    code = []
    while i < len(lines):
        line = lines[i]
        if line.startswith('```'):
            if not in_code:
                in_code = True; code=[]
            else:
                story.append(Preformatted('\n'.join(code), styles['Code']))
                in_code = False
            i += 1; continue
        if in_code:
            code.append(line); i += 1; continue
        if not line.strip():
            i += 1; continue
        if line.startswith('|'):
            block=[]
            while i < len(lines) and lines[i].startswith('|'):
                block.append(lines[i]); i += 1
            story.extend(make_table_flowables(block, styles)); continue
        if line.startswith('# '):
            story.append(PageBreak())
            story.append(Paragraph(inline(line[2:]), styles['Heading1']))
            i += 1; continue
        if line.startswith('## '):
            story.append(Paragraph(inline(line[3:]), styles['Heading2']))
            i += 1; continue
        if line.startswith('### '):
            story.append(Paragraph(inline(line[4:]), styles['Heading3']))
            i += 1; continue
        if line.startswith('- '):
            story.append(Paragraph(inline(line[2:]), styles['Bullet'], bulletText='-'))
            i += 1; continue
        if re.match(r'\d+\. ', line):
            m=re.match(r'(\d+)\. (.*)', line)
            story.append(Paragraph(inline(m.group(2)), styles['Bullet'], bulletText=m.group(1)+'.'))
            i += 1; continue
        if line.startswith('[Screenshot needed:'):
            txt = line.strip('[]')
            t = Table([[Paragraph('<b>'+inline(txt)+'</b>', styles['Body'])]], colWidths=[6.8*inch], rowHeights=[0.55*inch])
            t.setStyle(TableStyle([('BOX',(0,0),(-1,-1),1,RED),('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#FFF5F5')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),8)]))
            story.append(t); story.append(Spacer(1,6)); i += 1; continue
        if 'assets/diagrams/logical_architecture.mmd' in line:
            architecture_box(story, styles)
        story.append(Paragraph(inline(line), styles['Body']))
        i += 1
    return story

def header_footer(canvas, doc):
    canvas.saveState()
    w,h = letter
    canvas.setStrokeColor(colors.HexColor('#DDE3EA'))
    canvas.line(0.65*inch, h-0.55*inch, w-0.65*inch, h-0.55*inch)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(colors.HexColor('#52677A'))
    canvas.drawString(0.65*inch, h-0.4*inch, 'Integration Pulse')
    canvas.drawRightString(w-0.65*inch, 0.38*inch, f'Page {doc.page}')
    canvas.restoreState()

def build():
    styles = make_styles()
    doc = GuideDoc(str(OUT), pagesize=letter, rightMargin=0.65*inch, leftMargin=0.65*inch, topMargin=0.72*inch, bottomMargin=0.62*inch)
    doc.title = 'Integration Pulse Operations Guide'
    doc.author = 'Integration Pulse Project'
    doc.subject = 'Operations, user, technical administration, and deployment guide'
    story=[]
    story.append(Spacer(1,1.1*inch))
    story.append(Paragraph('Integration Pulse', styles['Title']))
    story.append(Paragraph('Operations, User, and Technical Administration Guide', styles['Subtitle']))
    story.append(Spacer(1,0.2*inch))
    meta = f'Version 0.1 Draft<br/>Prepared date: {date.today().isoformat()}<br/>Prepared for: HR Operations, HRIS, Integration Support, SAP BTP Administrators, and Application Owners'
    story.append(Paragraph(meta, styles['Meta']))
    story.append(Spacer(1,0.5*inch))
    story.append(Table([[Paragraph('<b>Confidentiality:</b> Internal / project use. Do not include secrets, tenant URLs, or production payload data.', styles['Body'])]], colWidths=[6.8*inch], style=[('BOX',(0,0),(-1,-1),1,BLUE),('BACKGROUND',(0,0),(-1,-1),LIGHT_BLUE),('PADDING',(0,0),(-1,-1),10)]))
    story.append(PageBreak())
    story.append(Paragraph('Table of Contents', styles['Heading1']))
    toc=TableOfContents(); toc.levelStyles=[styles['TOC'], ParagraphStyle('TOC2', parent=styles['TOC'], leftIndent=18, fontSize=9)]
    story.append(toc)
    for md in sorted(SOURCE.glob('*.md')):
        text=md.read_text(encoding='utf-8-sig')
        part=parse_md(text, styles)
        story.extend(part)
    doc.multiBuild(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(OUT)

if __name__ == '__main__':
    build()
