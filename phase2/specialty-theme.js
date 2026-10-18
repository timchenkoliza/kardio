(()=>{
  const overlay=document.querySelector('#overlay');
  const specialtyStage=document.querySelector('#specialtyStage');
  const shellStage=document.querySelector('#shellStage');
  const oncologyStage=document.querySelector('#oncologyStage');
  const specialtyLabel=document.querySelector('#specialtyLabel');
  const specialtyButton=document.querySelector('#chooseSpecialty');
  const chooseShell=document.querySelector('#chooseShell');

  if(!overlay||!specialtyStage||!shellStage||!oncologyStage)return;

  const setStage=(name)=>{
    specialtyStage.hidden=name!=='specialty';
    shellStage.hidden=name!=='shell';
    oncologyStage.hidden=name!=='oncology';
  };

  const openSpecialty=()=>{
    overlay.classList.add('open');
    setStage('specialty');
  };

  const activateCardiology=()=>{
    document.body.dataset.specialty='cardiology';
    if(specialtyLabel)specialtyLabel.textContent='Кардиология';
    setStage('shell');
  };

  /* Oncology is deliberately preview-only until an oncology canonical data layer exists.
     Never render the Cardiology Golden Set under an Oncology label/theme. */
  const previewOncology=()=>setStage('oncology');

  document.querySelector('[data-specialty-choice="cardiology"]')?.addEventListener('click',activateCardiology);
  document.querySelector('[data-specialty-choice="oncology"]')?.addEventListener('click',previewOncology);
  document.querySelectorAll('[data-specialty-back]').forEach(x=>x.addEventListener('click',()=>setStage('specialty')));
  specialtyButton?.addEventListener('click',openSpecialty);

  /* Existing app.js owns shell state and opens the same overlay. We only reset its first
     visual step so the dividing screen always starts with specialty, as in the Workbench. */
  chooseShell?.addEventListener('click',()=>setStage('specialty'));

  document.body.dataset.specialty='cardiology';
  if(specialtyLabel)specialtyLabel.textContent='Кардиология';

  /* On a fresh run app.js opens the chooser because shell=null. Make specialty the first gate. */
  setStage('specialty');
})();
