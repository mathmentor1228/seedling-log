/**
 * Preprocess an image for better OCR accuracy.
 * Applies brightness/contrast normalization and sharpening.
 */
export async function preprocessImageForOCR(
  file: File,
  options: { brightness?: number; contrast?: number } = {}
): Promise<File> {
  const { brightness = 1.1, contrast = 1.3 } = options;

  // Skip non-image files
  if (!file.type.startsWith('image/')) return file;

  try {
    const bitmap = await createImageBitmapSafe(file);
    if (!bitmap) return file;

    const { width, height } = bitmap;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      closeBitmap(bitmap);
      return file;
    }

    // Apply brightness/contrast via CSS filter
    ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    closeBitmap(bitmap);

    // Apply grayscale conversion for better OCR (keep as separate pass for clarity)
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // Weighted grayscale
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      // Simple threshold-based sharpening: increase separation
      const sharpened = gray > 160 ? Math.min(255, gray + 20) : Math.max(0, gray - 15);
      data[i] = data[i + 1] = data[i + 2] = sharpened;
    }
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9)
    );
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '_preprocessed.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn('[preprocessImageForOCR] Failed, returning original:', err);
    return file;
  }
}

async function createImageBitmapSafe(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* fallthrough */ }
  }
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function closeBitmap(bmp: ImageBitmap | HTMLImageElement) {
  if ('close' in bmp && typeof bmp.close === 'function') bmp.close();
}
