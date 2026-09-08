export async function readJson(req,maxBytes=32*1024){
  let size=0, chunks=[];
  for await (const chunk of req){ size+=chunk.length; if(size>maxBytes) throw new Error('BODY_TOO_LARGE'); chunks.push(chunk); }
  if(!chunks.length) return {};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('INVALID_JSON');}
}
