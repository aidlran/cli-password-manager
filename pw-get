#!/bin/sh

if [ "$#" -eq 0 ]; then
  echo "No argument given."
  exit 1
elif [ "$#" -gt 1 ]; then
  echo "Additional arguments after '$1' ignored."
fi

gpg -d ~/.pwmanager/pw.gpg | grep -i "$1"
