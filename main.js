"use strict";

import { addParticipantToXano } from "./api.js";
import { Digit, FlyingDigit, TimePlusAnimation } from "./digit.js";
import { 
  cells, generatedChunks, folderScores, folderNames,
  generateChunk, ensureVisibleChunks, drawCells,
  bfsCollectValue, bfsCollectAnomaly, getClickedDigit
} from "./game.js";
import { showRecordsOverlay } from "./ui.js";
import { fetchAllParticipantsFromXano } from "./api.js";

// Звуки
function playCollectSound() {
  const s = new Audio("plus.wav"); 
  s.volume = 0.4; 
  s.play(); 
}

function playStartSound() {
  const s = new Audio("start.wav");
  s.volume = 0.7;
  s.play();
}

function playEndSound() {
  const s = new Audio("end.wav");
  s.volume = 0.5;
  s.play();
}

let rightClickCount = 0;
function playRightClickSound() {
  const soundFiles = ["1.wav", "2.wav", "3.wav", "4.wav"];
  const soundIndex = rightClickCount % 4;
  const s = new Audio(soundFiles[soundIndex]);
  s.volume = 0.15;
  s.play();
  rightClickCount++;
}

// ---------- HTML ELEMENTS ----------
const fullscreenButton       = document.getElementById("fullscreenButton");
const topNav                 = document.getElementById("topNav");

const loginContainer         = document.getElementById("loginContainer");
const walletInput            = document.getElementById("walletInput");
const loginOkButton          = document.getElementById("loginOkButton");
const loginCancelButton      = document.getElementById("loginCancelButton");
const playWithoutWalletButton = document.getElementById("playWithoutWalletButton"); // Новая кнопка

const menuContainer          = document.getElementById("menuContainer");
const btnStart               = document.getElementById("btnStart");
const btnRecords             = document.getElementById("btnRecords");
const btnBuy                 = document.getElementById("btnBuy");

const gameCanvas             = document.getElementById("gameCanvas");
const ctx                    = gameCanvas.getContext("2d");

const gameOverOverlay        = document.getElementById("gameOverOverlay");
const finalScore             = document.getElementById("finalScore");
const btnMenuOver            = document.getElementById("btnMenu");
const btnRestartOver         = document.getElementById("btnRestart");

const recordsContainer       = document.getElementById("recordsContainer");
const recordsTableContainer  = document.getElementById("recordsTableContainer");
const closeRecordsButton     = document.getElementById("closeRecordsButton");

// ---------- GAME STATE ----------
let gameState  = "menu"; 
let currentPlayer = null; // { wallet, score }

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

// ---------- FULLSCREEN BUTTON ----------
fullscreenButton.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

// ---------- MENU BUTTONS ----------
btnStart.addEventListener("click", () => {
  showLoginOverlay();
});

btnRecords.addEventListener("click", () => {
  showRecordsOverlay(recordsTableContainer, recordsContainer, currentPlayer);
});

btnBuy.addEventListener("click", () => {
  window.open("https://odin.fun/token/2b11", "_blank");
});

const btnTwitter = document.getElementById("btnTwitter");
btnTwitter.addEventListener("click", () => {
  window.open("https://odin.fun/token/2b11", "_blank");
});

// ---------- LOGIN OVERLAY ----------
loginOkButton.addEventListener("click", () => {
  const wallet = walletInput.value.trim().toLowerCase();
  if (!wallet) {
    alert("Wallet is required!");
    return;
  }
  if (wallet.length !== 62) {
    alert("Invalid wallet length! Must be 62 characters.");
    return;
  }
  currentPlayer = { wallet, score: 0 };
  loginContainer.style.display = "none";
  startGame();
});

loginCancelButton.addEventListener("click", () => {
  loginContainer.style.display = "none";
});

playWithoutWalletButton.addEventListener("click", () => {
  currentPlayer = null; // Сбрасываем currentPlayer
  loginContainer.style.display = "none";
  startGame();
});

function showLoginOverlay() {
  walletInput.value = "";
  loginContainer.style.display = "block";
  walletInput.focus();
}

// ---------- RECORDS OVERLAY ----------
closeRecordsButton.addEventListener("click", () => {
  recordsContainer.style.display = "none";
  gameState = "menu";
  updateUI();
});

// ---------- GAME OVER BUTTONS ----------
btnRestartOver.addEventListener("click", () => {
  startGame(); // Убрали проверку currentPlayer, так как игра может быть без кошелька
});

btnMenuOver.addEventListener("click", () => {
  gameState = "menu";
  updateUI();
});

// ---------- RESIZE CANVAS ----------
function resizeCanvas() {
  gameCanvas.width = window.innerWidth;
  gameCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ---------- CAMERA DRAG (RIGHT BUTTON) ----------
gameCanvas.addEventListener("mousedown", (e) => {
  if (e.button === 2) {
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    cameraStart = { x: cameraX, y: cameraY };
    playRightClickSound();
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

// ---------- CLICK TO COLLECT DIGITS ----------
gameCanvas.addEventListener("click", (e) => {
  if (gameState !== "game") return;
  const rect = gameCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const clickedKey = getClickedDigit(mouseX, mouseY, cameraX, cameraY);
  if (!clickedKey) return;

  const [gx, gy] = clickedKey.split("_").map(Number);
  const digit = cells[clickedKey];
  const anomaly = digit.anomaly;
  const currentTime = performance.now();

  if (anomaly === Digit.ANOMALY_UPSIDE || anomaly === Digit.ANOMALY_STRANGE) {
    const group = bfsCollectAnomaly(gx, gy, anomaly);
    if (group.length >= 5) {
      const idx = (anomaly === Digit.ANOMALY_UPSIDE) ? 0 : 1;
      const fx = gameCanvas.width / 4 + (idx * gameCanvas.width / 2);
      const fy = gameCanvas.height - FOLDER_HEIGHT / 2;
      for (let k of group) {
        const d = cells[k];
        const pos = d.screenPosition(cameraX, cameraY, currentTime);
        flyingDigits.push(new FlyingDigit(d, pos.x, pos.y, fx, fy, currentTime, 1000));
        delete cells[k];
        slotsToRespawn[k] = currentTime + 2000;
      }
      scoreTotal += group.length * 10;
      folderScores[idx] += group.length;
      timeLeft += 1;

      playCollectSound();

      const plusAnim = new TimePlusAnimation("+1 s", 200, 20, currentTime, 2000);
      timeAnimations[Date.now()] = plusAnim;
      return;
    }
  }

  const groupVal = bfsCollectValue(gx, gy);
  if (groupVal.length >= 5) {
    const fx = gameCanvas.width / 4;
    const fy = gameCanvas.height - FOLDER_HEIGHT / 2;
    for (let k of groupVal) {
      const d = cells[k];
      const pos = d.screenPosition(cameraX, cameraY, currentTime);
      flyingDigits.push(new FlyingDigit(d, pos.x, pos.y, fx, fy, currentTime, 1000));
      delete cells[k];
      slotsToRespawn[k] = currentTime + 2000;
    }
    scoreTotal += group.length * 10;
    folderScores[0] += group.length;
    timeLeft += 1;

    playCollectSound();

    const plusAnim = new TimePlusAnimation("+1 s", 200, 20, currentTime, 2000);
    timeAnimations[Date.now()] = plusAnim;
  }
});

// ---------- UPDATE GAME ----------
function updateGame(dt) {
  const now = performance.now();
  timeLeft -= dt / 1000;
  if (timeLeft <= 0) {
    gameState = "game_over";
    lastScore = scoreTotal;
    if (currentPlayer && currentPlayer.wallet) {
      currentPlayer.score = scoreTotal;
      addParticipantToXano(currentPlayer.wallet, scoreTotal);
    }
    playEndSound();
    updateUI();
    return;
  }
  ensureVisibleChunks(cameraX, cameraY, gameCanvas.width, gameCanvas.height);
  flyingDigits = flyingDigits.filter(fd => (now - fd.startTime) < fd.duration);

  for (let k in slotsToRespawn) {
    if (now >= slotsToRespawn[k]) {
      const [gx, gy] = k.split("_").map(Number);
      const val = Math.floor(Math.random() * 10);
      const d = new Digit(gx, gy, val, Digit.ANOMALY_NONE, now - Math.random() * 1000);
      cells[k] = d;
      delete slotsToRespawn[k];
    }
  }
}

// ---------- DRAW GAME ----------
function drawGame() {
  ctx.fillStyle = "#021013";
  ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
  const now = performance.now();

  drawCells(ctx, cameraX, cameraY, gameCanvas.width, gameCanvas.height);

  for (let fd of flyingDigits) {
    fd.draw(ctx, now);
  }

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

  for (const k in timeAnimations) {
    const anim = timeAnimations[k];
    const keep = anim.draw(ctx, now);
    if (!keep) {
      delete timeAnimations[k];
    }
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

function startGame() {
  for (const k in cells) delete cells[k];
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

  playStartSound();
  gameState = "game";
  updateUI();
}

function updateUI() {
  if (gameState === "menu") {
    menuContainer.style.display = "flex";
    gameCanvas.style.display    = "none";
    gameOverOverlay.style.display = "none";
    recordsContainer.style.display = "none";
    loginContainer.style.display   = "none";

    topNav.style.display = "flex";
    fullscreenButton.style.display = "block";

  } else if (gameState === "game") {
    menuContainer.style.display   = "none";
    gameCanvas.style.display      = "block";
    gameOverOverlay.style.display = "none";
    recordsContainer.style.display= "none";
    loginContainer.style.display  = "none";

    topNav.style.display = "none";
    fullscreenButton.style.display = "none";

  } else if (gameState === "game_over") {
    menuContainer.style.display   = "none";
    gameCanvas.style.display      = "block";
    recordsContainer.style.display= "none";
    loginContainer.style.display  = "none";

    finalScore.textContent = `Your score: ${lastScore}`;
    gameOverOverlay.style.display = "block";

    topNav.style.display = "none";
    fullscreenButton.style.display = "none";
  }
}

updateUI();
