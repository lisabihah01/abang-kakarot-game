/* Stage 1 & 2 — Neon Path Puzzle
   - 5x5 grid
   - Drag-swap tiles
   - Real-time neon glowing path overlay (pulsing)
   - 2 levels: Level 1 easier, Level 2 more scrambled
   - Background music autoplay (assets/background.mp3)
   - connect.mp3 on pick/ swap, win.mp3 on win
   - Confetti + "You Win Abang Kakaort! ❤️"
*/

// ------------- CONFIG & DOM -------------
const SIZE = 5;
const gridEl = document.getElementById('grid');
const movesEl = document.getElementById('moves');
const levelEl = document.getElementById('level');
const timerEl = document.getElementById('timer');
const pathCanvas = document.getElementById('pathCanvas');
const confettiCanvas = document.getElementById('confettiCanvas');

const DPR = Math.min(window.devicePixelRatio || 1, 2);
let moves = 0;
let currentLevel = 0; // 0 -> level 1, 1 -> level 2
const LEVELS = [
  { id: 1, swaps: 120, weightsFactor: 1.0 },
  { id: 2, swaps: 300, weightsFactor: 1.6 }
];

let tiles = [];
let startPos = { r: 2, c: 0 };
let goalPos  = { r: 2, c: SIZE - 1 };
let draggingEl = null;
let dragIndex = null;
let currentPath = null;
let pathAnimReq = null;
let pathPulse = 0;

// Timer
let startTime = null;
let timerReq = null;

// Audio
const bgAudio = new Audio('assets/background.mp3');
const connectAudio = new Audio('assets/connect.mp3');
const winAudio = new Audio('assets/win.mp3');
// volumes (bg louder)
bgAudio.loop = true; bgAudio.volume = 0.9;
connectAudio.volume = 0.9;
winAudio.volume = 1.0;

// Tile types (connectors: up,right,down,left)
const TYPES = [
  {name:'hor', conn:[0,1,0,1]},
  {name:'ver', conn:[1,0,1,0]},
  {name:'tl', conn:[1,1,0,0]},
  {name:'tr', conn:[1,0,0,1]},
  {name:'br', conn:[0,0,1,1]},
  {name:'bl', conn:[0,1,1,0]},
  {name:'t', conn:[1,1,1,0]},
  {name:'x', conn:[1,1,1,1]}
];

// ------------ HELPERS -------------
function posToIndex(r,c){ return r*SIZE + c; }
function indexToPos(i){ return { r: Math.floor(i/SIZE), c: i % SIZE }; }
function cryptoId(){ return Math.random().toString(36).slice(2,9); }

// weighted pick for variety
function weightedPick(levelFactor){
  const base = [18,18,12,12,12,12,6,2];
  const weights = base.map(w => Math.max(1, Math.floor(w / levelFactor)));
  const s = weights.reduce((a,b)=>a+b,0);
  let v = Math.random()*s;
  for (let i=0;i<weights.length;i++){
    if (v < weights[i]) return i;
    v -= weights[i];
  }
  return 0;
}
function makeTileFromType(typeIndex, rot){
  const base = TYPES[typeIndex];
  let conn = base.conn.slice();
  for (let k=0;k<rot;k++) conn = [conn[3], conn[0], conn[1], conn[2]];
  return { conn, id: cryptoId() };
}
function ensureConnector(tile, dir){
  if (tile.conn[dir]) return tile;
  const t = { conn: tile.conn.slice(), id: tile.id };
  for (let i=0;i<3;i++){
    t.conn = [t.conn[3], t.conn[0], t.conn[1], t.conn[2]];
    if (t.conn[dir]) return t;
  }
  return makeTileFromType(0, dir===1||dir===3?0:1);
}

// ------------- CREATE & SCRAMBLE -------------
function createInitialTilesForLevel(levelIdx){
  const cfg = LEVELS[levelIdx];
  tiles = [];
  const factor = cfg.weightsFactor;
  for (let r=0;r<SIZE;r++){
    for (let c=0;c<SIZE;c++){
      const pick = weightedPick(factor);
      const rot = Math.floor(Math.random()*4);
      tiles.push(makeTileFromType(pick, rot));
    }
  }
  // force start & goal inward connectors
  tiles[posToIndex(startPos.r, startPos.c)] = ensureConnector(tiles[posToIndex(startPos.r, startPos.c)], 1);
  tiles[posToIndex(goalPos.r, goalPos.c)] = ensureConnector(tiles[posToIndex(goalPos.r, goalPos.c)], 3);

  // scramble with swaps
  for (let i=0;i<cfg.swaps;i++){
    const a = Math.floor(Math.random()*tiles.length);
    const b = Math.floor(Math.random()*tiles.length);
    const tmp = tiles[a]; tiles[a]=tiles[b]; tiles[b]=tmp;
  }
}

// ------------- RENDER GRID -------------
function renderGrid(){
  gridEl.innerHTML = '';
  for (let i=0;i<tiles.length;i++){
    const tile = tiles[i];
    const pos = indexToPos(i);
    const el = document.createElement('div');
    el.className = 'tile';
    if (pos.r === startPos.r && pos.c === startPos.c) el.classList.add('start');
    if (pos.r === goalPos.r && pos.c === goalPos.c) el.classList.add('goal');
    el.dataset.index = i;
    el.setAttribute('draggable','false');

    // SVG drawing
    const svgns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgns,'svg');
    svg.setAttribute('viewBox','0 0 100 100');
    svg.setAttribute('width','80%'); svg.setAttribute('height','80%');

    const center = document.createElementNS(svgns,'circle');
    center.setAttribute('cx',50); center.setAttribute('cy',50); center.setAttribute('r',10);
    center.setAttribute('fill','none'); center.setAttribute('stroke','rgba(58,224,255,0.95)');
    center.setAttribute('stroke-width','8'); center.setAttribute('class','pipe');
    svg.appendChild(center);

    const conn = tile.conn;
    function drawLine(dx,dy){
      const path = document.createElementNS(svgns,'path');
      const x2 = 50 + dx*40; const y2 = 50 + dy*40;
      const d = `M ${50+dx*10} ${50+dy*10} L ${x2} ${y2}`;
      path.setAttribute('d', d);
      path.setAttribute('stroke','rgba(58,224,255,0.95)');
      path.setAttribute('stroke-width','10');
      path.setAttribute('fill','none');
      path.setAttribute('class','pipe');
      svg.appendChild(path);
      const glow = document.createElementNS(svgns,'path');
      glow.setAttribute('d', d);
      glow.setAttribute('stroke','rgba(182,109,255,0.12)');
      glow.setAttribute('stroke-width','3');
      glow.setAttribute('fill','none');
      svg.appendChild(glow);
    }
    if (conn[0]) drawLine(0,-1);
    if (conn[1]) drawLine(1,0);
    if (conn[2]) drawLine(0,1);
    if (conn[3]) drawLine(-1,0);

    if (el.classList.contains('start')){
      const m = document.createElement('div'); m.className='marker'; m.textContent='🚗'; el.appendChild(m);
    }
    if (el.classList.contains('goal')){
      const m = document.createElement('div'); m.className='marker'; m.textContent='🏁'; el.appendChild(m);
    }

    el.appendChild(svg);
    gridEl.appendChild(el);

    makeDraggable(el);
  }
  movesEl.textContent = `Moves: ${moves}`;
  levelEl.textContent = `Level ${LEVELS[currentLevel].id}`;
}

// ------------- DRAG & SWAP -------------
function makeDraggable(el){
  let startX=0, startY=0;
  el.addEventListener('touchstart', (ev)=>{ ev.stopPropagation(); ev.preventDefault(); startDrag(ev.touches[0].clientX, ev.touches[0].clientY, el); }, {passive:false});
  el.addEventListener('touchmove', (ev)=>{ ev.stopPropagation(); ev.preventDefault(); continueDrag(ev.touches[0].clientX, ev.touches[0].clientY, el); }, {passive:false});
  el.addEventListener('touchend', (ev)=>{ ev.stopPropagation(); ev.preventDefault(); endDrag(ev.changedTouches[0].clientX, ev.changedTouches[0].clientY, el); }, {passive:false});
  el.addEventListener('mousedown', (ev)=>{ startDrag(ev.clientX, ev.clientY, el); });
  window.addEventListener('mousemove', (ev)=>{ if (draggingEl) continueDrag(ev.clientX, ev.clientY, draggingEl); });
  window.addEventListener('mouseup', (ev)=>{ if (draggingEl) endDrag(ev.clientX, ev.clientY, draggingEl); });

  function startDrag(x,y,elRef){
    draggingEl = elRef; dragIndex = Number(elRef.dataset.index);
    elRef.classList.add('dragging'); elRef.style.zIndex = 20;
    startX = x; startY = y;
    try { connectAudio.currentTime = 0; connectAudio.play(); } catch(e){}
  }
  function continueDrag(x,y,elRef){
    if (!draggingEl) return;
    const dx = x - startX, dy = y - startY;
    elRef.style.transform = `translate(${dx}px, ${dy}px) scale(1.02)`;
  }
  function endDrag(x,y,elRef){
    if (!draggingEl) return;
    elRef.classList.remove('dragging'); elRef.style.transform=''; elRef.style.zIndex='';
    const target = document.elementFromPoint(x, y);
    const targetTile = target && target.closest && target.closest('.tile');
    if (targetTile && targetTile !== elRef){
      const a = Number(elRef.dataset.index); const b = Number(targetTile.dataset.index);
      // swap in tiles array
      const tmp = tiles[a]; tiles[a] = tiles[b]; tiles[b] = tmp;
      renderGrid();
      moves += 1; movesEl.textContent = `Moves: ${moves}`;
      try { connectAudio.currentTime = 0; connectAudio.play(); } catch(e){}
      postUpdate();
    } else {
      try { connectAudio.currentTime = 0; connectAudio.play(); } catch(e){}
    }
    draggingEl = null; dragIndex = null;
  }
}

// ------------- CONNECTIVITY & PATH (BFS + reconstruct) -------------
function findPath(){
  const visited = new Array(SIZE*SIZE).fill(false);
  const prev = new Array(SIZE*SIZE).fill(-1);
  const q = [];
  const sIdx = posToIndex(startPos.r, startPos.c), gIdx = posToIndex(goalPos.r, goalPos.c);
  visited[sIdx] = true; q.push(sIdx);
  while(q.length){
    const cur = q.shift();
    if (cur === gIdx) break;
    const p = indexToPos(cur); const tile = tiles[cur];
    const dirs = [
      {dr:-1,dc:0,dirIdx:0,opp:2},
      {dr:0,dc:1,dirIdx:1,opp:3},
      {dr:1,dc:0,dirIdx:2,opp:0},
      {dr:0,dc:-1,dirIdx:3,opp:1}
    ];
    for (const d of dirs){
      const nr = p.r + d.dr, nc = p.c + d.dc;
      if (nr<0||nr>=SIZE||nc<0||nc>=SIZE) continue;
      const nidx = posToIndex(nr,nc);
      const neighbor = tiles[nidx];
      if (!tile.conn[d.dirIdx]) continue;
      if (!neighbor.conn[d.opp]) continue;
      if (visited[nidx]) continue;
      visited[nidx] = true; prev[nidx] = cur; q.push(nidx);
    }
  }
  if (!visited[gIdx]) return null;
  const path = []; let cur = gIdx;
  while(cur !== -1){ path.push(cur); if (cur === sIdx) break; cur = prev[cur]; }
  return path.reverse();
}

// ------------- PATH OVERLAY (animated neon) -------------
function drawPathAnimated(time){
  pathPulse = time * 0.001;
  pathAnimReq = requestAnimationFrame(drawPathAnimated);

  const rect = gridEl.getBoundingClientRect();
  const ctx = pathCanvas.getContext('2d');
  pathCanvas.width = rect.width * DPR; pathCanvas.height = rect.height * DPR;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,rect.width,rect.height);

  if (!currentPath || currentPath.length < 2) return;

  const cellW = rect.width / SIZE, cellH = rect.height / SIZE;
  const centers = currentPath.map(idx => {
    const p = indexToPos(idx);
    return { cx: p.c * cellW + cellW/2, cy: p.r * cellH + cellH/2 };
  });

  const pulse = (Math.sin(pathPulse * 3) + 1) / 2;
  // broad glow
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(centers[0].cx, centers[0].cy);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].cx, centers[i].cy);
  ctx.strokeStyle = `rgba(58,224,255,${0.06 + pulse*0.08})`;
  ctx.lineWidth = 18 + pulse*6; ctx.stroke();

  // inner glow
  ctx.beginPath(); ctx.moveTo(centers[0].cx, centers[0].cy);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].cx, centers[i].cy);
  ctx.strokeStyle = `rgba(58,224,255,${0.34 + pulse*0.25})`;
  ctx.lineWidth = 8 + pulse*4; ctx.stroke();

  // core
  ctx.beginPath(); ctx.moveTo(centers[0].cx, centers[0].cy);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].cx, centers[i].cy);
  ctx.strokeStyle = '#AFFFFF'; ctx.lineWidth = 3; ctx.stroke();

  // moving particles along path
  const total = centers.length;
  const tflow = (pathPulse * 1.2) % total;
  for (let k=0;k<3;k++){
    const pos = (tflow + k*0.9) % total;
    const i0 = Math.floor(pos), i1 = Math.min(i0+1, centers.length-1);
    const f = pos - i0; const x = centers[i0].cx*(1-f) + centers[i1].cx*f; const y = centers[i0].cy*(1-f) + centers[i1].cy*f;
    ctx.beginPath(); ctx.fillStyle = `rgba(175,255,255,${0.95 - k*0.25})`; ctx.arc(x,y,5-k,0,Math.PI*2); ctx.fill();
  }
  // dots
  for (let i=0;i<centers.length;i++){
    ctx.beginPath(); ctx.fillStyle = 'rgba(58,224,255,0.9)'; ctx.arc(centers[i].cx, centers[i].cy, 3, 0, Math.PI*2); ctx.fill();
  }
}

// ------------- POST UPDATE -------------
function postUpdate(){
  const path = findPath();
  currentPath = path;
  if (currentPath && !pathAnimReq) pathAnimReq = requestAnimationFrame(drawPathAnimated);
  if (!currentPath && pathAnimReq){
    cancelAnimationFrame(pathAnimReq); pathAnimReq = null;
    // clear
    const rect = gridEl.getBoundingClientRect();
    const ctx = pathCanvas.getContext('2d'); pathCanvas.width = rect.width*DPR; pathCanvas.height = rect.height*DPR; ctx.clearRect(0,0,rect.width,rect.height);
  }
  if (currentPath) {
    // optional soft ping when path appears
    try { connectAudio.currentTime = 0; connectAudio.play(); } catch(e){}
  }
  // check win
  if (currentPath && currentPath[currentPath.length-1] === posToIndex(goalPos.r, goalPos.c)){
    handleWin();
  }
}

// ------------- WIN -------------
let won = false;
function handleWin(){
  if (won) return;
  won = true;
  try { winAudio.currentTime = 0; winAudio.play(); } catch(e){}
  // overlay
  const overlay = document.createElement('div'); overlay.className = 'winOverlay';
  overlay.innerHTML = `<div class="winCard"><div class="winTitle">You Win Abang Kakaort! ❤️</div><div style="color:#bfe;opacity:.95">Level ${LEVELS[currentLevel].id} complete.</div><div style="height:10px"></div><button class="winBtn" id="nextBtn">Next Level</button></div>`;
  document.querySelector('.game-area').appendChild(overlay);
  // confetti using canvas-confetti library
  confetti({
    particleCount: 220,
    spread: 140,
    origin: { y: 0.6 }
  });
  document.getElementById('nextBtn').addEventListener('click', ()=>{
    overlay.remove();
    nextLevel();
  });
}

// ------------- LEVELS & RESET -------------
function resetLevel(idx){
  moves = 0; movesEl.textContent = `Moves: ${moves}`; won = false; won = false;
  createInitialTilesForLevel(idx); renderGrid(); postUpdate();
  // timer
  if (timerReq) cancelAnimationFrame(timerReq);
  startTime = performance.now();
  tickTimer();
}
function nextLevel(){
  currentLevel = Math.min(LEVELS.length-1, currentLevel+1);
  if (currentLevel >= LEVELS.length) currentLevel = LEVELS.length-1;
  resetLevel(currentLevel);
}

// timer display
function tickTimer(){
  const now = performance.now();
  const s = Math.floor((now - startTime)/1000);
  const mm = String(Math.floor(s/60)).padStart(2,'0'); const ss = String(s%60).padStart(2,'0');
  timerEl.textContent = `${mm}:${ss}`;
  timerReq = requestAnimationFrame(tickTimer);
}

// ------------- INIT & RESIZE -------------
function init(){
  function resizeCanvases(){
    const rect = gridEl.getBoundingClientRect();
    pathCanvas.style.width = rect.width + 'px'; pathCanvas.style.height = rect.height + 'px';
    confettiCanvas.style.width = rect.width + 'px'; confettiCanvas.style.height = rect.height + 'px';
    pathCanvas.width = rect.width * DPR; pathCanvas.height = rect.height * DPR;
    confettiCanvas.width = rect.width * DPR; confettiCanvas.height = rect.height * DPR;
  }
  window.addEventListener('resize', ()=>{ resizeCanvases(); postUpdate(); });
  currentLevel = 0;
  resetLevel(currentLevel);
  resizeCanvases();
  // try autoplay background; if blocked, wait for first user gesture
  bgAudio.play().catch(() => {
    // show small overlay hint to tap once to start audio
    const helper = document.createElement('div'); helper.className = 'winOverlay'; helper.style.zIndex=80;
    helper.innerHTML = `<div class="winCard"><div style="font-size:16px;color:#bfe">Tap to start audio & play</div><div style="height:8px"></div><button class="winBtn" id="playNow">Play</button></div>`;
    document.body.appendChild(helper);
    document.getElementById('playNow').addEventListener('click', ()=>{
      bgAudio.play();
      helper.remove();
      startTime = performance.now();
      tickTimer();
    });
  });
}
init();

// make sure audio plays on touch/click (mobile)
document.body.addEventListener('touchstart', function resumeAudio(){
  try { bgAudio.play(); } catch(e){}
  document.body.removeEventListener('touchstart', resumeAudio);
}, {passive:true});
document.body.addEventListener('click', function resumeClick(){
  try { bgAudio.play(); } catch(e){}
  document.body.removeEventListener('click', resumeClick);
});
