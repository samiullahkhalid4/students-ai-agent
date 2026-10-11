"""Rebuild the small text-based PDF and DOCX fixtures using Python's standard library."""
from pathlib import Path
import textwrap
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1] / 'samples'
text = (root / 'lecture.txt').read_text()
lines = [line for paragraph in text.splitlines() for line in (textwrap.wrap(paragraph, 88) or [''])]
pages = [lines[i:i + 48] for i in range(0, len(lines), 48)]
objects = [b'<< /Type /Catalog /Pages 2 0 R >>', None, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
page_ids = []
for page in pages:
    page_id = len(objects) + 1
    content_id = page_id + 1
    page_ids.append(page_id)
    objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>'.encode())
    commands = ['BT /F1 10 Tf 45 750 Td 14 TL']
    for line in page:
        safe = line.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
        commands.append(f'({safe}) Tj T*')
    commands.append('ET')
    content = '\n'.join(commands).encode('latin-1')
    objects.append(f'<< /Length {len(content)} >>\nstream\n'.encode() + content + b'\nendstream')
objects[1] = f'<< /Type /Pages /Kids [{" ".join(f"{i} 0 R" for i in page_ids)}] /Count {len(page_ids)} >>'.encode()
pdf = bytearray(b'%PDF-1.4\n')
offsets = [0]
for index, obj in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf.extend(f'{index} 0 obj\n'.encode() + obj + b'\nendobj\n')
xref = len(pdf)
pdf.extend(f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode())
for offset in offsets[1:]:
    pdf.extend(f'{offset:010} 00000 n \n'.encode())
pdf.extend(f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode())
(root / 'lecture.pdf').write_bytes(pdf)
with ZipFile(root / 'lecture.docx', 'w', ZIP_DEFLATED) as document:
    document.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    document.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    body = ''.join(f'<w:p><w:r><w:t>{escape(line)}</w:t></w:r></w:p>' for line in text.splitlines())
    document.writestr('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '</w:body></w:document>')
print('Created lecture.pdf and lecture.docx')
