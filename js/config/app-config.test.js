const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(__dirname + '/app-config.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(code, context);
if (!context.window.ElectroLabConfig) throw new Error('Config missing');
if (context.window.ElectroLabConfig.version !== '11.0') throw new Error('Version mismatch');
if (context.window.ElectroLabConfig.projectFormat !== '11.0') throw new Error('Project format mismatch');
try { context.window.ElectroLabConfig.version = 'changed'; } catch (_) {}
if (context.window.ElectroLabConfig.version !== '11.0') throw new Error('Config is not frozen');
console.log('app-config: PASS');
