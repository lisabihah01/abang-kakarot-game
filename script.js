/* Neon Path Puzzle with live neon path, 2 levels, sound, confetti, and car emoji markers.
   Drag-swap tiles (5x5). Level 2 is harder (more scramble).
*/

// ---- Config & DOM ----
const SIZE = 5;
const gridEl = document.getElementById('grid');
const movesEl = document.getElementById('moves');
const statusEl = document.getElementById('status');
const levelEl = document.getElementById('level');
const confettiCanvas = document.getElementById('confettiCanvas');
const pathCanvas = document.getElementById('pathCanvas');

const DPR = Math.min(window.devicePixelRatio || 1, 2);

// sound: WebAudio context
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// levels config
const LEVELS = [
  { id: 1, swaps: 150, weightsFactor: 1.0 }, // easy
  { id: 2, swaps: 320, weightsFactor: 1.6 }  // harder: more scrambled
];
let currentLevel = 0; // index in LEVELS

let moves = 0;
let tiles = [];
let startPos = { r: 2, c: 0 };
let goalPos = { r: 2, c: SIZE - 1 };
let draggingEl = null;
let dragIndex = null;
let confettiRunning = false;
let confettiParticles = [];

// tile types (connectors: up,right,down,left)
const TYPES = [
  {name:'hor', conn:[0,1,0,1]},   // horizontal
  {name:'ver', conn:[1,0,1,0]},   // vertical
  {name:'tl', conn:[1,1,0,0]},    // top-right corner
  {name:'tr', conn:[1,0,0,1]},    // top-left corner (mirrored)
  {name:'br', conn:[0,0,1,1]},    // bottom-left corner
  {name:'bl', conn:[0,1,1,0]},    // bottom-right corner
  {name:'t', conn:[1,1,1,0]},     // T left
  {name:'x', conn:[1,1,1,1]},     // cross (all)
];

// ---- Helpers ----
function posToIndex(r,c){ return r*SIZE + c; }
function indexToPos(i){ return { r: Math.floor(i/SIZE), c: i % SIZE }; }
function copyConn(conn){ return conn.slice(); }
function cryptoRandomId(){ return Math.random().toString(36).slice(2,9); }

// Weighted pick using level difficulty factor
function weightedPick(levelFactor){
  const baseWeights = [18,18,12,12,12,12,6,2]; // correspond TYPES
  const weights = baseWeights.map(w => Math.max(1, Math.floor(w / levelFactor)));
  const sum = weights.reduce((s,x)=>s+x,0);
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
  for (let k=0;k<rot;k++){
    conn = [conn[3], conn[0], conn[1], conn[2]];
  }
  return { conn, id: cryptoRandomId() };
}
function ensureConnector(tile, dir){
  if (tile.conn[dir]) return tile;
  const t = { conn: tile.conn.slice(), id: tile.id };
  for (let i=0;i<3;i++){
    t.conn = [t.conn[3], t.conn[0], t.conn[1], t.conn[2]];
    if (t.conn[dir]) return t;
  }
  // fallback: create horizontal then rotate to prefer direction
  const newTile = makeTileFromType(0, dir === 1 || dir === 3 ? 0 : 1);
  return newTile;
}

// ---- Create initial tiles & scramble per level ----
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
  // Force start & goal connectors inward
  const sIdx = posToIndex(startPos.r, startPos.c);
  const gIdx = posToIndex(goalPos.r, goalPos.c);
  tiles[sIdx] = ensureConnector(tiles[sIdx], 1); // right
  tiles[gIdx] = ensureConnector(tiles[gIdx], 3); // left

  // perform many swaps based on cfg.swaps
  for (let i=0;i<cfg.swaps;i++){
    const a = Math.floor(Math.random()*tiles.length);
    const b = Math.floor(Math.random()*tiles.length);
    swapTiles(a,b,false);
  }
}

// swap and optionally re-render
function swapTiles(a,b,updateDom=true){
  const tmp = tiles[a]; tiles[a] = tiles[b]; tiles[b] = tmp;
  if (updateDom) {
    renderGrid();
    postUpdate(); // recompute path + draw
  }
}

// ---- Render grid DOM ----
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
    const svg = document.createElementNS(svgns, 'svg');
    svg.setAttribute('viewBox','0 0 100 100');
    svg.setAttribute('width','80%');
    svg.setAttribute('height','80%');

    // center neon circle
    const center = document.createElementNS(svgns,'circle');
    center.setAttribute('cx',50); center.setAttribute('cy',50); center.setAttribute('r',10);
    center.setAttribute('fill','none');
    center.setAttribute('stroke','rgba(58,224,255,0.95)');
    center.setAttribute('stroke-width','8');
    center.setAttribute('class','pipe');
    svg.appendChild(center);

    const conn = tile.conn;
    function drawLine(dx,dy){
      const line = document.createElementNS(svgns,'path');
      const x2 = 50 + dx*40; const y2 = 50 + dy*40;
      const d = `M ${50+dx*10} ${50+dy*10} L ${x2} ${y2}`;
      line.setAttribute('d', d);
      line.setAttribute('stroke','rgba(58,224,255,0.95)');
      line.setAttribute('stroke-width','10');
      line.setAttribute('fill','none');
      line.setAttribute('class','pipe');
      svg.appendChild(line);
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

    // start/goal emoji overlay
    if (cell.classList.contains('start')){
      const m = document.createElement('div'); m.className='marker'; m.textContent='🚗';
      cell.appendChild(m);
    }
    if (cell.classList.contains('goal')){
      const m = document.createElement('div'); m.className='marker'; m.textContent='🚗';
      cell.appendChild(m);
    }

    cell.appendChild(svg);
    gridEl.appendChild(cell);
    makeDraggable(cell);
  }
  movesEl.textContent = `Moves: ${moves}`;
  levelEl.textContent = `Level: ${LEVELS[currentLevel].id}`;
}

// ---- Drag & Swap (touch & mouse) ----
function makeDraggable(el){
  let startX=0, startY=0;
  el.addEventListener('touchstart', (ev)=>{ ev.stopPropagation(); ev.preventDefault(); startDrag(ev.touches[0].clientX, ev.touches[0].clientY, el); }, {passive:false});
  el.addEventListener('touchmove', (ev)=>{ ev.stopPropagation(); ev.preventDefault(); continueDrag(ev.touches[0].clientX, ev.touches[0].clientY, el); }, {passive:false});
  el.addEventListener('touchend', (ev)=>{ ev.stopPropagation(); ev.preventDefault(); endDrag(ev.changedTouches[0].clientX, ev.changedTouches[0].clientY, el); }, {passive:false});
  el.addEventListener('mousedown', (ev)=>{ startDrag(ev.clientX, ev.clientY, el); });
  window.addEventListener('mousemove', (ev)=>{ if (draggingEl) continueDrag(ev.clientX, ev.clientY, draggingEl); });
  window.addEventListener('mouseup', (ev)=>{ if (draggingEl) endDrag(ev.clientX, ev.clientY, draggingEl); });

  function startDrag(x,y,elRef){
    draggingEl = elRef;
    dragIndex = Number(elRef.dataset.index);
    elRef.classList.add('dragging');
    elRef.style.zIndex = 20;
    startX = x; startY = y;
    playPing(); // sound feedback
  }
  function continueDrag(x,y,elRef){
    if (!draggingEl) return;
    const dx = x - startX, dy = y - startY;
    elRef.style.transform = `translate(${dx}px, ${dy}px) scale(1.02)`;
  }
  function endDrag(x,y,elRef){
    if (!draggingEl) return;
    elRef.classList.remove('dragging');
    elRef.style.zIndex = '';
    elRef.style.transform = '';
    const target = document.elementFromPoint(x, y);
    const targetTile = target && target.closest && target.closest('.tile');
    if (targetTile && targetTile !== elRef){
      const a = Number(elRef.dataset.index);
      const b = Number(targetTile.dataset.index);
      swapTiles(a,b,true);
      moves += 1;
      movesEl.textContent = `Moves: ${moves}`;
      playPing();
      postUpdate();
    }
    draggingEl = null;
    dragIndex = null;
  }
}

// ---- Connectivity BFS with path reconstruction ----
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
      visited[nidx] = true;
      prev[nidx] = cur;
      q.push(nidx);
    }
  }
  // if goal visited, reconstruct path
  const goalIdxVisited = visited[posToIndex(goalPos.r, goalPos.c)];
  if (!goalIdxVisited) return null;
  const path = [];
  let cur = posToIndex(goalPos.r, goalPos.c);
  while(cur !== -1){
    path.push(cur);
    if (cur === posToIndex(startPos.r, startPos.c)) break;
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

// ---- Draw neon path overlay in real-time ----
function drawPathOverlay(path){
  const canvas = pathCanvas;
  const ctx = canvas.getContext('2d');
  const rect = gridEl.getBoundingClientRect();
  canvas.width = rect.width * DPR;
  canvas.height = rect.height * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0,0,rect.width,rect.height);
  if (!path || path.length < 2) return;

  // compute centers of each tile
  const cellW = rect.width / SIZE, cellH = rect.height / SIZE;
  const centers = path.map(idx => {
    const p = indexToPos(idx);
    const cx = p.c * cellW + cellW/2;
    const cy = p.r * cellH + cellH/2;
    return {cx, cy};
  });

  // draw glow line
  ctx.lineCap = 'round';
  // broad glow
  ctx.strokeStyle = 'rgba(58,224,255,0.08)';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(centers[0].cx, centers[0].cy);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].cx, centers[i].cy);
  ctx.stroke();

  // inner glow
  ctx.strokeStyle = 'rgba(58,224,255,0.45)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(centers[0].cx, centers[0].cy);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].cx, centers[i].cy);
  ctx.stroke();

  // core bright line
  ctx.strokeStyle = '#AFFFFF';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centers[0].cx, centers[0].cy);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].cx, centers[i].cy);
  ctx.stroke();

  // little pulse circles
  for (let i=0;i<centers.length;i++){
    ctx.beginPath();
    ctx.fillStyle = 'rgba(58,224,255,0.9)';
    ctx.arc(centers[i].cx, centers[i].cy, 4, 0, Math.PI*2);
    ctx.fill();
  }
}

// ---- Post-update: recompute path, draw overlay, check win ----
function postUpdate(){
  const path = findPath();
  drawPathOverlay(path);
  if (path && path.length > 0){
    statusEl.textContent = 'Path active';
    playSoftPing();
  } else {
    statusEl.textContent = '';
  }
  if (path && path[path.length-1] === posToIndex(goalPos.r, goalPos.c)) {
    // complete
    triggerWin();
  }
}

// ---- Win: overlay + confetti + chime ----
function triggerWin(){
  // show overlay
  const overlay = document.createElement('div');
  overlay.className = 'winOverlay';
  overlay.innerHTML = `
    <div class="winCard">
      <div class="winTitle">You Win Abang Kakaort! ❤️</div>
      <div style="color:#bfe;opacity:.95">Sweet — level ${LEVELS[currentLevel].id} complete.</div>
      <div style="height:8px"></div>
      <button class="winBtn" id="replayBtn">Replay</button>
      <button class="winBtn" id="nextLevelBtn" style="margin-left:10px">Next Level</button>
    </div>
  `;
  document.querySelector('.game-area').appendChild(overlay);
  document.getElementById('replayBtn').addEventListener('click', ()=>{
    overlay.remove();
    stopConfetti();
    resetLevel(currentLevel);
  });
  document.getElementById('nextLevelBtn').addEventListener('click', ()=>{
    overlay.remove();
    stopConfetti();
    goToNextLevel();
  });

  startConfetti();
  playWinChime();
}

// ---- Confetti (same approach as before) ----
function startConfetti(){
  if (confettiRunning) return;
  confettiRunning = true;
  const canvas = confettiCanvas;
  const rect = gridEl.getBoundingClientRect();
  canvas.width = rect.width * DPR;
  canvas.height = rect.height * DPR;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  confettiParticles = [];
  for (let i=0;i<120;i++){
    confettiParticles.push({
      x: Math.random()*canvas.width,
      y: Math.random()*-canvas.height,
      vx: (Math.random()-0.5)*3,
      vy: 2 + Math.random()*4,
      size: 6 + Math.random()*8,
      rot: Math.random()*360,
      speedRot: (Math.random()-0.5)*6,
      color: randomColor()
    });
  }
  let last = performance.now();
  function frame(t){
    const dt = t - last; last = t;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (const p of confettiParticles){
      p.x += p.vx * (dt/16);
      p.y += p.vy * (dt/16);
      p.rot += p.speedRot * (dt/16);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI/180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
      ctx.restore();
      if (p.y > canvas.height + 40){
        p.y = Math.random()*-canvas.height;
        p.x = Math.random()*canvas.width;
      }
    }
    if (confettiRunning) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
function stopConfetti(){ confettiRunning = false; confettiParticles = []; const ctx = confettiCanvas.getContext('2d'); ctx && ctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height); }
function randomColor(){ const palette = ['#3ae0ff','#b66dff','#8be','#4df6a5','#ffd166','#9ff']; return palette[Math.floor(Math.random()*palette.length)]; }

// ---- Sound helpers ----
function playPing(){
  // short click
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.value = 700;
  g.gain.value = 0.0001;
  o.connect(g); g.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  o.start(now);
  g.gain.exponentialRampToValueAtTime(0.02, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  o.stop(now + 0.14);
}
function playSoftPing(){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'triangle';
  o.frequency.value = 420;
  g.gain.value = 0.0001;
  o.connect(g); g.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  o.start(now);
  g.gain.exponentialRampToValueAtTime(0.012, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  o.stop(now + 0.28);
}
function playWinChime(){
  // simple arpeggio
  const now = audioCtx.currentTime;
  const o1 = audioCtx.createOscillator();
  const g1 = audioCtx.createGain();
  o1.type = 'sine'; o1.frequency.value = 440;
  o1.connect(g1); g1.connect(audioCtx.destination);
  g1.gain.value = 0.0001;
  o1.start(now);
  g1.gain.exponentialRampToValueAtTime(0.025, now + 0.02);
  g1.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
  o1.stop(now + 1.12);

  const o2 = audioCtx.createOscillator();
  const g2 = audioCtx.createGain();
  o2.type = 'sine'; o2.frequency.value = 660;
  o2.connect(g2); g2.connect(audioCtx.destination);
  g2.gain.value = 0.0001;
  o2.start(now + 0.06);
  g2.gain.exponentialRampToValueAtTime(0.02, now + 0.08);
  g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  o2.stop(now + 0.92);
}

// ---- Hint: briefly show path if exists ----
function showHint(){
  const path = findPath();
  if (!path) return;
  // flash overlay with thicker neon for 900ms
  const canvas = pathCanvas; const ctx = canvas.getContext('2d');
  const rect = gridEl.getBoundingClientRect(); canvas.width = rect.width * DPR; canvas.height = rect.height * DPR; ctx.setTransform(DPR,0,0,DPR,0,0);
  // draw once bright then fade
  drawPathOverlay(path);
  setTimeout(()=>{ drawPathOverlay(path); }, 0);
  setTimeout(()=>{ postUpdate(); }, 900);
  playSoftPing();
}

// ---- Level & reset control ----
function resetLevel(idx){
  moves = 0;
  movesEl.textContent = `Moves: ${moves}`;
  statusEl.textContent = '';
  createInitialTilesForLevel(idx);
  renderGrid();
  postUpdate();
}
function goToNextLevel(){
  currentLevel = Math.min(LEVELS.length-1, currentLevel+1);
  resetLevel(currentLevel);
  document.getElementById('nextBtn').style.display = 'none';
}

// ---- UI buttons
document.getElementById('hintBtn').addEventListener('click', ()=> showHint());
document.getElementById('restartBtn').addEventListener('click', ()=> resetLevel(currentLevel));
document.getElementById('nextBtn').addEventListener('click', ()=> goToNextLevel());

// ---- Initialization ----
function init(){
  // size overlay canvases to grid
  function resizeCanvases(){
    const rect = gridEl.getBoundingClientRect();
    pathCanvas.style.width = rect.width + 'px'; pathCanvas.style.height = rect.height + 'px';
    confettiCanvas.style.width = rect.width + 'px'; confettiCanvas.style.height = rect.height + 'px';
    pathCanvas.width = rect.width * DPR; pathCanvas.height = rect.height * DPR;
    confettiCanvas.width = rect.width * DPR; confettiCanvas.height = rect.height * DPR;
  }
  window.addEventListener('resize', ()=>{ resizeCanvases(); postUpdate(); });
  // start at level 0
  currentLevel = 0;
  resetLevel(currentLevel);
  resizeCanvases();
  // initial draw
  postUpdate();
}

// ---- Kick off ----
init();

// ensure audio context unlock on first touch (mobile browsers)
document.body.addEventListener('touchstart', function resumeAudio(){
  if (audioCtx.state === 'suspended') audioCtx.resume();
  document.body.removeEventListener('touchstart', resumeAudio);
});
