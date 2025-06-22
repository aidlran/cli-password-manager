import { Common } from '@astrobase/sdk/common';
import { createInstance } from '@astrobase/sdk/instance';
import { activeSeeds, getAvailableKeyringCIDs } from '@astrobase/sdk/keyrings';
import sqlite from '@astrobase/sdk/sqlite';
import { saveIndex } from './content.mjs';
import { createKeyring, loadKeyring } from './keyring.mjs';
import { migrate } from './migrate.mjs';
import { getPassphrase } from './passphrase.mjs';
import { prompt } from './readline.mjs';

/**
 * Initialises Astrobase.
 *
 * @param {string} filename Database file path.
 */
export async function init(filename) {
  /** @type {import('@astrobase/sdk/sqlite').SQLiteClientConfig} */
  const sqliteOptions = { filename };
  const instance = createInstance(Common, { clients: [{ strategy: sqlite(sqliteOptions) }] });
  await migrate(instance, sqliteOptions);

  if (!activeSeeds.has(instance)) {
    let [cid] = await getAvailableKeyringCIDs(instance);

    if (cid) {
      await loadKeyring(instance, cid);
    } else {
      if (getPassphrase('Choose a') === prompt('Confirm database passphrase')) {
        await createKeyring(instance);
        await saveIndex(instance, {});
      } else {
        console.error('Passphrases do not match');
        process.exit(1);
      }
    }
  }

  return instance;
}
