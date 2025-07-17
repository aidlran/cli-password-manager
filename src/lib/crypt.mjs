import { encodeWithCodec } from '@astrobase/sdk/codecs';
import { Common } from '@astrobase/sdk/common';
import { createInstance } from '@astrobase/sdk/instance';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto';

const commonInstance = createInstance(Common);

export function decrypt(
  /** @type {Uint8Array} */ buf,
  /** @type {import('crypto').BinaryLike} */ passphrase,
) {
  try {
    const iv = buf.slice(0, 12);
    const salt = buf.slice(12, 28);
    const bufTagStart = buf.length - 16;
    const key = pbkdf2Sync(passphrase, salt, 10000, 32, 'sha512');
    const payload = buf.slice(28, bufTagStart);
    const decipher = createDecipheriv('chacha20-poly1305', key, iv);
    decipher.setAuthTag(buf.slice(bufTagStart));
    return Buffer.concat([decipher.update(payload), decipher.final()]);
  } catch (e) {
    console.error('Unable to decrypt');
    process.exit(1);
  }
}

export async function encrypt(
  /** @type {object} */ obj,
  /** @type {import('crypto').BinaryLike} */ passphrase,
  /** @type {import('@astrobase/sdk/instance').Instance} */ instance = commonInstance,
  /** @type {import('@astrobase/sdk/media-types').MediaTypeLike} */ mediaType = 'application/json',
) {
  const iv = randomBytes(12);
  const salt = randomBytes(16);
  const key = pbkdf2Sync(passphrase, salt, 10000, 32, 'sha512');
  const payload = await encodeWithCodec(instance, obj, mediaType);
  const cipher = createCipheriv('chacha20-poly1305', key, iv);
  return Buffer.concat([iv, salt, cipher.update(payload), cipher.final(), cipher.getAuthTag()]);
}
