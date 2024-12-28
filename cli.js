#!/usr/bin/env node

// prettier-ignore
import { deleteContent, File, getContent, getMutable, putImmutable, putMutable } from '@astrobase/core';
import { clients } from '@astrobase/core/rpc/client';
import sqlite from '@astrobase/core/sqlite';
import { Command } from 'commander';
import paths from 'env-paths';
import { mkdirSync } from 'fs';
import { join } from 'path';

// Ignore the ExperimentalWarning from JSON import
const defaultEmit = process.emit;
process.emit = function (...args) {
  if (args[1].name !== 'ExperimentalWarning') {
    return defaultEmit.call(this, ...args);
  }
};

const { default: pkg } = await import('./package.json', { assert: { type: 'json' } });

const program = new Command(pkg.name)
  .description(pkg.description)
  .version(pkg.version, '-v, --version');

program
  .command('add <unique-id>')
  .description('Add an entry')
  .option('-p, --property <properties...>', 'set properties on the entry', (v, prev) => {
    const separatorIndex = v.indexOf('=');

    // Separator cannot be at start (0), end, or not found (-1)
    if (separatorIndex <= 0 || separatorIndex == v.length - 1) {
      program.error('--property expects a key value pair, e.g. `--property key=value`');
    }

    (prev ??= {})[v.slice(0, separatorIndex)] = v.slice(separatorIndex + 1);

    return prev;
  })
  .option('-s, --secret <secrets...>', 'secret key names to ask for', (v) => {
    if (v.includes('=')) {
      console.warn('WARN: Close the terminal and shred your shell history file ASAP!');
      program.error('--secret cannot accept a value pair on the command line for security reasons');
    }
    return v;
  })
  .action(async (id, { property, secret }) => {
    property ??= {};

    if (secret) {
      for (const key of secret) {
        // TODO: prompt to get secret values
      }
    }

    initAstrobase();

    const index = await getIndex();

    if (index[id]) {
      program.error(`Entry '${id}' already exists`);
    }

    index[id] = await putImmutable(
      await new File().setMediaType('application/json').setValue(property),
    );

    await saveIndex(index);
  });

program
  .command('delete <unique-id>')
  .description('Delete an entry')
  .action(async (id) => {
    initAstrobase();

    const index = await getIndex();

    if (!index[id]) {
      program.error(`Entry '${id}' does not exist`);
    }

    const cid = index[id];

    delete index[id];

    await Promise.all([deleteContent(cid), saveIndex(index)]);
  });

program
  .command('get <unique-id>')
  .description('Retrieve an entry')
  .action(async (id) => {
    initAstrobase();

    const index = await getIndex();

    if (!index[id]) {
      program.error(`Entry '${id}' does not exist`);
    }

    const file = await getContent(index[id]);

    if (!file) {
      return program.error(`Entry '${id}' not found`);
    }

    for (const [k, v] of Object.entries(await file.getValue())) {
      console.log(`${k}: ${v}`);
    }
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

    const index = await getIndex();

    if (!index[oldID]) {
      program.error(`Entry '${oldID}' does not exist`);
    }

    if (index[newID]) {
      program.error(`Entry '${newID}' already exists`);
    }

    index[newID] = index[oldID];

    delete index[oldID];

    await saveIndex(index);
  });

program.parse();

function initAstrobase() {
  const { data } = paths('luna-pass', { suffix: '' });
  mkdirSync(data, { recursive: true });
  clients.add({ strategy: sqlite({ filename: join(data, 'astrobase.sql') }) });
}

async function getIndex() {
  let indexFile = await getMutable('luna-pass');
  return indexFile ? await indexFile.getValue() : {};
}

async function saveIndex(index) {
  await putMutable('luna-pass', await new File().setMediaType('application/json').setValue(index));
}
