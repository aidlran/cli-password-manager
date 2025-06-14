#!/usr/bin/env node

// prettier-ignore
import { deleteContent, File, getContent, getMutable, putImmutable, putMutable } from '@astrobase/core';
import { clients } from '@astrobase/core/rpc/client';
import sqlite from '@astrobase/core/sqlite';

import { Command } from 'commander';
import paths from 'env-paths';
import { existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import pkg from '../package.json' with { type: 'json' };
import { decrypt, encrypt, prompt } from './lib.js';

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

/** @type {Index} */
let index;
/** @type {string} */
let passphrase;

const { data: dataDir } = paths(pkg.name, { suffix: '' });
mkdirSync(dataDir, { recursive: true });

const oldDbFilePath = join(dataDir, 'astrobase.sql');
const defaultDbFilePath = join(dataDir, 'luna-pass.db');

if (!existsSync(defaultDbFilePath) && existsSync(oldDbFilePath)) {
  renameSync(oldDbFilePath, defaultDbFilePath);
}

const program = new Command(pkg.name)
  .description(pkg.description)
  .version(pkg.version, '-v, --version')
  .option('--db <db-file>', 'path to db file', defaultDbFilePath);

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
      cid = (await programDecrypt(file)).prev;
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
  .command('list [search]')
  .description('List entries')
  .action(async (search) => {
    initAstrobase();
    const keys = Object.keys(await getIndex());
    if (search) {
      search = search.trim().toLowerCase();
    }
    (search ? keys.filter((string) => string.toLowerCase().includes(search)) : keys)
      .sort((a, b) => a.localeCompare(b))
      .forEach((k) => console.log(k));
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

function initAstrobase() {
  const { data } = paths(pkg.name, { suffix: '' });
  mkdirSync(data, { recursive: true });
  clients.add({ strategy: sqlite({ filename: program.getOptionValue('db') }) });
}

async function getIndex() {
  if (!index) {
    let indexFile = await getMutable(pkg.name);
    // @ts-ignore
    index = indexFile ? await programDecrypt(indexFile) : {};
  }
  return index;
}

async function saveIndex() {
  await putMutable(pkg.name, await programEncrypt(await getIndex()));
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
  return (await programDecrypt(file)).props;
}

/**
 * @param {string} id
 * @param {Entry} entry
 */
async function saveEntry(id, entry) {
  entry.props.updated ??= now;
  const added = entry.props.added ?? index[id]?.added ?? now;
  delete entry.props.added;
  index[id] = { added, cid: await putImmutable(await programEncrypt(entry)) };
  await saveIndex();
}

async function programDecrypt(/** @type {import('@astrobase/core').File} */ file) {
  try {
    return await decrypt(file.payload, (passphrase ??= prompt('Enter database passphrase')));
  } catch (e) {
    if (e.message === 'Unsupported state or unable to authenticate data') {
      program.error('Incorrect database passphrase');
    }
    throw e;
  }
}

async function programEncrypt(/** @type {object} */ obj) {
  if (
    !passphrase &&
    (passphrase = prompt('Choose a database passphrase')) !== prompt('Confirm database passphrase')
  ) {
    program.error('Database passphrase did not match');
  }

  return new File().setPayload(await encrypt(obj, passphrase));
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
