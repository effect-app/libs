#!/bin/bash

for d in `find dist -type d | grep -v dist$`
do
  src_d="src/${d#dist/}"
  if [ ! -d "$src_d" ]; then
    echo "Removing $d"
    rm -rf $d
  fi
done

for f in `find dist -type f | grep \\\.mjs$`
do
  src_f="src/${f#dist/}"
  src_f="${src_f%.mjs}.mts"
  src_f2="${src_f}x"
  raw="${f%.mjs}"
  if [ ! -f "$src_f" ]; then
    if [ ! -f "$src_f2" ]; then
      echo "Removing $raw.mjs"
      rm -f $raw.mjs $raw.mjs.map $raw.d.mts $raw.d.mts.map
    fi
  fi
done


for f in `find dist -type f | grep \\\.js$`
do
  src_f="src/${f#dist/}"
  src_f="${src_f%.js}.ts"
  src_f2="${src_f}x"
  raw="${f%.js}"
  if [ ! -f "$src_f" ]; then
    if [ ! -f "$src_f2" ]; then

      echo "Removing $raw.js"
      rm -f $raw.js $raw.js.map $raw.d.ts $raw.d.ts.map

    fi
  fi
done