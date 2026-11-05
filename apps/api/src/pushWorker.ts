import { readFileSync } from 'node:fs';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import webPush from 'web-push';
import { z } from 'zod';
import { connect } from './db/client';
import { deliverPending, type PushSenders, type Sender, type WebPushTarget } from './modules/push';

// Runs apart from the API, so the API needs no internet and never holds a sending key.
const env = z.object({
  DATABASE_URL: z.string().min(1),
  FIREBASE_SERVICE_ACCOUNT_FILE: z.string().min(1).optional(),
  // Compose passes the unset ones as empty.
  WEB_PUSH_PUBLIC_KEY: z.string().optional().transform((value) => value || undefined),
  WEB_PUSH_PRIVATE_KEY: z.string().optional().transform((value) => value || undefined),
  // Who push services contact about abuse: a mailto: or https: address. Apple refuses messages without one.
  WEB_PUSH_SUBJECT: z.union([z.literal(''), z.string().regex(/^(mailto:|https:\/\/)/)]).optional().transform((value) => value || undefined),
}).parse(process.env);

const POLL_MS = 3000;
// Matches how long deliverPending keeps trying, so a phone that's off doesn't get it a day late.
const TTL_SECONDS = 3600;

function fcmSender(file: string): Sender<string> {
  const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
  const account = JSON.parse(readFileSync(file, 'utf8')) as ServiceAccount;
  const messaging = getMessaging(initializeApp({ credential: cert(account) }));
  return {
    send: async (tokens, { title, body, route }) => {
      const { responses, successCount } = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: route ? { route } : {},
        android: { priority: 'high', notification: { channelId: 'default' } },
      });
      const dead = tokens.filter((_, index) => DEAD_TOKEN_CODES.has(responses[index]?.error?.code ?? ''));
      return { dead, retry: successCount === 0 && dead.length < tokens.length };
    },
  };
}

function webSender(vapidDetails: { subject: string; publicKey: string; privateKey: string }): Sender<WebPushTarget> {
  // Only these mean the subscription itself is gone. A 400 or 403 is more likely our keys
  // being wrong, and dropping everyone's subscription over that couldn't be undone.
  const DEAD_STATUSES = new Set([404, 410]);
  return {
    send: async (targets, message) => {
      const results = await Promise.all(targets.map(async (target) => {
        try {
          await webPush.sendNotification(
            { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
            JSON.stringify(message),
            { vapidDetails, TTL: TTL_SECONDS, urgency: 'high' },
          );
          return 'ok' as const;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status && DEAD_STATUSES.has(status)) return 'dead' as const;
          console.error('Web push failed', status ?? error);
          return 'failed' as const;
        }
      }));
      const dead = targets.filter((_, index) => results[index] === 'dead');
      return { dead, retry: !results.includes('ok') && results.includes('failed') };
    },
  };
}

const senders: PushSenders = {};
if (env.FIREBASE_SERVICE_ACCOUNT_FILE) senders.fcm = fcmSender(env.FIREBASE_SERVICE_ACCOUNT_FILE);
if (env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY && env.WEB_PUSH_SUBJECT) {
  senders.web = webSender({ subject: env.WEB_PUSH_SUBJECT, publicKey: env.WEB_PUSH_PUBLIC_KEY, privateKey: env.WEB_PUSH_PRIVATE_KEY });
}
if (!senders.fcm && !senders.web) {
  console.error('Nothing to send with: set FIREBASE_SERVICE_ACCOUNT_FILE, or the three WEB_PUSH_ variables');
  process.exit(1);
}

const { db, close } = await connect(env.DATABASE_URL);
let running = true;
const stop = () => {
  running = false;
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

console.log(`Push worker running: ${[senders.fcm && 'Android', senders.web && 'web'].filter(Boolean).join(' and ')}`);
while (running) {
  // Failures just wait for the next round: the work stays in the table.
  await deliverPending(db, senders).catch((error: unknown) => console.error('Push round failed', error));
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}
await close();
process.exit(0);
