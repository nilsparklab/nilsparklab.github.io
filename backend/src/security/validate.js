import { AppError } from './errors.js';
export function assertMethod(req, allowed){ if(!allowed.includes(req.method)) throw new AppError(405,'METHOD_NOT_ALLOWED'); }
export function assertQueryString(value,{max=120,pattern=/^[\p{L}\p{N}\s.,+\-()/%]*$/u}={}){
  if(typeof value!=='string'||value.length===0||value.length>max||!pattern.test(value)) throw new AppError(400,'INVALID_INPUT');
  return value.trim();
}
