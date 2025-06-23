import wordlist from '@astrobase/sdk/bip39/wordlist/english' with { type: 'json' };
import { Common } from '@astrobase/sdk/common';
import { inMemory } from '@astrobase/sdk/in-memory';
import { createInstance } from '@astrobase/sdk/instance';
import { createKeyring, loadKeyring } from '@astrobase/sdk/keyrings';
import { randomBytes } from 'crypto';
import { expect, test } from 'vitest';
import { get, put } from './content.mjs';

const randText = (length = 8) => randomBytes(length).toString('base64');

test('Put & get', async () => {
  const instance = createInstance(Common, { clients: [{ strategy: inMemory() }] });
  const passphrase = randText();
  const keyring = await createKeyring(instance, { passphrase, wordlist });
  await loadKeyring(instance, { cid: keyring.cid, passphrase, wordlist });

  const content = {
    [randText()]: randText(),
    [randText()]: [randText()],
    [randText()]: { [randText()]: randText() },
  };

  const cid = await put(instance, content);

  await expect(get(instance, cid)).resolves.toStrictEqual(content);
});
