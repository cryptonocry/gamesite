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
// ЭЛЕМЕНТЫ HTML
// --------------------------------
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

// --------------------------------
// ПАРАМЕТРЫ ИГРЫ
// --------------------------------
const START_TIME    = 60;
const FOLDER_HEIGHT = 80;
let gameState  = "menu"; // "menu", "game", "game_over"
let currentPlayer = null; // { nickname, wallet, score }
let scoreTotal = 0;
let timeLeft   = START_TIME;
let flyingDigits  = [];
let timeAnimations = {};
let slotsToRespawn = {};

// Параметры камеры
let cameraX = canvas.width / 2;
let cameraY = canvas.height / 2;
let isDragging = false;
let dragStart  = { x: 0, y: 0 };
let cameraStart= { x: 0, y: 0 };

let lastUpdateTime = performance.now();
let lastScore = 0; // Запоминаем счёт для game_over

// --------------------------------
// ПОЛНОЭКРАННЫЙ РЕЖИМ
// --------------------------------
fullscreenButton.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

// --------------------------------
// ФУНКЦИЯ ИЗМЕНЕНИЯ РАЗМЕРОВ CANVAS
// --------------------------------
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// --------------------------------
// ВХОД (LOGIN): никнейм + кошелёк
// --------------------------------
loginButton.addEventListener("click", () => {
  const nickname = nicknameInput.value.trim();
  const wallet   = walletInput.value.trim();
  if (!nickname || !wallet) {
    alert("Заполните оба поля!");
    return;
  }
  currentPlayer = { nickname, wallet, score: 0 };
  console.log("Логин успешен:", currentPlayer);
  loginContainer.style.display = "none";
  startGame();
});

// --------------------------------
// ЗАКРЫТИЕ РЕЙТИНГА
// --------------------------------
closeRecordsButton.addEventListener("click", () => {
  recordsContainer.style.display = "none";
  gameState = "menu";
});

// --------------------------------
// ОБРАБОТКА КЛИКОВ НА CANVAS
// --------------------------------
canvas.addEventListener("click", async (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  if (gameState === "menu") {
    // Меню: "Начать игру", "Рекорды", "Выход"
    const menuOptions = ["Начать игру", "Рекорды", "Выход"];
    const optionAreaHeight = 40;
    const baseY = canvas.height / 2 - (menuOptions.length * optionAreaHeight) / 2;
    for (let i = 0; i < menuOptions.length; i++) {
      const itemY = baseY + i * optionAreaHeight;
      if (mouseX >= canvas.width / 2 - 150 && mouseX <= canvas.width / 2 + 150 &&
          mouseY >= itemY - optionAreaHeight / 2 && mouseY <= itemY + optionAreaHeight / 2) {
        const option = menuOptions[i];
        if (option === "Начать игру") {
          // Если не введён никнейм + кошелёк
          if (!currentPlayer) {
            loginContainer.style.display = "block";
          } else {
            startGame();
          }
        } else if (option === "Рекорды") {
          await showRecordsOverlay(recordsTableContainer, recordsContainer, currentPlayer);
        } else if (option === "Выход") {
          location.reload();
        }
        return;
      }
    }
  }
  else if (gameState === "game") {
    // Логика кликов во время игры
    const clickedKey = getClickedDigit(mouseX, mouseY, cameraX, cameraY);
    if (clickedKey) {
      const parts = clickedKey.split("_").map(Number);
      const gx = parts[0], gy = parts[1];
      const digit = cells[clickedKey];
      const anomaly = digit.anomaly;
      const currentTime = performance.now();

      // Сбор групп по аномалии
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
          timeLeft += countDig;
          console.log("Собрано аномалий:", countDig);
          const plusAnim = new TimePlusAnimation(`+${countDig} s`, 200, 20, currentTime, 2000);
          timeAnimations[Date.now()] = plusAnim;
          return;
        }
      }
      // Сбор групп по значению
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
        timeLeft += cVal;
        console.log("Собрано по значению:", cVal);
        const plusAnim = new TimePlusAnimation(`+${cVal} s`, 200, 20, currentTime, 2000);
        timeAnimations[Date.now()] = plusAnim;
      }
    }
  }
  else if (gameState === "game_over") {
    // При клике в game_over → меню
    gameState = "menu";
  }
});

// --------------------------------
// ПЕРЕТАСКИВАНИЕ КАМЕРЫ ПРАВОЙ КНОПКОЙ
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
// ОТРИСОВКА МЕНЮ И GAME OVER
// --------------------------------
function drawMenu() {
  ctx.fillStyle = "#021013";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "36px Arial";
  ctx.fillStyle = "#7AC0D6";
  ctx.textAlign = "center";
  ctx.fillText("Главное меню", canvas.width / 2, canvas.height / 4);

  const menuOptions = ["Начать игру", "Рекорды", "Выход"];
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
  ctx.fillText("Время вышло!", canvas.width / 2, canvas.height / 4);
  ctx.fillText(`Ваш счёт: ${lastScore}`, canvas.width / 2, canvas.height / 2);
  ctx.font = "24px Arial";
  ctx.fillText("Клик - в меню", canvas.width / 2, canvas.height - 50);
}

// --------------------------------
// СТАРТ ИГРЫ
// --------------------------------
function startGame() {
  console.log("Game started");
  // Сброс всего
  for (const key in cells) delete cells[key];
  generatedChunks.clear();
  folderScores[0] = 0;
  folderScores[1] = 0;
  scoreTotal = 0;
  timeLeft = START_TIME;
  flyingDigits = [];
  timeAnimations = {};
  slotsToRespawn = {};

  // Генерируем чанки вокруг (0,0)
  for (let cx = -1; cx <= 2; cx++) {
    for (let cy = -1; cy <= 2; cy++) {
      generateChunk(cx, cy);
    }
  }
  gameState = "game";
}

// --------------------------------
// ОБНОВЛЕНИЕ И ОТРИСОВКА
// --------------------------------
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
  
  // Убираем "улетающие цифры", если их анимация завершена
  flyingDigits = flyingDigits.filter(fd => (currentTime - fd.startTime) < fd.duration);

  // Респавн цифр
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

  // Отрисовка всех клеток
  drawCells(ctx, cameraX, cameraY, canvas.width, canvas.height);

  // Отрисовка "улетающих" цифр
  for (let fd of flyingDigits) {
    fd.draw(ctx, currentTime);
  }

  // Отрисовка папок (2 штуки)
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

  // Счёт (левый верх)
  ctx.font = "24px Arial";
  ctx.fillStyle = "#7AC0D6";
  ctx.textAlign = "left";
  ctx.fillText(`Счёт: ${scoreTotal}`, 10, 30);

  // Таймер (верх, центр)
  ctx.textAlign = "center";
  ctx.fillText(`${Math.floor(timeLeft)} с.`, canvas.width / 2, 30);

  // Анимации "+N s"
  for (const key in timeAnimations) {
    const anim = timeAnimations[key];
    const keep = anim.draw(ctx, currentTime);
    if (!keep) {
      delete timeAnimations[key];
    }
  }
}

// --------------------------------
// ГЛАВНЫЙ ЦИКЛ
// --------------------------------
function gameLoop() {
  // Для отладки можно выводить:
  // console.log("gameLoop called, gameState =", gameState);

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
