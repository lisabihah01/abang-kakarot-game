/* Green Connect — interactive tap & drag path puzzle
   - Level1: 5x5 (start at (2,0) to (2,4))
   - Level2: 6x6 (more difficult)
   - Tap start then drag or tap adjacent cells to build path.
   - Place assets/background.mp3, assets/connect.mp3, assets/win.mp3
*/

const gridEl = document.getElementById('grid');
const pathCanvas = document.getElementById('pathCanvas');
const levelLabel = document.getElementById('levelLabel');
const timerLabel = document.getElementById('timer');

const bgAudio = new Audio('assets/background.mp3');
const connectAudio = new Audio('assets/connect.mp3');
const winAudio = new Audio('assets/win.mp3');
bgAudio.loop = true; bgAudio.volume = 0.9;
connectAudio.volume = 0.9; winAudio.volume = 1.0;

let levelIndex = 0; // 0 -> Level1, 1 -> Level2
const LEVELS = [
  { id: 1, cols:5, rows:5, start: {r:2,c:0}, goal:{r:2,c:4} },
  { id: 2, cols:6, rows:6, start: {r:2,c:0}, goal:{r:3,c:5} }
];

let cols=5, rows=5;
let cells = []; // DOM cells array
let activePath = []; // array of indices in order
let drawing = false;
let timerStart = 0;
let timerReq = null;
const ctx = pathCanvas.getContext('2d');
const DPR = Math.min(window.devicePixelRatio||1, 2);

// ---- Utilities ----
function idx(r,c){ return r*cols + c; }
function pos(index){ return { r: Math.floor(index/cols), c: index%cols }; }
function cellCenter(index){
  const gridRect = gridEl.getBoundingClientRect();
  const cellRect = cells[index].getBoundingClientRect();
  // coordinates relative to canvas (canvas is offset inside grid padding)
  const canvasRect = pathCanvas.getBoundingClientRect();
  const x = (cellRect.left + cellRect.width/2) - canvasRect.left;
  const y = (cellRect.top + cellRect.height/2) - canvasRect.top;
  return { x, y };
}
function areAdjacent(aIdx, bIdx){
  const a = pos(aIdx), b = pos(bIdx);
  const dr = Math.abs(a.r - b.r), dc = Math.abs(a.c - b.c);
  return (dr+dc) === 1;
}

// ---- Grid creation ----
function buildGrid(levelConf){
  // clear previous
  gridEl.innerHTML = '';
  cells = [];
  cols = levelConf.cols; rows = levelConf.rows;
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  // create cells
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.index = idx(r,c);
      // pointer events: use pointerdown/move/up for drag
      d.addEventListener('pointerdown', onPointerDown);
      d.addEventListener('pointerenter', onPointerEnter); // for drag-over detection
      gridEl.appendChild(d);
      cells.push(d);
    }
  }
  // place start & goal
  const s = levelConf.start, g = levelConf.goal;
  const sIdx = idx(s.r,s.c), gIdx = idx(g.r,g.c);
  cells[sIdx].classList.add('start'); cells[sIdx].textContent='🚗';
  cells[gIdx].classList.add('end'); cells[gIdx].textContent='🏁';

  // resize canvas to grid inner size
  resizeCanvas();
}

// ---- Canvas resize ----
function resizeCanvas(){
  const rect = gridEl.getBoundingClientRect();
  pathCanvas.style.left = '8px'; pathCanvas.style.top = '8px';
  pathCanvas.width = rect.width * DPR - (16 * DPR);
  pathCanvas.height = rect.height * DPR - (16 * DPR);
  pathCanvas.style.width = `${rect.width - 16}px`;
  pathCanvas.style.height = `${rect.height - 16}px`;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  redrawPath();
}

// ---- Pointer events (tap & drag) ----
let pointerDown = false;
function onPointerDown(e){
  e.preventDefault();
  const idxNum = Number(this.dataset.index);
  const levelConf = LEVELS[levelIndex];
  const startIdx = idx(levelConf.start.r, levelConf.start.c);
  // start only if pointerdown on start cell OR if already drawing and adjacent allowed
  if (idxNum === startIdx){
    startDrawing(idxNum);
  } else if (drawing){
    // allow tap to add if adjacent
    tryAddToPath(idxNum);
  } else {
    // if autoplay blocked, start audio on first user interaction
    tryStartAudio();
  }
  pointerDown = true;
}
function onPointerEnter(e){
  if (!pointerDown) return;
  const idxNum = Number(this.dataset.index);
  if (drawing){
    tryAddToPath(idxNum);
  }
}
window.addEventListener('pointerup', (e)=>{
  pointerDown = false;
  // end drawing if needed
  // we keep drawing false only if last is goal
  // otherwise user can lift and continue again from start
});

// ---- Drawing helpers ----
function startDrawing(startIdx){
  // reset previous active cells (colors) if new attempt
  clearActive();
  activePath = [startIdx];
  cells[startIdx].classList.add('active');
  drawing = true;
  playConnect();
  // ensure audio started
  tryStartAudio();
}
function tryAddToPath(nextIdx){
  if (!drawing) return;
  const last = activePath[activePath.length-1];
  // only add if adjacent and not already in path (prevent cycles)
  if (!areAdjacent(last, nextIdx)) return;
  if (activePath.includes(nextIdx)) return;
  activePath.push(nextIdx);
  cells[nextIdx].classList.add('active');
  playConnect();
  redrawPath();
  checkGoalReached();
}
function clearActive(){
  cells.forEach(c=>c.classList.remove('active'));
  activePath = [];
  clearCanvas();
}
function playConnect(){
  try { connectAudio.currentTime = 0; connectAudio.play(); } catch(e){}
}
function tryStartAudio(){
  if (bgAudio.paused){
    bgAudio.play().catch(()=>{/* blocked */});
  }
}

// ---- Path drawing on canvas (neon pulsing) ----
let animReq = null;
let pulseT = 0;
function redrawPath(){
  // start animation loop if path exists
  if (activePath.length >= 2 && !animReq){
    animReq = requestAnimationFrame(animatePath);
  } else if (activePath.length < 2 && animReq){
    cancelAnimationFrame(animReq); animReq = null; clearCanvas();
  } else {
    // just draw static once
    drawPathFrame(pulseT);
  }
}
function clearCanvas(){
  ctx.clearRect(0,0,pathCanvas.width, pathCanvas.height);
}
function animatePath(t){
  pulseT = t * 0.001;
  drawPathFrame(pulseT);
  animReq = requestAnimationFrame(animatePath);
}
function drawPathFrame(t){
  clearCanvas();
  if (activePath.length < 2) return;
  const centers = activePath.map(i => cellCenter(i));
  // broad glow
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(centers[0].x, centers[0].y);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].x, centers[i].y);
  const pulse = (Math.sin(t*3)+1)/2;
  ctx.strokeStyle = `rgba(0,255,128,${0.06 + pulse*0.08})`;
  ctx.lineWidth = 18 + pulse*6;
  ctx.stroke();
  // inner glow
  ctx.beginPath();
  ctx.moveTo(centers[0].x, centers[0].y);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].x, centers[i].y);
  ctx.strokeStyle = `rgba(0,255,128,${0.34 + pulse*0.25})`;
  ctx.lineWidth = 8 + pulse*4;
  ctx.stroke();
  // core
  ctx.beginPath();
  ctx.moveTo(centers[0].x, centers[0].y);
  for (let i=1;i<centers.length;i++) ctx.lineTo(centers[i].x, centers[i].y);
  ctx.strokeStyle = '#bfffd8';
  ctx.lineWidth = 3;
  ctx.stroke();
  // moving dots
  const total = centers.length;
  const tflow = (t * 1.2) % total;
  for (let k=0;k<3;k++){
    const pos = (tflow + k*0.9) % total;
    const i0 = Math.floor(pos), i1 = Math.min(i0+1, centers.length-1);
    const f = pos - i0;
    const x = centers[i0].x*(1-f) + centers[i1].x*f;
    const y = centers[i0].y*(1-f) + centers[i1].y*f;
    ctx.beginPath();
    ctx.fillStyle = `rgba(191,255,216,${0.95 - k*0.25})`;
    ctx.arc(x,y,5-k,0,Math.PI*2);
    ctx.fill();
  }
  // small dots at centers
  for (let c of centers){
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,255,128,0.9)';
    ctx.arc(c.x, c.y, 3, 0, Math.PI*2);
    ctx.fill();
  }
}

// ---- Goal detection & win ----
function checkGoalReached(){
  const levelConf = LEVELS[levelIndex];
  const goalIndex = idx(levelConf.goal.r, levelConf.goal.c);
  if (activePath[activePath.length-1] === goalIndex){
    // win!
    handleWin();
  }
}
let didWin = false;
function handleWin(){
  if (didWin) return;
  didWin = true;
  try { winAudio.currentTime = 0; winAudio.play(); } catch(e){}
  // confetti
  confetti({
    particleCount: 220,
    spread: 140,
    origin: { y: 0.6 }
  });
  // overlay
  const overlay = document.createElement('div');
  overlay.className = 'winOverlay';
  overlay.innerHTML = `
    <div class="winCard">
      <div class="winTitle">You Win Abang Kakaort! ❤️</div>
      <div style="color:#bfe; margin-top:6px">Level ${LEVELS[levelIndex].id} complete.</div>
      <div style="height:10px"></div>
      <button class="winBtn" id="nextBtn">Next Level</button>
    </div>`;
  document.querySelector('.game-area').appendChild(overlay);
  document.getElementById('nextBtn').addEventListener('click', ()=>{
    overlay.remove();
    nextLevel();
  });
}

// ---- Level flow ----
function startLevel(idxLevel){
  levelIndex = idxLevel;
  const conf = LEVELS[levelIndex];
  levelLabel.textContent = `Level ${conf.id}`;
  // build grid & reset
  didWin = false; drawing = false; activePath = [];
  buildGrid(conf);
  clearCanvas();
  // timer
  cancelAnimationFrame(timerReq);
  timerStart = performance.now();
  updateTimer();
  // ensure audio
  tryStartAudio();
}
function nextLevel(){
  const next = Math.min(LEVELS.length-1, levelIndex+1);
  startLevel(next);
}
function updateTimer(){
  const now = performance.now();
  const sec = Math.floor((now - timerStart)/1000);
  const mm = String(Math.floor(sec/60)).padStart(2,'0');
  const ss = String(sec%60).padStart(2,'0');
  timerLabel.textContent = `${mm}:${ss}`;
  timerReq = requestAnimationFrame(updateTimer);
}

// ---- Init & events ----
window.addEventListener('resize', ()=> resizeCanvas());
window.addEventListener('load', ()=>{
  // try autoplay; browsers may block — we also start on first user interaction
  bgAudio.play().catch(()=>{/*blocked until user interacts*/});
  startLevel(0);
});
// make sure first touch/click resumes audio
document.addEventListener('pointerdown', function onceStartAudio(){
  try { bgAudio.play(); } catch(e){}
  document.removeEventListener('pointerdown', onceStartAudio);
}, {passive:true});
