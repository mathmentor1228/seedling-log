// EXAM-PDF-GEN-V1: Convert exam result photos to a single PDF using jsPDF
import { jsPDF } from 'jspdf';

export interface PdfBuildInput {
  studentName: string;
  schoolName: string;
  examYear?: number | null;
  examDate?: string | null;
  submittedAt: string;
  examType: string;
  examPeriod?: string | null;
  subject: string;
  imageUrls: string[]; // signed URLs
}

const EXAM_PERIOD_LABEL: Record<string, string> = {
  midterm: '중간', final: '기말', performance: '수행', other: '기타',
};

export function buildPdfTitle(input: PdfBuildInput): string {
  const dt = input.examDate || input.submittedAt.slice(0, 10);
  const year = input.examYear || new Date(dt).getFullYear();
  const month = String(new Date(dt).getMonth() + 1).padStart(2, '0');
  const day = String(new Date(dt).getDate()).padStart(2, '0');
  const period = EXAM_PERIOD_LABEL[input.examType] || input.examType;
  // 학생명_학교명_년도_MMDD_중간기말_과목.pdf
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '');
  return `${safe(input.studentName)}_${safe(input.schoolName)}_${year}_${month}${day}_${period}_${safe(input.subject)}.pdf`;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed: ' + url));
    img.src = url;
  });
}

export async function generateExamResultPdf(input: PdfBuildInput): Promise<{ blob: Blob; title: string }> {
  const title = buildPdfTitle(input);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - 10; // header line

  for (let i = 0; i < input.imageUrls.length; i++) {
    if (i > 0) pdf.addPage();
    // Header
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(`${input.studentName} · ${input.schoolName} · ${input.subject} · ${EXAM_PERIOD_LABEL[input.examType] || ''}`, margin, margin + 3);
    pdf.text(`p.${i + 1}/${input.imageUrls.length}`, pageW - margin, margin + 3, { align: 'right' });

    try {
      const img = await loadImage(input.imageUrls[i]);
      const ratio = img.width / img.height;
      let w = usableW;
      let h = w / ratio;
      if (h > usableH) {
        h = usableH;
        w = h * ratio;
      }
      const x = (pageW - w) / 2;
      const y = margin + 8 + (usableH - h) / 2;
      // Draw via canvas to reliable JPEG
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      pdf.addImage(dataUrl, 'JPEG', x, y, w, h, undefined, 'FAST');
    } catch (e) {
      pdf.setFontSize(10);
      pdf.setTextColor(200, 0, 0);
      pdf.text('이미지 로드 실패: ' + (e as Error).message, margin, margin + 20);
    }
  }
  const blob = pdf.output('blob');
  return { blob, title };
}
