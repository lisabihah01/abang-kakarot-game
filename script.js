/* Zombie Station — Mobile
   Controls:
   - Swipe (drag) horizontally on canvas to move player left/right
   - Tap canvas to shoot. Also use FIRE button.
   - Left/Right buttons provided too.
*/

// ---- Setup & responsive canvas scaling ----
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  // Make canvas pixel size match displayed size (handle DPR)
  const rect = canvas.getBoundingClientRect();
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * DPR);
  canvas.height = Math.round(rect.height * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---- Game state ----
let score = 0;
let hp = 100;
let gameOver = false;
let lastSpawn = 0;
let spawnInterval = 1200; // ms
let lastTime = performance.now();
let bullets = [];
let enemies = [];

// Player (stationary vertical; can move horizontally)
const player = {
  xPercent: 50, // percent of canvas width (0..100)
  y: 0.8,       // percent of canvas height
  width: 38,
  height: 50,
  reload: 0,    // cooldown ms
  anim: 0,      // for recoil animation
};

// auto scale positions by canvas element size
function px(wPercent) { return (wPercent / 100) * canvas.getBoundingClientRect().width; }
function py(hPercent) { return (hPercent / 100) * canvas.getBoundingClientRect().height; }

// update HUD
const hpEl = document.getElementById('hp');
const scoreEl = document.getElementById('score');
function updateHUD() {
  hpEl.textContent = `HP: ${Math.max(0, Math.floor(hp))}`;
  scoreEl.textContent = `Score: ${score}`;
}

// ---- Input: touch drag / tap detection ----
let touchStartX = null;
let touchStartTime = 0;
let dragging = false;
const TAP_THRESHOLD_MS = 200;
const TAP_MOVE_TOL = 10;

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  touchStartX = t.clientX;
  touchStartTime = Date.now();
  dragging = false;
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  if (Math.abs(dx) > TAP_MOVE_TOL) {
    dragging = true;
    // Move player proportionally
    const rect = canvas.getBoundingClientRect();
    const newPercent = (t.clientX - rect.left) / rect.width * 100;
    player.xPercent = Math.max(5, Math.min(95, newPercent));
  }
});

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  const dt = Date.now() - touchStartTime;
  if (!dragging && dt < TAP_THRESHOLD_MS) {
    // treat as tap => shoot
    shoot();
  }
  touchStartX = null;
  dragging = false;
});

// Also allow click on desktop for testing
canvas.addEventListener('click', (e) => {
  shoot();
});

// On-screen buttons
document.getElementById('btn-shoot').addEventListener('touchstart', (e)=>{ e.preventDefault(); shoot(); });
document.getElementById('btn-shoot').addEventListener('click', shoot);
let btnLeftHold=false, btnRightHold=false;
const btnL = document.getElementById('btn-left');
const btnR = document.getElementById('btn-right');
btnL.addEventListener('touchstart', (e)=>{e.preventDefault(); btnLeftHold=true});
btnL.addEventListener('touchend', (e)=>{e.preventDefault(); btnLeftHold=false});
btnR.addEventListener('touchstart', (e)=>{e.preventDefault(); btnRightHold=true});
btnR.addEventListener('touchend', (e)=>{e.preventDefault(); btnRightHold=false});

// Also keyboard support while testing on PC
const keys = {};
window.addEventListener('keydown', (e)=> keys[e.key]=true);
window.addEventListener('keyup', (e)=> keys[e.key]=false);

// ---- Shooting ----
function shoot() {
  if (player.reload > 0 || gameOver) return;
  player.reload = 300; // ms cooldown
  player.anim = 1; // recoil animation intensity

  // bullet from player center upwards direction (station shooter: towards top)
  const rect = canvas.getBoundingClientRect();
  const pxPos = (player.xPercent/100) * rect.width;
  const pyPos = rect.height * player.y - player.height/2;
  bullets.push({
    x: pxPos,
    y: pyPos,
    r: 6,
    vy: -8 - Math.random()*2,
  });
}

// ---- Enemy spawn & behavior ----
function spawnEnemy() {
  const rect = canvas.getBoundingClientRect();
  const fromLeft = Math.random() < 0.5;
  const y = rect.height * (0.15 + Math.random() * 0.6); // variety vertical spawn
  const speed = 1 + Math.random()*1.2 + score*0.02;
  enemies.push({
    x: fromLeft ? -30 : rect.width + 30,
    y,
    vx: fromLeft ? (0.6 + Math.random()*0.9 + score*0.01) : -(0.6 + Math.random()*0.9 + score*0.01),
    w: 34,
    h: 46,
    animPhase: 0, // for walking animation
    hp: 1 + Math.floor(score/10),
    fromLeft,
  });
}

// ---- Collision helpers ----
function circleRectCollision(cx, cy, r, rx, ry, rw, rh){
  // find closest point
  const closestX = Math.max(rx, Math.min(cx, rx+rw));
  const closestY = Math.max(ry, Math.min(cy, ry+rh));
  const dx = cx - closestX, dy = cy - closestY;
  return (dx*dx + dy*dy) <= r*r;
}

// ---- Game Loop ----
function update(dt) {
  if (gameOver) return;
  // spawn
  lastSpawn += dt;
  if (lastSpawn > spawnInterval) {
    lastSpawn = 0;
    spawnEnemy();
    // occasionally speed up spawn rate
    if (spawnInterval > 500 && Math.random() < 0.12) spawnInterval -= 20;
  }

  // input buttons
  if (btnLeftHold) player.xPercent = Math.max(5, player.xPercent - 0.9);
  if (btnRightHold) player.xPercent = Math.min(95, player.xPercent + 0.9);
  if (keys['ArrowLeft']) player.xPercent = Math.max(5, player.xPercent - 1.6);
  if (keys['ArrowRight']) player.xPercent = Math.min(95, player.xPercent + 1.6);
  
  // update reload
  if (player.reload > 0) player.reload = Math.max(0, player.reload - dt);
  if (player.anim > 0) player.anim = Math.max(0, player.anim - dt/200);

  // bullets
  const rect = canvas.getBoundingClientRect();
  bullets.forEach(b => {
    b.y += b.vy; // vy is negative (go up)
  });
  bullets = bullets.filter(b => b.y > -10);

  // enemies movement
  enemies.forEach(ent => {
    ent.x += ent.vx * (dt/16);
    ent.animPhase += dt/120;
    // check if enemy reaches player station vertical band
    const playerX = (player.xPercent/100) * rect.width;
    const distToPlayer = Math.hypot(ent.x - playerX, ent.y - rect.height*player.y);
    if (distToPlayer < 34) {
      // damage player
      hp -= 0.6;
      ent.toRemove = true;
      if (hp <= 0) {
        hp = 0; gameOver = true;
      }
    }
  });
  enemies = enemies.filter(e => !e.toRemove && e.x > -100 && e.x < rect.width + 100);

  // bullet-enemy collisions
  bullets.forEach(b => {
    enemies.forEach(en => {
      if (circleRectCollision(b.x, b.y, b.r, en.x - en.w/2, en.y - en.h/2, en.w, en.h)) {
        b.hit = true;
        en.hp -= 1;
        // small knockback
        en.x += en.vx * -10;
      }
    });
  });
  bullets = bullets.filter(b => !b.hit);

  // remove dead enemies, increment score, spawn gore effect (simple)
  enemies = enemies.filter(e => {
    if (e.hp <= 0) {
      score += 10;
      // small chance to drop HP pack
      if (Math.random() < 0.08) {
        hp = Math.min(100, hp + 6);
      }
      return false;
    }
    return true;
  });

  updateHUD();
}

function draw() {
  // clear
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0,0,rect.width,rect.height);

  // Draw background station elements (parallax)
  // floor
  ctx.fillStyle = '#0f0f10';
  ctx.fillRect(0, rect.height*0.82, rect.width, rect.height*0.18);

  // draw player (simple soldier with gun)
  const px = (player.xPercent/100) * rect.width;
  const py = rect.height * player.y;
  // body
  ctx.save();
  ctx.translate(px, py);
  // bobbing
  const bob = Math.sin(performance.now()/250) * 2;
  ctx.translate(0, bob * (1 + player.anim));
  // draw feet
  ctx.fillStyle = '#222';
  ctx.fillRect(-16, 10, 12, 6);
  ctx.fillRect(4, 10, 12, 6);
  // pants
  ctx.fillStyle = '#1b3a57';
  ctx.fillRect(-16, -10, 32, 20);
  // body/vest
  ctx.fillStyle = '#2f4f4f';
  ctx.fillRect(-14, -36, 28, 28);
  // head
  ctx.beginPath();
  ctx.fillStyle = '#f0c27b';
  ctx.arc(0, -46, 10, 0, Math.PI*2);
  ctx.fill();
  // gun - recoil moves when anim > 0
  ctx.fillStyle = '#111';
  const recoil = player.anim * 6;
  ctx.fillRect(8 - recoil, -30, 26, 6); // barrel
  ctx.fillRect(-6 - recoil, -28, 12, 8); // handle
  ctx.restore();

  // bullets
  bullets.forEach(b => {
    ctx.beginPath();
    ctx.fillStyle = '#ffd166';
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();
    // small trail
    ctx.fillStyle = 'rgba(255,200,100,0.08)';
    ctx.fillRect(b.x-1, b.y, 2, 8);
  });

  // enemies (zombies) draw with simple two-frame animation
  enemies.forEach(en => {
    ctx.save();
    ctx.translate(en.x, en.y);
    // body
    ctx.fillStyle = '#6b8e23';
    ctx.fillRect(-en.w/2, -en.h/2, en.w, en.h);
    // head
    ctx.fillStyle = '#8fbf75';
    ctx.fillRect(-12, -en.h/2 - 18, 24, 18);
    // eyes and mouth
    ctx.fillStyle = '#111';
    ctx.fillRect(-7, -en.h/2 - 12, 4, 4);
    ctx.fillRect(3, -en.h/2 - 12, 4, 4);
    ctx.fillRect(-4, -en.h/2 - 2, 8, 3);
    // broken staggered arms (animation)
    const swing = Math.sin(en.animPhase) * 8;
    ctx.fillStyle = '#6b8e23';
    ctx.fillRect(-en.w/2 - 8, -6 + swing, 8, 6);
    ctx.fillRect(en.w/2, -6 - swing, 8, 6);
    ctx.restore();
  });

  // overlay: draw crosshair at top center to aim feel
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#fff';
  ctx.fillRect(rect.width/2 - 1, rect.height*0.06, 2, 12);
  ctx.fillRect(rect.width/2 - 12, rect.height*0.06 + 5, 24, 2);
  ctx.restore();

  // if game over
  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0,0,rect.width,rect.height);
    ctx.fillStyle = '#fff';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', rect.width/2, rect.height/2 - 10);
    ctx.font = '16px sans-serif';
    ctx.fillText(`Score: ${score}`, rect.width/2, rect.height/2 + 18);
    ctx.textAlign = 'start';
  }
}

function loop(now) {
  const dt = now - lastTime;
  lastTime = now;
  update(dt);
  draw();
  if (!gameOver) requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// restart on tap after game over
canvas.addEventListener('touchstart', (e)=>{
  if (gameOver) resetGame();
});
canvas.addEventListener('click', (e)=>{
  if (gameOver) resetGame();
});

function resetGame(){
  score = 0; hp = 100; gameOver = false; bullets=[]; enemies=[]; spawnInterval=1200; lastSpawn=0;
  updateHUD();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

// initial HUD update
updateHUD();
