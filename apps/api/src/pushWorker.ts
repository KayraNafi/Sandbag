import { readFileSync } from 'node:fs';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { z } from 'zod';
import { connect } from './db/client';
import { deliverPending, type PushSender } from './modules/push';

// Runs apart from the API, so the API needs no internet and never holds the Firebase key.
const env = z.object({
  DATABASE_URL: z.string().min(1),
  FIREBASE_SERVICE_ACCOUNT_FILE: z.string().min(1),
}).parse(process.env);

const POLL_MS = 3000;
const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

const account = JSON.parse(readFileSync(env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8')) as ServiceAccount;
const messaging = getMessaging(initializeApp({ credential: cert(account) }));

const sender: PushSender = {
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

const { db, close } = await connect(env.DATABASE_URL);
let running = true;
const stop = () => {
  running = false;
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

console.log('Push worker running');
while (running) {
  // Failures just wait for the next round: the work stays in the table.
  await deliverPending(db, sender).catch((error: unknown) => console.error('Push round failed', error));
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}
await close();
process.exit(0);
