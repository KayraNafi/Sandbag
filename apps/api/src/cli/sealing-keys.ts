import { makeSealingKeys } from '../integrations/sealing';

// Makes the key pair for importing from other apps. Paste both lines into deploy/.env:
//   npm run sealing-keys -w @sandbag/api
// Making a new pair later means everyone connects their apps again, as the old keys can't be opened.
const { publicKey, privateKey } = makeSealingKeys();
console.log(`INTEGRATION_PUBLIC_KEY=${publicKey}`);
console.log(`INTEGRATION_PRIVATE_KEY=${privateKey}`);
