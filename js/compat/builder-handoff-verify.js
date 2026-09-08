(function(){
  "use strict";
  window.ElectroLabBuilderHandoffV1026={
    version:"10.26",
    resolve:function(title){
      var n=String(title||"").toLowerCase().replace(/\s+/g," ").trim();
      var m={"half-wave rectifier":"half_wave_rectifier","full-wave bridge rectifier":"bridge_rectifier","center-tap rectifier":"bridge_rectifier","led series circuit":"led_series"};
      return m[n]||null;
    },
    test:function(){return this.resolve("Half-wave rectifier")==="half_wave_rectifier";}
  };
})();
