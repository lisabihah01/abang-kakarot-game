/* Neon Path Puzzle — Drag swap tiles to connect Start -> Goal
   - 5x5 grid
   - Tiles have connectors: up,right,down,left (boolean array)
   - Drag one tile onto another to swap positions
   - BFS connectivity check from Start -> Goal following connectors
   - Futuristic neon visuals drawn with inline SVG
   - Confetti + overlay with message "You Win Abang Kakaort!"
*/

// ---- Config ----
const SIZE = 5;
const gridEl = document.getElementById('grid');
const movesEl = document.getElementById('moves');
const statusEl = document.getElementById('status');
const confettiCanvas = document.getElementById('confettiCanvas');
const DPR = Math.min(window.devicePixelRatio || 1, 2);

let moves = 0;
let tiles = []; // array of tile objects with connectors
let startPos = {r: 2, c: 0}; // left middle
let goalPos  = {r: 2, c: SIZE - 1}; // right middle
let draggingEl = null;
let dragIndex = null;

// Tile types definitions (connectors: [up,right,down,left])
// We'll include a variety: straight H, straight V, corner, T, cross
const TYPES = [
  {name:'hor', conn:[0,1,0,1]},   // horizontal
  {name:'ver', conn:[1,0,1,0]},   // vertical
  {name:'tl', conn:[1,1,0,0]},    // top-right corner
  {name:'tr', conn:[1,0,0,1]},    // top-left corner (mirrored)
  {name:'br', conn:[0,0,1,1]},    // bottom-left corner
  {name:'bl', conn:[0,1,1,0]},    // bottom-right corner
  {name:'t', conn:[1,1,1,0]},     // T left
  {name:'r', conn:[1,1,1,1]},     // cross (all) (less frequent)
];

// Helper: deep copy connectors
function copyConn(conn){ return conn.slice(); }

// ---- Create grid and randomize puzzle ----
function createInitialTiles() {
  tiles = [];
  for (let r=0;r<SIZE;r++){
    for (let c=0;c<SIZE;c++){
      // Random tile type biased: more straights & corners; less T/cross
      const pick = weightedPick();
      const rot = Math.floor(Math.random()*4); // rotate 0..3 times
      tiles.push(makeTileFromType(pick, rot));
    }
  }

  // Ensure start and goal have connector pointing inward
  const startIndex = posToIndex(startPos.r, startPos.c);
  const goalIndex = posToIndex(goalPos.r, goalPos.c);
  // Force start to have right connector
  tiles[startIndex] = ensureConnector(tiles[startIndex], 1); // right
  tiles[goalIndex]  = ensureConnector(tiles[goalIndex], 3); // left

  // Shuffle tiles a bit except keep start/goal roughly in place?
  // We want puzzle scrambled: perform many random swaps
  for (let i=0;i<150;i++){
    const a = Math.floor(Math.random()*tiles.length);
    const b = Math.floor(Math.random()*tiles.length);
    swapTiles(a,b,false);
  }
}

// Weighted pick for tile type index
function weightedPick(){
  // indices: 0..TYPES.length-1
  // weights: straights & corners common, T & cross rare
  const weights = [18,18,12,12,12,12,6,2];
  const sum = weights.reduce((s,x)=>s+x,0);
  let v = Math.random()*sum;
  for (let i=0;i<weights.length;i++){
    if (v < weights[i]) return i;
    v -= weights[i];
  }
  return 0;
}

function makeTileFromType(typeIndex, rot) {
  const base = TYPES[typeIndex];
  // rotate connectors clockwise rot times
  let conn = base.conn.slice();
  for (let k=0;k<rot;k++){
    conn = [conn[3], conn[0], conn[1], conn[2]];
  }
  return {conn, id: cryptoRandomId()};
}

function cryptoRandomId(){ return Math.random().toString(36).slice(2,9); }

// Ensure connector at direction dir (0:up,1:right,2:down,3:left)
function ensureConnector(tile, dir){
  if (tile.conn[dir]) return tile;
  // rotate until connector exists (max 3 rotates)
  const t = {conn: tile.conn.slice(), id: tile.id};
  for (let i=0;i<3;i++){
    t.conn = [t.conn[3], t.conn[0], t.conn[1], t.conn[2]];
    if (t.conn[dir]) return t;
  }
  // if still not, replace with horizontal and rotate
  const newTile = makeTileFromType(0, dir === 1 || dir === 3 ? 0 : 1);
  return newTile;
}

function posToIndex(r,c){ return r*SIZE + c; }
function indexToPos(i){ return {r: Math.floor(i/SIZE), c: i%SIZE}; }

// Swap tiles in array and optionally update DOM
function swapTiles(a,b,updateDom=true){
  const tmp = tiles[a]; tiles[a]=tiles[b]; tiles[b]=tmp;
  if (updateDom) renderGrid();
}

// ---- Render grid DOM ----
function renderGrid(){
  gridEl.innerHTML = '';
  const rect = gridEl.getBoundingClientRect();
  // Create tile elements
  tiles.forEach((tile, idx)=>{
    const cell = document.createElement('div');
    cell.className = 'tile';
    // mark start/goal
    const pos = indexToPos(idx);
    if (pos.r === startPos.r && pos.c === startPos.c) cell.classList.add('start');
    if (pos.r === goalPos.r  && pos.c === goalPos.c) cell.classList.add('goal');

    cell.setAttribute('draggable', 'false');
    cell.dataset.index = idx;

    // Create inline SVG to draw connectors neon style
    const svgns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgns, 'svg');
    svg.setAttribute('viewBox','0 0 100 100');
    svg.setAttribute('width','80%');
    svg.setAttribute('height','80%');

    // Draw background faint circuit
    const bgRect = document.createElementNS(svgns,'rect');
    bgRect.setAttribute('x',2); bgRect.setAttribute('y',2);
    bgRect.setAttribute('width',96); bgRect.setAttribute('height',96);
    bgRect.setAttribute('rx',8);
    bgRect.setAttribute('fill','none');
    svg.appendChild(bgRect);

    // For connectors, draw 4 possible pipes
    const conn = tile.conn;
    // center circle
    const center = document.createElementNS(svgns,'circle');
    center.setAttribute('cx',50); center.setAttribute('cy',50); center.setAttribute('r',10);
    center.setAttribute('fill','none');
    center.setAttribute('stroke','rgba(58,224,255,0.9)');
    center.setAttribute('stroke-width','8');
    center.setAttribute('class','pipe');
    svg.appendChild(center);

    // helper to draw line to direction
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
      // inner glow for neon gradient
      const glow = document.createElementNS(svgns,'path');
      glow.setAttribute('d', d);
      glow.setAttribute('stroke','rgba(182,109,255,0.45)');
      glow.setAttribute('stroke-width','4');
      glow.setAttribute('fill','none');
      glow.setAttribute('filter','');
      svg.appendChild(glow);
    }

    if (conn[0]) drawLine(0,-1);
    if (conn[1]) drawLine(1,0);
    if (conn[2]) drawLine(0,1);
    if (conn[3]) drawLine(-1,0);

    // If start or goal, draw marker
    if (cell.classList.contains('start')){
      const s = document.createElementNS(svgns,'circle');
      s.setAttribute('cx',50); s.setAttribute('cy',50); s.setAttribute('r',6);
      s.setAttribute('fill','rgba(58,224,255,0.95)');
      svg.appendChild(s);
    }
    if (cell.classList.contains('goal')){
      const g = document.createElementNS(svgns,'rect');
      g.setAttribute('x',44); g.setAttribute('y',44); g.setAttribute('width',12); g.setAttribute('height',12);
      g.setAttribute('rx',2);
      g.setAttribute('fill','rgba(182,109,255,0.95)');
      svg.appendChild(g);
    }

    cell.appendChild(svg);
    gridEl.appendChild(cell);

    // Events for drag-swap (mouse & touch)
    makeDraggable(cell);
  });
  movesEl.textContent = `Moves: ${moves}`;
}

// ---- Drag & Swap Implementation ----
function makeDraggable(el){
  let startX=0, startY=0, dragging=false;
  const idx = Number(el.dataset.index);

  // Touch
  el.addEventListener('touchstart', (ev)=>{
    ev.stopPropagation(); ev.preventDefault();
    startDrag(ev.touches[0].clientX, ev.touches[0].clientY, el);
  }, {passive:false});

  el.addEventListener('touchmove', (ev)=>{
    ev.stopPropagation(); ev.preventDefault();
    continueDrag(ev.touches[0].clientX, ev.touches[0].clientY, el);
  }, {passive:false});

  el.addEventListener('touchend', (ev)=>{
    ev.stopPropagation(); ev.preventDefault();
    endDrag(ev.changedTouches[0].clientX, ev.changedTouches[0].clientY, el);
  }, {passive:false});

  // Mouse fallback
  el.addEventListener('mousedown', (ev)=>{
    startDrag(ev.clientX, ev.clientY, el);
  });
  window.addEventListener('mousemove', (ev)=>{
    if (draggingEl) continueDrag(ev.clientX, ev.clientY, draggingEl);
  });
  window.addEventListener('mouseup', (ev)=>{
    if (draggingEl) endDrag(ev.clientX, ev.clientY, draggingEl);
  });

  function startDrag(x,y,elRef){
    draggingEl = elRef;
    dragIndex = Number(elRef.dataset.index);
    elRef.classList.add('dragging');
    elRef.style.zIndex = 20;
    startX = x; startY = y;
  }

  function continueDrag(x,y,elRef){
    if (!draggingEl) return;
    const dx = x - startX, dy = y - startY;
    elRef.style.transform = `translate(${dx}px, ${dy}px) scale(1.02)`;
  }

  function endDrag(x,y,elRef){
    if (!draggingEl) return;
    // find target element under pointer
    elRef.classList.remove('dragging');
    elRef.style.zIndex = '';
    elRef.style.transform = '';
    const target = document.elementFromPoint(x, y);
    // find tile parent if inside
    const targetTile = target && target.closest && target.closest('.tile');
    if (targetTile && targetTile !== elRef){
      const a = Number(elRef.dataset.index);
      const b = Number(targetTile.dataset.index);
      swapTiles(a,b,true);
      moves += 1;
      movesEl.textContent = `Moves: ${moves}`;
      // check win
      if (checkWin()) triggerWin();
    }
    draggingEl = null;
    dragIndex = null;
  }
}

// ---- Connectivity Check (BFS) ----
function checkWin(){
  // BFS from start; follow connectors that match between adjacent tiles
  const visited = new Array(SIZE*SIZE).fill(false);
  const q = [];
  const startIdx = posToIndex(startPos.r, startPos.c);
  const goalIdx = posToIndex(goalPos.r, goalPos.c);
  q.push(startIdx); visited[startIdx] = true;

  while(q.length){
    const cur = q.shift();
    if (cur === goalIdx) return true;
    const p = indexToPos(cur);
    const tile = tiles[cur];
    // check 4 directions
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
      if (!tile.conn[d.dirIdx]) continue; // current must have connector to that dir
      if (!neighbor.conn[d.opp]) continue; // neighbor must have opposite connector
      if (visited[nidx]) continue;
      visited[nidx] = true;
      q.push(nidx);
    }
  }
  return false;
}

// ---- Win Trigger: Confetti + Overlay ----
let confettiParticles = [];
let confettiRunning = false;
function triggerWin(){
  statusEl.textContent = 'Connected!';
  showWinOverlay();
  startConfetti();
}

function showWinOverlay(){
  // Create overlay element
  const overlay = document.createElement('div');
  overlay.className = 'winOverlay';
  overlay.innerHTML = `
    <div class="winCard">
      <div class="winTitle">You Win Abang Kakaort! ❤️</div>
      <div style="color:#bfe;opacity:.95">Great job — puzzle complete.</div>
      <button class="winBtn" id="replayBtn">Play Again</button>
    </div>
  `;
  document.querySelector('.game-area').appendChild(overlay);
  document.getElementById('replayBtn').addEventListener('click', ()=>{
    overlay.remove();
    stopConfetti();
    resetGame();
  });
}

// Confetti simple particle system
function startConfetti(){
  if (confettiRunning) return;
  confettiRunning = true;
  const canvas = confettiCanvas;
  canvas.width = canvas.clientWidth * DPR;
  canvas.height = canvas.clientHeight * DPR;
  const ctx = canvas.getContext('2d');
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
      // draw rectangle with rotation
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
function randomColor(){
  const palette = ['#3ae0ff','#6ff','#b66dff','#8be','#4df6a5','#ffd166'];
  return palette[Math.floor(Math.random()*palette.length)];
}

// ---- Reset & Start ----
function resetGame(){
  moves = 0;
  statusEl.textContent = '';
  createInitialTiles();
  renderGrid();
  movesEl.textContent = `Moves: ${moves}`;
}

window.addEventListener('resize', ()=>{
  // resize confetti canvas
  confettiCanvas.width = confettiCanvas.clientWidth * DPR;
  confettiCanvas.height = confettiCanvas.clientHeight * DPR;
});
createInitialTiles();
renderGrid();
window.dispatchEvent(new Event('resize'));
