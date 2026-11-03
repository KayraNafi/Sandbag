import * as Sharing from 'expo-sharing';
import type { ComponentRef, RefObject } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { CARD_WIDTH } from './SessionCard';

/** Story-sized, whatever size the card happens to be drawn at. */
const OUT_WIDTH = 1080;
const OUT_HEIGHT = 1920;

/** Turns a view into a picture and hands it to the phone's share sheet, or downloads it on the web. */
export async function shareImage(view: RefObject<ComponentRef<typeof View> | null>, name: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Loaded only here. It lets the browser draw the card itself, so the type and the body come out exactly as shown.
    const { toPng } = await import('html-to-image');
    const url = await toPng(view.current as unknown as HTMLElement, { pixelRatio: OUT_WIDTH / CARD_WIDTH });
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.png`;
    link.click();
    return;
  }
  const file = await captureRef(view, { format: 'png', width: OUT_WIDTH, height: OUT_HEIGHT, result: 'tmpfile' });
  await Sharing.shareAsync(file, { mimeType: 'image/png', UTI: 'public.png' });
}
