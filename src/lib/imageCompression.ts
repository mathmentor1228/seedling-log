// STUDENT-APP-V1: Client-side image compression for mobile uploads
// COMPRESS-FIX-V2: Robust compression with fallback for mobile devices

export async function compressImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.7
): Promise<File> {
  // If file is already small enough (< 500KB), skip compression
  if (file.size < 500 * 1024 && file.type === 'image/jpeg') {
    return file;
  }

  try {
    const bitmap = await createImageBitmapSafe(file);
    if (!bitmap) {
      // Fallback: return original if we can't decode
      console.warn('[compressImage] Could not decode image, returning original');
      return file;
    }

    let { width, height } = bitmap;

    // Scale down if needed
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[compressImage] Canvas context not available, returning original');
      if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

    // Try to get blob
    const blob = await canvasToBlobSafe(canvas, 'image/jpeg', quality);
    if (!blob) {
      console.warn('[compressImage] toBlob returned null, returning original');
      return file;
    }

    // If compressed is larger than original, return original
    if (blob.size >= file.size && file.type === 'image/jpeg') {
      return file;
    }

    const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    return compressed;
  } catch (err) {
    console.warn('[compressImage] Compression failed, returning original:', err);
    return file;
  }
}

/** Safe wrapper for createImageBitmap with fallback to Image element */
async function createImageBitmapSafe(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  // Try createImageBitmap first (faster, works in most modern browsers)
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to Image element approach
    }
  }

  // Fallback: use Image element with object URL
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    const cleanup = () => URL.revokeObjectURL(url);

    img.onload = () => {
      cleanup();
      resolve(img);
    };

    img.onerror = () => {
      cleanup();
      resolve(null);
    };

    img.src = url;
  });
}

/** Safe wrapper for canvas.toBlob that returns a Promise */
function canvasToBlobSafe(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(
        (blob) => resolve(blob),
        type,
        quality
      );
    } catch {
      resolve(null);
    }
  });
}
