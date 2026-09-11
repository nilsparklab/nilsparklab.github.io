const fs=require('fs'),vm=require('vm');
function el(tag,text){return {tagName:tag,textContent:text,removed:false,remove(){this.removed=true;}}}
const children=[el('DIV','w.document.close();'),el('DIV','w.print();'),el('DIV','try { w.focus(); }'),el('DIV','</body></html>'),el('SCRIPT','w.print();'),el('STYLE','w.print();'),el('LINK','w.print();'),el('DIV','normal content')];
const listeners={};
const document={readyState:'complete',documentElement:{},body:{},addEventListener:(n,fn)=>{listeners[n]=fn;},querySelectorAll:(sel)=>sel==='body>*'?children:[]};
const sandbox={document,window:{},console}; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/bottom-render-guard.js','utf8'),sandbox);
const removed=children.filter(x=>x.removed);
if(removed.length!==4) throw new Error('Expected 4 unsafe render helper nodes to be removed');
if(children.slice(4,7).some(x=>x.removed)) throw new Error('Script/style/link nodes must be preserved');
if(children[7].removed) throw new Error('Normal content must be preserved');
console.log('Stage 10 bottom-render-guard tests: PASS');
