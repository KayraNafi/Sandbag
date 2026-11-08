import { OUT_HEIGHT, OUT_WIDTH } from './saveImage';

/**
 * The browser hands back the photo at full size. The saved card copies it into a picture of the page,
 * and Safari gives up on one that big, so it's cut down to just cover the saved card.
 */
export async function shrinkPhoto(uri: string): Promise<string> {
  const image = new Image();
  image.src = uri;
  await image.decode();
  const scale = Math.min(1, Math.max(OUT_WIDTH / image.naturalWidth, OUT_HEIGHT / image.naturalHeight));
  if (scale === 1) return uri;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  const small = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.9));
  if (!small) return uri;
  URL.revokeObjectURL(uri);
  return URL.createObjectURL(small);
}
