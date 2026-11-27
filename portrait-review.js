const $ = id => document.getElementById(id);
const element = (tag,text,cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const key = 'artbook.portrait-review.draft.v1';
const labels = {small:'Small crop',soft:'Soft linework',match:'Identical image',similar:'Visually similar',group:'Grouped alternate'};
try {
  const load = async path => {
    const response = await fetch(path);
    if (!response.ok) throw Error(path);
    return response.json();
  };
  const [atlas, audit] = await Promise.all([load('catalogue.json'),load('portrait-review.json')]);
  const games = new Map(atlas.sources.map(s => [s.id,s.game]));
  const meta = new Map();
  const rows = [];
  const characters = [];
  for (const c of atlas.characters) {
    if (!audit[c.id]) continue;
    const portraits = new Map(c.portraits.map(p => [p.id,p]));
    const characterGames = new Set();
    for (const [id,[flags,comparison]] of Object.entries(audit[c.id])) {
      const p = portraits.get(id), other = portraits.get(comparison);
      const game = games.get(p.source);
      characterGames.add(game);
      rows.push({game,c,p,other,flags});
      for (const face of [p,other].filter(Boolean)) meta.set(face.id,{game:games.get(face.source),character:c.name});
    }
    characters.push({c,games:characterGames});
  }
  const gameNames = [...new Set(rows.map(r=>r.game))].sort((a,b)=>a.localeCompare(b));
  for (const game of gameNames) $('game').add(new Option(game,game));
  rows.sort((a,b)=>a.game.localeCompare(b.game)||a.c.name.localeCompare(b.c.name)||a.p.id.localeCompare(b.p.id,undefined,{numeric:true}));
  let choices = {};
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '{}');
    choices = Object.fromEntries(Object.entries(stored).filter(([id,v])=>meta.has(id)&&['keep','remove'].includes(v)));
  } catch {}
  const pageSize = 12;
  let page = 0;
  function populateCharacters() {
    const selected = $('character').value;
    $('character').replaceChildren(new Option('All characters',''));
    for (const {c,games} of characters.filter(x=>!$('game').value||x.games.has($('game').value)).sort((a,b)=>a.c.name.localeCompare(b.c.name))) {
      $('character').add(new Option(c.name,c.id));
    }
    if ([...$('character').options].some(o=>o.value===selected)) $('character').value=selected;
  }
  function picture(p,role,c) {
    const box = element('div',undefined,'pic');
    const link = element('a');link.href=p.file;link.target='_blank';link.rel='noopener';
    const img=element('img');img.src=p.thumb||p.file;img.alt=c.name+' · '+p.expression;img.loading='lazy';link.append(img);
    const title=p.pose?.label||(p.expression==='Expression variation' && p.sprite_variant)||p.expression;
    box.append(element('strong',role,'slot'),link,element('div',title),element('div',
      (p.pose?'Outfit or pose':'Expression')+' · '+p.width+' × '+(p.height||p.width)+' px'+(p.id===(atlas.shared_decisions.defaults[c.id]||c.default)?' · Default':''),'meta'),element('span',p.id,'pid'));
    const buttons=element('div',undefined,'actions');
    for (const value of ['keep','remove']) {
      const button=element('button',value==='keep'?'Keep':'Remove');
      button.dataset.id=p.id;button.dataset.choice=value;
      button.setAttribute('aria-label',button.textContent+' '+c.name+' '+p.id);
      button.setAttribute('aria-pressed',String(choices[p.id]===value));
      button.onclick=()=>{
        if(choices[p.id]===value) delete choices[p.id]; else choices[p.id]=value;
        let message='';
        try {localStorage.setItem(key,JSON.stringify(choices));} catch {message=' · This session only';}
        if($('decision').value) render();
        else for (const b of $('results').querySelectorAll('button[data-id]')) b.setAttribute('aria-pressed',String(choices[b.dataset.id]===b.dataset.choice));
        updateStatus(message);
      };
      buttons.append(button);
    }
    box.append(buttons);return box;
  }
  function updateStatus(message='') {
    const values=Object.values(choices);
    $('status').textContent=values.filter(v=>v==='keep').length+' keep · '+values.filter(v=>v==='remove').length+' remove'+message;
    $('copy').disabled=$('save').disabled=!values.length;
  }
  function render() {
    const reason=$('reason').value;
    const filtered=rows.filter(r=>(!$('game').value||r.game===$('game').value)&&(!$('character').value||r.c.id===$('character').value)&&
      (!reason||(reason==='quality'?r.flags.some(f=>f==='soft'||f==='small'):r.flags.includes(reason)))&&
      (!$('decision').value||(choices[r.p.id]||'pending')===$('decision').value));
    page=Math.max(0,Math.min(page,Math.ceil(filtered.length/pageSize)-1));
    const start=page*pageSize, batch=filtered.slice(start,start+pageSize);
    $('range').textContent=batch.length?(start+1)+'–'+(start+batch.length)+' of '+filtered.length.toLocaleString():'No matching candidates';
    $('prev').disabled=!page;$('next').disabled=start+batch.length>=filtered.length;
    const out=$('results');out.replaceChildren();let currentGame,currentId,grid;
    for(const r of batch){
      if(r.game!==currentGame){out.append(element('h2',r.game));currentGame=r.game;currentId=null;}
      if(r.c.id!==currentId){out.append(element('h3',r.c.name));grid=element('div',undefined,'pairs');out.append(grid);currentId=r.c.id;}
      const article=element('article',undefined,'pair'), pair=element('div',undefined,r.other?'compare':'solo');
      article.append(element('p',r.flags.map(f=>labels[f]).join(' · '),'reason'),pair);
      pair.append(picture(r.p,'Review',r.c));
      if(r.other)pair.append(picture(r.other,'Compare',r.c));
      else if(r.c.portraits.filter(p=>p.status==='Ready').length===1)article.append(element('p','Only usable portrait for this character.','meta'));
      grid.append(article);
    }
    updateStatus();
  }
  function exportChoices(){
    return JSON.stringify({schema:'artbook-portrait-review/1',decisions:Object.entries(choices).map(([portrait_id,decision])=>({...meta.get(portrait_id),portrait_id,decision}))},null,2);
  }
  $('copy').onclick=async()=>{
    const text=exportChoices();try{await navigator.clipboard.writeText(text);updateStatus(' · Copied');}
    catch{const box=$('fallback');box.value=text;box.hidden=false;box.select();}
  };
  $('save').onclick=()=>{
    const url=URL.createObjectURL(new Blob([exportChoices()],{type:'application/json'}));
    const a=element('a');a.href=url;a.download='portrait-review-decisions.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  for(const id of ['game','character','reason','decision']) $(id).onchange=()=>{page=0;if(id==='game')populateCharacters();
    const url=new URL(location.href);
    for(const filter of ['game','character','reason']){
      if($(filter).value)url.searchParams.set(filter,$(filter).value);else url.searchParams.delete(filter);
    }
    history.replaceState(null,'',url);render();};
  $('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
  $('summary').textContent=rows.length.toLocaleString()+' candidates across '+characters.length+' characters in '+gameNames.length+' games. Choose Keep or Remove, then copy or download your decisions. Choices are saved in this browser.';
  const params=new URLSearchParams(location.search);
  function restoreFilter(id) {
    if ([...$(id).options].some(o=>o.value===params.get(id))) $(id).value=params.get(id);
  }
  restoreFilter('game');populateCharacters();restoreFilter('character');restoreFilter('reason');render();
} catch (error) {
  $('summary').textContent='The portrait review could not load. Refresh to try again.';
  console.error(error);
}
