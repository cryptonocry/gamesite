"use strict";

// Получаем canvas, контекст и кнопку полного экрана
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const fullscreenButton = document.getElementById("fullscreenButton");

// Обработчик для переключения полноэкранного режима
fullscreenButton.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

// Подгоняем размеры canvas под окно
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ----------------------
// Глобальные константы и переменные
// ----------------------
const CELL_SIZE = 80;
const CHUNK_SIZE = 20;
const START_TIME = 60; // секунд
const FOLDER_HEIGHT = 80;
// Цвета
const COLOR_BG = "#021013";
const COLOR_DIGITS = "#7AC0D6";
const COLOR_FOLDERS_BG = "#7AC0D6";
const COLOR_FOLDERS_TXT = "#021013";
const COLOR_SCORE_OUTLINE = "#7AC0D6";
const COLOR_SCORE_TXT = "#7AC0D6";
const COLOR_MENU_TXT = "#7AC0D6";
const COLOR_MENU_SEL = "#FFFFFF";
const COLOR_TIMER_BG = "#021013";
const COLOR_TIMER_OUTLINE = "#7AC0D6";
const COLOR_TIMER_TXT = "#7AC0D6";
const COLOR_TIME_PLUS = "green";

// Поле игры
let cells = {}; // ключ "x_y" → объект Digit
let generatedChunks = new Set();
let folderScores = [0, 0];
const folderNames = ["Перевёрнутые", "Иная анимация"];
let topRecords = [];

// Фактор сложности (меньшее число – сложнее)
let difficultyFactor = 1;

// Состояния игры: "menu", "difficulty", "game", "game_over", "records"
let gameState = "menu";
let menuOptions = ["Начать игру", "Сложность", "Рекорды", "Выход"];
// Для меню будем считать, что каждый пункт занимает по 40px по высоте.
let menuItemHeight = 40;

let difficultyOptions = ["Лёгкая", "Средняя", "Сложная"];
let difficultyFactors = [4, 2, 1];
let difficultySelection = 2; // по умолчанию "Сложная"

// Счёт, таймер и прочее
let scoreTotal = 0;
let timeLeft = START_TIME;
let flyingDigits = [];
let timeAnimations = [];
let slotsToRespawn = {};

// Положение камеры
let cameraX = canvas.width/2, cameraY = canvas.height/2;

// Для перетаскивания камеры правой кнопкой мыши
let isDragging = false;
let dragStart = {x: 0, y: 0};
let cameraStart = {x: 0, y: 0};

let lastUpdateTime = performance.now();

// ----------------------
// Классы
// ----------------------

// Класс Digit – отрисовываемая цифра с анимацией
class Digit {
  constructor(gx, gy, value, anomaly, spawnTime = performance.now()) {
    this.gx = gx;
    this.gy = gy;
    this.value = value;
    this.anomaly = anomaly; // 0: нет, 1: перевёрнутая, 2: странная
    this.spawnTime = spawnTime;
    this.baseAmplitude = 5.0;
    this.baseSpeed = 2.0;
    if (this.anomaly === Digit.ANOMALY_STRANGE) {
      this.baseAmplitude *= 2.0;
      this.baseSpeed *= 1.6;
    }
    // Увеличиваем разброс, чтобы анимация была менее синхронной
    this.phaseOffset = Math.random() * 200;
    this.appearDelay = Math.random() * 1000; // мс
    this.appearDuration = 300 + Math.random() * 400; // мс
    this.appearStart = null;
  }
  // Вычисляем позицию с учётом анимации
  screenPosition(cameraX, cameraY, currentTime) {
    let baseX = this.gx * CELL_SIZE + cameraX;
    let baseY = this.gy * CELL_SIZE + cameraY;
    // Добавляем смещение с учётом координат для разнообразия
    let dt = (currentTime - this.phaseOffset) / 1000;
    let dx = this.baseAmplitude * Math.cos(this.baseSpeed * dt + this.gx);
    let dy = this.baseAmplitude * Math.sin(this.baseSpeed * dt + this.gy);
    let age = currentTime - this.spawnTime;
    if (age < 1000) {
      let factor = age / 1000;
      dx *= factor;
      dy *= factor;
    }
    if (this.appearStart === null && age >= this.appearDelay) {
      this.appearStart = currentTime;
    }
    let scale = 1.0;
    let alpha = 1.0;
    if (this.appearStart !== null) {
      let progress = Math.min(1.0, (currentTime - this.appearStart) / this.appearDuration);
      scale = progress;
      alpha = progress;
    }
    return { x: baseX + dx, y: baseY + dy, scale: scale, alpha: alpha };
  }
  // Отрисовка цифры с учётом особенностей анимации
  draw(ctx, cameraX, cameraY, currentTime) {
    let pos = this.screenPosition(cameraX, cameraY, currentTime);
    let finalScale = pos.scale;
    // Для "странной" аномалии добавляем пульсацию, аналогично оригиналу
    if (this.anomaly === Digit.ANOMALY_STRANGE) {
      let pulsation = 0.2 * Math.sin(this.baseSpeed * 0.7 * currentTime/1000 + this.phaseOffset);
      finalScale *= (1.0 + pulsation);
    }
    ctx.save();
    ctx.globalAlpha = pos.alpha;
    ctx.font = `${24 * finalScale}px Arial`;
    ctx.fillStyle = COLOR_DIGITS;
    if (this.anomaly === Digit.ANOMALY_UPSIDE) {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.scale(1, -1);
      ctx.fillText(String(this.value), -10, 10);
      ctx.restore();
    } else {
      ctx.fillText(String(this.value), pos.x, pos.y);
    }
    ctx.restore();
  }
}
Digit.ANOMALY_NONE = 0;
Digit.ANOMALY_UPSIDE = 1;
Digit.ANOMALY_STRANGE = 2;

// Класс FlyingDigit – анимирует "улёт" цифры к папке
class FlyingDigit {
  constructor(digit, sx, sy, ex, ey, startTime, duration) {
    this.digit = digit;
    this.startX = sx;
    this.startY = sy;
    this.endX = ex;
    this.endY = ey;
    this.startTime = startTime;
    this.duration = duration; // мс
  }
  updatePosition(currentTime) {
    let t = (currentTime - this.startTime) / this.duration;
    t = Math.max(0, Math.min(t, 1));
    let x = this.startX + (this.endX - this.startX) * t;
    let y = this.startY + (this.endY - this.startY) * t;
    return { x, y };
  }
  draw(ctx, currentTime) {
    let pos = this.updatePosition(currentTime);
    ctx.save();
    ctx.font = "24px Arial";
    ctx.fillStyle = COLOR_DIGITS;
    if (this.digit.anomaly === Digit.ANOMALY_UPSIDE) {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.scale(1, -1);
      ctx.fillText(String(this.digit.value), -10, 10);
      ctx.restore();
    } else {
      ctx.fillText(String(this.digit.value), pos.x, pos.y);
    }
    ctx.restore();
  }
}

// Класс TimePlusAnimation – для анимации бонусного времени "+N s"
class TimePlusAnimation {
  constructor(text, startX, startY, startTime, duration = 2000) {
    this.text = text;
    this.startX = startX;
    this.startY = startY;
    this.startTime = startTime;
    this.duration = duration; // мс
  }
  draw(ctx, currentTime) {
    let t = currentTime - this.startTime;
    if (t > this.duration) return false;
    let alpha = 1.0 - t / this.duration;
    let dy = -20 * (t / this.duration);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "24px Arial";
    ctx.fillStyle = COLOR_TIME_PLUS;
    ctx.fillText(this.text, this.startX, this.startY + dy);
    ctx.restore();
    return true;
  }
}

// ----------------------
// Функции генерации поля (чанков)
// ----------------------
function getChunkCoords(cx, cy) {
  let coords = [];
  let baseX = cx * CHUNK_SIZE;
  let baseY = cy * CHUNK_SIZE;
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      coords.push({ x: baseX + lx, y: baseY + ly });
    }
  }
  return coords;
}

function generateClusterInChunk(cx, cy, anomaly, minSize = 5, maxSize = 9) {
  let allCoords = getChunkCoords(cx, cy);
  // Перемешиваем координаты
  for (let i = allCoords.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [allCoords[i], allCoords[j]] = [allCoords[j], allCoords[i]];
  }
  let clusterSize = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
  for (let coord of allCoords) {
    let key = `${coord.x}_${coord.y}`;
    if (cells[key] && cells[key].anomaly === Digit.ANOMALY_NONE) {
      let visited = new Set();
      let queue = [];
      visited.add(key);
      queue.push(key);
      let result = [key];
      while (queue.length > 0 && result.length < clusterSize) {
        let current = queue.shift();
        let parts = current.split("_").map(Number);
        let cx2 = parts[0], cy2 = parts[1];
        let directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let d of directions) {
          let nx = cx2 + d[0], ny = cy2 + d[1];
          let nkey = `${nx}_${ny}`;
          if (cells[nkey] && !visited.has(nkey) && cells[nkey].anomaly === Digit.ANOMALY_NONE) {
            visited.add(nkey);
            queue.push(nkey);
            result.push(nkey);
          }
        }
      }
      if (result.length >= minSize) {
        for (let k of result) {
          cells[k].anomaly = anomaly;
        }
        break;
      }
    }
  }
}

function generateChunk(cx, cy) {
  let chunkKey = `${cx}_${cy}`;
  if (generatedChunks.has(chunkKey)) return;
  generatedChunks.add(chunkKey);
  let coords = getChunkCoords(cx, cy);
  for (let coord of coords) {
    let key = `${coord.x}_${coord.y}`;
    let value = Math.floor(Math.random() * 10);
    let digit = new Digit(coord.x, coord.y, value, Digit.ANOMALY_NONE);
    cells[key] = digit;
  }
  // Гарантированное создание кластеров для обеих аномалий
  generateClusterInChunk(cx, cy, Digit.ANOMALY_UPSIDE);
  generateClusterInChunk(cx, cy, Digit.ANOMALY_STRANGE);
  // Дополнительные случайные кластеры
  let numClusters = Math.floor((2 * difficultyFactor) - 2);
  for (let i = 0; i < numClusters; i++) {
    let anomaly = (Math.random() < 0.5) ? Digit.ANOMALY_UPSIDE : Digit.ANOMALY_STRANGE;
    generateClusterInChunk(cx, cy, anomaly);
  }
}

function ensureVisibleChunks() {
  let leftWorld = -cameraX / CELL_SIZE;
  let topWorld = -cameraY / CELL_SIZE;
  let rightWorld = (canvas.width - cameraX) / CELL_SIZE;
  let bottomWorld = (canvas.height - cameraY) / CELL_SIZE;
  let cx_min = Math.floor(leftWorld / CHUNK_SIZE) - 1;
  let cx_max = Math.floor(rightWorld / CHUNK_SIZE) + 1;
  let cy_min = Math.floor(topWorld / CHUNK_SIZE) - 1;
  let cy_max = Math.floor(bottomWorld / CHUNK_SIZE) + 1;
  for (let cx = cx_min; cx <= cx_max; cx++) {
    for (let cy = cy_min; cy <= cy_max; cy++) {
      generateChunk(cx, cy);
    }
  }
}

function drawCells() {
  let currentTime = performance.now();
  for (let key in cells) {
    let pos = cells[key].screenPosition(cameraX, cameraY, currentTime);
    if (pos.x < -CELL_SIZE || pos.x > canvas.width + CELL_SIZE || pos.y < -CELL_SIZE || pos.y > canvas.height + CELL_SIZE)
      continue;
    cells[key].draw(ctx, cameraX, cameraY, currentTime);
  }
}

// ----------------------
// BFS для сбора групп цифр
// ----------------------
function bfsCollectValue(sx, sy) {
  let key = `${sx}_${sy}`;
  if (!cells[key]) return [];
  let startVal = cells[key].value;
  let visited = new Set();
  let queue = [];
  visited.add(key);
  queue.push(key);
  let group = [];
  while (queue.length > 0) {
    let current = queue.shift();
    group.push(current);
    let parts = current.split("_").map(Number);
    let cx = parts[0], cy = parts[1];
    let directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let d of directions) {
      let nx = cx + d[0], ny = cy + d[1];
      let nkey = `${nx}_${ny}`;
      if (cells[nkey] && !visited.has(nkey) && cells[nkey].value === startVal) {
        visited.add(nkey);
        queue.push(nkey);
      }
    }
  }
  if (group.length < 5) return [];
  return group;
}

function bfsCollectAnomaly(sx, sy, anomaly) {
  let key = `${sx}_${sy}`;
  if (!cells[key] || cells[key].anomaly !== anomaly) return [];
  let visited = new Set();
  let queue = [];
  visited.add(key);
  queue.push(key);
  let group = [];
  while (queue.length > 0) {
    let current = queue.shift();
    group.push(current);
    let parts = current.split("_").map(Number);
    let cx = parts[0], cy = parts[1];
    let directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let d of directions) {
      let nx = cx + d[0], ny = cy + d[1];
      let nkey = `${nx}_${ny}`;
      if (cells[nkey] && !visited.has(nkey) && cells[nkey].anomaly === anomaly) {
        visited.add(nkey);
        queue.push(nkey);
      }
    }
  }
  if (group.length < 5) return [];
  return group;
}

function getClickedDigit(mouseX, mouseY) {
  let currentTime = performance.now();
  let closestKey = null;
  let closestDist = Infinity;
  for (let key in cells) {
    let pos = cells[key].screenPosition(cameraX, cameraY, currentTime);
    let dx = mouseX - pos.x;
    let dy = mouseY - pos.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 20 && dist < closestDist) {
      closestKey = key;
      closestDist = dist;
    }
  }
  return closestKey;
}

// ----------------------
// Обработка ввода
// ----------------------

// Перетаскивание камеры правой кнопкой мыши
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 2) {
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    cameraStart = { x: cameraX, y: cameraY };
  }
});
canvas.addEventListener("mousemove", (e) => {
  if (isDragging) {
    let dx = e.clientX - dragStart.x;
    let dy = e.clientY - dragStart.y;
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

// Обработка кликов – теперь в режиме игры и в меню работают клики
canvas.addEventListener("click", (e) => {
  let rect = canvas.getBoundingClientRect();
  let mouseX = e.clientX - rect.left;
  let mouseY = e.clientY - rect.top;
  
  if (gameState === "game") {
    // В режиме игры: сбор цифр по одному клику
    let clickedKey = getClickedDigit(mouseX, mouseY);
    if (clickedKey) {
      let parts = clickedKey.split("_").map(Number);
      let gx = parts[0], gy = parts[1];
      let digit = cells[clickedKey];
      let anomaly = digit.anomaly;
      let currentTime = performance.now();
      // Если клик по аномальной цифре
      if (anomaly === Digit.ANOMALY_UPSIDE || anomaly === Digit.ANOMALY_STRANGE) {
        let group = bfsCollectAnomaly(gx, gy, anomaly);
        if (group.length >= 5) {
          let idx = (anomaly === Digit.ANOMALY_UPSIDE) ? 0 : 1;
          let fx = canvas.width / 4 + (idx * canvas.width / 2);
          let fy = canvas.height - FOLDER_HEIGHT / 2;
          let countDig = group.length;
          for (let key of group) {
            let d = cells[key];
            let pos = d.screenPosition(cameraX, cameraY, currentTime);
            flyingDigits.push(new FlyingDigit(d, pos.x, pos.y, fx, fy, currentTime, 1000));
            delete cells[key];
            slotsToRespawn[key] = currentTime + 2000;
          }
          scoreTotal += countDig * 10;
          folderScores[idx] += countDig;
          timeLeft += countDig;
          timeAnimations.push(new TimePlusAnimation(`+${countDig} s`, 200, 20, currentTime, 2000));
          return;
        }
      }
      // Если клик по группе по значению
      let groupVal = bfsCollectValue(gx, gy);
      if (groupVal.length >= 5) {
        let fx = canvas.width / 4;
        let fy = canvas.height - FOLDER_HEIGHT / 2;
        let cVal = groupVal.length;
        for (let key of groupVal) {
          let d = cells[key];
          let pos = d.screenPosition(cameraX, cameraY, currentTime);
          flyingDigits.push(new FlyingDigit(d, pos.x, pos.y, fx, fy, currentTime, 1000));
          delete cells[key];
          slotsToRespawn[key] = currentTime + 2000;
        }
        scoreTotal += cVal * 10;
        folderScores[0] += cVal;
        timeLeft += cVal;
        timeAnimations.push(new TimePlusAnimation(`+${cVal} s`, 200, 20, currentTime, 2000));
      }
    }
  } else if (gameState === "menu") {
    // Обработка клика по пунктам главного меню
    let optionAreaHeight = 40;
    let baseY = canvas.height/2 - (menuOptions.length * optionAreaHeight)/2;
    for (let i = 0; i < menuOptions.length; i++) {
      let itemY = baseY + i * optionAreaHeight;
      if (mouseX >= canvas.width/2 - 150 && mouseX <= canvas.width/2 + 150 &&
          mouseY >= itemY - optionAreaHeight/2 && mouseY <= itemY + optionAreaHeight/2) {
        let option = menuOptions[i];
        if (option === "Начать игру") {
          startGame();
        } else if (option === "Сложность") {
          gameState = "difficulty";
          difficultySelection = 2;
        } else if (option === "Рекорды") {
          gameState = "records";
        } else if (option === "Выход") {
          location.reload();
        }
        return;
      }
    }
  } else if (gameState === "difficulty") {
    // Обработка клика по меню выбора сложности
    let optionAreaHeight = 40;
    let baseY = canvas.height/2 - (difficultyOptions.length * optionAreaHeight)/2;
    for (let i = 0; i < difficultyOptions.length; i++) {
      let itemY = baseY + i * optionAreaHeight;
      if (mouseX >= canvas.width/2 - 150 && mouseX <= canvas.width/2 + 150 &&
          mouseY >= itemY - optionAreaHeight/2 && mouseY <= itemY + optionAreaHeight/2) {
        difficultySelection = i;
        difficultyFactor = difficultyFactors[i];
        gameState = "menu";
        return;
      }
    }
  } else if (gameState === "records" || gameState === "game_over") {
    // Клик в этих режимах возвращает в меню
    gameState = "menu";
  }
});

// ----------------------
// Функции отрисовки экранов
// ----------------------
function drawMenu() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "36px Arial";
  ctx.fillStyle = COLOR_MENU_TXT;
  ctx.textAlign = "center";
  ctx.fillText("Главное меню", canvas.width/2, canvas.height/4);
  let optionAreaHeight = 40;
  let baseY = canvas.height/2 - (menuOptions.length * optionAreaHeight)/2;
  for (let i = 0; i < menuOptions.length; i++) {
    ctx.font = "36px Arial";
    ctx.fillStyle = COLOR_MENU_TXT;
    ctx.fillText(menuOptions[i], canvas.width/2, baseY + i * optionAreaHeight);
  }
}

function drawDifficultyMenu() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "36px Arial";
  ctx.fillStyle = COLOR_MENU_TXT;
  ctx.textAlign = "center";
  ctx.fillText("Выберите сложность", canvas.width/2, canvas.height/4);
  let optionAreaHeight = 40;
  let baseY = canvas.height/2 - (difficultyOptions.length * optionAreaHeight)/2;
  for (let i = 0; i < difficultyOptions.length; i++) {
    ctx.font = "36px Arial";
    ctx.fillStyle = (i === difficultySelection) ? COLOR_MENU_SEL : COLOR_MENU_TXT;
    ctx.fillText(difficultyOptions[i], canvas.width/2, baseY + i * optionAreaHeight);
  }
  ctx.font = "24px Arial";
  ctx.fillText("Клик - подтвердить, клик вне - отмена", canvas.width/2, canvas.height - 50);
}

function drawRecords() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "36px Arial";
  ctx.fillStyle = COLOR_MENU_TXT;
  ctx.textAlign = "center";
  ctx.fillText("Топ-10 Рекорды", canvas.width/2, canvas.height/6);
  ctx.font = "24px Arial";
  for (let i = 0; i < topRecords.length; i++) {
    ctx.fillText(`${i+1}. ${topRecords[i]}`, canvas.width/2, canvas.height/3 + i * 30);
  }
  ctx.fillText("Клик - вернуться", canvas.width/2, canvas.height - 50);
}

let lastScore = 0;
function drawGameOver() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "36px Arial";
  ctx.fillStyle = COLOR_MENU_TXT;
  ctx.textAlign = "center";
  ctx.fillText("Время вышло!", canvas.width/2, canvas.height/4);
  ctx.fillText(`Ваш счёт: ${lastScore}`, canvas.width/2, canvas.height/2);
  ctx.font = "24px Arial";
  ctx.fillText("Клик - в меню", canvas.width/2, canvas.height - 50);
}

function startGame() {
  cells = {};
  generatedChunks.clear();
  folderScores = [0, 0];
  scoreTotal = 0;
  timeLeft = START_TIME;
  flyingDigits = [];
  timeAnimations = [];
  slotsToRespawn = {};
  for (let cx = -1; cx <= 2; cx++) {
    for (let cy = -1; cy <= 2; cy++) {
      generateChunk(cx, cy);
    }
  }
  gameState = "game";
}

// ----------------------
// Обновление и отрисовка игрового процесса
// ----------------------
function updateGame(dt) {
  let currentTime = performance.now();
  timeLeft -= dt / 1000;
  if (timeLeft <= 0) {
    gameState = "game_over";
    lastScore = scoreTotal;
    tryAddRecord(scoreTotal);
    return;
  }
  ensureVisibleChunks();
  flyingDigits = flyingDigits.filter(fd => (currentTime - fd.startTime) < fd.duration);
  for (let key in slotsToRespawn) {
    if (currentTime >= slotsToRespawn[key]) {
      let parts = key.split("_").map(Number);
      let value = Math.floor(Math.random() * 10);
      let digit = new Digit(parts[0], parts[1], value, Digit.ANOMALY_NONE, currentTime - Math.random() * 1000);
      cells[key] = digit;
      delete slotsToRespawn[key];
    }
  }
}

function drawGame() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let currentTime = performance.now();
  drawCells();
  for (let fd of flyingDigits) {
    fd.draw(ctx, currentTime);
  }
  for (let i = 0; i < 2; i++) {
    let rectX = i * canvas.width / 2;
    let rectY = canvas.height - FOLDER_HEIGHT;
    ctx.fillStyle = COLOR_FOLDERS_BG;
    ctx.fillRect(rectX, rectY, canvas.width / 2, FOLDER_HEIGHT);
    ctx.strokeStyle = COLOR_SCORE_OUTLINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX, rectY, canvas.width / 2, FOLDER_HEIGHT);
    ctx.font = "24px Arial";
    ctx.fillStyle = COLOR_FOLDERS_TXT;
    ctx.textAlign = "center";
    ctx.fillText(`${folderNames[i]}: ${folderScores[i]}`, rectX + canvas.width / 4, rectY + FOLDER_HEIGHT / 2);
  }
  let scoreStr = `Счёт: ${scoreTotal}`;
  ctx.font = "24px Arial";
  ctx.fillStyle = COLOR_SCORE_TXT;
  ctx.textAlign = "left";
  ctx.fillText(scoreStr, 10, 30);
  let timeStr = `${Math.floor(timeLeft)} с.`;
  ctx.font = "24px Arial";
  ctx.fillStyle = COLOR_TIMER_TXT;
  ctx.textAlign = "center";
  ctx.fillText(timeStr, canvas.width / 2, 30);
  timeAnimations = timeAnimations.filter(anim => anim.draw(ctx, currentTime));
}

function gameLoop() {
  let currentTime = performance.now();
  let dt = currentTime - lastUpdateTime;
  lastUpdateTime = currentTime;
  switch (gameState) {
    case "menu":
      drawMenu();
      break;
    case "difficulty":
      drawDifficultyMenu();
      break;
    case "records":
      drawRecords();
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

function tryAddRecord(score) {
  if (topRecords.length < 10) {
    topRecords.push(score);
    topRecords.sort((a, b) => b - a);
  } else {
    if (score > Math.min(...topRecords)) {
      topRecords.push(score);
      topRecords.sort((a, b) => b - a);
      topRecords.pop();
    }
  }
}
