import { Digit } from "./digit.js";

export const CELL_SIZE = 80;
export const CHUNK_SIZE = 20;

// Global game objects
export let cells = {}; // { "x_y": Digit }
export let generatedChunks = new Set();
export let folderScores = [0, 0];
export const folderNames = ["Upside", "Strange"];

function getChunkCoords(cx, cy) {
  const coords = [];
  const baseX = cx * CHUNK_SIZE;
  const baseY = cy * CHUNK_SIZE;
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      coords.push({ x: baseX + lx, y: baseY + ly });
    }
  }
  return coords;
}

function generateClusterInChunk(cx, cy, anomaly, minSize = 5, maxSize = 9) {
  const allCoords = getChunkCoords(cx, cy);
  // Shuffle coordinates
  for (let i = allCoords.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCoords[i], allCoords[j]] = [allCoords[j], allCoords[i]];
  }
  const clusterSize = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
  for (let coord of allCoords) {
    const key = `${coord.x}_${coord.y}`;
    if (cells[key] && cells[key].anomaly === Digit.ANOMALY_NONE) {
      const visited = new Set();
      const queue = [];
      visited.add(key);
      queue.push(key);
      const result = [key];
      while (queue.length > 0 && result.length < clusterSize) {
        const current = queue.shift();
        const parts = current.split("_").map(Number);
        const cx2 = parts[0], cy2 = parts[1];
        const directions = [[1,0],[-1,0],[0,1],[0,-1]];
        for (let d of directions) {
          const nx = cx2 + d[0], ny = cy2 + d[1];
          const nkey = `${nx}_${ny}`;
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

export function generateChunk(cx, cy) {
  const chunkKey = `${cx}_${cy}`;
  if (generatedChunks.has(chunkKey)) return;
  generatedChunks.add(chunkKey);
  const coords = getChunkCoords(cx, cy);
  for (let coord of coords) {
    const key = `${coord.x}_${coord.y}`;
    const value = Math.floor(Math.random() * 10);
    const digit = new Digit(coord.x, coord.y, value, Digit.ANOMALY_NONE);
    cells[key] = digit;
  }
  // Create guaranteed clusters for Upside and Strange
  generateClusterInChunk(cx, cy, Digit.ANOMALY_UPSIDE);
  generateClusterInChunk(cx, cy, Digit.ANOMALY_STRANGE);
  // Additional clusters (difficultyFactor = 1)
  const numClusters = Math.floor((2 * 1) - 2);
  for (let i = 0; i < numClusters; i++) {
    const anomaly = (Math.random() < 0.5) ? Digit.ANOMALY_UPSIDE : Digit.ANOMALY_STRANGE;
    generateClusterInChunk(cx, cy, anomaly);
  }
}

export function ensureVisibleChunks(cameraX, cameraY, canvasWidth, canvasHeight) {
  const leftWorld = -cameraX / CELL_SIZE;
  const topWorld = -cameraY / CELL_SIZE;
  const rightWorld = (canvasWidth - cameraX) / CELL_SIZE;
  const bottomWorld = (canvasHeight - cameraY) / CELL_SIZE;
  const cx_min = Math.floor(leftWorld / CHUNK_SIZE) - 1;
  const cx_max = Math.floor(rightWorld / CHUNK_SIZE) + 1;
  const cy_min = Math.floor(topWorld / CHUNK_SIZE) - 1;
  const cy_max = Math.floor(bottomWorld / CHUNK_SIZE) + 1;
  for (let cx = cx_min; cx <= cx_max; cx++) {
    for (let cy = cy_min; cy <= cy_max; cy++) {
      generateChunk(cx, cy);
    }
  }
}

export function drawCells(ctx, cameraX, cameraY, canvasWidth, canvasHeight) {
  const currentTime = performance.now();
  for (let key in cells) {
    const digit = cells[key];
    const pos = digit.screenPosition(cameraX, cameraY, currentTime);
    if (pos.x < -CELL_SIZE || pos.x > canvasWidth + CELL_SIZE ||
        pos.y < -CELL_SIZE || pos.y > canvasHeight + CELL_SIZE)
      continue;
    digit.draw(ctx, cameraX, cameraY, currentTime);
  }
}

export function bfsCollectValue(sx, sy) {
  const key = `${sx}_${sy}`;
  if (!cells[key]) return [];
  const startVal = cells[key].value;
  const visited = new Set();
  const queue = [];
  visited.add(key);
  queue.push(key);
  const group = [];
  while (queue.length > 0) {
    const current = queue.shift();
    group.push(current);
    const parts = current.split("_").map(Number);
    const cx = parts[0], cy = parts[1];
    const directions = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let d of directions) {
      const nx = cx + d[0], ny = cy + d[1];
      const nkey = `${nx}_${ny}`;
      if (cells[nkey] && !visited.has(nkey) && cells[nkey].value === startVal) {
        visited.add(nkey);
        queue.push(nkey);
      }
    }
  }
  if (group.length < 5) return [];
  return group;
}

export function bfsCollectAnomaly(sx, sy, anomaly) {
  const key = `${sx}_${sy}`;
  if (!cells[key] || cells[key].anomaly !== anomaly) return [];
  const visited = new Set();
  const queue = [];
  visited.add(key);
  queue.push(key);
  const group = [];
  while (queue.length > 0) {
    const current = queue.shift();
    group.push(current);
    const parts = current.split("_").map(Number);
    const cx = parts[0], cy = parts[1];
    const directions = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let d of directions) {
      const nx = cx + d[0], ny = cy + d[1];
      const nkey = `${nx}_${ny}`;
      if (cells[nkey] && !visited.has(nkey) && cells[nkey].anomaly === anomaly) {
        visited.add(nkey);
        queue.push(nkey);
      }
    }
  }
  if (group.length < 5) return [];
  return group;
}

export function getClickedDigit(mouseX, mouseY, cameraX, cameraY) {
  const currentTime = performance.now();
  let closestKey = null;
  let closestDist = Infinity;
  for (let key in cells) {
    const digit = cells[key];
    const pos = digit.screenPosition(cameraX, cameraY, currentTime);
    const dx = mouseX - pos.x;
    const dy = mouseY - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 20 && dist < closestDist) {
      closestKey = key;
      closestDist = dist;
    }
  }
  return closestKey;
}
