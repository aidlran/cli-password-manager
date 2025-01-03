#!/usr/bin/env node

// prettier-ignore
import { decodeWithCodec, deleteContent, encodeWithCodec, File, getContent, getMutable, putImmutable, putMutable } from '@astrobase/core';
import { clients } from '@astrobase/core/rpc/client';
import sqlite from '@astrobase/core/sqlite';
import { Command } from 'commander';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto';
import paths from 'env-paths';
import { mkdirSync } from 'fs';
import { join } from 'path';
import readline from 'readline-sync';

/** @typedef {Record<string, IndexValue>} Index */

/**
 * @typedef IndexValue
 * @property {string} added
 * @property {import('@astrobase/core').ContentIdentifier} cid
 */

/**
 * @typedef Entry
 * @property {import('@astrobase/core').ContentIdentifier} [prev]
 * @property {Record<string, string>} props
 */

// Ignore the ExperimentalWarning from JSON import
const defaultEmit = process.emit;
process.emit = function (...args) {
  if (args[1].name !== 'ExperimentalWarning') {
    return defaultEmit.call(this, ...args);
  }
};

const { default: pkg } = await import('./package.json', {
  assert: { type: 'json' },
});

/** @type {Index} */
let index;
/** @type {string} */
let passphrase;

const program = new Command(pkg.name)
  .description(pkg.description)
  .version(pkg.version, '-v, --version');

const propertyOption = [
  '-p, --property <properties...>',
  'set properties on the entry',
  (v, prev) => {
    const separatorIndex = v.indexOf('=');

    // Separator cannot be at start (0), end, or not found (-1)
    if (separatorIndex <= 0 || separatorIndex == v.length - 1) {
      program.error('--property expects a key value pair, e.g. `--property key=value`');
    }

    const key = v.slice(0, separatorIndex);
    const value = v.slice(separatorIndex + 1);

    if ((key === 'added' || key === 'updated') && isNaN(Date.parse(value))) {
      program.error(`Property '${key}' must use date format`);
    }

    (prev ??= {})[key] = value;

    return prev;
  },
];

const secretOption = [
  '-s, --secret <secrets...>',
  'secret property key names to ask for',
  (v, prev) => {
    if (v.includes('=')) {
      console.warn('WARN: Secrets may have been leaked via command line input');
      program.error('--secret cannot accept a value on the command line for security reasons');
    }
    if (v === 'added' || v === 'updated') {
      program.error(`Cannot use --secret for property '${v}'. Use --property instead.`);
    }
    (prev ??= []).push(v);
    return prev;
  },
];

program
  .command('add <unique-id>')
  .description('Add an entry')
  // @ts-ignore
  .option(...propertyOption)
  // @ts-ignore
  .option(...secretOption)
  .action(async (id, { property, secret }) => {
    promptSecrets((property ??= {}), secret);

    initAstrobase();

    await assertEntryExists(id, false);

    await saveEntry(id, { props: property });
  });

program
  .command('delete <unique-id>')
  .description('Delete an entry')
  .action(async (id) => {
    initAstrobase();

    await assertEntryExists(id);

    let cid = index[id].cid;
    delete index[id];

    const promises = [saveIndex()];

    while (cid) {
      const file = await getContent(cid);

      if (!file) {
        break;
      }

      promises.push(deleteContent(cid));

      // @ts-ignore
      cid = (await decrypt(file)).prev;
    }

    await Promise.all(promises);
  });

program
  .command('get <unique-id>')
  .description('Retrieve an entry')
  .action(async (id) => {
    initAstrobase();
    Object.entries(await getEntryProps(id)).forEach(([k, v]) =>
      console.log(`${k.charAt(0).toUpperCase()}${k.slice(1)}:`, v),
    );
    console.log('Added:', index[id].added);
  });

program
  .command('list')
  .description('List entries')
  .action(async () => {
    initAstrobase();
    Object.keys(await getIndex()).forEach((k) => console.log(k));
  });

program
  .command('rename <unique-id> <new-unique-id>')
  .description('Assign a new ID to an entry')
  .action(async (oldID, newID) => {
    initAstrobase();

    await assertEntryExists(oldID);
    await assertEntryExists(newID, false);

    index[newID] = index[oldID];
    delete index[oldID];

    await saveIndex();
  });

program
  .command('update <unique-id>')
  .description('Update an existing entry')
  // @ts-ignore
  .option(...propertyOption)
  // @ts-ignore
  .option(...secretOption)
  .option('-d, --delete <keys-to-delete...>', 'specify keys to delete')
  .action(async (id, { delete: keysToDelete, property, secret }) => {
    initAstrobase();

    const props = await getEntryProps(id);

    if (keysToDelete) {
      for (const key of keysToDelete) {
        delete props[key];
      }
    }

    promptSecrets(props, secret);

    (property ??= {}).updated ??= now;

    Object.assign(props, property);

    await saveEntry(id, { prev: index[id]?.cid, props });
  });

const now = new Date().toISOString();

const prompt = (prompt) => readline.question(`${prompt}: `, { hideEchoBack: true });

function initAstrobase() {
  const { data } = paths(pkg.name, { suffix: '' });
  mkdirSync(data, { recursive: true });
  clients.add({ strategy: sqlite({ filename: join(data, 'astrobase.sql') }) });
}

async function getIndex() {
  if (!index) {
    let indexFile = await getMutable(pkg.name);
    // @ts-ignore
    index = indexFile ? await decrypt(indexFile) : {};
  }
  return index;
}

async function saveIndex() {
  await putMutable(pkg.name, await encrypt(await getIndex()));
}

/** @param {string} id */
async function assertEntryExists(id, bool = true) {
  if (!(await getIndex())[id] == bool) {
    program.error(`Entry '${id}' ${bool ? 'does not exist' : 'already exists'}`);
  }
}

/**
 * @param {string} id
 * @returns {Promise<Entry['props']>}
 */
async function getEntryProps(id) {
  await assertEntryExists(id);

  const file = await getContent(index[id].cid);

  if (!file) {
    return program.error(`Entry '${id}' not found`);
  }

  // @ts-ignore
  return (await decrypt(file)).props;
}

/**
 * @param {string} id
 * @param {Entry} entry
 */
async function saveEntry(id, entry) {
  entry.props.updated ??= now;
  const added = entry.props.added ?? index[id]?.added ?? now;
  delete entry.props.added;
  index[id] = { added, cid: await putImmutable(await encrypt(entry)) };
  await saveIndex();
}

/** @param {File} file */
function decrypt(file) {
  const buf = file.payload;

  const iv = buf.slice(0, 12);
  const salt = buf.slice(12, 28);
  const bufTagStart = buf.length - 16;
  const key = pbkdf2Sync(
    (passphrase ??= prompt('Enter database passphrase')),
    salt,
    10000,
    32,
    'sha512',
  );
  const payload = buf.slice(28, bufTagStart);

  const decipher = createDecipheriv('chacha20-poly1305', key, iv);
  // @ts-ignore
  decipher.setAuthTag(buf.slice(bufTagStart));

  try {
    var decoded = Buffer.concat([decipher.update(payload), decipher.final()]);
  } catch (e) {
    if (e.message === 'Unsupported state or unable to authenticate data') {
      program.error('Incorrect database passphrase');
    }
    throw e;
  }

  return decodeWithCodec(decoded, 'application/json');
}

/** @param {object} obj */
async function encrypt(obj) {
  if (
    !passphrase &&
    (passphrase = prompt('Choose a database passphrase')) !== prompt('Confirm database passphrase')
  ) {
    program.error('Database passphrase did not match');
  }

  const iv = randomBytes(12);
  const salt = randomBytes(16);
  const key = pbkdf2Sync(passphrase, salt, 10000, 32, 'sha512');
  const payload = await encodeWithCodec(obj, 'application/json');

  const cipher = createCipheriv('chacha20-poly1305', key, iv);

  // @ts-ignore
  // prettier-ignore
  const buf = Buffer.concat([iv, salt, cipher.update(payload), cipher.final(), cipher.getAuthTag()]);

  return new File().setPayload(buf);
}

/**
 * @param {object} obj
 * @param {string[]} [secrets]
 */
function promptSecrets(obj, secrets) {
  if (secrets) {
    for (const key of secrets) {
      obj[key] = prompt(`Enter value for '${key}'`);
    }
  }
}

program.parse();
