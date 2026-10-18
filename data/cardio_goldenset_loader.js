window.KARDIO_GOLDENSET_META={sha256:'1b0bd273b8652856209201e72474f40824b3fb987e16fc192863f376efafd7af',content_count:54,source_count:18,compression:'gzip+base64'};
window.KARDIO_LOAD_GOLDENSET=async function(){
  if(!Array.isArray(window.KARDIO_GOLDENSET_CHUNKS)||window.KARDIO_GOLDENSET_CHUNKS.length!==5) throw new Error('Golden Set chunks are incomplete.');
  if(typeof DecompressionStream==='undefined') throw new Error('This browser does not support DecompressionStream(gzip).');
  const b64=window.KARDIO_GOLDENSET_CHUNKS.join('');
  const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const text=await new Response(stream).text();
  const db=JSON.parse(text);
  if(!db?.content||db.content.length!==54||!db?.sources||db.sources.length!==18) throw new Error('Golden Set integrity check failed.');
  return db;
};
