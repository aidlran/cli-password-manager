// prettier-ignore
import { decodeWithCodec as legacyDecodeWithCodec, getContent as legacyGetContent } from '@astrobase/core';
import { clients } from '@astrobase/core/rpc/client';
import sqliteLegacy from '@astrobase/core/sqlite';

import wordlist from '@astrobase/sdk/bip39/wordlist/english' with { type: 'json' };
import { ContentIdentifier } from '@astrobase/sdk/cid';
import { encodeWithCodec } from '@astrobase/sdk/codecs';
import { Common } from '@astrobase/sdk/common';
import { getContent } from '@astrobase/sdk/content';
import { FileBuilder } from '@astrobase/sdk/file';
import { getIdentity, getPrivateKey, putIdentity } from '@astrobase/sdk/identity';
import { putImmutable } from '@astrobase/sdk/immutable';
import { createInstance } from '@astrobase/sdk/instance';
import { compareBytes } from '@astrobase/sdk/internal';
import { createKeyring, getAvailableKeyringCIDs, loadKeyring } from '@astrobase/sdk/keyrings';
import { MUTABLE_PREFIX } from '@astrobase/sdk/mutable';
import sqlite from '@astrobase/sdk/sqlite';

import { cpSync } from 'fs';

import pkg from '../package.json' with { type: 'json' };

import { decrypt, encrypt } from './lib/crypt.mjs';
import { getIndex } from './lib/legacy/index-file.mjs';
import { prompt } from './lib/readline.mjs';

export async function migrate(/** @type {string} */ dbPath, /** @type {string} */ passphrase) {
  /** @type {import('@astrobase/sdk/sqlite').SQLiteClientConfig} */
  const sqliteOptions = { filename: dbPath, fileMustExist: true };

  const legacySqliteClient = { strategy: sqliteLegacy(sqliteOptions) };

  clients.add(legacySqliteClient);

  const instance = createInstance(Common, { clients: [{ strategy: sqlite(sqliteOptions) }] });

  // If keyring exists then migration has happened
  if (!(await getAvailableKeyringCIDs(instance)).length) {
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

    const privateKey = getPrivateKey({
      instance,
      publicKey: new Uint8Array(
        (
          await putIdentity({
            id: pkg.name,
            instance,
            ref: new ContentIdentifier(MUTABLE_PREFIX, pkg.name),
          })
        ).value,
      ),
    });

    // Update each entry in the index
    for (const [id, { cid }] of Object.entries(index)) {
      /** @type {import('./cli.mjs').Entry['props'][]} */
      const stack = [];

      let prev = cid;

      // Push each generation onto stack (oldest on top)
      do {
        const entry = await legacyDecodeWithCodec(
          decrypt((await legacyGetContent(prev)).payload, passphrase, () =>
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
            await encrypt({ prev, props: stack.pop() }, privateKey, instance),
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
        new FileBuilder().setPayload(await encrypt(index, privateKey, instance)),
        { instance },
      ),
    });

    console.log('Migration complete.\nRunning tests...');

    const { identity } = await getIdentity({ id: pkg.name, instance });

    const afterIndex = decrypt(
      (await getContent(identity.ref, instance)).payload,
      privateKey,
      () => {
        console.error('Incorrect database passphrase');
        process.exit(1);
      },
      instance,
    );

    const beforeIndex = await encodeWithCodec(instance, index, 'application/json');

    const indexMatch = compareBytes(beforeIndex, afterIndex);

    console.log('Index:', indexMatch ? 'pass' : 'fail');

    indexMatch || process.exit(1);
  }

  clients.delete(legacySqliteClient);
}

migrate('test/test-2.db', prompt('Enter database passphrase'));
