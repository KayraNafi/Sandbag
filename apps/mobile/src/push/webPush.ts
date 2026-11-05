import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { api } from '@/api/client';

/**
 * Where the web app stands on notifications:
 * - unsupported: this browser can't, or this isn't the web app
 * - install: an iPhone in Safari, which only allows them once it's on the Home Screen
 * - ask: possible, and nobody has said yes or no yet
 * - on / blocked: the person decided
 */
export type WebPushState = 'unsupported' | 'install' | 'ask' | 'on' | 'blocked';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function webPushState(): WebPushState {
  if (Platform.OS !== 'web') return 'unsupported';
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return isIos() && !installed() ? 'install' : 'unsupported';
  if (Notification.permission === 'granted') return 'on';
  if (Notification.permission === 'denied') return 'blocked';
  return 'ask';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** Hands this browser's subscription to the server, for whoever is signed in now. Needs permission already given. */
export async function syncWebPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes((await api.webPushKey()).key) });
  await api.registerWebPush(subscription.toJSON());
}

/** Safari only shows the prompt from a tap, so this must run inside one. */
export async function enableWebPush(): Promise<WebPushState> {
  if (await Notification.requestPermission() === 'granted') await syncWebPush();
  return webPushState();
}

export function useWebPush() {
  const [state, setState] = useState<WebPushState>('unsupported');
  useEffect(() => setState(webPushState()), []);
  const enable = useCallback(async () => setState(await enableWebPush()), []);
  return { state, enable };
}
