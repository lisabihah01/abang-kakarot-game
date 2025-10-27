const gridElement = document.getElementById("grid");
const timerElement = document.getElementById("timer");
const winMessage = document.getElementById("win-message");

const backgroundMusic = new Audio("assets/background.mp3");
const pickSound = new Audio("assets/connect.mp3");
const winSound = new Audio("assets/win.mp3");

backgroundMusic.loop = true;
backgroundMusic.volume = 0.8;
pickSound.volume = 1.0;
winSound.volume = 1.0;

let gridSize = 5;
let grid = [];
let startCell, endCell;
let path = [];
let level = 1;
let timer = 0;
let timerInterval;

function startGame() {
  backgroundMusic.play();
  timer = 0;
  timerElement.textContent = `Time: ${timer}s`;
  timerInterval = setInterval(() => {
    timer++;
    timerElement.textContent = `Time: ${timer}s`;
  }, 1000);
  generateLevel(level);
}

function generateLevel(levelNum) {
  gridElement.innerHTML = "";
  document.querySelectorAll(".line").forEach(l => l.remove());
  grid = [];
  gridElement.style.gridTemplateColumns = `repeat(${gridSize}, 60px)`;

  for (let i = 0; i < gridSize * gridSize; i++) {
    const cell = document.createElement("div");
    cell.classList.add("cell");
    cell.dataset.index = i;
    cell.addEventListener("click", handleCellClick);
    gridElement.appendChild(cell);
    grid.push(cell);
  }

  if (levelNum === 1) {
    startCell = grid[0];
    endCell = grid[24];
  } else {
    gridSize = 6;
    gridElement.style.gridTemplateColumns = `repeat(${gridSize}, 60px)`;
    gridElement.innerHTML = "";
    for (let i = 0; i < gridSize * gridSize; i++) {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      cell.dataset.index = i;
      cell.addEventListener("click", handleCellClick);
      gridElement.appendChild(cell);
      grid.push(cell);
    }
    startCell = grid[2];
    endCell = grid[grid.length - 4];
  }

  startCell.textContent = "🚗";
  startCell.classList.add("start");
  endCell.textContent = "🏁";
  endCell.classList.add("end");
}

let drawing = false;
function handleCellClick(e) {
  const cell = e.target;

  if (cell === startCell) {
    drawing = true;
    path = [cell];
    pickSound.currentTime = 0;
    pickSound.play();
  } else if (drawing && !cell.classList.contains("active")) {
    cell.classList.add("active");
    path.push(cell);
    drawLine(path[path.length - 2], cell);

    if (cell === endCell) {
      drawing = false;
      completeLevel();
    }
  }
}

function drawLine(cell1, cell2) {
  const line = document.createElement("div");
  line.classList.add("line");

  const rect1 = cell1.getBoundingClientRect();
  const rect2 = cell2.getBoundingClientRect();

  const x1 = rect1.left + rect1.width / 2;
  const y1 = rect1.top + rect1.height / 2;
  const x2 = rect2.left + rect2.width / 2;
  const y2 = rect2.top + rect2.height / 2;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  line.style.width = `${length}px`;
  line.style.left = `${x1}px`;
  line.style.top = `${y1}px`;
  line.style.transform = `rotate(${angle}deg)`;
  document.body.appendChild(line);
}

function completeLevel() {
  clearInterval(timerInterval);
  winSound.play();
  winMessage.style.display = "block";
  winMessage.innerHTML = "🎉 You Win Abang Kakaort! 🎉";
  confettiEffect();

  setTimeout(() => {
    winMessage.style.display = "none";
    level++;
    if (level === 2) {
      startGame();
    } else {
      alert("Game Over! Semua stage siap 💚");
    }
  }, 4000);
}

function confettiEffect() {
  for (let i = 0; i < 150; i++) {
    const confetti = document.createElement("div");
    confetti.style.position = "fixed";
    confetti.style.left = Math.random() * 100 + "vw";
    confetti.style.top = Math.random() * 100 + "vh";
    confetti.style.width = "8px";
    confetti.style.height = "8px";
    confetti.style.background = `hsl(${Math.random() * 360}, 100%, 50%)`;
    confetti.style.borderRadius = "50%";
    confetti.style.opacity = 0.9;
    confetti.style.animation = `fall ${2 + Math.random() * 3}s linear infinite`;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 3000);
  }
}

startGame();
