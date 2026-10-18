(()=>{
  const overlay=document.querySelector('#overlay');
  const introStage=document.querySelector('#introStage');
  const specialtyStage=document.querySelector('#specialtyStage');
  const safetyStage=document.querySelector('#safetyStage');
  const shellStage=document.querySelector('#shellStage');
  const oncologyStage=document.querySelector('#oncologyStage');
  const specialtyLabel=document.querySelector('#specialtyLabel');
  const specialtyButton=document.querySelector('#chooseSpecialty');
  const chooseShell=document.querySelector('#chooseShell');
  const ONBOARDING_KEY='yamed.feed.onboarding.v1';
  const SPECIALTY_KEY='yamed.feed.specialty.v1';
  const stages={intro:introStage,specialty:specialtyStage,safety:safetyStage,shell:shellStage,oncology:oncologyStage};
  if(!overlay||Object.values(stages).some(x=>!x))return;

  const hasCompleted=()=>{try{return localStorage.getItem(ONBOARDING_KEY)==='done'}catch{return false}};
  const setCompleted=()=>{try{localStorage.setItem(ONBOARDING_KEY,'done')}catch{}}
  const rememberedSpecialty=()=>{try{return localStorage.getItem(SPECIALTY_KEY)||'cardiology'}catch{return'cardiology'}};
  const rememberSpecialty=id=>{try{localStorage.setItem(SPECIALTY_KEY,id)}catch{}}

  function setStage(name){
    for(const [k,node] of Object.entries(stages))node.hidden=k!==name;
  }
  function openStage(name){overlay.classList.add('open');setStage(name)}
  function setSpecialty(id){
    document.body.dataset.specialty=id;
    if(specialtyLabel)specialtyLabel.textContent=id==='oncology'?'Онкология':'Кардиология';
    rememberSpecialty(id);
  }
  function selectCardiology(){
    setSpecialty('cardiology');
    if(hasCompleted()&&window.KARDIO_HAS_SHELL){overlay.classList.remove('open');return}
    setStage('safety');
  }
  function selectOncology(){
    setSpecialty('oncology');
    setStage('oncology');
  }
  function continueSafety(){
    setCompleted();
    setSpecialty('cardiology');
    setStage('shell');
  }

  document.querySelector('#introContinue')?.addEventListener('click',()=>setStage('specialty'));
  document.querySelector('[data-specialty-choice="cardiology"]')?.addEventListener('click',selectCardiology);
  document.querySelector('[data-specialty-choice="oncology"]')?.addEventListener('click',selectOncology);
  document.querySelector('#specialtySkip')?.addEventListener('click',()=>setStage('safety'));
  document.querySelector('#safetyContinue')?.addEventListener('click',continueSafety);
  document.querySelectorAll('[data-onboarding-back]').forEach(x=>x.addEventListener('click',()=>setStage(x.dataset.onboardingBack)));

  specialtyButton?.addEventListener('click',()=>openStage('specialty'));
  chooseShell?.addEventListener('click',()=>openStage('shell'));

  const initial=rememberedSpecialty();
  /* Do not reopen a stale oncology theme over cardiology content after reload. */
  setSpecialty(initial==='oncology'?'cardiology':initial);

  /* app.js opens the overlay on a fresh shell. We decide which step it should show. */
  if(overlay.classList.contains('open')){
    setStage(hasCompleted()?'shell':'intro');
  }else{
    setStage(hasCompleted()?'shell':'intro');
  }

  window.KARDIO_ONBOARDING={
    openIntro:()=>openStage('intro'),
    openSpecialty:()=>openStage('specialty'),
    openShell:()=>openStage('shell'),
    setStage,
  };
})();
