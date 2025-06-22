import { decodeWithCodec, getContent, getMutable } from '@astrobase/core';
import pkg from '../../package.json' with { type: 'json' };
import { decrypt } from './crypt.mjs';
import { getPassphrase } from './passphrase.mjs';

/**
 * @template T
 * @template Q
 * @param {import('@astrobase/core').File<T> | void} file
 * @param {Q} notFoundValue
 * @returns {Promise<T | Q>}
 */
const get = async (file, notFoundValue) =>
  // @ts-ignore
  file
    ? await decodeWithCodec(decrypt(file.payload, getPassphrase()), 'application/json')
    : notFoundValue;

/**
 * Get immutable item for legacy version.
 *
 * @param {import('@astrobase/core').ContentIdentifierLike} cid
 * @returns {Promise<
 *   | (Omit<import('./content.mjs').Entry, 'prev'> & {
 *       prev?: import('@astrobase/core').ContentIdentifier;
 *     })
 *   | null
 * >}
 */
export const legacyGetEntry = async (cid) => get(await getContent(cid), null);

/**
 * Get index for legacy version.
 *
 * @returns {Promise<
 *   Record<
 *     string,
 *     Omit<import('./content.mjs').Index[string], 'cid'> & {
 *       cid: import('@astrobase/core').ContentIdentifier;
 *     }
 *   >
 * >}
 */
export const legacyGetIndex = async () => get(await getMutable(pkg.name), {});
