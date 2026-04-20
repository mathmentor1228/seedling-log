// IMG-BLUR-DETECT-V1: Detects blurry images via Laplacian variance
// Higher variance = sharper. Threshold ~150 works well for phone photos of paper.
export interface BlurResult {
  variance: number;
  isBlurry: boolean;
  width: number;
  height: number;
}

export async function detectBlur(file: File, threshold = 120): Promise<BlurResult> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { variance: 999, isBlurry: false, width: 0, height: 0 };

  // Downscale to speed up calculation (max 600px on long side)
  const max = 600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close?.();
    return { variance: 999, isBlurry: false, width: bitmap.width, height: bitmap.height };
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const data = ctx.getImageData(0, 0, w, h).data;
  // Convert to grayscale buffer
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  // Apply 3x3 Laplacian kernel: [[0,1,0],[1,-4,1],[0,1,0]]
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap =
        -4 * gray[idx] +
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx - w] +
        gray[idx + w];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return { variance, isBlurry: variance < threshold, width: w, height: h };
}
