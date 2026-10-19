(async()=>{
const C=await window.KARDIO_BOOT();
const KEY='kardio.realcontent.v1';
const D={shell:null,view:'home',topic:null,query:'артериальная гипертензия',recent:['gl-ah-2024','fact-ar-echo-2025','rko-heart-days-2025'],saved:['gl-vt-2025'],pinned:['gl-ah-2024','fact-ah-score2-2024'],filters:{content_type:'',trust_layer:'',status:'',year:''},debug:false};
let S=load();
function load(){try{return{...D,...JSON.parse(localStorage.getItem(KEY)||'{}'),filters:{...D.filters,...(JSON.parse(localStorage.getItem(KEY)||'{}').filters||{})}}}catch{return{...D}}}
function save(){localStorage.setItem(KEY,JSON.stringify(S))}
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const src=i=>i?i._source?.name||i.organization||i.source_id||'Источник не указан':'Источник не указан';
const typeLabel=i=>i?.content_type||'Материал';
function toast(t){const x=document.querySelector('#toast');if(!x)return;x.textContent=t;x.classList.add('show');setTimeout(()=>x.classList.remove('show'),1300)}
function shell(v){S.shell=v;S.view='home';save();window.KARDIO_HAS_SHELL=true;draw();document.querySelector('#overlay')?.classList.remove('open');toast('Режим изменён')}
function view(v){S.view=v;save();draw();scrollTo(0,0)}
function openItem(id){S.recent=[id,...S.recent.filter(x=>x!==id)].slice(0,8);S.view='detail:'+id;save();draw();scrollTo(0,0)}
function toggle(k,id){S[k]=S[k].includes(id)?S[k].filter(x=>x!==id):[...S[k],id];save();draw();toast(S[k].includes(id)?'Сохранено':'Удалено')}
function search(){const q=document.querySelector('[data-query]');S.query=q?q.value.trim():S.query;S.view='results';save();draw()}
function chooser(){document.querySelector('#overlay')?.classList.add('open');document.querySelectorAll('.option').forEach(x=>x.classList.toggle('active',x.dataset.shell===S.shell));window.KARDIO_ONBOARDING?.openShell?.()}

function statusBadges(i){return `<div class="feed-card__status"><span class="badge ${i.trust_layer==='official'?'official':''}">${esc(i._trustLabel)}</span>${i._dateLabel?`<span class="badge">${esc(i._dateLabel)}</span>`:''}<span class="badge ${i._status.kind}">${esc(i._status.label)}</span></div>`}
function sourceLink(i){return i.source_url?`<a class="source-link" href="${esc(i.source_url)}" target="_blank" rel="noopener">Открыть источник ↗</a>`:''}
function practice(i){return i.clinical_task?`<div class="feed-card__practice"><b>Для практики:</b> ${esc(i.clinical_task)}</div>`:''}
function metaLine(i){return `<div class="feed-card__meta"><span class="feed-card__type">${esc(typeLabel(i))}</span><span>·</span><span class="feed-card__source">${esc(src(i))}</span>${i._dateLabel?`<span>·</span><span>${esc(i._dateLabel)}</span>`:''}</div>`}
function card(i,{featured=false}={}){
  if(!i)return'';
  const newer=i.superseded_by_id?C.byId(i.superseded_by_id):null;
  const cls=['feed-card','feed-card--'+esc(i._typeClass||'other'),i._image?'feed-card--image':'',featured?'feed-card--featured':'',i._status.kind==='superseded'?'feed-card--superseded':''].filter(Boolean).join(' ');
  return `<article class="${cls}">
    <div class="feed-card__body">
      ${metaLine(i)}
      <h3 class="feed-card__title"><a href="#" data-open="${esc(i.golden_id)}">${esc(i.title)}</a></h3>
      ${i.card_summary?`<p class="feed-card__summary">${esc(i.card_summary)}</p>`:''}
      ${practice(i)}
      ${statusBadges(i)}
      ${newer?`<div class="provenance">Есть более новая версия: <a href="#" data-open="${esc(newer.golden_id)}">${esc(newer.title)}</a></div>`:''}
      <div class="debug-id">${esc(i.golden_id)}</div>
      <div class="feed-card__foot">
        <button class="mini ${S.saved.includes(i.golden_id)?'on':''}" data-save="${esc(i.golden_id)}">${S.saved.includes(i.golden_id)?'Сохранено':'Сохранить'}</button>
        <button class="mini ${S.pinned.includes(i.golden_id)?'on':''}" data-pin="${esc(i.golden_id)}">${S.pinned.includes(i.golden_id)?'Закреплено':'Закрепить'}</button>
        ${sourceLink(i)}
      </div>
    </div>
    ${i._image?`<div class="feed-card__media"><img src="${esc(i._image.image_url)}" alt=""></div><div class="image-note">${esc(i._image.image_source_name||'Источник изображения')}${i._image.image_status!=='verified'?' · права/происхождение требуют проверки':''}</div>`:''}
  </article>`
}
const cards=(a,{featuredFirst=false}={})=>`<div class="feed-list">${a.map((i,n)=>card(i,{featured:featuredFirst&&n===0})).join('')}</div>`;
const searchBox=()=>`<div class="search"><input data-query value="${esc(S.query)}" aria-label="Поиск по материалам" placeholder="Тема, источник, рекомендация"><button data-action="search">Найти</button></div>`;

function tabs(){
  const tab=(label,v,activeViews)=>`<button class="feed-tab ${activeViews.includes(S.view)?'active':''}" data-view="${v}">${label}</button>`;
  return `<div class="feed-tabs">${tab('Для вас','home',['home'])}${tab('Почитать','guidelines',['guidelines'])}${tab('Научиться','education',['education'])}${tab('Пообщаться','community',['community'])}</div>`
}
function quickTools(){return `<div class="quick-tools"><button class="quick-tool" data-view="guidelines">Клинические рекомендации</button><button class="quick-tool" data-view="tools">Калькуляторы</button><button class="quick-tool" data-view="drugs">Препараты</button><button class="quick-tool" data-view="route">Маршрутизация / ВМП</button></div>`}

function spotlight(sh){
  const ranked=C.rank(sh);
  const main=ranked[0];if(!main)return'';
  const topic=main.canonical_topic_id||main.topic;
  let related=ranked.filter(i=>i.golden_id!==main.golden_id&&(i.canonical_topic_id||i.topic)===topic).slice(0,3);
  if(related.length<3){for(const i of ranked){if(i.golden_id===main.golden_id||related.some(x=>x.golden_id===i.golden_id))continue;related.push(i);if(related.length===3)break}}
  return `<section class="spotlight">
    <div class="spotlight-meta"><span>${esc(typeLabel(main))}</span><span>·</span><span>${esc(src(main))}</span>${main._dateLabel?`<span>·</span><span>${esc(main._dateLabel)}</span>`:''}</div>
    <h2><a href="#" data-open="${esc(main.golden_id)}">${esc(main.title)}</a></h2>
    ${main.card_summary?`<p class="spotlight-summary">${esc(main.card_summary)}</p>`:''}
    ${main.clinical_task?`<div class="practice"><b>Для практики:</b> ${esc(main.clinical_task)}</div>`:''}
    <div class="spotlight-actions"><button class="mini ${S.saved.includes(main.golden_id)?'on':''}" data-save="${esc(main.golden_id)}">${S.saved.includes(main.golden_id)?'Сохранено':'Сохранить'}</button>${sourceLink(main)}</div>
    <div class="spotlight-grid">${related.map(i=>`<button class="spotlight-mini" data-open="${esc(i.golden_id)}"><div class="micro-meta">${esc(typeLabel(i))} · ${esc(src(i))}</div><b>${esc(i.title)}</b>${i.card_summary?`<p>${esc(i.card_summary)}</p>`:''}</button>`).join('')}</div>
  </section>`
}

function feedHome(sh){
  const ranked=C.rank(sh);
  const after=ranked.slice(1,7);
  return `<div class="feed-shell">
    <div class="feed-titlebar"><h1>Лента</h1><span class="feed-count">${C.stats().evaluation_count} материалов в тестовом срезе</span></div>
    ${tabs()}
    ${searchBox()}
    ${quickTools()}
    ${spotlight(sh)}
    ${cards(after)}
  </div>`
}

function sectionHead(kicker,title,copy=''){return `<div class="section-head"><div class="section-head__copy"><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1>${copy?`<p>${esc(copy)}</p>`:''}</div></div>`}
function filters(){const types=[...new Set(C.evaluation.map(x=>x.content_type))].sort(),years=[...new Set(C.evaluation.map(x=>x._year).filter(Boolean))].sort((a,b)=>b-a),f=S.filters;return `<div class="filters"><select data-filter="content_type"><option value="">Все типы</option>${types.map(v=>`<option ${f.content_type===v?'selected':''}>${esc(v)}</option>`).join('')}</select><select data-filter="trust_layer"><option value="">Все источники</option>${['official','professional','expert'].map(v=>`<option value="${v}" ${f.trust_layer===v?'selected':''}>${v}</option>`).join('')}</select><select data-filter="status"><option value="">Все статусы</option>${['current','review','superseded','archive'].map(v=>`<option value="${v}" ${f.status===v?'selected':''}>${v}</option>`).join('')}</select><select data-filter="year"><option value="">Все годы</option>${years.map(v=>`<option value="${v}" ${String(f.year)===String(v)?'selected':''}>${v}</option>`).join('')}</select></div>`}
function results(sh){let a=C.search(S.query,C.evaluation,sh);a=C.filter(a,{content_type:S.filters.content_type,trust_layer:S.filters.trust_layer,status:S.filters.status,year:S.filters.year});return `<div class="content">${sectionHead('Поиск',S.query||'Все материалы','Результаты сохраняют источник, актуальность и provenance.')}${searchBox()}${filters()}${a.length?cards(a,{featuredFirst:true}):'<div class="empty"><b>Ничего не найдено</b><br>Измените запрос или фильтры.</div>'}</div>`}
function guidelines(sh){const a=C.rank(sh,C.evaluation.filter(x=>['Клинические рекомендации','Клиническая карточка'].includes(x.content_type)));return `<div class="content">${sectionHead('Почитать','Клинические рекомендации','Актуальность и наличие более новой версии показываются прямо в карточке.')}${cards(a,{featuredFirst:true})}</div>`}
function education(sh){const a=C.rank(sh,C.evaluation.filter(i=>i.prototype_surface==='Обучение'||i.content_type==='Видеолекция'));return `<div class="content">${sectionHead('Научиться','Обучение','Только source-grounded материалы из Golden Set.')}${a.length?cards(a,{featuredFirst:true}):'<div class="empty">В evaluation slice нет подходящих объектов.</div>'}</div>`}
function community(sh){const a=C.rank(sh,C.evaluation.filter(i=>['Сообщество','Новости Общества','Эксперт'].includes(i.content_type)||i.trust_layer==='expert'));return `<div class="content">${sectionHead('Пообщаться','Профессиональное сообщество','Экспертные и профессиональные материалы, если они есть в текущем срезе.')}${a.length?cards(a,{featuredFirst:true}):'<div class="empty">В evaluation slice нет подходящих объектов.</div>'}</div>`}
function gap(t){return `<div class="content">${sectionHead('Golden Set gap',t)}<div class="empty"><b>Source-grounded объектов пока нет.</b><br>Мы не заполняем возможность выдуманным медицинским контентом.</div></div>`}
function sources(){return `<div class="content">${sectionHead('Source registry','Источники','Наблюдаемый источник не равен клиническому одобрению; коммерческие источники остаются отдельным слоем.')}<section class="panel source-list">${C.sources.map(s=>`<div class="row"><div><b>${esc(s.name)}</b><small>${esc(s.notes||s.category||'')}</small></div><span>${s.url?`<a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener">Источник ↗</a>`:'URL нет'}</span></div>`).join('')}</section></div>`}
function saved(sh){const a=S.saved.map(C.byId).filter(Boolean);return `<div class="content">${sectionHead('Личное','Сохранённое')}${a.length?cards(C.rank(sh,a),{featuredFirst:true}):'<div class="empty">Пока пусто.</div>'}</div>`}
function detail(id){const i=C.byId(id);if(!i)return'<div class="content"><div class="empty">Объект не найден.</div></div>';const newer=i.superseded_by_id?C.byId(i.superseded_by_id):null;const kv=(k,v)=>v?`<div class="kv"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`:'';return `<div class="content"><article class="detail"><button class="ghost" data-view="home">← Назад</button>${sectionHead(src(i),i.title)}${i._image?`<div class="detail-media"><img src="${esc(i._image.image_url)}" alt=""></div><div class="image-note">${esc(i._image.image_usage_note||'')}</div>`:''}${i.card_summary?`<p class="feed-card__summary" style="font-size:16px">${esc(i.card_summary)}</p>`:''}${practice(i)}${statusBadges(i)}${newer?`<div class="provenance"><b>Есть более новая версия.</b> <a href="#" data-open="${esc(newer.golden_id)}">${esc(newer.title)}</a></div>`:''}<dl class="panel" style="margin-top:18px">${kv('Тип',i.content_type)}${kv('Формат',i.format)}${kv('Тема',i.topic)}${kv('Автор / эксперт',i.author_expert)}${kv('Организация',i.organization)}${kv('Дата',i.publication_date||i.publication_year)}${kv('Provenance',i.provenance_type)}${kv('Trust layer',i.trust_layer)}${kv('Freshness',i.freshness_status)}${kv('Editorial status',i.editorial_status)}${kv('Rights status',i.rights_status)}</dl><div class="feed-card__foot">${sourceLink(i)}</div></article></div>`}

function core(sh){if(S.view.startsWith('detail:'))return detail(S.view.split(':')[1]);if(S.view==='results')return results(sh);if(S.view==='guidelines')return guidelines(sh);if(S.view==='education')return education(sh);if(S.view==='community'||S.view==='news')return community(sh);if(S.view==='sources')return sources();if(S.view==='saved')return saved(sh);if(S.view==='tools')return gap('Калькуляторы');if(S.view==='drugs')return gap('Препараты / справочник');if(S.view==='route')return gap('Маршрутизация / ВМП');return null}

function A(){return core('search_first')||feedHome('search_first')}
function navButton(label,v){return `<button class="${S.view===v?'active':''}" data-view="${v}">${label}</button>`}
function B(){
  const body=core('toolbelt')||feedHome('toolbelt');
  const top=C.rank('toolbelt')[0];
  const nav=`<aside class="rail">${navButton('Для вас','home')}${navButton('КР','guidelines')}${navButton('Обучение','education')}${navButton('Сообщество','community')}${navButton('Источники','sources')}<div class="space"></div>${navButton('Сохранённое','saved')}</aside>`;
  const side=top?`<aside class="side"><div class="eyebrow">Источник и статус</div><h3>${esc(top.title)}</h3><p class="muted">${esc(src(top))}</p>${statusBadges(top)}<div class="provenance">${esc(top.provenance_type||'Provenance не указан')}</div>${sourceLink(top)}</aside>`:'';
  return `<div class="toolbelt">${nav}<main class="tool-main">${body}</main>${side}</div><nav class="bottom"><button data-view="home">Для вас</button><button data-view="guidelines">КР</button><button data-view="education">Учиться</button><button data-view="saved">Saved</button></nav>`
}
const labels={ventricular_arrhythmias:'Желудочковые аритмии',pulmonary_hypertension:'Лёгочная гипертензия',aortic_regurgitation:'Аортальная недостаточность',atrial_fibrillation:'Фибрилляция предсердий',arterial_hypertension:'Артериальная гипертензия',metabolic_syndrome:'Метаболический синдром',stemi:'ИМ с подъёмом ST',congress:'Конгресс',education_event:'Образовательные события',rko_membership:'Членство РКО'};
const tl=t=>labels[t]||String(t||'Другое').replaceAll('_',' ');
function Cshell(){
  if(S.view.startsWith('detail:'))return detail(S.view.split(':')[1]);
  const groups=[...C.groupsForWorkspace().entries()].sort((a,b)=>b[1].length-a[1].length);
  let body;
  if(S.view==='topic'){
    const a=C.evaluation.filter(x=>(x.canonical_topic_id||x.topic)===S.topic);
    body=`${sectionHead('Тема',tl(S.topic))}${cards(C.rank('workspace',a),{featuredFirst:true})}`;
  }else body=core('workspace');
  if(!body)body=`${sectionHead('Рабочее пространство','Темы и источники')}<div class="collections">${groups.slice(0,8).map(([t,a])=>`<button class="tile" data-topic="${esc(t)}"><div class="eyebrow">${a.length} материалов</div><b>${esc(tl(t))}</b><small>${esc(a.slice(0,2).map(x=>x.content_type).join(' · '))}</small></button>`).join('')}</div><div style="margin-top:18px">${cards(C.rank('workspace').slice(0,5),{featuredFirst:true})}</div>`;
  return `<div class="workspace"><aside class="leftnav"><div class="eyebrow" style="margin:0 10px 8px">Рабочие области</div>${navButton('Обзор','home')}${navButton('Мои КР','guidelines')}${groups.slice(0,8).map(([t])=>`<button data-topic="${esc(t)}">${esc(tl(t))}</button>`).join('')}${navButton('Источники','sources')}${navButton('Сохранённое','saved')}</aside><main class="workspace-main">${body}</main><aside class="side"><div class="eyebrow">Контентный слой</div><p class="muted">Изображение показывается только при точном semantic match.</p><div class="provenance">Evaluation slice: ${C.stats().evaluation_count}<br>Real matched image: ${C.stats().with_real_image}<br>Image-free: ${C.stats().image_free}</div></aside></div><nav class="bottom"><button data-view="home">Обзор</button><button data-view="guidelines">КР</button><button data-view="sources">Источники</button><button data-view="saved">Saved</button></nav>`
}

function draw(){
  window.KARDIO_HAS_SHELL=Boolean(S.shell);
  document.body.classList.toggle('debug',S.debug);
  const d=document.querySelector('#debugToggle');if(d)d.className=S.debug?'solid':'ghost';
  const n=document.querySelector('#shellName');if(n)n.textContent={search_first:'Search-first Navigator',toolbelt:'Professional Toolbelt',workspace:'Knowledge Workspace'}[S.shell]||'—';
  const root=document.querySelector('#root');if(root)root.innerHTML=S.shell==='toolbelt'?B():S.shell==='workspace'?Cshell():A();
  if(!S.shell)chooser();
}

document.addEventListener('click',e=>{let x;if(x=e.target.closest('[data-shell]'))return shell(x.dataset.shell);if(x=e.target.closest('[data-view]')){e.preventDefault();return view(x.dataset.view)}if(x=e.target.closest('[data-open]')){e.preventDefault();return openItem(x.dataset.open)}if(x=e.target.closest('[data-save]')){e.preventDefault();return toggle('saved',x.dataset.save)}if(x=e.target.closest('[data-pin]')){e.preventDefault();return toggle('pinned',x.dataset.pin)}if(x=e.target.closest('[data-topic]')){e.preventDefault();S.topic=x.dataset.topic;return view('topic')}if(x=e.target.closest('[data-action="search"]'))return search()});
document.addEventListener('change',e=>{const x=e.target.closest('[data-filter]');if(!x)return;S.filters={...S.filters,[x.dataset.filter]:x.value};save();draw()});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-query]'))search()});
document.querySelector('#chooseShell').onclick=chooser;
document.querySelector('#debugToggle').onclick=()=>{S.debug=!S.debug;save();draw()};
document.querySelector('#overlay').onclick=e=>{if(e.target.id==='overlay'&&S.shell)e.currentTarget.classList.remove('open')};
draw();
})();
