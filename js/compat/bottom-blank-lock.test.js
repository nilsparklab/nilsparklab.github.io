const fs=require('fs'),vm=require('vm');
function el(){
  return {
    hiddenAttr:false,
    style:{props:{},setProperty(k,v){this.props[k]=v;}},
    setAttribute(name,val){ if(name==='hidden') this.hiddenAttr=true; }
  };
}
const matches={
  '#elab-v575-status':[el()],
  '#elab-v575-toast':[el()],
  '#elab-v599-security-badge':[],
  '#elab-v600-security-badge':[],
  '#elab-v569-audit':[],
  '#elab-build-audit':[],
  '#elab-ready-status':[],
  '#elab-badges-pill':[],
  '#elab-badges-modal':[],
  '#elab-badge-toast':[],
  '#elab-v67-tools':[],
  '#elab-v67-panel':[],
  '#elab-v1pro2-intelligence':[],
  '#elab-v1pro3-simulation':[]
};
const listeners={};
let observed=null;
const document={
  readyState:'complete',
  documentElement:{},
  addEventListener:(n,fn)=>{listeners[n]=fn;},
  querySelectorAll:(sel)=>matches[sel]||[]
};
function MutationObserver(cb){ this.observe=(target,opts)=>{ observed={target,opts,cb}; }; }
const sandbox={document,window:{},MutationObserver,console};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/bottom-blank-lock.js','utf8'),sandbox);

// Ran immediately since readyState==='complete'
const statusEl=matches['#elab-v575-status'][0];
if(!statusEl.hiddenAttr) throw new Error('Expected matched element to be hidden on init');
if(statusEl.style.props['display']!=='none') throw new Error('Expected display:none to be applied');

if(!observed) throw new Error('Expected a MutationObserver to be attached for ongoing enforcement');
if(!sandbox.window.ElectroLabBottomBlankLock || sandbox.window.ElectroLabBottomBlankLock.enabled!==true)
  throw new Error('Expected window.ElectroLabBottomBlankLock.enabled to be true');

console.log('Stage 13 bottom-blank-lock tests: PASS');
