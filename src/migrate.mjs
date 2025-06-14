import { clients } from '@astrobase/core/rpc/client';
import sqliteLegacy from '@astrobase/core/sqlite';

import wordlist from '@astrobase/sdk/bip39/wordlist/english' with { type: 'json' };
import { Common } from '@astrobase/sdk/common';
import { createInstance } from '@astrobase/sdk/instance';
import { createKeyring, getAvailableKeyringCIDs, loadKeyring } from '@astrobase/sdk/keyrings';
import sqlite from '@astrobase/sdk/sqlite';

import { inspect } from 'util';

import { getIndex } from './lib/legacy/index-file.mjs';
import { prompt } from './lib/readline.mjs';

export async function migrate(
  /** @type {import('@astrobase/sdk/instance').Instance} */ instance,
  /** @type {string} */ passphrase,
) {
  // If keyring exists then migration has happened
  const availableKeyringCIDs = await getAvailableKeyringCIDs(instance);
  console.log(inspect({ availableKeyringCIDs }));
  if (availableKeyringCIDs.length) {
    console.log('Skipping migration...');
    return;
  }

  // TODO: get original index with old API - if decrypt fails, we have the wrong passphrase
  const index = await getIndex(passphrase, () => {
    console.error('Incorrect database passphrase');
    process.exit(1);
  });

  console.log('Beginning migration...');

  // Create keyring using passphrase
  const { cid } = await createKeyring(instance, { passphrase, wordlist });
  await loadKeyring(instance, { cid, passphrase, wordlist });
  console.log('Keyring created and loaded.');

  for (const [id, { added, cid }] of Object.entries(index)) {
    // TODO: recreate, with new file format and crypt key, including parent chain
    // TODO: update cid pointer
  }

  // TODO: save new index
}

const sqliteConfig = { filename: 'test/test-1.db' };

clients.add({ strategy: sqliteLegacy(sqliteConfig) });

migrate(
  createInstance(Common, { clients: [{ strategy: sqlite(sqliteConfig) }] }),
  prompt('Enter db passphrase'),
);
