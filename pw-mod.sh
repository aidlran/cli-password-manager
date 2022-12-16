#!/bin/bash

# Directory where stuffs are stored
DIR=~/.pwmanager/

# Create directories if they don't exist
mkdir -p $DIR $DIR/backup/
chmod 700 $DIR $DIR/backup/

PW_FILE=$DIR/pw.gpg
DO_BACKUP=1
GPG_CIPHER="aes256"
GPG_ARGS="-c"

# Create file if it doesn't exist
if [ ! -f $PW_FILE ]; then
  echo > $PW_FILE
  DO_BACKUP=0
fi

BACKUP_FILE=$DIR/backup/$(date -r $PW_FILE '+%Y%m%d%H%M%S').gpg

# Process arguments
while [[ $# -gt 0 ]]; do

  if [[ "$1" == "--no-backup" ]]; then
    DO_BACKUP=0
  fi

  if [[ "$1" == "--cipher" ]]; then
    GPG_CIPHER="$2"
    shift
  fi

  if [[ "$1" == "--gpg-args" ]]; then
    GPG_ARGS="$2"
    shift
  fi

  shift

done

mv $PW_FILE $BACKUP_FILE

# Pipe into and out of EDITOR
editor_pipe() {
  TMPFILE=`mktemp /tmp/pw.XXXXXXXX`
  cat > $TMPFILE
  $EDITOR $TMPFILE < /dev/tty > /dev/tty
  cat $TMPFILE
  rm $TMPFILE
}

# Decrypt, edit in editor, re-encrypt
gpg -do - $BACKUP_FILE \
| editor_pipe \
| gpg --cipher-algo "$GPG_CIPHER" $GPG_ARGS -o $PW_FILE -

chmod 400 $PW_FILE $BACKUP_FILE

# If backups are disabled, delete
# old version when we're done with it
if [ ! $DO_BACKUP ]; then
  rm $BACKUP_FILE
fi
