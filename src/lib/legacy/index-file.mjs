import { decodeWithCodec, getMutable } from '@astrobase/core';
import pkg from '../../../package.json' with { type: 'json' };
import { decrypt } from '../crypt.mjs';

/**
 * @typedef IndexValue
 * @property {string} added
 * @property {import('@astrobase/core').ContentIdentifier} cid
 */

/** @typedef {Record<string, IndexValue>} Index */

/** @type {Index} */
let index;

/**
 * @param {string} passphrase
 * @param {() => unknown} onIncorrectPassphrase
 * @returns {Promise<Index>}
 */
export async function getIndex(
  /** @type {string} */ passphrase,
  /** @type {() => unknown} */ onIncorrectPassphrase,
) {
  if (!index) {
    const indexFile = await getMutable(pkg.name);
    // @ts-ignore
    index = indexFile
      ? await decodeWithCodec(
          decrypt(indexFile.payload, passphrase, onIncorrectPassphrase),
          'application/json',
        )
      : {};
  }
  return index;
}
