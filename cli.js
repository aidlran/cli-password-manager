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

new Command(pkg.name).version(pkg.version).parse();
