import { health } from './health.js';
import { routes, notConfigured } from '../contracts/api.js';

function methodNotAllowed(allowed){
  return {status:405,body:{ok:false,error:'METHOD_NOT_ALLOWED'},headers:{Allow:allowed.join(', ')}};
}
export function route(req){
  const url=new URL(req.url,'http://localhost');
  const path=url.pathname;
  if(path===routes.health){
    if(req.method==='GET') return {status:200,body:health()};
    return methodNotAllowed(['GET']);
  }
  if(path===routes.status){
    if(req.method==='GET') return {status:200,body:{ok:true,apiConnected:true,providers:{wikimedia:true},message:'Wikimedia web search is configured.'}};
    return methodNotAllowed(['GET']);
  }
  // Reserved public contracts: intentionally disabled until a reviewed backend service is added.
  if([routes.study,routes.books,routes.dictionary,routes.search].includes(path)){
    if(req.method!=='POST') return methodNotAllowed(['POST']);
    return notConfigured;
  }
  return {status:404,body:{ok:false,error:'NOT_FOUND'}};
}
