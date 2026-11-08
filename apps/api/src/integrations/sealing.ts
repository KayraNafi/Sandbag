import { constants, createPrivateKey, createPublicKey, generateKeyPairSync, privateDecrypt, publicEncrypt } from 'node:crypto';

// Keys for other apps are locked with the import worker's public key. The API holds only that half, so it can
// store a key it's given but never read one back, and a copy of the database alone opens nothing.
const OAEP = { padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' } as const;

/** RSA-3072 with OAEP and SHA-256 fits up to this many bytes. */
export const MAX_SEALED_BYTES = 318;

export function sealKey(publicKey: string, secret: string): string {
  const key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
  return publicEncrypt({ key, ...OAEP }, Buffer.from(secret)).toString('base64');
}

export function openKey(privateKey: string, sealed: string): string {
  const key = createPrivateKey({ key: Buffer.from(privateKey, 'base64'), format: 'der', type: 'pkcs8' });
  return privateDecrypt({ key, ...OAEP }, Buffer.from(sealed, 'base64')).toString();
}

/** A new pair, each as one line of base64 that fits in a .env file. */
export function makeSealingKeys(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return { publicKey: publicKey.toString('base64'), privateKey: privateKey.toString('base64') };
}
