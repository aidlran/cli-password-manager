# CLI Password Manager

A simple password storage and retrieval system using things that are probably aleady available on your Unix based system - Bash scripting and GnuPG.

> **Warning**
> This isn't the most user friendly solution and we're dealing with sensitive information here. To avoid making costly mistakes, I would recommend this only if you are already familiar with using shell utilities.
>
> Also, don't use it in a purely command line environment or you'll face issues when GnuPG wants to prompt you for a password.

## Set Up

> **Note**
> Make sure you have GnuPG (`gpg`) installed.

1. Download the scripts to a local folder.
   You could clone this repo and `cd` into it, or use a utility like `cURL`:

   ```sh
   curl https://raw.githubusercontent.com/aidlran/cli-password-manager/main/bash/pw-get > pw-get
   curl https://raw.githubusercontent.com/aidlran/cli-password-manager/main/bash/pw-mod > pw-mod
   ```

2. Add the executable flag to the scripts:

   ```sh
   chmod +x pw-get pw-mod
   ```

3. Add the directory to the `PATH` in your `~/.bashrc`:

   ```sh
   echo '# CLI Password Manager' >> ~/.bashrc
   echo '# https://github.com/aidlran/cli-password-manager' >> ~/.bashrc
   echo "CLI_PASSWORD_MANAGER_DIR=$(readlink -f .)" >> ~/.bashrc
   echo 'export PATH=$PATH:$CLI_PASSWORD_MANAGER_DIR/' >> ~/.bashrc
   ```

> **Note**
> Open a new terminal to enable the changes.

## Uninstall

Just delete the scripts and remove the above section from your `~/.bashrc` file.

Your data is stored in `~/.pwmanager/`. Make sure you've backed it up before you delete it!

## Usage

### Editing the Password File

Use the `pw-mod` command. You will be prompted for a password at encrypt/decrypt time, unless you've entered it recently and GnuPG has cached it.

```sh
pw-mod
```

> **Note**
> It should open in your default editor.
>
> You can change your default editor by adding/editing `export EDITOR=vim` in your `~/.bashrc` file. Replace `vim` with whichever terminal based editor you want to use. Other programs, like Git, also use the `EDITOR` variable.
>
> Another option is to specify the editor in the command, e.g. `EDITOR=vim pw-mod`.

Add each account to a new line in the file. I recommend adding data like what service it is, the email you used, a username if applicable, password, and the date it was last updated. I personally write mine in CSV format and sort lines alphabetically

```csv
service,email,username,password,last updated
GitHub,you@example.com,octocat,hunter2,2022-12-16
```

As of now, it's really up to you how you format it. Just make sure each account is on its own line and that you make it consistent.

Once you are done editing, simply save and close the editor.

Old versions of the file are backed up in `~/.pwmanager/backup/`.

### Retrieving Data

To search for an account and retrieve its data, use the `pw-get` command with a search term argument. You should surround it in quotes if you are using spaces.

Again, you will be prompted for a password at decrypt time, unless you've entered it recently and GnuPG has cached it.

```sh
pw-get "github"
```

It will print lines that contain the term or phrase you specified.

### Arguments

`pw-mod` has arguments you can use:

- `--no-backup`: Prevents a backup being created for this edit.
- `--cipher <cipher>`: GPG cipher algorithm to use. Default is `aes256` for better security (GnuPG default is `aes128`). Run `gpg --version` to list supported algorithms.
- `--gpg-args <args_string>`: Custom args to supply to GPG. **Please use with care.** Default is `-c`, which is used to symmetrically encrypt. See [Using Your GPG Identity](#using-your-gpg-identity) if you wish to use a key instead.

## Configuration

There's no configuration file for these scripts, but you can add arguments to the aliases in your `~/.bashrc`. See [my own dotfiles repo](https://github.com/aidlran/dotfiles/search?q=pw-get+pw-mod) for example.

### GnuPG Configuration

If, like me, you are bothered by GnuPG caching things and temporarily remembering your passwords, or if you want it to remember for longer, you can edit the GPG config files.

- To prevent caching of symmetric passwords, append `no-symkey-cache` to `~/.gnupg/gpg.conf`.

  ```sh
  echo "no-symkey-cache" >> ~/.gnupg/gpg.conf
  ```

- To change the allowed cache time to live, edit `~/.gnupg/gpg-agent.conf` to add or change the following options:

  ```conf
  # Cache TTL in seconds
  # (1 hour since last usage, up to 5 hours max)
  default-cache-ttl 3600
  max-cache-ttl 18000
  ```

  > **Note**
  > Restart the GPG Agent to apply the config.

### Using Your GPG Identity

By default, the system will use symmetric encryption which needs no configuration, however it is recommended to set up a GPG identity and use it to sign and encrypt your password file instead.

1. Generate your keys with `gpg --full-generate-key`. I recommend the [GitHub docs on this](https://docs.github.com/en/authentication/managing-commit-signature-verification/generating-a-new-gpg-key) for more info.

2. Add a `pw-mod` alias in your `~/.bashrc` to include the `--gpg-args` argument, like so:

   ```bash
   alias pw-mod='pw-mod --gpg-args "-ser you@example.com"'
   ```

   - `-s`: Signs the file with the key.
   - `-e`: Encrypts the file with the key.
   - `-r <id>`: Uses the desired identity. You can pass the email or name.

   This will make it so that `pw-mod` will always use your key for encryption.
