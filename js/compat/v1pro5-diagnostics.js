
(() => {
"use strict";
window.ElectroLabV1PRO5Diagnostics = Object.freeze({
  version:"1 PRO.5",
  check(){
    const ids=["elab-v1pro5-visuals","elab-v1pro4-diagrams","elab-v1pro3-simulation"];
    const missing=ids.filter(id=>!document.getElementById(id));
    return {ok:missing.length===0,missing,visualApi:!!window.ElectroLabV1PRO5Visuals};
  }
});
})();
