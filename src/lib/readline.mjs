import { question } from 'readline-sync';

export const prompt = (/** @type {string} */ prompt) =>
  question(`${prompt}: `, { hideEchoBack: true });
