// Получаем canvas и его контекст
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Функция изменения размеров canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Константы и глобальные переменные
const CELL_SIZE = 80;
let cameraX = canvas.width / 2;
let cameraY = canvas.height / 2;

// Для простоты используем фиксированную сетку 30x30
const GRID_WIDTH = 30;
const GRID_HEIGHT = 30;
let cells = {}; // Ключи вида "x_y", значения – объекты Digit

// Класс Digit – аналог класса в Pygame
class Digit {
  constructor(gx, gy, value, anomaly, spawnTime = performance.now()) {
    this.gx = gx;
    this.gy = gy;
    this.value = value;
    this.anomaly = anomaly;
    this.spawnTime = spawnTime;
    this.baseAmplitude = 5.0;
    this.baseSpeed = 2.0;
    if (this.anomaly === Digit.ANOMALY_STRANGE) {
      this.baseAmplitude *= 2.0;
      this.baseSpeed *= 1.6;
    }
    this.phaseOffset = Math.random() * 100;
    // Задержка и длительность появления (в миллисекундах)
    this.appearDelay = Math.random() * 1000;
    this.appearDuration = 300 + Math.random() * 400;
    this.appearStart = null;
  }

  // Вычисляем позицию, масштаб и прозрачность для анимации
  screenPosition(cameraX, cameraY, currentTime) {
    let dt = (currentTime - this.phaseOffset) / 1000;
    let baseX = this.gx * CELL_SIZE + cameraX;
    let baseY = this.gy * CELL_SIZE + cameraY;
    let dx = this.baseAmplitude * Math.cos(this.baseSpeed * dt);
    let dy = this.baseAmplitude * Math.sin(this.baseSpeed * dt);
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

  // Отрисовка цифры на canvas
  draw(ctx, cameraX, cameraY, currentTime) {
    let pos = this.screenPosition(cameraX, cameraY, currentTime);
    ctx.save();
    ctx.globalAlpha = pos.alpha;
    // Размер шрифта масштабируется
    ctx.font = `${24 * pos.scale}px Arial`;
    ctx.fillStyle = "#7AC0D6";
    // Если аномалия "перевёрнутая" – отрисовываем перевёрнутым
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

// Инициализируем сетку цифр
function initGrid() {
  for (let x = 0; x < GRID_WIDTH; x++) {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      let value = Math.floor(Math.random() * 10);
      // Для примера назначаем аномалию случайным образом
      let anomaly = Digit.ANOMALY_NONE;
      let rand = Math.random();
      if (rand < 0.1) anomaly = Digit.ANOMALY_UPSIDE;
      else if (rand < 0.2) anomaly = Digit.ANOMALY_STRANGE;
      let digit = new Digit(x, y, value, anomaly, performance.now());
      cells[`${x}_${y}`] = digit;
    }
  }
}
initGrid();

// Главный игровой цикл с использованием requestAnimationFrame
let lastTime = performance.now();
function gameLoop(currentTime) {
  let dt = currentTime - lastTime;
  lastTime = currentTime;
  update(dt, currentTime);
  draw(currentTime);
  requestAnimationFrame(gameLoop);
}

function update(dt, currentTime) {
  // Здесь можно добавить обновление логики игры (например, перемещение камеры, сбор групп и т.д.)
}

function draw(currentTime) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Отрисовываем все цифры из сетки
  for (let key in cells) {
    cells[key].draw(ctx, cameraX, cameraY, currentTime);
  }
}

// Обработчик кликов – можно добавить логику выбора и удаления группы цифр
canvas.addEventListener('click', function (event) {
  let rect = canvas.getBoundingClientRect();
  let x = event.clientX - rect.left;
  let y = event.clientY - rect.top;
  console.log("Клик по координатам", x, y);
  // Здесь можно реализовать логику определения, по какой цифре кликнули, и дальнейшие действия
});

// Обработчик двойного клика для перехода в полноэкранный режим
canvas.addEventListener('dblclick', function () {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    canvas.requestFullscreen();
  }
});

// Запускаем игровой цикл
requestAnimationFrame(gameLoop);
