import { expect, test } from 'vitest';
import { decrypt, encrypt } from './lib';

test('Encrypt & decrypt', async () => {
  const object = {
    key1: 'hello',
    key2: {
      'string-subkey': 'Hello!',
      'num-subkey': 123,
    },
  };

  const passphrase = 'testpassphrase';

  const encrypted = await encrypt(object, passphrase);

  expect(encrypted.payload).toBeInstanceOf(Uint8Array);
  expect(encrypted.payload.length).toBeGreaterThan(10);

  await expect(decrypt(encrypted, passphrase)).resolves.toStrictEqual(object);
});
