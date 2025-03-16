"use strict";

import { addParticipantToXano } from "./api.js";
import { Digit, FlyingDigit, TimePlusAnimation } from "./digit.js";
import { 
  cells, generatedChunks, folderScores, folderNames,
  generateChunk, ensureVisibleChunks, drawCells,
  bfsCollectValue, bfsCollectAnomaly, getClickedDigit
} from "./game.js";

// Если в ui.js есть функции для рекордов, используйте их. Здесь для наглядности - прямо в main.js:
import { fetchAllParticipantsFromXano } from "./api.js";

// ---------- HTML ELEMENTS ----------
const menuContainer     = document.getElementById("menuContainer");
const btnStart          = document.getElementById("btnStart");
const btnRecords        = document.getElementById("btnRecords");

const gameCanvas        = document.getElementById("gameCanvas");
const ctx               = gameCanvas.getContext("2d");

const gameOverOverlay   = document.getElementById("gameOverOverlay");
const finalScore        = document.getElementById("finalScore");
const btnMenuOver       = document.getElementById("btnMenu");
const btnRestartOver    = document.getElementById("btnRestart");

const recordsContainer  = document.getElementById("recordsContainer");
const recordsTableContainer = document.getElementById("recordsTableContainer");
const closeRecordsButton    = document.getElementById("closeRecordsButton");

// ---------- GAME STATE ----------
let gameState  = "menu";  // "menu", "game", "game_over"
let currentPlayer = null; // { wallet, score }

// Параметры
const START_TIME    = 60;
const FOLDER_HEIGHT = 80;
let scoreTotal = 0;
let timeLeft   = START_TIME;
let flyingDigits  = [];
let timeAnimations = {};
let slotsToRespawn = {};

let cameraX = 0;
let cameraY = 0;
let isDragging = false;
let dragStart  = { x: 0, y: 0 };
let cameraStart= { x: 0, y: 0 };
let lastUpdateTime = performance.now();
let lastScore = 0;

// ---------- MENU BUTTONS ----------
btnStart.addEventListener("click", () => {
  // Если нужна авторизация кошелька - сделайте её здесь
  currentPlayer = { wallet: "testwallet" };
  startGame();
});

btnRecords.addEventListener("click", () => {
  showRecordsOverlay();
});

// ---------- RECORDS OVERLAY ----------
closeRecordsButton.addEventListener("click", () => {
  recordsContainer.style.display = "none";
});

async function showRecordsOverlay() {
  recordsContainer.style.display = "block";
  recordsTableContainer.innerHTML = "Loading...";
  const records = await fetchAllParticipantsFromXano();
  if (!records || records.length === 0) {
    recordsTableContainer.innerHTML = "No records found.";
    return;
  }
  let html = "<table><tr><th>BTC Wallet</th><th>Score</th></tr>";
  records.forEach((r) => {
    html += `<tr><td>${r.wallet}</td><td>${r.score}</td></tr>`;
  });
  html += "</table>";
  recordsTableContainer.innerHTML = html;
}

// ---------- GAME OVER BUTTONS ----------
btnMenuOver.addEventListener("click", () => {
  gameState = "menu";
  updateUI();
});

btnRestartOver.addEventListener("click", () => {
  startGame();
});

// ---------- CANVAS RESIZE ----------
function resizeCanvas() {
  gameCanvas.width = window.innerWidth;
  gameCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ---------- CAMERA DRAGGING (RIGHT MOUSE BUTTON) ----------
gameCanvas.addEventListener("mousedown", (e) => {
  if (e.button === 2) {
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    cameraStart = { x: cameraX, y: cameraY };
  }
});
gameCanvas.addEventListener("mousemove", (e) => {
  if (isDragging) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    cameraX = cameraStart.x + dx;
    cameraY = cameraStart.y + dy;
  }
});
gameCanvas.addEventListener("mouseup", (e) => {
  if (e.button === 2) isDragging = false;
});
gameCanvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// ---------- CANVAS CLICK (Collect digits) ----------
gameCanvas.addEventListener("click", (e) => {
  if (gameState !== "game") return;
  const rect = gameCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const clickedKey = getClickedDigit(mouseX, mouseY, cameraX, cameraY);
  if (!clickedKey) return;

  const parts = clickedKey.split("_").map(Number);
  const gx = parts[0], gy = parts[1];
  const digit = cells[clickedKey];
  const anomaly = digit.anomaly;
  const currentTime = performance.now();

  // Собираем группу по аномалии
  if (anomaly === Digit.ANOMALY_UPSIDE || anomaly === Digit.ANOMALY_STRANGE) {
    const group = bfsCollectAnomaly(gx, gy, anomaly);
    if (group.length >= 5) {
      const idx = (anomaly === Digit.ANOMALY_UPSIDE) ? 0 : 1;
      const fx = gameCanvas.width / 4 + (idx * gameCanvas.width / 2);
      const fy = gameCanvas.height - FOLDER_HEIGHT / 2;
      for (let key of group) {
        const d = cells[key];
        const pos = d.screenPosition(cameraX, cameraY, currentTime);
        flyingDigits.push(new FlyingDigit(d, pos.x, pos.y, fx, fy, currentTime, 1000));
        delete cells[key];
        slotsToRespawn[key] = currentTime + 2000;
      }
      scoreTotal += group.length * 10;
      folderScores[idx] += group.length;
      timeLeft += 1;
      const plusAnim = new TimePlusAnimation("+1 s", 200, 20, currentTime, 2000);
      timeAnimations[Date.now()] = plusAnim;
      return;
    }
  }

  // Собираем группу по значению
  const groupVal = bfsCollectValue(gx, gy);
  if (groupVal.length >= 5) {
    const fx = gameCanvas.width / 4;
    const fy = gameCanvas.height - FOLDER_HEIGHT / 2;
    for (let key of groupVal) {
      const d = cells[key];
      const pos = d.screenPosition(cameraX, cameraY, currentTime);
      flyingDigits.push(new FlyingDigit(d, pos.x, pos.y, fx, fy, currentTime, 1000));
      delete cells[key];
      slotsToRespawn[key] = currentTime + 2000;
    }
    scoreTotal += groupVal.length * 10;
    folderScores[0] += groupVal.length;
    timeLeft += 1;
    const plusAnim = new TimePlusAnimation("+1 s", 200, 20, currentTime, 2000);
    timeAnimations[Date.now()] = plusAnim;
  }
});

// ---------- GAME LOOP (update + draw) ----------
function updateGame(dt) {
  const currentTime = performance.now();
  timeLeft -= dt / 1000;
  if (timeLeft <= 0) {
    gameState = "game_over";
    lastScore = scoreTotal;
    if (currentPlayer) {
      currentPlayer.score = scoreTotal;
      addParticipantToXano(currentPlayer.wallet, scoreTotal);
    }
    updateUI();
    return;
  }
  ensureVisibleChunks(cameraX, cameraY, gameCanvas.width, gameCanvas.height);

  flyingDigits = flyingDigits.filter(fd => (currentTime - fd.startTime) < fd.duration);

  for (let key in slotsToRespawn) {
    if (currentTime >= slotsToRespawn[key]) {
      const [gx, gy] = key.split("_").map(Number);
      const val = Math.floor(Math.random() * 10);
      const d = new Digit(gx, gy, val, Digit.ANOMALY_NONE, currentTime - Math.random() * 1000);
      cells[key] = d;
      delete slotsToRespawn[key];
    }
  }
}

function drawGame() {
  ctx.fillStyle = "#021013";
  ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
  const currentTime = performance.now();

  drawCells(ctx, cameraX, cameraY, gameCanvas.width, gameCanvas.height);

  for (let fd of flyingDigits) {
    fd.draw(ctx, currentTime);
  }

  // Папки (Upside, Strange) внизу
  for (let i = 0; i < 2; i++) {
    const rectX = i * gameCanvas.width / 2;
    const rectY = gameCanvas.height - FOLDER_HEIGHT;
    ctx.fillStyle = "#7AC0D6";
    ctx.fillRect(rectX, rectY, gameCanvas.width / 2, FOLDER_HEIGHT);
    ctx.strokeStyle = "#7AC0D6";
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX, rectY, gameCanvas.width / 2, FOLDER_HEIGHT);
    ctx.font = "24px Arial";
    ctx.fillStyle = "#021013";
    ctx.textAlign = "center";
    ctx.fillText(`${folderNames[i]}: ${folderScores[i]}`, rectX + gameCanvas.width / 4, rectY + FOLDER_HEIGHT / 2);
  }

  // Счёт
  ctx.save();
  ctx.font = "24px Arial";
  const scoreText = `Score: ${scoreTotal}`;
  const sw = ctx.measureText(scoreText).width;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(10, 10, sw + 10, 30);
  ctx.fillStyle = "#7AC0D6";
  ctx.textAlign = "left";
  ctx.fillText(scoreText, 15, 32);
  ctx.restore();

  // Таймер
  ctx.save();
  ctx.font = "24px Arial";
  const timerText = `${Math.floor(timeLeft)} s.`;
  const tw = ctx.measureText(timerText).width;
  const tx = gameCanvas.width / 2;
  const ty = 30;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(tx - tw/2 - 5, ty - 24, tw + 10, 30);
  ctx.fillStyle = "#7AC0D6";
  ctx.textAlign = "center";
  ctx.fillText(timerText, tx, ty);
  ctx.restore();

  // Анимации +N s
  for (const k in timeAnimations) {
    const anim = timeAnimations[k];
    const keep = anim.draw(ctx, currentTime);
    if (!keep) delete timeAnimations[k];
  }
}

function gameLoop() {
  const now = performance.now();
  const dt = now - lastUpdateTime;
  lastUpdateTime = now;

  if (gameState === "game") {
    updateGame(dt);
    drawGame();
  }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// ---------- START GAME ----------
function startGame() {
  // Сброс
  for (const key in cells) delete cells[key];
  generatedChunks.clear();
  folderScores[0] = 0;
  folderScores[1] = 0;
  scoreTotal = 0;
  timeLeft = START_TIME;
  flyingDigits = [];
  timeAnimations = {};
  slotsToRespawn = {};
  cameraX = 0;
  cameraY = 0;

  for (let cx = -1; cx <= 2; cx++) {
    for (let cy = -1; cy <= 2; cy++) {
      generateChunk(cx, cy);
    }
  }

  gameState = "game";
  updateUI();
}

// ---------- UPDATE UI ----------
function updateUI() {
  if (gameState === "menu") {
    menuContainer.style.display = "flex";
    gameCanvas.style.display = "none";
    gameOverOverlay.style.display = "none";
    recordsContainer.style.display = "none";
  } else if (gameState === "game") {
    menuContainer.style.display = "none";
    gameCanvas.style.display = "block";
    gameOverOverlay.style.display = "none";
    recordsContainer.style.display = "none";
  } else if (gameState === "game_over") {
    menuContainer.style.display = "none";
    gameCanvas.style.display = "block";
    recordsContainer.style.display = "none";
    finalScore.textContent = `Your score: ${lastScore}`;
    gameOverOverlay.style.display = "block";
  }
}

// При загрузке → меню
updateUI();
