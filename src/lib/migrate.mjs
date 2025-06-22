import { ContentIdentifier as LegacyContentIdentifier } from '@astrobase/core';
import { clients } from '@astrobase/core/rpc/client';
import sqliteLegacy from '@astrobase/core/sqlite';
import { getAvailableKeyringCIDs } from '@astrobase/sdk/keyrings';
import { cpSync } from 'fs';
import { get, getIndex, put, saveIndex } from './content.mjs';
import { createKeyring } from './keyring.mjs';
import { legacyGetEntry, legacyGetIndex } from './legacy.mjs';

/**
 * Migrates database to new format.
 *
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @param {import('@astrobase/sdk/sqlite').SQLiteClientConfig} sqliteOptions
 */
export async function migrate(instance, sqliteOptions) {
  const legacySqliteClient = { strategy: sqliteLegacy(sqliteOptions) };

  clients.add(legacySqliteClient);

  const cleanup = () => clients.delete(legacySqliteClient);

  // If keyring exists then migration has happened
  if ((await getAvailableKeyringCIDs(instance)).length) {
    return cleanup();
  }

  // Get original index with old API - if decrypt fails, we have the wrong passphrase
  const index = await legacyGetIndex();
  const indexEntries = Object.entries(index);

  if (!indexEntries.length) {
    return cleanup();
  }

  // Create a deep copy for later
  const originalIndex = indexEntries.reduce((index, [id, { added, cid }]) => {
    index[id] = { added, cid: new LegacyContentIdentifier(cid) };
    return index;
  }, {});

  // Create backup
  const { filename } = sqliteOptions;
  const backupPath = `${filename}.bak`;
  // @ts-ignore
  cpSync(filename, backupPath);
  console.log(`Backup made at ${backupPath}\nBeginning migration...`);

  // Create keyring using passphrase
  await createKeyring(instance);

  // Update each entry in the index
  for (const [id, { cid }] of Object.entries(index)) {
    /** @type {import('./content.mjs').Entry['props'][]} */
    const stack = [];

    let prev = cid;

    // Push each generation onto stack (oldest on top)
    do {
      const entry = await legacyGetEntry(prev);
      stack.push(entry.props);
      ({ prev } = entry);
    } while (prev);

    // Pop throughout the stack to build a new chain
    while (stack.length) {
      // @ts-ignore
      prev = await put(instance, { prev, props: stack.pop() });
    }

    // Update entry's CID in index
    index[id].cid = prev;
  }

  // Save the new index
  // @ts-ignore
  await saveIndex(instance, index);

  console.log('Migration complete.\nRunning tests...');

  const afterIndex = await getIndex(instance);

  let hasError = false;

  function error(message) {
    console.log(message);
    hasError = true;
  }

  for (const [id, { added, cid }] of Object.entries(originalIndex)) {
    if (added !== afterIndex[id]?.added) {
      error(`index[${id}].added does not match`);
    }

    let newPrev = afterIndex[id].cid,
      oldPrev = cid,
      generation = 0;

    do {
      // @ts-ignore
      const newContent = await get(instance, newPrev);
      const oldContent = await legacyGetEntry(oldPrev);

      if (JSON.stringify(newContent.props) !== JSON.stringify(oldContent.props)) {
        error(`${id}{${generation}}.props do not match`);
      }

      if ((newPrev && !oldPrev) || (!newPrev && oldPrev)) {
        error(`${id}{${generation}}.prev exists only on one`);
      }

      // @ts-ignore
      newPrev = newContent.prev;
      oldPrev = oldContent.prev;
      --generation;
    } while (newPrev);
  }

  if (hasError) {
    process.exit(1);
  } else {
    console.log('Tests pass');
  }

  return cleanup();
}
