# Changelog

## [2.1.0](https://github.com/aidlran/cli-password-manager/releases/tag/v2.1.0) - 2025-07-17

- Added `note` subcommand.

## [2.0.0-rc.8](https://github.com/aidlran/cli-password-manager/releases/tag/v2.0.0-rc.7) - 2025-06-25

- Added missing peer dependencies.

## [2.0.0-rc.7](https://github.com/aidlran/cli-password-manager/releases/tag/v2.0.0-rc.7) - 2025-06-24

- Added `--db` option.
- Changed get command to list properties alphabetically.
- Renamed default database file path. File will be automatically renamed when a command is run.
- Migrated to use Astrobase keyring & identity. Database will be migrated when a command is run.

## [2.0.0-rc.6](https://github.com/aidlran/cli-password-manager/releases/tag/v2.0.0-rc.6) - 2025-04-13

- Added optional case insensitive search to list command.
- Changed list command to print entries in alphabetical order.
- Fixed deprecation warning for assert import.
