import wordlist from '@astrobase/sdk/bip39/wordlist/english';
import { createKeyring as create, loadKeyring as load } from '@astrobase/sdk/keyrings';
import { getPassphrase } from './passphrase.mjs';

/**
 * Creates a new keyring and loads it.
 *
 * @param {import('@astrobase/sdk/instance').Instance} instance
 */
export async function createKeyring(instance) {
  const { cid } = await create(instance, { passphrase: getPassphrase(), wordlist });
  await loadKeyring(instance, cid);
}

/**
 * Loads an existing keyring.
 *
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @param {import('@astrobase/sdk/cid').ContentIdentifierLike} cid
 */
export async function loadKeyring(instance, cid) {
  await load(instance, { cid, passphrase: getPassphrase(), wordlist });
}
