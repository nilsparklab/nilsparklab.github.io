(function(){
    "use strict";
    if(window.ElectroLabDialog) return;
    function openDialog(opts){
      opts=opts||{};
      if(document.querySelector('.elab-dialog-backdrop')) return Promise.resolve(false);
      var previous=document.activeElement;
      var backdrop=document.createElement('div');
      backdrop.className='elab-dialog-backdrop';
      backdrop.setAttribute('role',opts.alertdialog?'alertdialog':'dialog');
      backdrop.setAttribute('aria-modal','true');
      var card=document.createElement('div'); card.className='elab-dialog-card';
      var title=document.createElement('h2'); title.className='elab-dialog-title'; title.id='elab-dialog-title'; title.textContent=opts.title||'Confirm action';
      var msg=document.createElement('p'); msg.className='elab-dialog-message'; msg.id='elab-dialog-message'; msg.textContent=opts.message||'';
      backdrop.setAttribute('aria-labelledby',title.id); backdrop.setAttribute('aria-describedby',msg.id);
      card.append(title,msg);
      var input=null;
      if(opts.input){ input=document.createElement('input'); input.className='elab-dialog-input'; input.type='text'; input.value=opts.value||''; input.placeholder=opts.placeholder||''; input.setAttribute('aria-label',opts.inputLabel||'Input'); card.append(input); }
      var actions=document.createElement('div'); actions.className='elab-dialog-actions';
      var cancel=document.createElement('button'); cancel.type='button'; cancel.textContent=opts.cancelText||'CANCEL';
      var primary=document.createElement('button'); primary.type='button'; primary.textContent=opts.okText||'OK'; primary.className=opts.danger?'danger':'primary';
      actions.append(cancel,primary); card.append(actions); backdrop.append(card);
      document.body.appendChild(backdrop);
      var done=false;
      function close(result){ if(done)return; done=true; document.removeEventListener('keydown',onKey,true); backdrop.remove(); try{if(previous&&previous.focus)previous.focus();}catch(_){} resolve(result); }
      function onKey(e){
        if(e.key==='Escape'){e.preventDefault();close(opts.input?null:false);return;}
        if(e.key==='Enter' && document.activeElement!==cancel){e.preventDefault();close(opts.input?(input?input.value:''):true);return;}
        if(e.key!=='Tab')return;
        var focusables=[cancel,primary]; if(input)focusables.unshift(input);
        var first=focusables[0], last=focusables[focusables.length-1];
        if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
      }
      var resolve; var promise=new Promise(function(r){resolve=r;});
      cancel.addEventListener('click',function(){close(opts.input?null:false);});
      primary.addEventListener('click',function(){close(opts.input?(input?input.value:''):true);});
      backdrop.addEventListener('click',function(e){if(e.target===backdrop && opts.closeOnBackdrop)close(opts.input?null:false);});
      document.addEventListener('keydown',onKey,true);
      setTimeout(function(){try{(opts.input?input:cancel).focus();if(input)input.select();}catch(_){}},0);
      return promise;
    }
    window.ElectroLabDialog=Object.freeze({
      confirm:function(message,opts){opts=Object.assign({},opts,{message:message,okText:(opts&&opts.okText)||'REMOVE'});return openDialog(opts);},
      alert:function(message,opts){opts=Object.assign({},opts,{message:message,okText:'OK'});return openDialog(opts).then(function(){return true;});},
      prompt:function(message,value,opts){opts=Object.assign({},opts,{message:message,value:value||'',input:true,okText:(opts&&opts.okText)||'OK'});return openDialog(opts);}
    });
  })();
