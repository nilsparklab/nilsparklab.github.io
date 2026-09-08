(function(){
"use strict";
function cleanup(){
  document.querySelectorAll("body>*").forEach(function(el){
    if(el.tagName==="SCRIPT"||el.tagName==="STYLE"||el.tagName==="LINK") return;
    var t=(el.textContent||"").trim();
    if(t.indexOf("w.document.close();")>=0 || t.indexOf("w.print();")>=0 ||
       t.indexOf("try { w.focus();")>=0 || t.indexOf("</body></html>")>=0){ el.remove(); }
  });
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",cleanup);
else cleanup();
})();
