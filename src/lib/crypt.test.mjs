import { encodeWithCodec } from '@astrobase/sdk/codecs';
import { Common } from '@astrobase/sdk/common';
import { createInstance } from '@astrobase/sdk/instance';
import { expect, test } from 'vitest';
import { decrypt, encrypt } from './crypt.mjs';

test('Encrypt & decrypt', async () => {
  const instance = createInstance(Common);

  const object = {
    key1: 'hello',
    key2: {
      'string-subkey': 'Hello!',
      'num-subkey': 123,
    },
  };

  const passphrase = 'testpassphrase';

  const encrypted = await encrypt(object, passphrase, instance);
  expect(encrypted).toBeInstanceOf(Uint8Array);
  expect(encrypted.length).toBeGreaterThan(10);

  expect(
    decrypt(encrypted, passphrase).compare(
      await encodeWithCodec(instance, object, 'application/json'),
    ),
  ).toBe(0);
});
