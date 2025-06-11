import { decodeWithCodec, encodeWithCodec, File } from '@astrobase/core';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto';

export function decrypt(/** @type {File} */ file, /** @type {string} */ passphrase) {
  const buf = file.payload;

  const iv = buf.slice(0, 12);
  const salt = buf.slice(12, 28);
  const bufTagStart = buf.length - 16;
  const key = pbkdf2Sync(passphrase, salt, 10000, 32, 'sha512');
  const payload = buf.slice(28, bufTagStart);

  const decipher = createDecipheriv('chacha20-poly1305', key, iv);
  decipher.setAuthTag(buf.slice(bufTagStart));

  const decoded = Buffer.concat([decipher.update(payload), decipher.final()]);

  return decodeWithCodec(decoded, 'application/json');
}

export async function encrypt(/** @type {object} */ obj, /** @type {string} */ passphrase) {
  const iv = randomBytes(12);
  const salt = randomBytes(16);
  const key = pbkdf2Sync(passphrase, salt, 10000, 32, 'sha512');
  const payload = await encodeWithCodec(obj, 'application/json');

  const cipher = createCipheriv('chacha20-poly1305', key, iv);

  // prettier-ignore
  const buf = Buffer.concat([iv, salt, cipher.update(payload), cipher.final(), cipher.getAuthTag()]);

  return new File().setPayload(buf);
}
