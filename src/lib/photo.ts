/**
 * Shrinks a big photo in the browser before it is uploaded (phones take 12+ megapixel pictures):
 * the upload is quicker on mobile data, and serverless hosting (Vercel) refuses request bodies over
 * about 4 MB. The server re-encodes every photo anyway. Anything the browser can't decode is sent
 * as it is, and the server reports the problem.
 */
export async function shrinkPhoto(file: File, maxSide = 2400, maxBytes = 2_500_000): Promise<Blob> {
  if (file.size <= maxBytes || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
