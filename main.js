"use strict";

// --------------------------------------------------
// 1) ССЫЛКИ НА ВАШИ ЭНДПОИНТЫ XANO
// --------------------------------------------------
const XANO_GET_URL  = "https://x8ki-letl-twmt.n7.xano.io/api:7fuLzq6k/gamerecords_get";
const XANO_POST_URL = "https://x8ki-letl-twmt.n7.xano.io/api:7fuLzq6k/gamerecords_post";

// --------------------------------------------------
// 2) ПОЛУЧАЕМ HTML-ЭЛЕМЕНТЫ
// --------------------------------------------------
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

// --------------------------------------------------
// 3) НАСТРОЙКА CANVAS И ПОЛНОЭКРАННОЙ КНОПКИ
// --------------------------------------------------
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

fullscreenButton.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

// --------------------------------------------------
// 4) ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ ИГРЫ
// --------------------------------------------------
// Игровые настройки
const CELL_SIZE    = 80;
const CHUNK_SIZE   = 20;
const START_TIME   = 60;  // секунд
const FOLDER_HEIGHT = 80;
let difficultyFactor = 1; // Теперь не меняется, всегда "сложная"

// Цвета
const COLOR_BG          = "#021013";
const COLOR_DIGITS      = "#7AC0D6";
const COLOR_FOLDERS_BG  = "#7AC0D6";
const COLOR_FOLDERS_TXT = "#021013";
const COLOR_SCORE_OUTLINE = "#7AC0D6";
const COLOR_SCORE_TXT   = "#7AC0D6";
const COLOR_MENU_TXT    = "#7AC0D6";
const COLOR_MENU_SEL    = "#FFFFFF";
const COLOR_TIMER_TXT   = "#7AC0D6";
const COLOR_TIME_PLUS   = "green";

// Состояния игры
let gameState = "menu"; // Возможные: "menu", "game", "game_over"

// Параметры игры
let cells = {};                // { "x_y": Digit }
let generatedChunks = new Set();
let folderScores = [0, 0];     // Счёт в двух "папках": перевёрнутые / иная анимация
const folderNames = ["Перевёрнутые", "Иная анимация"];

// Текущий игрок (будет заполнен при входе)
let currentPlayer = null; // { nickname, wallet, score }

// Счёт и таймер
let scoreTotal = 0;
let timeLeft   = START_TIME;

// Прочие массивы и объекты
let flyingDigits  = [];
let timeAnimations = [];
let slotsToRespawn = {};

// Положение камеры
let cameraX = canvas.width / 2;
let cameraY = canvas.height / 2;

// Перетаскивание камеры (правая кнопка мыши)
let isDragging = false;
let dragStart  = { x: 0, y: 0 };
let cameraStart= { x: 0, y: 0 };

// Для игрового цикла
let lastUpdateTime = performance.now();
let lastScore = 0; // Запоминаем счёт для экрана game_over

// --------------------------------------------------
// 5) КЛАССЫ ДЛЯ ЦИФР, АНИМАЦИИ И Т.Д.
// --------------------------------------------------
class Digit {
  constructor(gx, gy, value, anomaly, spawnTime = performance.now()) {
    this.gx = gx;
    this.gy = gy;
    this.value = value;
    this.anomaly = anomaly; // 0: нет, 1: перевёрнутая, 2: странная
    this.spawnTime = spawnTime;

    // Базовые настройки анимации
    this.baseAmplitude = 5.0;
    this.baseSpeed = 2.0;
    if (this.anomaly === Digit.ANOMALY_STRANGE) {
      this.baseAmplitude *= 2.0;
      this.baseSpeed *= 1.6;
    }

    // Случайный фазовый сдвиг (чтобы анимация у каждой цифры была своя)
    this.phaseOffset = Math.random() * Math.PI * 2;

    // Анимация появления
    this.appearDelay = Math.random() * 1000;   // мс
    this.appearDuration = 300 + Math.random() * 400; // мс
    this.appearStart = null;
  }

  screenPosition(cameraX, cameraY, currentTime) {
    let baseX = this.gx * CELL_SIZE + cameraX;
    let baseY = this.gy * CELL_SIZE + cameraY;
    let dt = (currentTime - this.spawnTime) / 1000;
    let angle = this.baseSpeed * dt + this.phaseOffset;
    let dx = this.baseAmplitude * Math.cos(angle);
    let dy = this.baseAmplitude * Math.sin(angle);

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

  draw(ctx, cameraX, cameraY, currentTime) {
    let pos = this.screenPosition(cameraX, cameraY, currentTime);
    let finalScale = pos.scale;
    if (this.anomaly === Digit.ANOMALY_STRANGE) {
      let pulsation = 0.2 * Math.sin(
        this.baseSpeed * 0.7 * ((currentTime - this.spawnTime) / 1000) + this.phaseOffset
      );
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
Digit.ANOMALY_NONE    = 0;
Digit.ANOMALY_UPSIDE  = 1;
Digit.ANOMALY_STRANGE = 2;

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

class TimePlusAnimation {
  constructor(text, startX, startY, startTime, duration = 2000) {
    this.text = text;
    this.startX = startX;
    this.startY = startY;
    this.startTime = startTime;
    this.duration = duration;
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

// --------------------------------------------------
// 6) ЛОГИКА РАБОТЫ С ЧАНКАМИ, ГЕНЕРАЦИЕЙ ЦИФР
// --------------------------------------------------
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
  // Перемешиваем
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
  // Кластеры для аномалий
  generateClusterInChunk(cx, cy, Digit.ANOMALY_UPSIDE);
  generateClusterInChunk(cx, cy, Digit.ANOMALY_STRANGE);
  // Дополнительные кластеры
  let numClusters = Math.floor((2 * difficultyFactor) - 2);
  for (let i = 0; i < numClusters; i++) {
    let anomaly = (Math.random() < 0.5) ? Digit.ANOMALY_UPSIDE : Digit.ANOMALY_STRANGE;
    generateClusterInChunk(cx, cy, anomaly);
  }
}

function ensureVisibleChunks() {
  let leftWorld   = -cameraX / CELL_SIZE;
  let topWorld    = -cameraY / CELL_SIZE;
  let rightWorld  = (canvas.width  - cameraX) / CELL_SIZE;
  let bottomWorld = (canvas.height - cameraY) / CELL_SIZE;

  let cx_min = Math.floor(leftWorld  / CHUNK_SIZE) - 1;
  let cx_max = Math.floor(rightWorld / CHUNK_SIZE) + 1;
  let cy_min = Math.floor(topWorld   / CHUNK_SIZE) - 1;
  let cy_max = Math.floor(bottomWorld/ CHUNK_SIZE) + 1;

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
    if (pos.x < -CELL_SIZE || pos.x > canvas.width  + CELL_SIZE ||
        pos.y < -CELL_SIZE || pos.y > canvas.height + CELL_SIZE) {
      continue;
    }
    cells[key].draw(ctx, cameraX, cameraY, currentTime);
  }
}

// --------------------------------------------------
// 7) BFS ДЛЯ СБОРА ГРУПП
// --------------------------------------------------
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
    let dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 20 && dist < closestDist) {
      closestKey = key;
      closestDist = dist;
    }
  }
  return closestKey;
}

// --------------------------------------------------
// 8) ОБРАБОТЧИКИ КЛИКОВ: ПЕРЕТАСКИВАНИЕ КАМЕРЫ, МЕНЮ, ИГРА
// --------------------------------------------------

// Перетаскивание камеры правой кнопкой
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

// Клик левой кнопкой: меню / игра
canvas.addEventListener("click", (e) => {
  let rect = canvas.getBoundingClientRect();
  let mouseX = e.clientX - rect.left;
  let mouseY = e.clientY - rect.top;

  if (gameState === "menu") {
    // Рисуем пункты: "Начать игру", "Рекорды", "Выход"
    let menuOptions = ["Начать игру", "Рекорды", "Выход"];
    let optionAreaHeight = 40;
    let baseY = canvas.height / 2 - (menuOptions.length * optionAreaHeight) / 2;
    for (let i = 0; i < menuOptions.length; i++) {
      let itemY = baseY + i * optionAreaHeight;
      if (mouseX >= canvas.width / 2 - 150 && mouseX <= canvas.width / 2 + 150 &&
          mouseY >= itemY - optionAreaHeight / 2 && mouseY <= itemY + optionAreaHeight / 2) {
        let option = menuOptions[i];
        if (option === "Начать игру") {
          // Если игрок не залогинен (не ввёл ник и кошелёк), показываем экран входа
          if (!currentPlayer) {
            loginContainer.style.display = "block";
          } else {
            startGame();
          }
        } else if (option === "Рекорды") {
          showRecordsOverlay();
        } else if (option === "Выход") {
          location.reload();
        }
        return;
      }
    }
  }
  else if (gameState === "game") {
    // Ищем, не кликнули ли мы по цифре (сбор групп)
    let clickedKey = getClickedDigit(mouseX, mouseY);
    if (clickedKey) {
      let parts = clickedKey.split("_").map(Number);
      let gx = parts[0], gy = parts[1];
      let digit = cells[clickedKey];
      let anomaly = digit.anomaly;
      let currentTime = performance.now();

      // Сбор групп по аномалии
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
      // Сбор групп по значению
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
  }
  else if (gameState === "game_over") {
    // Клик → возвращаемся в меню
    gameState = "menu";
  }
});

// --------------------------------------------------
// 9) ЛОГИКА ВХОДА (LOGIN) И РЕЙТИНГА (RECORDS)
// --------------------------------------------------

// При нажатии кнопки входа (nickname + wallet)
loginButton.addEventListener("click", () => {
  let nickname = nicknameInput.value.trim();
  let wallet   = walletInput.value.trim();
  if (!nickname || !wallet) {
    alert("Заполните оба поля!");
    return;
  }
  currentPlayer = { nickname, wallet, score: 0 };
  loginContainer.style.display = "none";
  startGame();
});

// Закрыть рейтинг
closeRecordsButton.addEventListener("click", () => {
  recordsContainer.style.display = "none";
  gameState = "menu";
});

// Запросы к Xano
async function addParticipantToXano(nickname, wallet, score) {
  try {
    let body = { nickname, wallet, score };
    let response = await fetch(XANO_POST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    let data = await response.json();
    console.log("Запись добавлена в Xano:", data);
  } catch(e) {
    console.error("Ошибка при отправке данных в Xano:", e);
  }
}

async function fetchAllParticipantsFromXano() {
  try {
    let response = await fetch(XANO_GET_URL);
    let data = await response.json();
    console.log("Список из Xano:", data);
    return data; // Массив объектов [{id, nickname, wallet, score}, ...]
  } catch(e) {
    console.error("Ошибка при получении данных из Xano:", e);
    return [];
  }
}

// Урезаем кошелёк: первые 4 символа, ****, последние 4
function maskWallet(wallet) {
  if (wallet.length <= 8) return wallet;
  return wallet.substring(0,4) + "****" + wallet.substring(wallet.length - 4);
}

// Показать оверлей рейтинга
async function showRecordsOverlay() {
  let records = await fetchAllParticipantsFromXano();
  // Формируем таблицу
  let html = "<table><tr><th>Никнейм</th><th>Биткойн кошелек</th><th>Счёт</th></tr>";
  let currentPlayerIndex = -1;

  records.forEach((rec, index) => {
    let shortWallet = maskWallet(rec.wallet || "");
    let rowId = "";
    // Если совпадает с текущим игроком
    if (currentPlayer && rec.nickname === currentPlayer.nickname && rec.wallet === currentPlayer.wallet) {
      rowId = " id='currentPlayerRow'";
      currentPlayerIndex = index;
    }
    html += `<tr${rowId}>
               <td>${rec.nickname}</td>
               <td>${shortWallet}</td>
               <td>${rec.score}</td>
             </tr>`;
  });
  html += "</table>";

  recordsTableContainer.innerHTML = html;
  recordsContainer.style.display = "block";

  // Скроллим к текущему игроку
  setTimeout(() => {
    let row = document.getElementById("currentPlayerRow");
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 100);
}

// --------------------------------------------------
// 10) МЕНЮ И ЭКРАН GAME OVER (ОТРИСОВКА НА CANVAS)
// --------------------------------------------------
function drawMenu() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "36px Arial";
  ctx.fillStyle = COLOR_MENU_TXT;
  ctx.textAlign = "center";
  ctx.fillText("Главное меню", canvas.width / 2, canvas.height / 4);

  let menuOptions = ["Начать игру", "Рекорды", "Выход"];
  let optionAreaHeight = 40;
  let baseY = canvas.height / 2 - (menuOptions.length * optionAreaHeight) / 2;
  for (let i = 0; i < menuOptions.length; i++) {
    ctx.font = "36px Arial";
    ctx.fillStyle = COLOR_MENU_TXT;
    ctx.fillText(menuOptions[i], canvas.width / 2, baseY + i * optionAreaHeight);
  }
}

function drawGameOver() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "36px Arial";
  ctx.fillStyle = COLOR_MENU_TXT;
  ctx.textAlign = "center";
  ctx.fillText("Время вышло!", canvas.width / 2, canvas.height / 4);
  ctx.fillText(`Ваш счёт: ${lastScore}`, canvas.width / 2, canvas.height / 2);
  ctx.font = "24px Arial";
  ctx.fillText("Клик - в меню", canvas.width / 2, canvas.height - 50);
}

// --------------------------------------------------
// 11) ЛОГИКА СТАРТА ИГРЫ, ОБНОВЛЕНИЯ И ОТРИСОВКИ
// --------------------------------------------------
function startGame() {
  // Сбрасываем все переменные
  cells = {};
  generatedChunks.clear();
  folderScores = [0, 0];
  scoreTotal = 0;
  timeLeft   = START_TIME;
  flyingDigits = [];
  timeAnimations = [];
  slotsToRespawn = {};

  // Генерируем несколько чанков вокруг (0,0)
  for (let cx = -1; cx <= 2; cx++) {
    for (let cy = -1; cy <= 2; cy++) {
      generateChunk(cx, cy);
    }
  }
  gameState = "game";
}

function updateGame(dt) {
  let currentTime = performance.now();
  timeLeft -= dt / 1000;
  if (timeLeft <= 0) {
    gameState = "game_over";
    lastScore = scoreTotal;
    // Отправляем результат в Xano
    if (currentPlayer) {
      currentPlayer.score = scoreTotal;
      addParticipantToXano(currentPlayer.nickname, currentPlayer.wallet, scoreTotal);
    }
    return;
  }
  ensureVisibleChunks();
  // Убираем "улетающие цифры", если время анимации вышло
  flyingDigits = flyingDigits.filter(fd => (currentTime - fd.startTime) < fd.duration);
  // Респавн
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

  // Рисуем летающие цифры
  for (let fd of flyingDigits) {
    fd.draw(ctx, currentTime);
  }

  // Папки (2 штуки)
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

  // Счёт
  ctx.font = "24px Arial";
  ctx.fillStyle = COLOR_SCORE_TXT;
  ctx.textAlign = "left";
  ctx.fillText(`Счёт: ${scoreTotal}`, 10, 30);

  // Таймер
  ctx.textAlign = "center";
  ctx.fillStyle = COLOR_TIMER_TXT;
  ctx.fillText(`${Math.floor(timeLeft)} с.`, canvas.width / 2, 30);

  // Анимации "+N s"
  timeAnimations = timeAnimations.filter(anim => anim.draw(ctx, currentTime));
}

// --------------------------------------------------
// 12) ГЛАВНЫЙ ЦИКЛ (gameLoop)
// --------------------------------------------------
function gameLoop() {
  let currentTime = performance.now();
  let dt = currentTime - lastUpdateTime;
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
