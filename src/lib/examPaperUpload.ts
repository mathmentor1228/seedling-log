import { compressImage } from './imageCompression';

/** Reduce photo uploads before encoding; preserve PDF documents unchanged. */
export async function prepareExamPaperUpload(file: File): Promise<File> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return file;
  const prepared = await compressImage(file, 1800, 1800, 0.75, true);
  if (prepared.size > 12 * 1024 * 1024) {
    throw new Error('사진 용량을 줄이지 못했어요. JPG나 PNG 사진으로 다시 골라 주세요.');
  }
  return prepared;
}