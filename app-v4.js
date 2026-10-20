const prompt=document.getElementById('prompt');
const answer=document.getElementById('answer');
const answerTitle=document.getElementById('answerTitle');
const answerBody=document.getElementById('answerBody');
const answerAgent=document.getElementById('answerAgent');
const answerTrace=document.getElementById('answerTrace');

const outputs={
 guideline:{agent:'Агент · Изменения рекомендаций',title:'Что изменилось в рекомендациях по ХСН',body:`<p>Сравнил версии рекомендаций и отделил содержательные изменения от редакционных.</p><div class="answer-callout"><b>Коротко:</b> проверьте обновления в последовательности терапии, ведении коморбидностей и маршрутизации. Для каждого пункта сохранён первоисточник.</div><p>Если нужно, могу показать diff по разделам и собрать чек‑лист для практической проверки.</p>`},
 drug:{agent:'Агент · Препараты',title:'Изменения по препаратам после прошлого просмотра',body:`<p>Нашёл 4 события по вашим темам: две новые регистрации, одно прекращение регистрации и одно ограничение безопасности.</p><div class="answer-callout"><b>Важно:</b> регистрационные изменения, safety‑сигналы и новые исследования показаны отдельно — это разные типы основания для решения.</div>`},
 research:{agent:'Агент · Исследовать тему',title:'Evidence brief по SGLT2 и сердечной недостаточности',body:`<p>Собрал рекомендации, исследования и обзоры в одну проверяемую структуру.</p><div class="answer-callout"><b>Ключевой вывод:</b> интерпретацию стоит строить вокруг популяции исследования и применимости к клиническому сценарию, а не только вокруг итогового эффекта.</div>`},
 default:{agent:'Агент · Клинический разбор',title:'Подготовил рабочий ответ',body:`<p>Разбил задачу на проверяемые части, использовал выбранные источники и личный контекст врача.</p><div class="answer-callout"><b>Следующий шаг:</b> могу открыть первоисточники, сравнить рекомендации или сохранить результат в ваши материалы.</div>`}
};
function classify(q){const s=q.toLowerCase();if(/рекоменд|esc|хсн/.test(s))return 'guideline';if(/препарат|антикоаг|регистрац|лекар/.test(s))return 'drug';if(/sglt|исслед|evidence|литератур/.test(s))return 'research';return 'default'}
function run(q){q=(q||prompt.value).trim();if(!q)return;const data=outputs[classify(q)];answerAgent.textContent=data.agent;answerTitle.textContent=data.title;answerBody.innerHTML=data.body;answerTrace.textContent='4 источника · provenance сохранён';answer.classList.remove('hidden');answer.scrollIntoView({behavior:'smooth',block:'nearest'});}
function applyFeedFilter(type){document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x.dataset.filter===type));document.querySelectorAll('.feed-item').forEach(item=>{item.style.display=(type==='all'||item.dataset.type===type||item.dataset.type==='partner')?'grid':'none'});}
document.getElementById('sendBtn').onclick=()=>run();
prompt.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();run()}});
document.querySelectorAll('.ask').forEach(btn=>btn.onclick=()=>{prompt.value=btn.dataset.prompt;window.scrollTo({top:0,behavior:'smooth'});setTimeout(()=>run(btn.dataset.prompt),260)});
document.querySelectorAll('.filter').forEach(btn=>btn.onclick=()=>applyFeedFilter(btn.dataset.filter));
document.querySelectorAll('[data-filter-jump]').forEach(btn=>btn.onclick=()=>{applyFeedFilter(btn.dataset.filterJump);document.getElementById('feedSection').scrollIntoView({behavior:'smooth',block:'start'});});
document.querySelectorAll('.persona').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.persona').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const label=btn.querySelector('strong').textContent;document.getElementById('modeBtn').textContent='✦ '+label;prompt.focus()});
const drawer=document.getElementById('drawer');document.getElementById('materialsBtn').onclick=()=>drawer.classList.add('show');document.getElementById('drawerClose').onclick=()=>drawer.classList.remove('show');drawer.addEventListener('click',e=>{if(e.target===drawer)drawer.classList.remove('show')});
document.getElementById('attachBtn').onclick=()=>drawer.classList.add('show');
