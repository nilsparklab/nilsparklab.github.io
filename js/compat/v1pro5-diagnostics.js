
(() => {
"use strict";
window.NilSparkLabV1PRO5Diagnostics = Object.freeze({
  version:"1 PRO.5",
  check(){
    const ids=["nsl-v1pro5-visuals","nsl-v1pro4-diagrams","nsl-v1pro3-simulation"];
    const missing=ids.filter(id=>!document.getElementById(id));
    return {ok:missing.length===0,missing,visualApi:!!window.NilSparkLabV1PRO5Visuals};
  }
});
})();
