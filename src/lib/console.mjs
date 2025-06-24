const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';

/** @param {string} message */
export const warn = (message) => console.error(`${YELLOW}WARN: ${message}${RESET}`);
