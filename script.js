/* Final Neon Path Puzzle
   - 5x5 drag-swap tiles
   - Live animated neon path overlay (pulsing)
   - Background futuristic loop (WebAudio)
   - Pick/drop sounds + win chime
   - 2 levels (level 2 harder)
*/

// ---------- Config & DOM ----------
const SIZE = 5;
const gridEl = document.getElementById('grid');
const movesEl = document.getElementById('moves');
const statusEl = document.getElementById('status');
const levelEl = document.getElementById('level');
const confettiCanvas = document.getElementById('confettiCanvas');
const pathCanvas = document.getElementById('pathCanvas');

const DPR = Math.min(window.devicePixelRatio || 1, 2);

// audio
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// levels
const LEVELS = [
  { id: 1, swaps: 150, weightsFactor: 1.0 },
  { id: 2, swaps: 320, weightsFactor: 1.6 }
];
let currentLevel = 0;

// state
let moves = 0;
let tiles = [];
let startPos = { r: 2, c: 0 };
let goalPos = { r: 2, c: SIZE - 1 };
let draggingEl = null, dragIndex = null;
let confettiRunning = false, confettiParticles = [];
let currentPath = null; // array of indices
let pathPulseTime = 0;
let pathAnimReq = null;

// tile types (connectors: up,right,down,left)
const TYPES = [
  {name:'hor', conn:[0,1,0,1]}, // horizontal
  {name:'ver', conn:[1,0,1,0]},
  {name:'tl', conn:[1,1,0,0]},
  {name:'tr', conn:[1,0,0,1]},
  {name:'br', conn:[0,0,1,1]},
  {name:'bl', conn:[0,1,1,0]},
  {name:'t', conn:[1,1,1,0]},
  {name:'x', conn:[1,1,1,1]},
];

// ---------- Helpers ----------
function posToIndex(r,c){ return r*SIZE + c; }
function indexToPos(i){ return { r: Math.floor(i/SIZE), c: i % SIZE }; }
function cryptoId(){ return Math.random().toString(36).slice(2,9); }

function weightedPick(levelFactor){
  const baseWeights = [18,18,12,12,12,12,6,2];
  const weights = baseWeights.map(w => Math.max(1, Math.floor(w / levelFactor)));
  const sum = weights.reduce((s,x) => s + x, 0);
  let v = Math.random()*sum;
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
  return makeTileFromType(0, dir === 1 || dir === 3 ? 0 : 1);
}

// ---------- Create / scramble ----------
function createInitialTilesForLevel(levelIdx){
  const cfg = LEVELS[levelIdx];
  tiles = [];
  const levelFactor = cfg.weightsFactor;
  for (let r=0;r<SIZE;r++){
    for (let c=0;c<SIZE;c++){
      const pick = weightedPick(levelFactor);
      const rot = Math.floor(Math.random()*4);
      tiles.push(makeTileFromType(pick, rot));
    }
  }
  // Ensure start/goal connectors
  const sIdx = posToIndex(startPos.r, startPos.c);
  const gIdx = posToIndex(goalPos.r, goalPos.c);
  tiles[sIdx] = ensureConnector(tiles[sIdx], 1);
  tiles[gIdx] = ensureConnector(tiles[gIdx], 3);

  // scramble swaps
  for (let i=0;i<cfg.swaps;i++){
    const a=Math.floor(Math.random()*tiles.length), b=Math.floor(Math.random()*tiles.length);
    swapTiles(a,b,false);
  }
}

// swap tiles
function swapTiles(a,b,updateDom=true){
  const tmp = tiles[a]; tiles[a] = tiles[b]; tiles[b] = tmp;
  if (updateDom) { renderGrid(); postUpdate(); }
}

// ---------- Render ----------
function renderGrid(){
  gridEl.innerHTML = '';
  for (let i=0;i<tiles.length;i++){
    const tile = tiles[i];
    const pos = indexToPos(i);
    const cell = document.createElement('div');
    cell.className = 'tile';
    if (pos.r === startPos.r && pos.c === startPos.c) cell.classList.add('start');
    if (pos.r === goalPos.r && pos.c === goalPos.c) cell.classList.add('goal');
    cell.setAttribute('draggable','false');
    cell.dataset.index = i;

    // SVG connectors
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
      const line = document.createElementNS(svgns,'path');
      const x2 = 50 + dx*40; const y2 = 50 + dy*40;
      const d = `M ${50+dx*10} ${50+dy*10} L ${x2} ${y2}`;
      line.setAttribute('d', d);
      line.setAttribute('stroke','rgba(58,224,255,0.95)');
      line.setAttribute('stroke-width','10');
      line.setAttribute('fill','none'); line.setAttribute('class','pipe');
      svg.appendChild(line);
      const glow = document.createElementNS(svgns,'path');
      glow.setAttribute('d', d); glow.setAttribute('stroke','rgba(182,109,255,0.12)');
      glow.setAttribute('stroke-width','3'); glow.setAttribute('fill','none');
      svg.appendChild(glow);
    }
    if (conn[0]) drawLine(0,-1);
    if (conn[1]) drawLine(1,0);
    if (conn[2]) drawLine(0,1);
    if (conn[3]) drawLine(-1,0);

    if (cell.classList.contains('start')){
      const m = document.createElement('div'); m.className='marker'; m.textContent='🚗'; cell.appendChild(m);
    }
    if (cell.classList.contains('goal')){
      const m = document.createElement('div'); m.className='marker'; m.textContent='🚗'; cell.appendChild(m);
    }

    cell.appendChild(svg);
    gridEl.appendChild(cell);
    makeDraggable(cell);
  }
  movesEl.textContent = `Moves: ${moves}`;
  levelEl.textContent = `Level: ${LEVELS[currentLevel].id}`;
}

// ---------- Drag & swap ----------
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
    playPick(); // sound
  }
  function continueDrag(x,y,elRef){
    if (!draggingEl) return;
    const dx = x - startX, dy = y - startY;
    elRef.style.transform = `translate(${dx}px, ${dy}px) scale(1.02)`;
    // while dragging, highlight possible target by drawing path preview
    // (we'll recalc path after drop)
  }
  function endDrag(x,y,elRef){
    if (!draggingEl) return;
    elRef.classList.remove('dragging'); elRef.style.zIndex=''; elRef.style.transform='';
    const target = document.elementFromPoint(x, y);
    const targetTile = target && target.closest && target.closest('.tile');
    if (targetTile && targetTile !== elRef){
      const a = Number(elRef.dataset.index), b = Number(targetTile.dataset.index);
      swapTiles(a,b,true);
      moves += 1; movesEl.textContent = `Moves: ${moves}`;
      playDrop();
      postUpdate();
    } else {
      // cancelled drag
      playDrop();
    }
    draggingEl = null; dragIndex = null;
  }
}

// ---------- Connectivity BFS + path reconstruct ----------
function findPath(){
  const visited = new Array(SIZE*SIZE).fill(false);
  const prev = new Array(SIZE*SIZE).fill(-1);
  const q = [];
  const startIdx = posToIndex(startPos.r, startPos.c);
  const goalIdx = posToIndex(goalPos.r, goalPos.c);
  q.push(startIdx); visited[startIdx] = true;
  while(q.length){
    const cur = q.shift();
    if (cur === goalIdx) break;
    const p = indexToPos(cur);
    const tile = tiles[cur];
    const dirs = [
      {dr:-1, dc:0, dirIdx:0, opp:2},
      {dr:0, dc:1, dirIdx:1, opp:3},
      {dr:1, dc:0, dirIdx:2, opp:0},
      {dr:0, dc:-1, dirIdx:3, opp:1},
    ];
    for (const d of dirs){
      const nr = p.r + d.dr, nc = p.c + d.dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const nidx = posToIndex(nr,nc);
      const neighbor = tiles[nidx];
      if (!tile.conn[d.dirIdx]) continue;
      if (!neighbor.conn[d.opp]) continue;
      if (visited[nidx]) continue;
      visited[nidx] = true; prev[nidx] = cur; q.push(nidx);
    }
  }
  if (!visited[posToIndex(goalPos.r, goalPos.c)]) return null;
  const path = [];
  let cur = posToIndex(goalPos.r, goalPos.c);
  while(cur !== -1){ path.push(cur); if (cur === posToIndex(startPos.r, startPos.c)) break; cur = prev[cur]; }
  path.reverse();
  return path;
}

// ---------- Path overlay (animated pulsing) ----------
function drawPathAnimated(time){
  // loop redraw
  pathPulseTime = time * 0.001;
  pathAnimReq = requestAnimationFrame(drawPathAnimated);

  const rect = gridEl.getBoundingClientRect();
  const canvas = pathCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = rect.width * DPR; canvas.height = rect.height * DPR;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,rect.width,rect.height);

  if (!currentPath || currentPath.length < 2) return;
  const cellW = rect.width / SIZE, cellH = rect.height / SIZE;
  const centers = currentPath.map(idx => {
    const p = indexToPos(idx);
    return { cx: p.c * cellW + cellW/2, cy: p.r * cellH + cellH/2 };
  });

  // create pulsing widths and alpha
  const pulse = (Math.sin(pathPulseTime * 3) + 1) / 2; // 0..1
  // broad glow
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(centers[0].cx, centers[0].cy);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].cx, centers[i].cy);
  ctx.strokeStyle = `rgba(58,224,255,${0.06 + pulse*0.06})`;
  ctx.lineWidth = 18 + pulse*6;
  ctx.stroke();

  // inner glow
  ctx.beginPath();
  ctx.moveTo(centers[0].cx, centers[0].cy);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].cx, centers[i].cy);
  ctx.strokeStyle = `rgba(58,224,255,${0.32 + pulse*0.2})`;
  ctx.lineWidth = 8 + pulse*4;
  ctx.stroke();

  // core bright
  ctx.beginPath();
  ctx.moveTo(centers[0].cx, centers[0].cy);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].cx, centers[i].cy);
  ctx.strokeStyle = '#AFFFFF';
  ctx.lineWidth = 3;
  ctx.stroke();

  // pulse dots moving along path to show flow
  const total = centers.length;
  const tflow = (pathPulseTime * 1.4) % total;
  for (let k=0;k<3;k++){
    const pos = (tflow + k*0.9) % total;
    // interpolate between points
    const i0 = Math.floor(pos), i1 = Math.min(i0+1, centers.length-1);
    const f = pos - i0;
    const x = centers[i0].cx * (1-f) + centers[i1].cx * f;
    const y = centers[i0].cy * (1-f) + centers[i1].cy * f;
    ctx.beginPath();
    ctx.fillStyle = `rgba(175,255,255,${0.9 - k*0.25})`;
    ctx.arc(x, y, 5 - k, 0, Math.PI*2);
    ctx.fill();
  }

  // small center dots
  for (let i=0;i<centers.length;i++){
    ctx.beginPath();
    ctx.fillStyle = 'rgba(58,224,255,0.9)';
    ctx.arc(centers[i].cx, centers[i].cy, 3, 0, Math.PI*2);
    ctx.fill();
  }
}

// ---------- Post update: compute path, draw, check win ----------
function drawPathOverlayNow(){
  currentPath = findPath();
  if (currentPath) {
    statusEl.textContent = 'Path active';
    playSoftPing();
  } else {
    statusEl.textContent = '';
  }
  // start animation loop if path exists, stop if not
  if (currentPath && !pathAnimReq) pathAnimReq = requestAnimationFrame(drawPathAnimated);
  if (!currentPath && pathAnimReq) {
    cancelAnimationFrame(pathAnimReq);
    pathAnimReq = null;
    // clear canvas
    const rect = gridEl.getBoundingClientRect();
    const ctx = pathCanvas.getContext('2d');
    pathCanvas.width = rect.width * DPR; pathCanvas.height = rect.height * DPR;
    ctx.clearRect(0,0,rect.width,rect.height);
  }
  // win check
  if (currentPath && currentPath[currentPath.length-1] === posToIndex(goalPos.r, goalPos.c)) {
    triggerWin();
  }
}
function postUpdate(){ drawPathOverlayNow(); }

// ---------- Win: overlay + confetti + chime ----------
function triggerWin(){
  // prevent double-trigger
  if (confettiRunning) return;
  const overlay = document.createElement('div');
  overlay.className = 'winOverlay';
  overlay.innerHTML = `
    <div class="winCard">
      <div class="winTitle">You Win Abang Kakaort! ❤️</div>
      <div style="color:#bfe;opacity:.95">Nice — level ${LEVELS[currentLevel].id} complete.</div>
      <div style="height:8px"></div>
      <button class="winBtn" id="replayBtn">Replay</button>
      <button class="winBtn" id="nextLevelBtn" style="margin-left:10px">Next Level</button>
    </div>
  `;
  document.querySelector('.game-area').appendChild(overlay);
  document.getElementById('replayBtn').addEventListener('click', ()=>{
    overlay.remove(); stopConfetti(); resetLevel(currentLevel);
  });
  document.getElementById('nextLevelBtn').addEventListener('click', ()=>{
    overlay.remove(); stopConfetti(); goToNextLevel();
  });

  startConfetti();
  playWinChime();
}

// ---------- Confetti ----------
function startConfetti(){
  if (confettiRunning) return;
  confettiRunning = true;
  const canvas = confettiCanvas;
  const rect = gridEl.getBoundingClientRect();
  canvas.width = rect.width * DPR; canvas.height = rect.height * DPR;
  const ctx = canvas.getContext('2d'); ctx.setTransform(DPR,0,0,DPR,0,0);
  confettiParticles = [];
  for (let i=0;i<140;i++){
    confettiParticles.push({
      x: Math.random()*canvas.width, y: Math.random()*-canvas.height,
      vx:(Math.random()-0.5)*3, vy:2+Math.random()*4,
      size:6+Math.random()*8, rot:Math.random()*360, speedRot:(Math.random()-0.5)*6,
      color: randomColor()
    });
  }
  let last = performance.now();
  (function frame(t){
    const dt = t-last; last = t;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (const p of confettiParticles){
      p.x += p.vx * (dt/16); p.y += p.vy * (dt/16); p.rot += p.speedRot * (dt/16);
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot * Math.PI/180);
      ctx.fillStyle = p.color; ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
      ctx.restore();
      if (p.y > canvas.height + 40){ p.y = Math.random()*-canvas.height; p.x = Math.random()*canvas.width; }
    }
    if (confettiRunning) requestAnimationFrame(frame);
  })(performance.now());
}
function stopConfetti(){ confettiRunning = false; confettiParticles = []; const ctx = confettiCanvas.getContext('2d'); ctx && ctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height); }
function randomColor(){ const palette = ['#3ae0ff','#b66dff','#8be','#4df6a5','#ffd166','#9ff']; return palette[Math.floor(Math.random()*palette.length)]; }

// ---------- Sounds (background loop + pick/drop + small pings + win chime) ----------
// Background futuristic loop: simple evolving pad (sine + filter + LFO)
let bgNodes = null;
function startBackgroundLoop(){
  if (bgNodes) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const f1 = 110; const f2 = 220;
  osc.type = 'sine'; osc.frequency.value = f1;
  osc2.type = 'sine'; osc2.frequency.value = f2;
  // lowpass filter
  const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600;
  const g = audioCtx.createGain(); g.gain.value = 0.04;
  // slow LFO to modulate filter cutoff
  const lfo = audioCtx.createOscillator(); lfo.frequency.value = 0.07; // slow
  const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 300; // modulation depth
  lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
  osc.connect(filter); osc2.connect(filter); filter.connect(g); g.connect(audioCtx.destination);
  osc.start(now); osc2.start(now); lfo.start(now);
  bgNodes = {osc, osc2, filter, g, lfo, lfoGain};
}
function stopBackgroundLoop(){
  if (!bgNodes) return;
  try {
    bgNodes.osc.stop(); bgNodes.osc2.stop(); bgNodes.lfo.stop();
  } catch(e){}
  bgNodes = null;
}

// small pick/drop
function playPick(){
  const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
  o.type='sawtooth'; o.frequency.value = 880; g.gain.value = 0.0001;
  o.connect(g); g.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  o.start(now); g.gain.exponentialRampToValueAtTime(0.02, now+0.01); g.gain.exponentialRampToValueAtTime(0.0001, now+0.12); o.stop(now+0.14);
}
function playDrop(){
  const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
  o.type='triangle'; o.frequency.value = 440; g.gain.value = 0.0001;
  o.connect(g); g.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  o.start(now); g.gain.exponentialRampToValueAtTime(0.018, now+0.01); g.gain.exponentialRampToValueAtTime(0.0001, now+0.18); o.stop(now+0.2);
}
function playSoftPing(){
  const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
  o.type='sine'; o.frequency.value=420; g.gain.value=0.0001; o.connect(g); g.connect(audioCtx.destination);
  const now = audioCtx.currentTime; o.start(now); g.gain.exponentialRampToValueAtTime(0.012, now+0.02); g.gain.exponentialRampToValueAtTime(0.0001, now+0.25); o.stop(now+0.28);
}
function playWinChime(){
  const now = audioCtx.currentTime;
  const p = [440, 660, 880];
  p.forEach((freq,i)=>{
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type='sine'; o.frequency.value=freq; g.gain.value=0.0001; o.connect(g); g.connect(audioCtx.destination);
    o.start(now + i*0.08);
    g.gain.exponentialRampToValueAtTime(0.03, now + i*0.08 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i*0.08 + 0.9);
    o.stop(now + i*0.08 + 0.92);
  });
}

// unlock audio on first touch
document.body.addEventListener('touchstart', function unlockAudio(){
  if (audioCtx.state === 'suspended') audioCtx.resume();
  startBackgroundLoop();
  document.body.removeEventListener('touchstart', unlockAudio);
}, {passive:true});

// ---------- Hint / Level / Controls ----------
function showHint(){
  const path = findPath();
  if (!path) return;
  drawPathOverlayNow();
  setTimeout(()=>{ postUpdate(); }, 900);
  playSoftPing();
}
function resetLevel(idx){
  moves = 0; movesEl.textContent = `Moves: ${moves}`; statusEl.textContent = '';
  createInitialTilesForLevel(idx); renderGrid(); postUpdate();
}
function goToNextLevel(){
  currentLevel = Math.min(LEVELS.length-1, currentLevel+1);
  resetLevel(currentLevel);
}
document.getElementById('hintBtn').addEventListener('click', ()=> showHint());
document.getElementById('restartBtn').addEventListener('click', ()=> resetLevel(currentLevel));
document.getElementById('nextBtn').addEventListener('click', ()=> goToNextLevel());

// ---------- Initialization ----------
function init(){
  function resizeCanvases(){
    const rect = gridEl.getBoundingClientRect();
    pathCanvas.style.width = rect.width + 'px'; pathCanvas.style.height = rect.height + 'px';
    confettiCanvas.style.width = rect.width + 'px'; confettiCanvas.style.height = rect.height + 'px';
    pathCanvas.width = rect.width * DPR; pathCanvas.height = rect.height * DPR;
    confettiCanvas.width = rect.width * DPR; confettiCanvas.height = rect.height * DPR;
  }
  window.addEventListener('resize', ()=>{ resizeCanvases(); postUpdate(); });
  currentLevel = 0; resetLevel(currentLevel); resizeCanvases(); postUpdate();
}
init();

// ensure audio resume on desktop click too
document.body.addEventListener('click', function resume(){
  if (audioCtx.state === 'suspended') audioCtx.resume();
  startBackgroundLoop();
  document.body.removeEventListener('click', resume);
});
