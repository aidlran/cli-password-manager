import wordlist from '@astrobase/sdk/bip39/wordlist/english' with { type: 'json' };
import { Common } from '@astrobase/sdk/common';
import { inMemory } from '@astrobase/sdk/in-memory';
import { createInstance } from '@astrobase/sdk/instance';
import { createKeyring, loadKeyring } from '@astrobase/sdk/keyrings';
import { randomBytes } from 'crypto';
import { expect, test } from 'vitest';
import { deleteEntry, get, getEntry, getIndex, put, saveEntry, saveIndex } from './content.mjs';

const randText = (length = 8) => randomBytes(length).toString('base64');

const instance = createInstance(Common, { clients: [{ strategy: inMemory() }] });
const passphrase = randText();
const keyring = await createKeyring(instance, { passphrase, wordlist });
await loadKeyring(instance, { cid: keyring.cid, passphrase, wordlist });

test('Put & get', async () => {
  const content = {
    [randText()]: randText(),
    [randText()]: [randText()],
    [randText()]: { [randText()]: randText() },
  };

  const cid = await put(instance, content);

  await expect(get(instance, cid)).resolves.toStrictEqual(content);
});

test('saveEntry, getEntry & deleteEntry', async () => {
  await saveIndex(instance, {});

  const entryID = randText();

  /** @type {import('./content.mjs').Entry} */
  let props = {
    [randText()]: randText(),
  };

  await expect(getEntry(instance, entryID)).resolves.toBe(null);

  await saveEntry(instance, entryID, props);

  await expect(getEntry(instance, entryID)).resolves.toStrictEqual({ props });

  let prev = (await getIndex())[entryID].cid;

  props = {
    [randText()]: randText(),
    [randText()]: randText(),
  };

  await saveEntry(instance, entryID, props);

  const retrievedEntry = await getEntry(instance, entryID);

  expect(retrievedEntry.prev.toString()).toBe(prev.toString());
  expect(retrievedEntry.props).toStrictEqual(props);

  await deleteEntry(instance, entryID);

  await expect(getEntry(instance, entryID)).resolves.toBe(null);
});
