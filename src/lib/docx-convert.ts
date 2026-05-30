import mammoth from "mammoth";
import { execSync, execFileSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";

export async function convertDocxToPdf(
  buffer: Buffer,
  originalName: string
): Promise<{ buffer: Buffer; name: string }> {
  const pdfName = originalName.replace(/\.docx?$/i, ".pdf");

  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    const tmpText = path.join(tmpdir(), `offeros_${Date.now()}.txt`);
    const tmpPdf = path.join(tmpdir(), `offeros_${Date.now()}.pdf`);
    const tmpScript = path.join(tmpdir(), `offeros_convert_${Date.now()}.py`);

    writeFileSync(tmpText, text, "utf-8");

    const pyScript = `
import sys
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    content = f.read()

doc = SimpleDocTemplate(sys.argv[2], pagesize=letter,
    leftMargin=0.85*inch, rightMargin=0.85*inch,
    topMargin=0.9*inch, bottomMargin=0.9*inch)
styles = getSampleStyleSheet()
story = []
title = sys.argv[3].replace('.pdf','').replace('_',' ')
story.append(Paragraph(title, styles['Title']))
story.append(Spacer(1, 12))
for para in content.split('\\n\\n'):
    para = para.strip()
    if not para:
        continue
    try:
        story.append(Paragraph(para.replace('<','&lt;').replace('>','&gt;').replace('&','&amp;'), styles['Normal']))
        story.append(Spacer(1, 6))
    except:
        pass
doc.build(story)
`;
    writeFileSync(tmpScript, pyScript, "utf-8");
    execFileSync("python3", [tmpScript, tmpText, tmpPdf, pdfName], { timeout: 30000 });

    const pdfBuffer = readFileSync(tmpPdf) as Buffer;
    try { unlinkSync(tmpText); } catch { /* ignore */ }
    try { unlinkSync(tmpPdf); } catch { /* ignore */ }
    try { unlinkSync(tmpScript); } catch { /* ignore */ }

    return { buffer: pdfBuffer, name: pdfName };
  } catch (err) {
    console.error(`docx→pdf conversion failed for ${originalName}:`, err);
    return { buffer, name: originalName };
  }
}
