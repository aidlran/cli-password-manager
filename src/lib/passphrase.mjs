import { prompt } from './readline.mjs';

/** @type {string} */
let passphase;

export const getPassphrase = (prefix = 'Enter') =>
  (passphase ??= prompt(`${prefix} database passphrase`));

export const hasPassphrase = () => !!passphase;
