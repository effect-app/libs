#!/bin/bash
# Script to generate package.json exports mappings for TypeScript modules
# This script finds all .ts files in src/ (excluding test files) and generates
# JSON export entries that map source files to their compiled .js and .d.ts outputs
#
# Example output:
# "./utils/helper": { "types": "./dist/utils/helper.d.ts", "default": "./dist/utils/helper.js" },
#
# This allows users to import individual modules instead of the entire package:
# import { helper } from 'package/utils/helper' instead of 'package'

for f in `find src -type f | grep .ts$ | grep -v \\\.test.ts`
do
  # Remove 'src/' prefix (first 4 characters) from file path
  f1=`echo $f | cut -c 5-`
  # Add './' prefix to create relative path
  f=./$f1
  # Convert src path to dist path
  f2="./dist${f#.}"
  # Change .ts extension to .js for compiled output
  f2="${f2%.ts}.js"

  # Generate JSON export mapping entry
  # Format: "module-path": { "types": "path/to/types", "default": "path/to/js" }
  echo "\"${f%.ts}\": { \"types\": \"${f2%.js}.d.ts\", \"default\": \"$f2\" },"
done
