#!/bin/bash
cd /home/patroza/pj/effect-app/libs
./node_modules/.bin/tsc -p packages/infra/tsconfig.src.json --noEmit 2>&1 | grep -E "(internal\.ts|Operations\.ts|SQLQueue\.ts|memQueue\.ts|sbqueue\.ts)" | head -100
