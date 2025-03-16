"use strict";

import { addParticipantToXano } from "./api.js";
import { Digit, FlyingDigit, TimePlusAnimation } from "./digit.js";
import { 
  cells, generatedChunks, folderScores, folderNames,
  generateChunk, ensureVisibleChunks, drawCells,
  bfsCollectValue, bfsCollectAnomaly, getClickedDigit
} from "./game.js";
import { showRecordsOverlay } from "./ui.js";

// --------------------------------
// HTML ELEMENTS
// --------------------------------
const canvas = document.getElementById("gameCanvas");
const ctx    = canvas.getContext("2d");

// Меню
const menuContainer = document.getElementById("menuContainer");
const btnStart      = document.getElementById("btnStart");
const btnRecords    = document.getElementById("btnRecords");
const btnExit       = document.getElementById("btnExit");

// Game Over
const gameOverOverlay = document.getElementById("gameOverOverlay");
const finalScore       = document.getElementById("finalScore");
const btnMenuOver      = document.getElementById("btnMenu");
const btnRestartOver   = document.getElementById("btnRestart");

// --------------------------------
// GAME PARAMETERS
// --------------------------------
const START_TIME    = 60;
const FOLDER_HEIGHT = 80;
let gameState  = "menu"; // "menu", "game", "game_over"
let currentPlayer = null; // { wallet, score }
let scoreTotal = 0;
let timeLeft   = START_TIME;
let flyingDigits  = [];
let timeAnimations = {};
let slotsToRespawn = {};

// Camera parameters
let cameraX = 0;
let cameraY = 0;
let isDragging = false;
let dragStart  = { x: 0, y: 0 };
let cameraStart= { x: 0, y: 0 };

let lastUpdateTime = performance.now();
let lastScore = 0;

// --------------------------------
// MENU BUTTONS
// --------------------------------
btnStart.addEventListener("click", () => {
  // Если у вас есть логика "loginContainer", "walletInput", и т.д.,
  // можете её оставить. Ниже – упрощённый вариант:
  currentPlayer = { wallet: "testwallet", score: 0 };
  startGame();
});

btnRecords.addEventListener("click", async () => {
  // Открываем оверлей рекордов
  // (предположим, у вас есть showRecordsOverlay, как в ui.js)
  // Для примера:
  await showRecordsOverlay(null, null, currentPlayer);
  // Можете открывать ваш #recordsContainer
});

btnExit.addEventListener("click", () => {
  // Перезагружаем страницу
  location.reload();
});

// --------------------------------
// GAME OVER BUTTONS
// --------------------------------
btnMenuOver.addEventListener("click", () => {
  gameState = "menu";
  updateUI();
});
btnRestartOver.addEventListener("click", () => {
  startGame();
});

// --------------------------------
// RESIZE CANVAS
// --------------------------------
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// --------------------------------
// CAMERA DRAGGING (RIGHT MOUSE BUTTON)
// --------------------------------
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 2) {
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    cameraStart = { x: cameraX, y: cameraY };
  }
});
canvas.addEventListener("mousemove", (e) => {
  if (isDragging) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    cameraX = cameraStart.x + dx;
    cameraY = cameraStart.y + dy;
  }
});
canvas.addEventListener("mouseup", (e) => {
  if (e.button === 2) isDragging = false;
});
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// --------------------------------
// CANVAS CLICK HANDLER (Collect digits)
// --------------------------------
canvas.addEventListener("click", async (e) => {
  if (gameState !== "game") return; // Только во время игры
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const clickedKey = getClickedDigit(mouseX, mouseY, cameraX, cameraY);
  if (clickedKey) {
    const [gx, gy] = clickedKey.split("_").map(Number);
    const digit = cells[clickedKey];
    const anomaly = digit.anomaly;
    const currentTime = performance.now();

    // Process anomaly groups
    if (anomaly === Digit.ANOMALY_UPSIDE || anomaly === Digit.ANOMALY_STRANGE) {
      const group = bfsCollectAnomaly(gx, gy, anomaly);
      if (group.length >= 5) {
        const idx = (anomaly === Digit.ANOMALY_UPSIDE) ? 0 : 1;
        const fx = canvas.width / 4 + (idx * canvas.width / 2);
        const fy = canvas.height - FOLDER_HEIGHT / 2;
        const countDig = group.length;
        for (let key of group) {
          const d = cells[key];
          const pos = d.screenPosition(cameraX, cameraY, currentTime);
          flyingDigits.push(new FlyingDigit(d, pos.x, pos.y, fx, fy, currentTime, 1000));
          delete cells[key];
          slotsToRespawn[key] = currentTime + 2000;
        }
        scoreTotal += countDig * 10;
        folderScores[idx] += countDig;
        timeLeft += 1; // или сколько хотите
        const plusAnim = new TimePlusAnimation(`+1 s`, 200, 20, currentTime, 2000);
        timeAnimations[Date.now()] = plusAnim;
        return;
      }
    }

    // Process groups by value
    const groupVal = bfsCollectValue(gx, gy);
    if (groupVal.length >= 5) {
      const fx = canvas.width / 4;
      const fy = canvas.height - FOLDER_HEIGHT / 2;
      const cVal = groupVal.length;
      for (let key of groupVal) {
        const d = cells[key];
        const pos = d.screenPosition(cameraX, cameraY, currentTime);
        flyingDigits.push(new FlyingDigit(d, pos.x, pos.y, fx, fy, currentTime, 1000));
        delete cells[key];
        slotsToRespawn[key] = currentTime + 2000;
      }
      scoreTotal += cVal * 10;
      folderScores[0] += cVal;
      timeLeft += 1;
      const plusAnim = new TimePlusAnimation(`+1 s`, 200, 20, currentTime, 2000);
      timeAnimations[Date.now()] = plusAnim;
    }
  }
});

// --------------------------------
// UPDATE GAME (logic)
// --------------------------------
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
  ensureVisibleChunks(cameraX, cameraY, canvas.width, canvas.height);

  flyingDigits = flyingDigits.filter(fd => (currentTime - fd.startTime) < fd.duration);

  for (let key in slotsToRespawn) {
    if (currentTime >= slotsToRespawn[key]) {
      const parts = key.split("_").map(Number);
      const gx = parts[0], gy = parts[1];
      const value = Math.floor(Math.random() * 10);
      const d = new Digit(gx, gy, value, Digit.ANOMALY_NONE, currentTime - Math.random() * 1000);
      cells[key] = d;
      delete slotsToRespawn[key];
    }
  }
}

// --------------------------------
// DRAW GAME
// --------------------------------
function drawGame() {
  ctx.fillStyle = "#021013";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const currentTime = performance.now();

  // Рисуем клетки
  drawCells(ctx, cameraX, cameraY, canvas.width, canvas.height);

  // Рисуем "летящие" цифры
  for (let fd of flyingDigits) {
    fd.draw(ctx, currentTime);
  }

  // Рисуем папки снизу (Upside, Strange)
  for (let i = 0; i < 2; i++) {
    const rectX = i * canvas.width / 2;
    const rectY = canvas.height - FOLDER_HEIGHT;
    ctx.fillStyle = "#7AC0D6";
    ctx.fillRect(rectX, rectY, canvas.width / 2, FOLDER_HEIGHT);
    ctx.strokeStyle = "#7AC0D6";
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX, rectY, canvas.width / 2, FOLDER_HEIGHT);
    ctx.font = "24px Arial";
    ctx.fillStyle = "#021013";
    ctx.textAlign = "center";
    ctx.fillText(`${folderNames[i]}: ${folderScores[i]}`, rectX + canvas.width / 4, rectY + FOLDER_HEIGHT / 2);
  }

  // Счёт
  ctx.save();
  ctx.font = "24px Arial";
  const scoreText = `Score: ${scoreTotal}`;
  const scoreWidth = ctx.measureText(scoreText).width;
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(10, 10, scoreWidth + 10, 30);
  ctx.fillStyle = "#7AC0D6";
  ctx.textAlign = "left";
  ctx.fillText(scoreText, 15, 32);
  ctx.restore();

  // Таймер
  ctx.save();
  ctx.font = "24px Arial";
  const timerText = `${Math.floor(timeLeft)} s.`;
  const timerWidth = ctx.measureText(timerText).width;
  const timerX = canvas.width / 2;
  const timerY = 30;
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(timerX - timerWidth / 2 - 5, timerY - 24, timerWidth + 10, 30);
  ctx.fillStyle = "#7AC0D6";
  ctx.textAlign = "center";
  ctx.fillText(timerText, timerX, timerY);
  ctx.restore();

  // Анимации +N s
  for (const k in timeAnimations) {
    const anim = timeAnimations[k];
    const keep = anim.draw(ctx, currentTime);
    if (!keep) {
      delete timeAnimations[k];
    }
  }
}

// --------------------------------
// MAIN LOOP
// --------------------------------
function gameLoop() {
  const currentTime = performance.now();
  const dt = currentTime - lastUpdateTime;
  lastUpdateTime = currentTime;

  if (gameState === "game") {
    updateGame(dt);
    drawGame();
  }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// --------------------------------
// START GAME
// --------------------------------
function startGame() {
  // Сбрасываем всё
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

// --------------------------------
// UPDATE UI (show/hide overlays)
// --------------------------------
function updateUI() {
  if (gameState === "menu") {
    menuContainer.style.display = "block";
    gameOverOverlay.style.display = "none";
    canvas.style.display = "none";
  } else if (gameState === "game") {
    menuContainer.style.display = "none";
    gameOverOverlay.style.display = "none";
    canvas.style.display = "block";
  } else if (gameState === "game_over") {
    menuContainer.style.display = "none";
    canvas.style.display = "block"; // Можно оставить видимым поле, но оно застынет
    finalScore.textContent = `Your score: ${lastScore}`;
    gameOverOverlay.style.display = "block";
  }
}

// При старте приложения показываем меню
updateUI();
