#!/usr/bin/env node

import { getIdentity, putIdentity } from '@astrobase/sdk/identity';
import { spawnSync } from 'child_process';
import { Command } from 'commander';
import { randomUUID } from 'crypto';
import paths from 'env-paths';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import pkg from '../package.json' with { type: 'json' };
// prettier-ignore
import { deleteEntry, get, getEntryProps, getIndex, put, renameEntry, saveEntry } from './lib/content.mjs';
import { init } from './lib/init.mjs';
import { prompt } from './lib/readline.mjs';

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
    const instance = await initInstance();
    await assertEntryExists(instance, id, false);
    await saveEntry(instance, id, property);
  });

program
  .command('delete <unique-id>')
  .description('Delete an entry')
  .action(async (id) => {
    const instance = await initInstance();
    await assertEntryExists(instance, id);
    await deleteEntry(instance, id);
  });

program
  .command('get <unique-id>')
  .description('Retrieve an entry')
  .action(async (id) =>
    Object.entries(await getAssertedEntryProps(await initInstance(), id))
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([k, v]) => console.log(`${k.charAt(0).toUpperCase()}${k.slice(1)}:`, v)),
  );

program
  .command('list [search]')
  .description('List entries')
  .action(async (search) => {
    const keys = Object.keys(await getIndex(await initInstance()));
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
    const instance = await initInstance();

    await assertEntryExists(instance, oldID);
    await assertEntryExists(instance, newID, false);

    await renameEntry(instance, oldID, newID);
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
    const instance = await initInstance();

    const props = await getAssertedEntryProps(instance, id);

    if (keysToDelete) {
      for (const key of keysToDelete) {
        delete props[key];
      }
    }

    promptSecrets(props, secret);

    (property ??= {}).updated ??= new Date().toISOString();

    Object.assign(props, property);

    await saveEntry(instance, id, props);
  });

program
  .command('note')
  .description('Edit the note')
  .action(async () => {
    const instance = await initInstance();

    const id = `${pkg.name}-note`;

    /** @type {Uint8Array} */
    let note;

    try {
      // @ts-ignore
      note = await get(
        instance,
        (await getIdentity({ id, instance })).identity.ref,
        'application/octet-stream',
      );
    } catch (e) {
      if (e instanceof RangeError && e.message.includes('Identity not found')) {
        note = new Uint8Array();
      } else {
        console.error(e);
        process.exit(1);
      }
    }

    const tempFilePath = join(tmpdir(), randomUUID());

    writeFileSync(tempFilePath, note, { mode: 0o600 });

    const editResult = spawnSync(process.env.EDITOR || 'vim', [tempFilePath], { stdio: 'inherit' });

    if (editResult.error) {
      console.error(editResult.error);
      process.exit(1);
    }

    const newNote = readFileSync(tempFilePath);

    if (newNote.compare(note) == 0) {
      console.log('No change');
    } else {
      await putIdentity({
        id,
        instance,
        ref: await put(instance, newNote, 'application/octet-stream'),
      });
      console.log('Note saved');
    }

    function shredFallback() {
      console.warn('Shred failed; using fallback');
      const overwriteBuffer = Buffer.alloc(newNote.length, 0);
      writeFileSync(tempFilePath, overwriteBuffer);
      unlinkSync(tempFilePath);
    }

    try {
      const shred = spawnSync('shred', ['--remove', '--zero', '--iterations=3', tempFilePath]);
      if (shred.status != 0) {
        shredFallback();
      }
    } catch {
      shredFallback();
    }
  });

const initInstance = () => init(program.getOptionValue('db'));

/**
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @param {string} id
 * @param {boolean} [bool] `true` = it must exist. `false` = it must not exist.
 */
async function assertEntryExists(instance, id, bool = true) {
  if (!(await getIndex(instance))[id] == bool) {
    program.error(`Entry '${id}' ${bool ? 'does not exist' : 'already exists'}`);
  }
}

/**
 * @param {import('@astrobase/sdk/instance').Instance} instance
 * @param {string} id
 * @returns {Promise<import('./lib/content.mjs').Entry['props']>}
 */
async function getAssertedEntryProps(instance, id) {
  await assertEntryExists(instance, id);
  return (await getEntryProps(instance, id)) ?? program.error(`Entry '${id}' not found`);
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
