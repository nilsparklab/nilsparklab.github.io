export function json(res,status,body,headers={}){
  res.writeHead(status,{ 'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers });
  res.end(JSON.stringify(body));
}
export function requestId(){ return crypto.randomUUID(); }
