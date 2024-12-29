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

// Ignore the ExperimentalWarning from JSON import
const defaultEmit = process.emit;
process.emit = function (...args) {
  if (args[1].name !== 'ExperimentalWarning') {
    return defaultEmit.call(this, ...args);
  }
};

const { default: pkg } = await import('./package.json', { assert: { type: 'json' } });

let index;
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

    (prev ??= {})[v.slice(0, separatorIndex)] = v.slice(separatorIndex + 1);

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
    readSecrets((property ??= {}), secret);

    initAstrobase();

    await assertEntryNotExists(id);

    await saveEntry(id, property);
  });

program
  .command('delete <unique-id>')
  .description('Delete an entry')
  .action(async (id) => {
    initAstrobase();

    await assertEntryExists(id);

    const cid = index[id];

    delete index[id];

    await Promise.all([deleteContent(cid), saveIndex()]);
  });

program
  .command('get <unique-id>')
  .description('Retrieve an entry')
  .action(async (id) => {
    initAstrobase();
    Object.entries(await getEntry(id)).forEach(([k, v]) => console.log(`${k}: ${v}`));
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
    await assertEntryNotExists(newID);

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
  .action(async (id, { property, secret }) => {
    initAstrobase();

    const entry = await getEntry(id);

    Object.assign(entry, property);

    readSecrets(entry, secret);

    const oldCID = index[id];

    await Promise.all([deleteContent(oldCID), saveEntry(id, entry)]);
  });

function initAstrobase() {
  const { data } = paths(pkg.name, { suffix: '' });
  mkdirSync(data, { recursive: true });
  clients.add({ strategy: sqlite({ filename: join(data, 'astrobase.sql') }) });
}

async function getIndex() {
  if (!index) {
    let indexFile = await getMutable(pkg.name);
    index = indexFile ? await decrypt(indexFile) : {};
  }
  return index;
}

async function saveIndex() {
  await putMutable(pkg.name, await encrypt(await getIndex()));
}

async function assertEntryExists(id) {
  const index = await getIndex();

  if (!index[id]) {
    program.error(`Entry '${id}' does not exist`);
  }
}

async function assertEntryNotExists(id) {
  const index = await getIndex();

  if (index[id]) {
    program.error(`Entry '${id}' already exists`);
  }
}

async function getEntry(id) {
  await assertEntryExists(id);

  const file = await getContent(index[id]);

  if (!file) {
    return program.error(`Entry '${id}' not found`);
  }

  return decrypt(file);
}

async function saveEntry(id, entry) {
  index[id] = await putImmutable(await encrypt(entry));
  await saveIndex();
}

/** @param {File} file */
function decrypt(file) {
  if (!passphrase) {
    passphrase = readline.question('Enter passphrase: ', { hideEchoBack: true });
  }

  const buf = file.payload;

  const iv = buf.slice(0, 12);
  const salt = buf.slice(12, 28);
  const bufTagStart = buf.length - 16;
  const key = pbkdf2Sync(passphrase, salt, 10000, 32, 'sha512');
  const payload = buf.slice(28, bufTagStart);

  const decipher = createDecipheriv('chacha20-poly1305', key, iv);
  // @ts-ignore
  decipher.setAuthTag(buf.slice(bufTagStart));

  return decodeWithCodec(
    Buffer.concat([decipher.update(payload), decipher.final()]),
    'application/json',
  );
}

async function encrypt(obj) {
  if (!passphrase) {
    passphrase = readline.question('Choose a passphrase: ', { hideEchoBack: true });
    if (passphrase !== readline.question('Confirm passphrase: ', { hideEchoBack: true })) {
      program.error('Passphrase does not match');
    }
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

function readSecrets(obj, secrets) {
  if (secrets) {
    for (const key of secrets) {
      obj[key] = readline.question(`${key}: `, { hideEchoBack: true });
    }
  }
}

program.parse();
