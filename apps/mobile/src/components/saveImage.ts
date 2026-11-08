import { Asset, requestPermissionsAsync } from 'expo-media-library';
import type { ComponentRef } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { CARD_HEIGHT, CARD_WIDTH } from './ShareCard';

/** Story-sized, whatever size the card happens to be drawn at. */
export const OUT_WIDTH = 1080;
export const OUT_HEIGHT = Math.round((OUT_WIDTH * CARD_HEIGHT) / CARD_WIDTH);

/** Asking only to add photos: the app never needs to look through them. */
export class NoPhotoAccess extends Error {}

const capture = (view: ComponentRef<typeof View>) => captureRef(view, { format: 'png', width: OUT_WIDTH, height: OUT_HEIGHT, result: 'tmpfile' });

/** Puts the card in the phone's photos, or hands it to the browser's share sheet or downloads. */
export async function saveImage(view: ComponentRef<typeof View>, name: string): Promise<void> {
  if (Platform.OS === 'web') return saveOnWeb(view as unknown as HTMLElement, `${name}.png`);
  const access = await requestPermissionsAsync(true, ['photo']);
  if (!access.granted) throw new NoPhotoAccess();
  await Asset.create(await capture(view));
}

async function saveOnWeb(card: HTMLElement, fileName: string): Promise<void> {
  // Loaded only here. The browser draws the card itself, so the type and the body come out exactly as shown.
  const { toBlob } = await import('html-to-image');
  const options = { pixelRatio: OUT_WIDTH / CARD_WIDTH };
  // Safari draws the first copy before the photo inside it has loaded, so it comes out without it. The second has it.
  await toBlob(card, options);
  const png = await toBlob(card, options);
  if (!png) throw new Error('The card came out empty.');
  // On an iPhone a download lands in Files, not Photos. The share sheet has "Save Image" and the apps to post it to.
  const file = new File([png], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      // Closing the sheet isn't a failure. Safari refuses when making the picture took too long after the tap, so it's downloaded instead.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error;
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(png);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
