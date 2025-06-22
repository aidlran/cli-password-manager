import { decodeWithCodec } from '@astrobase/sdk/codecs';
import { getContent } from '@astrobase/sdk/content';
import { FileBuilder } from '@astrobase/sdk/file';
import { getIdentity, getNextIdentity, getPrivateKey, putIdentity } from '@astrobase/sdk/identity';
import { putImmutable } from '@astrobase/sdk/immutable';
import pkg from '../../package.json' with { type: 'json' };
import { decrypt, encrypt } from './crypt.mjs';

/**
 * @typedef IndexValue
 * @property {string} added
 * @property {import('@astrobase/sdk/cid').ContentIdentifier} cid
 */

/** @typedef {Record<string, IndexValue>} Index */

/**
 * @typedef Entry
 * @property {import('@astrobase/sdk/cid').ContentIdentifier} [prev]
 * @property {Record<string, string>} props
 */

/** @type {Uint8Array} */
let publicKey;

/**
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @returns {Promise<Uint8Array>}
 */
async function getPubKey(instance) {
  if (!publicKey) {
    /** @type {import('@astrobase/sdk/cid').ContentIdentifier} */
    let cid;

    try {
      ({ cid } = await getIdentity({ id: pkg.name, instance }));
    } catch (e) {
      if (e instanceof Error && e.message === 'Identity not found') {
        ({ cid } = await getNextIdentity(instance));
      } else {
        throw e;
      }
    }

    publicKey = new Uint8Array(cid.value);
  }

  return publicKey;
}

/**
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @returns {Promise<Uint8Array>}
 */
const getPrivKey = async (instance) =>
  getPrivateKey({ instance, publicKey: await getPubKey(instance) });

/**
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @param {import('@astrobase/sdk/cid').ContentIdentifierLike} cid
 * @returns {Promise<Index | Entry | null>}
 */
export async function get(instance, cid) {
  /** @type {FileBuilder<Index | Entry>} */
  const content = await getContent(cid, instance);
  // @ts-ignore
  return content
    ? decodeWithCodec(
        instance,
        decrypt(content.payload, await getPrivKey(instance)),
        'application/json',
      )
    : null;
}

/** @type {Index} */
let index;

/**
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @returns {Promise<Index>}
 */
export const getIndex = async (instance) =>
  // @ts-ignore
  (index ??= await get(instance, (await getIdentity({ id: pkg.name, instance })).identity.ref));

/**
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @param {string} id
 * @returns {Promise<Entry | null>}
 */
export async function getEntry(instance, id) {
  const cid = (await getIndex(instance))[id]?.cid;
  // @ts-ignore
  return cid ? await get(instance, cid) : null;
}

/**
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @param {string} id
 * @returns {Promise<Entry['props'] & { added: string }>}
 */
export async function getEntryProps(instance, id) {
  const entry = await getEntry(instance, id);

  return entry
    ? {
        ...entry.props,
        added: (await getIndex(instance))[id]?.added,
      }
    : undefined;
}

/**
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @param {object} value
 * @returns {Promise<import('@astrobase/sdk/cid').ContentIdentifier>}
 */
export const put = async (instance, value) =>
  putImmutable(
    new FileBuilder().setPayload(await encrypt(value, await getPrivKey(instance), instance)),
    { instance },
  );

/**
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @param {Index} [newIndex]
 */
export const saveIndex = async (instance, newIndex) =>
  putIdentity({
    id: pkg.name,
    instance,
    ref: await put(instance, (index = newIndex ?? (await getIndex(instance)))),
  });

/**
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @param {string} id
 * @param {Entry['props']} props
 */
export async function saveEntry(instance, id, props) {
  const now = new Date().toISOString();
  props.updated ??= now;
  const added = props.added ?? index[id]?.added ?? now;
  delete props.added;
  index[id] = {
    added,
    cid: await put(instance, { prev: (await getEntry(instance, id))?.prev, props }),
  };
  await saveIndex(instance);
}

/**
 * Renames an entry in the index.
 *
 * Only the index is changed. Entry files remain unchanged.
 *
 * No entry existence assertions are made so be careful of potential overwrites.
 *
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @param {string} oldID
 * @param {string} newID
 */
export async function renameEntry(instance, oldID, newID) {
  const index = await getIndex(instance);
  index[newID] = index[oldID];
  delete index[oldID];
  await saveIndex(instance);
}
