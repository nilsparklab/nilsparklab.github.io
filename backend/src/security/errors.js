export class AppError extends Error {
  constructor(status, code, message = code) {
    super(message); this.status=status; this.code=code;
  }
}
export function toErrorResponse(err){
  if(err instanceof AppError) return {status:err.status, body:{ok:false,error:err.code}};
  if(err?.message==='BODY_TOO_LARGE') return {status:413,body:{ok:false,error:'BODY_TOO_LARGE'}};
  if(err?.message==='INVALID_JSON') return {status:400,body:{ok:false,error:'INVALID_JSON'}};
  return {status:500,body:{ok:false,error:'INTERNAL_ERROR'}};
}

export function gatewaySafeError(status = 500) {
  if (status >= 500) return { status, body: { ok: false, error: 'GATEWAY_INTERNAL_ERROR', message: 'The gateway could not complete the request.' } };
  return { status, body: { ok: false, error: 'REQUEST_ERROR', message: 'The request could not be completed.' } };
}
