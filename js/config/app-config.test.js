const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(__dirname + '/app-config.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(code, context);
if (!context.window.NilSparkLabConfig) throw new Error('Config missing');
if (context.window.NilSparkLabConfig.version !== '11.0') throw new Error('Version mismatch');
if (context.window.NilSparkLabConfig.projectFormat !== '11.0') throw new Error('Project format mismatch');
try { context.window.NilSparkLabConfig.version = 'changed'; } catch (_) {}
if (context.window.NilSparkLabConfig.version !== '11.0') throw new Error('Config is not frozen');
console.log('app-config: PASS');
