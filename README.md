# Luna Pass CLI

A secure password and secrets management CLI utility using [Astrobase](https://github.com/AstrobaseTech/Astrobase).

This version supercedes my original simple CLI utility that used bash and GPG which is still available in the [bash](https://github.com/aidlran/cli-password-manager/tree/bash) branch.

## Installation

I have not yet packaged it up. Run these commands to give it a try (requires Git, Node.js, and NPM):

```sh
git clone https://github.com/aidlran/cli-password-manager
cd cli-password-manager
git submodule update --init
npm ci
node cli.js help
```

> [!NOTE]
> Application data is encrypted and stored in your user application data directory. On Linux, this is `~/.local/share/luna-pass`.
