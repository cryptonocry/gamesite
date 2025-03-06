"use strict";

import { addParticipantToXano } from "./api.js";
import { Digit, FlyingDigit, TimePlusAnimation } from "./digit.js";
import { 
  cells, generatedChunks, folderScores, folderNames,
  generateChunk, ensureVisibleChunks, drawCells,
  bfsCollectValue, bfsCollectAnomaly, getClickedDigit
} from "./game.js";
import { showRecordsOverlay } from "./ui.js";

// HTML elements
const canvas              = document.getElementById("gameCanvas");
const ctx                 = canvas.getContext("2d");
const fullscreenButton    = document.getElementById("fullscreenButton");
const loginContainer      = document.getElementById("loginContainer");
const loginButton         = document.getElementById("loginButton");
const nicknameInput       = document.getElementById("nicknameInput");
const walletInput         = document.getElementById("walletInput");
const recordsContainer    = document.getElementById("recordsContainer");
const recordsTableContainer = document.getElementById("recordsTableContainer");
const closeRecordsButton  = document.getElementById("closeRecordsButton");

// Game states
let gameState = "menu"; // "menu", "game", "game_over"
let currentPlayer = null; // { nickname, wallet, score }

// Score, time, etc.
let scoreTotal = 0;
let timeLeft   = 60;
let flyingDigits  = [];
let timeAnimations = {};
let slotsToRespawn = {};

// Camera position
let cameraX = canvas.width / 2;
let cameraY = canvas.height / 2;
let isDragging = false;
let dragStart  = { x: 0, y: 0 };
let cameraStart= { x: 0, y: 0 };

let lastUpdateTime = performance.now();
let lastScore = 0;

// Fullscreen button
fullscreenButton.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

// Resize canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ----------------------
// VALIDATION FUNCTIONS
// ----------------------
function validateNickname(nickname) {
  // 1–10 chars, only letters (A–Z, a–z), digits (0–9), underscore
  const regex = /^[A-Za-z0-9_]{1,10}$/;
  return regex.test(nickname);
}

function validateWallet(wallet) {
  // exactly 62 chars, only lowercase letters (a–z) and digits (0–9)
  const regex = /^[a-z0-9]{62}$/;
  return regex.test(wallet);
}

// ----------------------
// LOGIN EVENT
// ----------------------
loginButton.addEventListener("click", () => {
  const nickname = nicknameInput.value.trim();
  const wallet   = walletInput.value.trim();

  // Check nickname
  if (!validateNickname(nickname)) {
    alert("Invalid nickname! Must be 1–10 characters (letters, digits, underscore).");
    return;
  }
  // Check wallet
  if (!validateWallet(wallet)) {
    alert("Invalid BTC Taproot wallet! Must be exactly 62 lowercase letters/digits.");
    return;
  }

  currentPlayer = { nickname, wallet, score: 0 };
  console.log("Login successful:", currentPlayer);
  loginContainer.style.display = "none";
  startGame();
});

// Close records overlay
closeRecordsButton.addEventListener("click", () => {
  recordsContainer.style.display = "none";
  gameState = "menu";
});

// Canvas click: menu or game
canvas.addEventListener("click", async (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  if (gameState === "menu") {
    const menuOptions = ["Start Game", "Records", "Exit"];
    const optionAreaHeight = 40;
    const baseY = canvas.height / 2 - (menuOptions.length * optionAreaHeight) / 2;
    for (let i = 0; i < menuOptions.length; i++) {
      const itemY = baseY + i * optionAreaHeight;
      if (mouseX >= canvas.width / 2 - 150 && mouseX <= canvas.width / 2 + 150 &&
          mouseY >= itemY - optionAreaHeight / 2 && mouseY <= itemY + optionAreaHeight / 2) {
        const option = menuOptions[i];
        if (option === "Start Game") {
          if (!currentPlayer) {
            loginContainer.style.display = "block";
          } else {
            startGame();
          }
        } else if (option === "Records") {
          await showRecordsOverlay(recordsTableContainer, recordsContainer, currentPlayer);
        } else if (option === "Exit") {
          location.reload();
        }
        return;
      }
    }
  }
  else if (gameState === "game") {
    // In-game clicks: BFS collecting
    const clickedKey = getClickedDigit(mouseX, mouseY, cameraX, cameraY);
    if (clickedKey) {
      const parts = clickedKey.split("_").map(Number);
      const gx = parts[0], gy = parts[1];
      const digit = cells[clickedKey];
      const anomaly = digit.anomaly;
      const currentTime = performance.now();

      // Anomaly BFS
      if (anomaly === Digit.ANOMALY_UPSIDE || anomaly === Digit.ANOMALY_STRANGE) {
        const group = bfsCollectAnomaly(gx, gy, anomaly);
        if (group.length >= 5) {
          const idx = (anomaly === Digit.ANOMALY_UPSIDE) ? 0 : 1;
          const fx = canvas.width / 4 + (idx * canvas.width / 2);
          const fy = canvas.height - 80 / 2; // FOLDER_HEIGHT
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
          timeLeft += countDig;
          const plusAnim = new TimePlusAnimation(`+${countDig} s`, 200, 20, currentTime, 2000);
          timeAnimations[Date.now()] = plusAnim;
          return;
        }
      }

      // Value BFS
      const groupVal = bfsCollectValue(gx, gy);
      if (groupVal.length >= 5) {
        const fx = canvas.width / 4;
        const fy = canvas.height - 80 / 2;
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
        timeLeft += cVal;
        const plusAnim = new TimePlusAnimation(`+${cVal} s`, 200, 20, currentTime, 2000);
        timeAnimations[Date.now()] = plusAnim;
      }
    }
  }
  else if (gameState === "game_over") {
    // Click => go to menu
    gameState = "menu";
  }
});

// Camera dragging (right mouse button)
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

// Draw menu and game over
function drawMenu() {
  ctx.fillStyle = "#021013";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "36px Arial";
  ctx.fillStyle = "#7AC0D6";
  ctx.textAlign = "center";
  ctx.fillText("Main Menu", canvas.width / 2, canvas.height / 4);

  const menuOptions = ["Start Game", "Records", "Exit"];
  const optionAreaHeight = 40;
  const baseY = canvas.height / 2 - (menuOptions.length * optionAreaHeight) / 2;
  for (let i = 0; i < menuOptions.length; i++) {
    ctx.font = "36px Arial";
    ctx.fillStyle = "#7AC0D6";
    ctx.fillText(menuOptions[i], canvas.width / 2, baseY + i * optionAreaHeight);
  }
}

function drawGameOver() {
  ctx.fillStyle = "#021013";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "36px Arial";
  ctx.fillStyle = "#7AC0D6";
  ctx.textAlign = "center";
  ctx.fillText("Time's up!", canvas.width / 2, canvas.height / 4);
  ctx.fillText(`Your score: ${lastScore}`, canvas.width / 2, canvas.height / 2);
  ctx.font = "24px Arial";
  ctx.fillText("Click to return to menu", canvas.width / 2, canvas.height - 50);
}

// Start game
function startGame() {
  console.log("Game started");
  // Reset everything
  for (const key in cells) delete cells[key];
  generatedChunks.clear();
  folderScores[0] = 0;
  folderScores[1] = 0;
  scoreTotal = 0;
  timeLeft = 60;
  flyingDigits = [];
  timeAnimations = {};
  slotsToRespawn = {};

  // Generate chunks around (0,0)
  for (let cx = -1; cx <= 2; cx++) {
    for (let cy = -1; cy <= 2; cy++) {
      generateChunk(cx, cy);
    }
  }
  gameState = "game";
}

// Update & draw game
function updateGame(dt) {
  const currentTime = performance.now();
  timeLeft -= dt / 1000;
  if (timeLeft <= 0) {
    gameState = "game_over";
    lastScore = scoreTotal;
    if (currentPlayer) {
      currentPlayer.score = scoreTotal;
      addParticipantToXano(currentPlayer.nickname, currentPlayer.wallet, scoreTotal);
    }
    return;
  }
  ensureVisibleChunks(cameraX, cameraY, canvas.width, canvas.height);

  // Remove finished flying digits
  flyingDigits = flyingDigits.filter(fd => (currentTime - fd.startTime) < fd.duration);

  // Respawn
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

function drawGame() {
  ctx.fillStyle = "#021013";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const currentTime = performance.now();

  drawCells(ctx, cameraX, cameraY, canvas.width, canvas.height);

  // Draw flying digits
  for (let fd of flyingDigits) {
    fd.draw(ctx, currentTime);
  }

  // Draw 2 "folders" at bottom
  for (let i = 0; i < 2; i++) {
    const rectX = i * canvas.width / 2;
    const rectY = canvas.height - 80; // FOLDER_HEIGHT
    ctx.fillStyle = "#7AC0D6";
    ctx.fillRect(rectX, rectY, canvas.width / 2, 80);
    ctx.strokeStyle = "#7AC0D6";
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX, rectY, canvas.width / 2, 80);
    ctx.font = "24px Arial";
    ctx.fillStyle = "#021013";
    ctx.textAlign = "center";
    ctx.fillText(`${folderNames[i]}: ${folderScores[i]}`, rectX + canvas.width / 4, rectY + 80 / 2);
  }

  // Score (top-left)
  ctx.font = "24px Arial";
  ctx.fillStyle = "#7AC0D6";
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${scoreTotal}`, 10, 30);

  // Timer (top-center)
  ctx.textAlign = "center";
  ctx.fillText(`${Math.floor(timeLeft)} s.`, canvas.width / 2, 30);

  // Time-plus animations
  for (const k in timeAnimations) {
    const anim = timeAnimations[k];
    const keep = anim.draw(ctx, currentTime);
    if (!keep) {
      delete timeAnimations[k];
    }
  }
}

// Main loop
function gameLoop() {
  // For debugging:
  // console.log("gameLoop, state =", gameState);

  const currentTime = performance.now();
  const dt = currentTime - lastUpdateTime;
  lastUpdateTime = currentTime;

  switch (gameState) {
    case "menu":
      drawMenu();
      break;
    case "game":
      updateGame(dt);
      drawGame();
      break;
    case "game_over":
      drawGameOver();
      break;
  }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
