import { z } from 'zod';
import { connect } from './db/client';
import { FETCHERS } from './integrations/fetchers';
import { pullDue } from './integrations/pull';

// Fetches from the apps people connected and leaves what it finds in the inbox for the API to import.
// Runs apart from the API, so the API needs no internet and can never read a connected app's key.
const env = z.object({
  DATABASE_URL: z.string().min(1),
  INTEGRATION_PRIVATE_KEY: z.string().min(1),
}).parse(process.env);

const POLL_MS = 60_000;
const { db, close } = await connect(env.DATABASE_URL);

let stopping = false;
async function shutdown() {
  stopping = true;
  await close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

while (!stopping) {
  try {
    const pulled = await pullDue(db, env.INTEGRATION_PRIVATE_KEY, FETCHERS, (error) => console.error('Import failed', error));
    if (pulled) console.log(`Pulled ${pulled} account${pulled === 1 ? '' : 's'}`);
  } catch (error) {
    console.error('Import round failed', error);
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}
