#!/usr/bin/env node

import { Command } from 'commander';

// Ignore the ExperimentalWarning from JSON import
const defaultEmit = process.emit;
process.emit = function (...args) {
  if (args[1].name !== 'ExperimentalWarning') {
    defaultEmit.call(this, ...args);
  }
};

const { default: pkg } = await import('./package.json', { assert: { type: 'json' } });

const program = new Command(pkg.name)
  .description('Astrobase based password management CLI utility')
  .version(pkg.version, '-v, --version');

program
  .command('add <unique-id>')
  .description('Add an entry to the password manager')
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
  .action((id, { property, secret }) => {
    console.log({ id, property, secret });
    // TODO: prompt to get secret values
    // TODO: save the entry
  });

program.parse();
