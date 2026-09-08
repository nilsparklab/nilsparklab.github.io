(function(){
"use strict";
function hideReservedBottomUI(){
  var selectors=[
    "#elab-v575-status","#elab-v575-toast","#elab-v599-security-badge",
    "#elab-v600-security-badge","#elab-v569-audit","#elab-build-audit",
    "#elab-ready-status","#elab-badges-pill","#elab-badges-modal",
    "#elab-badge-toast","#elab-v67-tools","#elab-v67-panel",
    "#elab-v1pro2-intelligence","#elab-v1pro3-simulation"
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
new MutationObserver(hideReservedBottomUI).observe(document.documentElement,{childList:true,subtree:true});
window.ElectroLabBottomBlankLock={version:"9.11",enabled:true};
})();
