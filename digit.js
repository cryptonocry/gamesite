export class Digit {
  constructor(gx, gy, value, anomaly, spawnTime = performance.now()) {
    this.gx = gx;
    this.gy = gy;
    this.value = value;
    this.anomaly = anomaly; // 0: none, 1: upside, 2: strange
    this.spawnTime = spawnTime;
    this.baseAmplitude = 5.0;
    this.baseSpeed = 2.0;
    if (this.anomaly === Digit.ANOMALY_STRANGE) {
      this.baseAmplitude *= 2.0;
      this.baseSpeed *= 1.6;
    }
    this.phaseOffset = Math.random() * Math.PI * 2;
    this.appearDelay = Math.random() * 1000;
    this.appearDuration = 300 + Math.random() * 400;
    this.appearStart = null;
  }

  screenPosition(cameraX, cameraY, currentTime) {
    const CELL_SIZE = 80;
    const baseX = this.gx * CELL_SIZE + cameraX;
    const baseY = this.gy * CELL_SIZE + cameraY;
    const dt = (currentTime - this.spawnTime) / 1000;
    const angle = this.baseSpeed * dt + this.phaseOffset;
    let dx = this.baseAmplitude * Math.cos(angle);
    let dy = this.baseAmplitude * Math.sin(angle);
    const age = currentTime - this.spawnTime;
    if (age < 1000) {
      const factor = age / 1000;
      dx *= factor;
      dy *= factor;
    }
    if (this.appearStart === null && age >= this.appearDelay) {
      this.appearStart = currentTime;
    }
    let scale = 1.0, alpha = 1.0;
    if (this.appearStart !== null) {
      const progress = Math.min(1.0, (currentTime - this.appearStart) / this.appearDuration);
      scale = progress;
      alpha = progress;
    }
    return { x: baseX + dx, y: baseY + dy, scale, alpha };
  }

  draw(ctx, cameraX, cameraY, currentTime) {
    const pos = this.screenPosition(cameraX, cameraY, currentTime);
    let finalScale = pos.scale;
    if (this.anomaly === Digit.ANOMALY_STRANGE) {
      const pulsation = 0.2 * Math.sin(this.baseSpeed * 0.7 * ((currentTime - this.spawnTime) / 1000) + this.phaseOffset);
      finalScale *= (1.0 + pulsation);
    }
    ctx.save();
    ctx.globalAlpha = pos.alpha;
    ctx.font = `${24 * finalScale}px Arial`;
    ctx.fillStyle = "#7AC0D6";
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

export class FlyingDigit {
  constructor(digit, sx, sy, ex, ey, startTime, duration) {
    this.digit = digit;
    this.startX = sx;
    this.startY = sy;
    this.endX = ex;
    this.endY = ey;
    this.startTime = startTime;
    this.duration = duration;
  }

  updatePosition(currentTime) {
    let t = (currentTime - this.startTime) / this.duration;
    t = Math.max(0, Math.min(t, 1));
    const x = this.startX + (this.endX - this.startX) * t;
    const y = this.startY + (this.endY - this.startY) * t;
    return { x, y };
  }

  draw(ctx, currentTime) {
    const pos = this.updatePosition(currentTime);
    ctx.save();
    ctx.font = "24px Arial";
    ctx.fillStyle = "#7AC0D6";
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

export class TimePlusAnimation {
  constructor(text, startX, startY, startTime, duration = 2000) {
    this.text = text;
    this.startX = startX;
    this.startY = startY;
    this.startTime = startTime;
    this.duration = duration;
  }

  draw(ctx, currentTime) {
    const t = currentTime - this.startTime;
    if (t > this.duration) return false;
    const alpha = 1.0 - t / this.duration;
    const dy = -20 * (t / this.duration);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "24px Arial";
    ctx.fillStyle = "green";
    ctx.fillText(this.text, this.startX, this.startY + dy);
    ctx.restore();
    return true;
  }
}
