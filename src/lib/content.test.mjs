import wordlist from '@astrobase/sdk/bip39/wordlist/english' with { type: 'json' };
import { Common } from '@astrobase/sdk/common';
import { inMemory } from '@astrobase/sdk/in-memory';
import { createInstance } from '@astrobase/sdk/instance';
import { createKeyring, loadKeyring } from '@astrobase/sdk/keyrings';
import { randomBytes } from 'crypto';
import { expect, test } from 'vitest';
// prettier-ignore
import { deleteEntry, get, getEntry, getIndex, put, renameEntry, saveEntry, saveIndex } from './content.mjs';

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

test('saveEntry, getEntry, renameEntry & deleteEntry', async () => {
  await saveIndex(instance, {});

  const firstEntryID = randText();

  // Non exist get test
  await expect(getEntry(instance, firstEntryID)).resolves.toBe(null);

  // Save new test
  /** @type {import('./content.mjs').Entry} */
  let props = {
    [randText()]: randText(),
  };
  await saveEntry(instance, firstEntryID, props);
  await expect(getEntry(instance, firstEntryID)).resolves.toStrictEqual({ props });

  // Save update test
  let prev = (await getIndex())[firstEntryID].cid;
  props = {
    [randText()]: randText(),
    [randText()]: randText(),
  };
  await saveEntry(instance, firstEntryID, props);

  // Get after update
  let retrievedEntry = await getEntry(instance, firstEntryID);
  expect(retrievedEntry.prev.toString()).toBe(prev.toString());
  expect(retrievedEntry.props).toStrictEqual(props);

  // Will be renamed
  const secondEntryID = firstEntryID + 'different';

  // Rename test
  await renameEntry(instance, firstEntryID, secondEntryID);
  await expect(getEntry(instance, firstEntryID)).resolves.toBe(null);
  retrievedEntry = await getEntry(instance, secondEntryID);
  expect(retrievedEntry.prev.toString()).toBe(prev.toString());
  expect(retrievedEntry.props).toStrictEqual(props);

  // Delete test
  await deleteEntry(instance, secondEntryID);
  await expect(getEntry(instance, firstEntryID)).resolves.toBe(null);
  await expect(getEntry(instance, secondEntryID)).resolves.toBe(null);
});
