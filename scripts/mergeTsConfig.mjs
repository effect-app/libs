"use strict";

import _fs from "fs" 
import _json from "json5";
import _path from "path"
//import ts from "typescript"

const configPath = process.argv[2];
const rootPath = _path.resolve(configPath);

function loadConfigRecursive(configPath) {
  const config = _json.parse(_fs.readFileSync(configPath, "utf-8").toString());
  const baseDir = _path.dirname(configPath);
  const configs = [];

  const extendEntries = Array.isArray(config.extends)
    ? config.extends
    : config.extends ? [config.extends] : [];

  for (const ext of extendEntries) {
    let extendsPath = _path.resolve(baseDir, ext);
    if (!_fs.existsSync(extendsPath)) {
      extendsPath = _path.resolve(baseDir, "node_modules", ext);
    }
    configs.push(...loadConfigRecursive(extendsPath));
  }

  configs.push(config);
  return configs;
}

const allConfigs = loadConfigRecursive(rootPath);

const config = allConfigs.reduce((prev, cur) => {
  const { compilerOptions, ...rest } = cur;
  Object.assign(prev, rest);
  Object.assign(prev.compilerOptions, compilerOptions);
  return prev;
}, { compilerOptions: {} });

Object.assign(config, {
  extends: undefined,
  references: []
});

_fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
