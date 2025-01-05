"use strict";

var _fs = _interopRequireDefault(require("fs"));
var _json = _interopRequireDefault(require("json5"));
var _path = _interopRequireDefault(require("path"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
//import ts from "typescript"
const configPath = process.argv[2];
console.log(configPath);
const rootConfig = _json.default.parse(_fs.default.readFileSync(configPath, "utf-8").toString());
const configs = [rootConfig];
let currentConfig = rootConfig;
let relativeRoot = _path.default.dirname(_path.default.resolve(configPath));
while (currentConfig) {
  if (currentConfig.extends) {
    let extendsPath = _path.default.resolve(relativeRoot, currentConfig.extends);
    if (!_fs.default.existsSync(extendsPath)) {
      extendsPath = _path.default.resolve(relativeRoot, "node_modules", currentConfig.extends);
    }
    const c = _json.default.parse(_fs.default.readFileSync(extendsPath, "utf-8").toString());
    configs.push(c);
    currentConfig = c;
    relativeRoot = _path.default.dirname(_path.default.resolve(extendsPath));
  } else {
    currentConfig = undefined;
  }
}
const config = [...configs].reverse().reduce((prev, cur) => {
  const {
    compilerOptions,
    ...rest
  } = cur;
  Object.assign(prev, rest);
  Object.assign(prev.compilerOptions, compilerOptions);
  return prev;
}, {
  compilerOptions: {}
});
if (config.compilerOptions.tsPlusConfig) {
  _fs.default.cpSync(config.compilerOptions.tsPlusConfig, "./tsplus.config.json");
  Object.assign(config.compilerOptions, {
    tsPlusConfig: "./tsplus.config.json",
    noEmit: true
  });
}
Object.assign(config, {
  extends: undefined,
  references: []
});
console.log(config);
_fs.default.writeFileSync(configPath, JSON.stringify(config, null, 2));
//# sourceMappingURL=mergeTsConfig.cjs.map