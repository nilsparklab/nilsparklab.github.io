const fs=require('fs'),vm=require('vm');
const logs=[];
const sandbox={window:{},console:{info:(m)=>logs.push(m)}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/runtime-integrity.js','utf8'),sandbox);
const x=sandbox.window.ElectroLabIntegrity;
if(!x || x.version!=='5.88' || x.duplicateIds!==0 || x.criticalHandlersChecked!==true || x.audioSafe!==true || x.status!=='PASS') throw new Error('Integrity diagnostics contract mismatch');
if(logs[0]!=='[ElectroLab 5.87] Runtime integrity PASS') throw new Error('Integrity diagnostic log mismatch');
console.log('Stage 11 runtime-integrity tests: PASS');
