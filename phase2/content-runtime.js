window.KARDIO_BOOT=async function(){
  'use strict';
  const db=await window.KARDIO_LOAD_GOLDENSET();
  const ids=(window.KARDIO_EVALUATION_SLICE&&window.KARDIO_EVALUATION_SLICE.golden_ids)||[];
  const images=(window.KARDIO_IMAGE_ENRICHMENT&&window.KARDIO_IMAGE_ENRICHMENT.mappings)||{};
  const sourceById=new Map(db.sources.map(s=>[s.source_id,s]));
  const P={P0:30,P1:20,P2:10},T={official:18,professional:12,expert:10},F={current:20,current_in_export:12,needs_date_check:8,needs_version_check:6,needs_currentness_check:4,legacy:0,archive:-6,superseded:-18};
  const text=v=>(v==null?'':String(v)).trim();
  const fold=v=>text(v).toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function source(item){return sourceById.get(item.source_id)||null}
  function status(item){
    if(item.freshness_status==='superseded'||(item.is_current==='no'&&item.superseded_by_id))return{kind:'superseded',label:'Есть более новая версия'};
    if(item.is_current==='yes'&&item.freshness_status==='current')return{kind:'current',label:'Актуально'};
    if(item.is_current==='review'||/^needs_/.test(text(item.freshness_status)))return{kind:'review',label:'Требует проверки'};
    if(['archive','legacy'].includes(item.freshness_status))return{kind:'archive',label:'Архив'};
    return{kind:'neutral',label:text(item.freshness_status)||'Статус не указан'};
  }
  function typeClass(item){if(item.content_type==='Клинические рекомендации')return'guideline';if(item.content_type==='Клиническая карточка')return'clinical-card';if(item.content_type==='Видеолекция')return'video';if(/Новости журнала/.test(text(item.content_type)))return'journal';return'other'}
  function normalize(item){const s=source(item);const y=Number(item.publication_year||(text(item.publication_date).match(/\d{4}/)||[])[0]);return{...item,_source:s,_status:status(item),_typeClass:typeClass(item),_year:Number.isFinite(y)?y:null,_dateLabel:item.publication_date||(Number.isFinite(y)?String(y):''),_trustLabel:{official:'Официальное',professional:'Профессиональное',expert:'Экспертное'}[item.trust_layer]||text(item.trust_layer),_image:images[item.golden_id]||null,_searchText:fold([item.title,item.card_summary,item.topic,item.canonical_topic_id,item.content_type,item.format,item.author_expert,item.organization,item.category,item.subcategory,item.clinical_task,item.tags,s&&s.name,s&&s.category,s&&s.subcategory].filter(Boolean).join(' '))}}
  const all=db.content.map(normalize),byId=new Map(all.map(x=>[x.golden_id,x])),evaluation=ids.map(id=>byId.get(id)).filter(Boolean);
  function searchScore(item,q){q=fold(q);if(!q)return 0;const toks=q.split(/\s+/).filter(t=>t.length>1),title=fold(item.title),sum=fold(item.card_summary),topic=fold([item.topic,item.canonical_topic_id].join(' '));let sc=title.includes(q)?80:sum.includes(q)?35:0;for(const t of toks){if(title.includes(t))sc+=18;if(sum.includes(t))sc+=6;if(topic.includes(t))sc+=10;if(item._searchText.includes(t))sc+=3}return sc}
  function base(item){return(P[item.prototype_priority]||0)+(T[item.trust_layer]||0)+(F[item.freshness_status]||0)+(item.editorial_status==='verified_from_upload'?5:0)+(item.source_url?3:0)}
  function shellScore(shell,item,q){let s=base(item)+searchScore(item,q);if(shell==='search_first'){if(item._typeClass==='guideline')s+=12;if(item._typeClass==='clinical-card')s+=10}else if(shell==='toolbelt'){if(item._typeClass==='clinical-card')s+=15;if(item._typeClass==='guideline')s+=12;if(item.prototype_surface==='Обучение')s+=4}else{if(item.canonical_topic_id||item.topic)s+=8;if(item._typeClass==='guideline')s+=7;if(item._typeClass==='video')s+=5}return s}
  function rank(shell,items=evaluation,q=''){return[...items].sort((a,b)=>shellScore(shell,b,q)-shellScore(shell,a,q)||(b._year||0)-(a._year||0)||a.title.localeCompare(b.title,'ru'))}
  function search(q,items=evaluation,shell='search_first'){const f=fold(q);return f?rank(shell,items.filter(x=>searchScore(x,f)>0),f):rank(shell,items)}
  function filter(items=evaluation,f={}){return items.filter(x=>(!f.content_type||x.content_type===f.content_type)&&(!f.source_id||x.source_id===f.source_id)&&(!f.year||x._year===Number(f.year))&&(!f.trust_layer||x.trust_layer===f.trust_layer)&&(!f.status||x._status.kind===f.status)&&(!f.category||x.category===f.category)&&(!f.subcategory||x.subcategory===f.subcategory))}
  function group(items,key){const m=new Map();for(const x of items){const k=typeof key==='function'?key(x):x[key];if(!m.has(k||'Другое'))m.set(k||'Другое',[]);m.get(k||'Другое').push(x)}return m}
  const api={meta:db.meta,all,evaluation,sources:db.sources,byId:id=>byId.get(id)||null,rank,search,filter,group,groupsForWorkspace:()=>group(rank('workspace'),x=>x.canonical_topic_id||x.topic),stats:()=>({total_loaded:all.length,evaluation_count:evaluation.length,with_real_image:evaluation.filter(x=>x._image).length,image_free:evaluation.filter(x=>!x._image).length,needs_review:evaluation.filter(x=>x._status.kind==='review').length,superseded:evaluation.filter(x=>x._status.kind==='superseded').length,source_links:evaluation.filter(x=>x.source_url).length})};
  window.KARDIO_CONTENT=api;return api;
};
