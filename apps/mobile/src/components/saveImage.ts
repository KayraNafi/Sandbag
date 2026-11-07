import { Asset, requestPermissionsAsync } from 'expo-media-library';
import type { ComponentRef } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { CARD_HEIGHT, CARD_WIDTH } from './ShareCard';

/** Story-sized, whatever size the card happens to be drawn at. */
const OUT_WIDTH = 1080;
const OUT_HEIGHT = Math.round((OUT_WIDTH * CARD_HEIGHT) / CARD_WIDTH);

/** Asking only to add photos: the app never needs to look through them. */
export class NoPhotoAccess extends Error {}

const capture = (view: ComponentRef<typeof View>) => captureRef(view, { format: 'png', width: OUT_WIDTH, height: OUT_HEIGHT, result: 'tmpfile' });

/** Puts the card in the phone's photos, or downloads it on the web. */
export async function saveImage(view: ComponentRef<typeof View>, name: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Loaded only here. The browser draws the card itself, so the type and the body come out exactly as shown.
    const { toPng } = await import('html-to-image');
    const link = document.createElement('a');
    link.href = await toPng(view as unknown as HTMLElement, { pixelRatio: OUT_WIDTH / CARD_WIDTH });
    link.download = `${name}.png`;
    link.click();
    return;
  }
  const access = await requestPermissionsAsync(true, ['photo']);
  if (!access.granted) throw new NoPhotoAccess();
  await Asset.create(await capture(view));
}
