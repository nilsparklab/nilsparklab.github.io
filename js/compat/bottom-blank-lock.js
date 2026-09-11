(function(){
"use strict";
function hideReservedBottomUI(){
  var selectors=[
    "#nsl-v575-status","#nsl-v575-toast","#nsl-v599-security-badge",
    "#nsl-v600-security-badge","#nsl-v569-audit","#nsl-build-audit",
    "#nsl-ready-status","#nsl-badges-pill","#nsl-badges-modal",
    "#nsl-badge-toast","#nsl-v67-tools","#nsl-v67-panel",
    "#nsl-v1pro2-intelligence","#nsl-v1pro3-simulation"
  ];
  selectors.forEach(function(sel){
    document.querySelectorAll(sel).forEach(function(el){
      el.setAttribute("hidden","");
      el.style.setProperty("display","none","important");
      el.style.setProperty("visibility","hidden","important");
      el.style.setProperty("height","0","important");
      el.style.setProperty("width","0","important");
      el.style.setProperty("margin","0","important");
      el.style.setProperty("padding","0","important");
    });
  });
}
if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",hideReservedBottomUI);
else hideReservedBottomUI();
// Perf fix: this observer watches the whole document and re-runs 13
// full-page querySelectorAll calls on every DOM mutation anywhere in
// the app. Coalescing bursts into one call per animation frame keeps
// reserved UI hidden just as quickly while cutting redundant scans.
(function(){
  var scheduled=false;
  var mo=new MutationObserver(function(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(function(){scheduled=false;hideReservedBottomUI();});
  });
  mo.observe(document.documentElement,{childList:true,subtree:true});
})();
window.NilSparkLabBottomBlankLock={version:"9.11",enabled:true};
})();
