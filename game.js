// ===== Bomber Game =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const $ = id => document.getElementById(id);
const scoreEls = [$('score-d'), $('score-m')].filter(Boolean);
const levelEls = [$('level-d'), $('level-m')].filter(Boolean);
const livesEls = [$('lives-d'), $('lives-m')].filter(Boolean);
const bombCountEl = $('bomb-count');
const bombRangeEl = $('bomb-range');
const speedLevelEl = $('speed-level');
const statusEl = $('status');
const overlayEl = $('overlay');
const overlayTitleEl = $('overlay-title');
const overlayTextEl = $('overlay-text');
const startBtn = $('start-btn');
const pauseBtn = $('pause-btn');
const restartBtn = $('restart-btn');
const pauseBtnM = $('pause-btn-m');
const restartBtnM = $('restart-btn-m');

// Map config
const COLS = 13;
const ROWS = 13;
const TILE = canvas.width / COLS;

// Tile types
const EMPTY = 0;
const WALL = 1;    // indestructible
const BRICK = 2;   // destructible
const BOMB = 3;
const FLAME = 4;
const POWERUP_BOMB = 5;
const POWERUP_RANGE = 6;
const POWERUP_SPEED = 7;

// Colors
const TILE_COLORS = {
  [WALL]: '#4a5568',
  [BRICK]: '#92613a',
  [BOMB]: '#1a1a2e',
  [FLAME]: '#ff6b35',
  [POWERUP_BOMB]: '#1a1a2e',
  [POWERUP_RANGE]: '#1a1a2e',
  [POWERUP_SPEED]: '#1a1a2e',
};

// Game state
let map, player, enemies, bombs, flames, powerups;
let score, level, lives;
let running = false, paused = false, gameOverFlag = false;
let animationId = null, lastTime = 0;
let keys = {};

// Player
const BASE_SPEED = 120; // pixels per second
let playerSpeed, maxBombs, bombRange;

function generateMap() {
  const m = Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
  // Walls: fixed grid pattern
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS-1 || c === 0 || c === COLS-1) {
        m[r][c] = WALL;
      } else if (r % 2 === 0 && c % 2 === 0) {
        m[r][c] = WALL;
      }
    }
  }
  // Bricks: random fill
  const brickChance = 0.35 + level * 0.02;
  for (let r = 1; r < ROWS-1; r++) {
    for (let c = 1; c < COLS-1; c++) {
      if (m[r][c] !== EMPTY) continue;
      // Keep player spawn area clear (top-left corner)
      if ((r <= 2 && c <= 2)) continue;
      if (Math.random() < Math.min(brickChance, 0.55)) {
        m[r][c] = BRICK;
      }
    }
  }
  return m;
}

function spawnEnemies() {
  const count = Math.min(2 + level, 8);
  const ens = [];
  const attempts = 200;
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < attempts; a++) {
      const r = 1 + Math.floor(Math.random() * (ROWS - 2));
      const c = 1 + Math.floor(Math.random() * (COLS - 2));
      if (map[r][c] !== EMPTY) continue;
      if (r <= 3 && c <= 3) continue; // away from player
      if (ens.some(e => e.r === r && e.c === c)) continue;
      ens.push({
        x: c * TILE + TILE/2,
        y: r * TILE + TILE/2,
        r, c,
        dir: Math.floor(Math.random() * 4),
        moveTimer: 0,
        speed: 0.6 + Math.random() * 0.4 + level * 0.08,
        alive: true
      });
      break;
    }
  }
  return ens;
}

function resetGame() {
  level = 1; score = 0; lives = 3;
  maxBombs = 1; bombRange = 1; playerSpeed = 1;
  initLevel();
}

function initLevel() {
  map = generateMap();
  bombs = [];
  flames = [];
  powerups = [];
  player = {
    x: 1 * TILE + TILE/2,
    y: 1 * TILE + TILE/2,
    alive: true,
    invincible: 0
  };
  enemies = spawnEnemies();
  running = false; paused = false; gameOverFlag = false;
  updateHud();
  showOverlay(level === 1 ? '💣 炸弹人' : `第 ${level} 关`, level === 1
    ? '方向键移动，空格放炸弹。\n手机用下方按钮操作。\n炸掉所有敌人过关！'
    : `消灭 ${enemies.length} 个敌人！`, '开始');
  draw();
  stopLoop();
}

function updateHud() {
  scoreEls.forEach(el => el.textContent = score);
  levelEls.forEach(el => el.textContent = level);
  livesEls.forEach(el => el.textContent = lives);
  if (bombCountEl) bombCountEl.textContent = maxBombs;
  if (bombRangeEl) bombRangeEl.textContent = bombRange;
  if (speedLevelEl) speedLevelEl.textContent = playerSpeed;
}

function setStatus(t) { if (statusEl) statusEl.textContent = t; }
function showOverlay(title, text, btn = '开始游戏') {
  if (overlayTitleEl) overlayTitleEl.textContent = title;
  if (overlayTextEl) overlayTextEl.innerHTML = text.replace(/\n/g, '<br>');
  if (startBtn) startBtn.textContent = btn;
  if (overlayEl) overlayEl.classList.add('visible');
}
function hideOverlay() { if (overlayEl) overlayEl.classList.remove('visible'); }

function startGame() {
  if (!running) {
    running = true; paused = false;
    hideOverlay(); setStatus('进行中');
    lastTime = performance.now(); loop(lastTime);
  }
}

function stopLoop() { if (animationId) cancelAnimationFrame(animationId); animationId = null; }

function togglePause() {
  if (!running || gameOverFlag) return;
  paused = !paused;
  if (paused) {
    stopLoop(); setStatus('已暂停');
    showOverlay('⏸ 已暂停', '休息一下', '继续');
  } else {
    hideOverlay(); setStatus('进行中');
    lastTime = performance.now(); loop(lastTime);
  }
}

// ===== Game Logic =====
function tileAt(x, y) {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return WALL;
  return map[r][c];
}

function canWalk(x, y, size) {
  const half = size / 2 - 1;
  return (
    tileAt(x - half, y - half) === EMPTY &&
    tileAt(x + half, y - half) === EMPTY &&
    tileAt(x - half, y + half) === EMPTY &&
    tileAt(x + half, y + half) === EMPTY
  );
}

function placeBomb() {
  if (!player.alive) return;
  const activeBombs = bombs.filter(b => !b.exploded);
  if (activeBombs.length >= maxBombs) return;
  const c = Math.floor(player.x / TILE);
  const r = Math.floor(player.y / TILE);
  if (bombs.some(b => b.r === r && b.c === c && !b.exploded)) return;
  bombs.push({
    r, c, timer: 2.0, range: bombRange, exploded: false
  });
  map[r][c] = BOMB;
}

function explodeBomb(bomb) {
  bomb.exploded = true;
  const { r, c, range } = bomb;
  if (map[r][c] === BOMB) map[r][c] = EMPTY;

  const dirs = [[0,0],[0,-1],[0,1],[-1,0],[1,0]];
  const spreadDirs = [[0,-1],[0,1],[-1,0],[1,0]];

  // Center flame
  addFlame(r, c);

  for (const [dr, dc] of spreadDirs) {
    for (let i = 1; i <= range; i++) {
      const nr = r + dr * i;
      const nc = c + dc * i;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
      const t = map[nr][nc];
      if (t === WALL) break;
      if (t === BRICK) {
        map[nr][nc] = EMPTY;
        addFlame(nr, nc);
        score += 10;
        // Chance to drop powerup
        if (Math.random() < 0.3) {
          const types = [POWERUP_BOMB, POWERUP_RANGE, POWERUP_SPEED];
          powerups.push({ r: nr, c: nc, type: types[Math.floor(Math.random() * types.length)], timer: 12 });
        }
        break;
      }
      if (t === BOMB) {
        // Chain explosion
        const chainBomb = bombs.find(b => b.r === nr && b.c === nc && !b.exploded);
        if (chainBomb) explodeBomb(chainBomb);
        break;
      }
      addFlame(nr, nc);
    }
  }
  updateHud();
}

function addFlame(r, c) {
  if (!flames.some(f => f.r === r && f.c === c)) {
    flames.push({ r, c, timer: 0.5 });
  }
}

function movePlayer(dt) {
  if (!player.alive) return;
  const speed = BASE_SPEED * (1 + (playerSpeed - 1) * 0.25) * dt;
  let nx = player.x, ny = player.y;

  if (keys.up) ny -= speed;
  if (keys.down) ny += speed;
  if (keys.left) nx -= speed;
  if (keys.right) nx += speed;

  // Check walkable (treat bombs as blocking except the one player is standing on)
  const pSize = TILE * 0.75;
  if (canWalk(nx, player.y, pSize)) player.x = nx;
  if (canWalk(player.x, ny, pSize)) player.y = ny;

  // Clamp
  const half = pSize / 2;
  player.x = Math.max(TILE + half, Math.min((COLS-1) * TILE - half, player.x));
  player.y = Math.max(TILE + half, Math.min((ROWS-1) * TILE - half, player.y));

  // Pick up powerups
  const pc = Math.floor(player.x / TILE);
  const pr = Math.floor(player.y / TILE);
  const puIdx = powerups.findIndex(p => p.r === pr && p.c === pc);
  if (puIdx !== -1) {
    const pu = powerups[puIdx];
    if (pu.type === POWERUP_BOMB) maxBombs = Math.min(maxBombs + 1, 6);
    else if (pu.type === POWERUP_RANGE) bombRange = Math.min(bombRange + 1, 6);
    else if (pu.type === POWERUP_SPEED) playerSpeed = Math.min(playerSpeed + 1, 4);
    score += 50;
    powerups.splice(puIdx, 1);
    updateHud();
  }
}

function moveEnemies(dt) {
  const dirMap = [[0,-1],[0,1],[-1,0],[1,0]]; // up,down,left,right
  enemies.forEach(e => {
    if (!e.alive) return;
    e.moveTimer += dt;
    const interval = 1.0 / e.speed;
    if (e.moveTimer < interval) return;
    e.moveTimer = 0;

    // Try current direction, or pick new random one
    const [dr, dc] = dirMap[e.dir];
    const nr = Math.floor(e.y / TILE) + dr;
    const nc = Math.floor(e.x / TILE) + dc;

    if (nr > 0 && nr < ROWS-1 && nc > 0 && nc < COLS-1 && map[nr][nc] === EMPTY) {
      e.x = nc * TILE + TILE/2;
      e.y = nr * TILE + TILE/2;
    } else {
      // Pick new random direction
      const dirs = [0,1,2,3].sort(() => Math.random() - 0.5);
      for (const d of dirs) {
        const [ddr, ddc] = dirMap[d];
        const tr = Math.floor(e.y / TILE) + ddr;
        const tc = Math.floor(e.x / TILE) + ddc;
        if (tr > 0 && tr < ROWS-1 && tc > 0 && tc < COLS-1 && map[tr][tc] === EMPTY) {
          e.dir = d;
          e.x = tc * TILE + TILE/2;
          e.y = tr * TILE + TILE/2;
          break;
        }
      }
    }

    e.r = Math.floor(e.y / TILE);
    e.c = Math.floor(e.x / TILE);
  });
}

function checkCollisions() {
  if (!player.alive) return;

  // Player vs flames
  const pr = Math.floor(player.y / TILE);
  const pc = Math.floor(player.x / TILE);

  if (player.invincible <= 0) {
    if (flames.some(f => f.r === pr && f.c === pc)) {
      playerHit();
      return;
    }
    // Player vs enemies
    const threshold = TILE * 0.6;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Math.abs(e.x - player.x) < threshold && Math.abs(e.y - player.y) < threshold) {
        playerHit();
        return;
      }
    }
  }

  // Enemies vs flames
  enemies.forEach(e => {
    if (!e.alive) return;
    const er = Math.floor(e.y / TILE);
    const ec = Math.floor(e.x / TILE);
    if (flames.some(f => f.r === er && f.c === ec)) {
      e.alive = false;
      score += 100;
      updateHud();
    }
  });
}

function playerHit() {
  lives--;
  updateHud();
  if (lives <= 0) {
    player.alive = false;
    gameOverFlag = true;
    running = false;
    stopLoop();
    setStatus('游戏结束');
    showOverlay('💀 游戏结束', `最终得分 ${score}`, '重新开始');
  } else {
    player.invincible = 2.0;
    // Respawn at start
    player.x = 1 * TILE + TILE/2;
    player.y = 1 * TILE + TILE/2;
  }
}

function checkWin() {
  if (enemies.every(e => !e.alive)) {
    running = false;
    stopLoop();
    level++;
    score += 200;
    updateHud();
    setTimeout(() => initLevel(), 500);
  }
}

function update(dt) {
  // Update bombs
  bombs.forEach(b => {
    if (b.exploded) return;
    b.timer -= dt;
    if (b.timer <= 0) explodeBomb(b);
  });

  // Update flames
  flames.forEach(f => f.timer -= dt);
  flames = flames.filter(f => f.timer > 0);

  // Update powerup timers
  powerups.forEach(p => p.timer -= dt);
  powerups = powerups.filter(p => p.timer > 0);

  // Update invincibility
  if (player.invincible > 0) player.invincible -= dt;

  movePlayer(dt);
  moveEnemies(dt);
  checkCollisions();
  checkWin();
}

// ===== Drawing =====
function draw() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE, y = r * TILE;
      const t = map[r][c];

      if (t === WALL) {
        ctx.fillStyle = '#4a5568';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#2d3748';
        ctx.fillRect(x+1, y+1, TILE-2, TILE-2);
        // Brick pattern
        ctx.fillStyle = '#4a5568';
        ctx.fillRect(x+TILE/2-1, y, 2, TILE);
        ctx.fillRect(x, y+TILE/2-1, TILE, 2);
      } else if (t === BRICK) {
        ctx.fillStyle = '#92613a';
        ctx.fillRect(x+1, y+1, TILE-2, TILE-2);
        ctx.fillStyle = '#a0724a';
        ctx.fillRect(x+2, y+2, TILE-4, TILE/2-3);
        ctx.strokeStyle = '#6b4426';
        ctx.strokeRect(x+1, y+1, TILE-2, TILE-2);
      } else {
        // Floor
        ctx.fillStyle = (r + c) % 2 === 0 ? '#1e1e38' : '#1a1a2e';
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
  }

  // Powerups
  powerups.forEach(p => {
    const x = p.c * TILE, y = p.r * TILE;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x+2, y+2, TILE-4, TILE-4);
    ctx.font = `${TILE * 0.6}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const emoji = p.type === POWERUP_BOMB ? '💣' : p.type === POWERUP_RANGE ? '🔥' : '⚡';
    ctx.fillText(emoji, x + TILE/2, y + TILE/2);
  });

  // Bombs
  bombs.forEach(b => {
    if (b.exploded) return;
    const x = b.c * TILE, y = b.r * TILE;
    const pulse = 1 + Math.sin(performance.now() / 150) * 0.08;
    const r = TILE * 0.35 * pulse;
    ctx.beginPath();
    ctx.arc(x + TILE/2, y + TILE/2, r, 0, Math.PI*2);
    ctx.fillStyle = '#1c1c1c';
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Fuse
    ctx.beginPath();
    ctx.moveTo(x + TILE/2 + r*0.5, y + TILE/2 - r*0.8);
    ctx.lineTo(x + TILE/2 + r, y + TILE/2 - r*1.2);
    ctx.strokeStyle = b.timer < 0.5 ? '#ff4444' : '#ff9900';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Spark
    if (b.timer < 1.0) {
      ctx.beginPath();
      ctx.arc(x + TILE/2 + r, y + TILE/2 - r*1.2, 3, 0, Math.PI*2);
      ctx.fillStyle = '#ffdd00';
      ctx.fill();
    }
  });

  // Flames
  flames.forEach(f => {
    const x = f.c * TILE, y = f.r * TILE;
    const alpha = Math.min(1, f.timer * 2);
    ctx.fillStyle = `rgba(255, 107, 53, ${alpha * 0.7})`;
    ctx.fillRect(x+1, y+1, TILE-2, TILE-2);
    ctx.fillStyle = `rgba(255, 221, 0, ${alpha * 0.5})`;
    ctx.fillRect(x+4, y+4, TILE-8, TILE-8);
  });

  // Enemies
  enemies.forEach(e => {
    if (!e.alive) return;
    ctx.font = `${TILE * 0.7}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👾', e.x, e.y);
  });

  // Player
  if (player.alive) {
    const blink = player.invincible > 0 && Math.floor(performance.now() / 120) % 2 === 0;
    if (!blink) {
      ctx.font = `${TILE * 0.75}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧑', player.x, player.y);
    }
  }
}

// ===== Game Loop =====
function loop(time) {
  if (!running || paused) return;
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  update(dt);
  draw();
  animationId = requestAnimationFrame(loop);
}

// ===== Input =====
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  const ctrl = ['arrowup','arrowdown','arrowleft','arrowright',' ','w','a','s','d'];
  if (ctrl.includes(k)) e.preventDefault();

  if (!running && !gameOverFlag) { startGame(); return; }

  if (k === 'arrowup' || k === 'w') keys.up = true;
  else if (k === 'arrowdown' || k === 's') keys.down = true;
  else if (k === 'arrowleft' || k === 'a') keys.left = true;
  else if (k === 'arrowright' || k === 'd') keys.right = true;
  else if (k === ' ') placeBomb();
  else if (k === 'p') togglePause();
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'arrowup' || k === 'w') keys.up = false;
  else if (k === 'arrowdown' || k === 's') keys.down = false;
  else if (k === 'arrowleft' || k === 'a') keys.left = false;
  else if (k === 'arrowright' || k === 'd') keys.right = false;
});

// Touch buttons (hold support)
document.querySelectorAll('.control-btn').forEach(btn => {
  const action = btn.dataset.action;

  function press() {
    if (!running && !gameOverFlag) startGame();
    if (action === 'bomb') placeBomb();
    else if (action === 'up') keys.up = true;
    else if (action === 'down') keys.down = true;
    else if (action === 'left') keys.left = true;
    else if (action === 'right') keys.right = true;
  }
  function release() {
    if (action === 'up') keys.up = false;
    else if (action === 'down') keys.down = false;
    else if (action === 'left') keys.left = false;
    else if (action === 'right') keys.right = false;
  }

  btn.addEventListener('mousedown', press);
  btn.addEventListener('mouseup', release);
  btn.addEventListener('mouseleave', release);
  btn.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
  btn.addEventListener('touchend', e => { e.preventDefault(); release(); }, { passive: false });
  btn.addEventListener('touchcancel', release);
});

// Canvas swipe
let touchStartX = 0, touchStartY = 0;
canvas.addEventListener('touchstart', e => {
  const t = e.changedTouches[0];
  touchStartX = t.clientX; touchStartY = t.clientY;
}, { passive: true });
canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
canvas.addEventListener('touchend', e => {
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  if (!running && !gameOverFlag) startGame();
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { placeBomb(); return; }
  // Quick tap direction
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 20) { keys.right = true; setTimeout(() => keys.right = false, 200); }
    else if (dx < -20) { keys.left = true; setTimeout(() => keys.left = false, 200); }
  } else {
    if (dy > 20) { keys.down = true; setTimeout(() => keys.down = false, 200); }
    else if (dy < -20) { keys.up = true; setTimeout(() => keys.up = false, 200); }
  }
}, { passive: true });

// Buttons
if (startBtn) startBtn.addEventListener('click', () => {
  if (paused) togglePause();
  else if (gameOverFlag) { resetGame(); startGame(); }
  else startGame();
});
if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
if (restartBtn) restartBtn.addEventListener('click', () => { resetGame(); });
if (pauseBtnM) pauseBtnM.addEventListener('click', togglePause);
if (restartBtnM) restartBtnM.addEventListener('click', () => { resetGame(); });

// Prevent zoom
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

// Init
resetGame();
