import { router } from 'expo-router';
import { useEffect } from 'react';
import { queryClient } from '@/api/queryClient';
import { useSession } from '@/auth/session';
import { hrefFor } from '@/domain/routes';
import { syncWebPush, webPushState } from './webPush';

const open = (route: unknown) => {
  const href = hrefFor(typeof route === 'string' ? route : null);
  if (href) router.push(href);
};

/** The web app's PushBridge. Turning notifications on is a button, since browsers won't ask on their own. */
export function WebPushBridge() {
  const status = useSession((state) => state.status);

  useEffect(() => {
    if (status !== 'signedIn' || !('serviceWorker' in navigator)) return undefined;
    // Signing in makes a new session, and the subscription has to follow it. Failing only costs pushes.
    if (webPushState() === 'on') void syncWebPush().catch(() => {});

    // A tap that opened the app fresh arrives in the address, from public/sw.js.
    const params = new URLSearchParams(window.location.search);
    if (params.has('open')) {
      open(params.get('open'));
      params.delete('open');
      window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
    }

    const onMessage = ({ data }: MessageEvent<{ type?: string; route?: unknown }>) => {
      if (data?.type === 'open') open(data.route);
      // A push can mean a new call on you, not just a new inbox row.
      if (data?.type === 'pushed') void queryClient.invalidateQueries({ predicate: ({ queryKey }) => ['notifications', 'calls'].includes(String(queryKey[0])) });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [status]);

  return null;
}
