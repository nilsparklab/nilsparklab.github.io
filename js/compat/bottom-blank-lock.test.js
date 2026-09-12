const fs=require('fs'),vm=require('vm');
function el(){
  return {
    hiddenAttr:false,
    style:{props:{},setProperty(k,v){this.props[k]=v;}},
    setAttribute(name,val){ if(name==='hidden') this.hiddenAttr=true; }
  };
}
const matches={
  '#nsl-v575-status':[el()],
  '#nsl-v575-toast':[el()],
  '#nsl-v599-security-badge':[],
  '#nsl-v600-security-badge':[],
  '#nsl-v569-audit':[],
  '#nsl-build-audit':[],
  '#nsl-ready-status':[],
  '#nsl-badges-pill':[],
  '#nsl-badges-modal':[],
  '#nsl-badge-toast':[],
  '#nsl-v67-tools':[],
  '#nsl-v67-panel':[],
  '#nsl-v1pro2-intelligence':[],
  '#nsl-v1pro3-simulation':[]
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
const statusEl=matches['#nsl-v575-status'][0];
if(!statusEl.hiddenAttr) throw new Error('Expected matched element to be hidden on init');
if(statusEl.style.props['display']!=='none') throw new Error('Expected display:none to be applied');

if(!observed) throw new Error('Expected a MutationObserver to be attached for ongoing enforcement');
if(!sandbox.window.NilSparkLabBottomBlankLock || sandbox.window.NilSparkLabBottomBlankLock.enabled!==true)
  throw new Error('Expected window.NilSparkLabBottomBlankLock.enabled to be true');

console.log('Stage 13 bottom-blank-lock tests: PASS');
