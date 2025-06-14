import { decodeWithCodec, getContent } from '@astrobase/core';

import wordlist from '@astrobase/sdk/bip39/wordlist/english' with { type: 'json' };
import { FileBuilder } from '@astrobase/sdk/file';
import { putIdentity } from '@astrobase/sdk/identity';
import { putImmutable } from '@astrobase/sdk/immutable';
import { createKeyring, getAvailableKeyringCIDs, loadKeyring } from '@astrobase/sdk/keyrings';

import { cpSync } from 'fs';

import pkg from '../package.json' with { type: 'json' };

import { decrypt, encrypt } from './lib/crypt.mjs';
import { getIndex } from './lib/legacy/index-file.mjs';

export async function migrate(
  /** @type {import('@astrobase/sdk/instance').Instance} */ instance,
  /** @type {string} */ passphrase,
  /** @type {string} */ dbPath,
) {
  // If keyring exists then migration has happened
  if ((await getAvailableKeyringCIDs(instance)).length) {
    return;
  }

  // Get original index with old API - if decrypt fails, we have the wrong passphrase
  const index = await getIndex(passphrase, () => {
    console.error('Incorrect database passphrase');
    process.exit(1);
  });

  const backupPath = `${dbPath}.bak`;
  cpSync(dbPath, backupPath);

  console.log(`Backup made at ${backupPath}\nBeginning migration...`);

  // Create keyring using passphrase
  const { cid } = await createKeyring(instance, { passphrase, wordlist });
  await loadKeyring(instance, { cid, passphrase, wordlist });

  // Update each entry in the index
  for (const [id, { cid }] of Object.entries(index)) {
    /** @type {import('./cli.mjs').Entry['props'][]} */
    const stack = [];

    let prev = cid;

    // Push each generation onto stack (oldest on top)
    do {
      const entry = await decodeWithCodec(
        decrypt((await getContent(prev)).payload, passphrase, () =>
          program.error('Incorrect database passphrase'),
        ),
        'application/json',
      );
      stack.push(entry.props);
      prev = entry.prev;
    } while (prev);

    // Pop throughout the stack to build a new chain
    while (stack.length) {
      prev = await putImmutable(
        new FileBuilder().setPayload(
          await encrypt({ prev, props: stack.pop() }, passphrase, instance),
        ),
        { instance },
      );
    }

    // Update entry's CID in index
    index[id].cid = prev;
  }

  // Save the new index using identity
  await putIdentity({
    id: pkg.name,
    instance,
    ref: await putImmutable(
      new FileBuilder().setPayload(await encrypt(index, passphrase, instance)),
      { instance },
    ),
  });

  console.log('Migration complete.');
}
