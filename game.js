// ===== Bomber Game =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const $ = id => document.getElementById(id);
const scoreEls = [$('score-d'), $('score-m')].filter(Boolean);
const levelEls = [$('level-d'), $('level-m')].filter(Boolean);
const livesEls = [$('lives-d'), $('lives-m')].filter(Boolean);
const bombCountEls = [$('bomb-count'), $('bomb-count-m')].filter(Boolean);
const bombRangeEls = [$('bomb-range'), $('bomb-range-m')].filter(Boolean);
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
const bombFab = $('bomb-fab');

const COLS = 13, ROWS = 13;
const TILE = canvas.width / COLS;
const EMPTY = 0, WALL = 1, BRICK = 2, BOMB_TILE = 3;

let map, player, enemies, bombs, flames, powerups;
let score, level, lives;
let running = false, paused = false, gameOverFlag = false;
let animationId = null, lastTime = 0;
let keys = {};

const BASE_SPEED = 130;
let playerSpeed, maxBombs, bombRange;

// ===== Map Generation =====
function generateMap() {
  const m = Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS-1 || c === 0 || c === COLS-1) m[r][c] = WALL;
      else if (r % 2 === 0 && c % 2 === 0) m[r][c] = WALL;
    }
  const brickChance = Math.min(0.35 + level * 0.02, 0.52);
  for (let r = 1; r < ROWS-1; r++)
    for (let c = 1; c < COLS-1; c++) {
      if (m[r][c] !== EMPTY) continue;
      if (r <= 2 && c <= 2) continue;
      if (Math.random() < brickChance) m[r][c] = BRICK;
    }
  return m;
}

function spawnEnemies() {
  const count = Math.min(2 + level, 8);
  const ens = [];
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 200; a++) {
      const r = 1 + Math.floor(Math.random() * (ROWS - 2));
      const c = 1 + Math.floor(Math.random() * (COLS - 2));
      if (map[r][c] !== EMPTY || (r <= 3 && c <= 3)) continue;
      if (ens.some(e => e.r === r && e.c === c)) continue;
      ens.push({ x: c*TILE+TILE/2, y: r*TILE+TILE/2, r, c, dir: Math.floor(Math.random()*4), moveTimer: 0, speed: 0.6+Math.random()*0.4+level*0.08, alive: true });
      break;
    }
  }
  return ens;
}

// ===== Game State =====
function resetGame() {
  level = 1; score = 0; lives = 3;
  maxBombs = 1; bombRange = 1; playerSpeed = 1;
  initLevel();
}

function initLevel() {
  map = generateMap();
  bombs = []; flames = []; powerups = [];
  player = { x: 1*TILE+TILE/2, y: 1*TILE+TILE/2, alive: true, invincible: 0 };
  enemies = spawnEnemies();
  running = false; paused = false; gameOverFlag = false;
  keys = {};
  updateHud();
  showOverlay(
    level === 1 ? '💣 炸弹人' : `第 ${level} 关`,
    level === 1 ? '方向键移动，空格放炸弹。\n手机点方向键+💣按钮。\n炸掉所有敌人过关！' : `消灭 ${enemies.length} 个敌人！`,
    '开始'
  );
  draw();
  stopLoop();
}

function updateHud() {
  scoreEls.forEach(el => el.textContent = score);
  levelEls.forEach(el => el.textContent = level);
  livesEls.forEach(el => el.textContent = lives);
  bombCountEls.forEach(el => el.textContent = maxBombs);
  bombRangeEls.forEach(el => el.textContent = bombRange);
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
    lastTime = performance.now();
    loop(lastTime);
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

// ===== Logic =====
function tileAt(x, y) {
  const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return WALL;
  return map[r][c];
}

function canWalk(x, y, half) {
  return tileAt(x-half, y-half) === EMPTY && tileAt(x+half, y-half) === EMPTY &&
         tileAt(x-half, y+half) === EMPTY && tileAt(x+half, y+half) === EMPTY;
}

function placeBomb() {
  if (!player.alive || !running || paused) return;
  const active = bombs.filter(b => !b.exploded);
  if (active.length >= maxBombs) return;
  const c = Math.floor(player.x / TILE), r = Math.floor(player.y / TILE);
  if (bombs.some(b => b.r === r && b.c === c && !b.exploded)) return;
  bombs.push({ r, c, timer: 2.0, range: bombRange, exploded: false });
  map[r][c] = BOMB_TILE;
}

function explodeBomb(bomb) {
  bomb.exploded = true;
  const { r, c, range } = bomb;
  if (map[r][c] === BOMB_TILE) map[r][c] = EMPTY;
  addFlame(r, c);
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  for (const [dr, dc] of dirs) {
    for (let i = 1; i <= range; i++) {
      const nr = r+dr*i, nc = c+dc*i;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
      const t = map[nr][nc];
      if (t === WALL) break;
      if (t === BRICK) {
        map[nr][nc] = EMPTY; addFlame(nr, nc); score += 10;
        if (Math.random() < 0.3) {
          const types = [5, 6, 7];
          powerups.push({ r: nr, c: nc, type: types[Math.floor(Math.random()*types.length)], timer: 12 });
        }
        break;
      }
      if (t === BOMB_TILE) {
        const chain = bombs.find(b => b.r === nr && b.c === nc && !b.exploded);
        if (chain) explodeBomb(chain);
        break;
      }
      addFlame(nr, nc);
    }
  }
  updateHud();
}

function addFlame(r, c) {
  if (!flames.some(f => f.r === r && f.c === c)) flames.push({ r, c, timer: 0.5 });
}

function movePlayer(dt) {
  if (!player.alive) return;
  const speed = BASE_SPEED * (1 + (playerSpeed-1)*0.25) * dt;
  let nx = player.x, ny = player.y;
  if (keys.up) ny -= speed;
  if (keys.down) ny += speed;
  if (keys.left) nx -= speed;
  if (keys.right) nx += speed;
  const half = TILE * 0.35;
  if (canWalk(nx, player.y, half)) player.x = nx;
  if (canWalk(player.x, ny, half)) player.y = ny;
  player.x = Math.max(TILE+half, Math.min((COLS-1)*TILE-half, player.x));
  player.y = Math.max(TILE+half, Math.min((ROWS-1)*TILE-half, player.y));

  // Powerups
  const pc = Math.floor(player.x/TILE), pr = Math.floor(player.y/TILE);
  const pi = powerups.findIndex(p => p.r === pr && p.c === pc);
  if (pi !== -1) {
    const pu = powerups[pi];
    if (pu.type === 5) maxBombs = Math.min(maxBombs+1, 6);
    else if (pu.type === 6) bombRange = Math.min(bombRange+1, 6);
    else if (pu.type === 7) playerSpeed = Math.min(playerSpeed+1, 4);
    score += 50; powerups.splice(pi, 1); updateHud();
  }
}

function moveEnemies(dt) {
  const dirMap = [[0,-1],[0,1],[-1,0],[1,0]];
  enemies.forEach(e => {
    if (!e.alive) return;
    e.moveTimer += dt;
    if (e.moveTimer < 1.0/e.speed) return;
    e.moveTimer = 0;
    const [dr, dc] = dirMap[e.dir];
    const nr = Math.floor(e.y/TILE)+dr, nc = Math.floor(e.x/TILE)+dc;
    if (nr > 0 && nr < ROWS-1 && nc > 0 && nc < COLS-1 && map[nr][nc] === EMPTY) {
      e.x = nc*TILE+TILE/2; e.y = nr*TILE+TILE/2;
    } else {
      const dirs = [0,1,2,3].sort(() => Math.random()-0.5);
      for (const d of dirs) {
        const [ddr, ddc] = dirMap[d];
        const tr = Math.floor(e.y/TILE)+ddr, tc = Math.floor(e.x/TILE)+ddc;
        if (tr > 0 && tr < ROWS-1 && tc > 0 && tc < COLS-1 && map[tr][tc] === EMPTY) {
          e.dir = d; e.x = tc*TILE+TILE/2; e.y = tr*TILE+TILE/2; break;
        }
      }
    }
    e.r = Math.floor(e.y/TILE); e.c = Math.floor(e.x/TILE);
  });
}

function checkCollisions() {
  if (!player.alive) return;
  const pr = Math.floor(player.y/TILE), pc = Math.floor(player.x/TILE);
  if (player.invincible <= 0) {
    if (flames.some(f => f.r === pr && f.c === pc)) { playerHit(); return; }
    const th = TILE * 0.6;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Math.abs(e.x-player.x) < th && Math.abs(e.y-player.y) < th) { playerHit(); return; }
    }
  }
  enemies.forEach(e => {
    if (!e.alive) return;
    if (flames.some(f => f.r === Math.floor(e.y/TILE) && f.c === Math.floor(e.x/TILE))) {
      e.alive = false; score += 100; updateHud();
    }
  });
}

function playerHit() {
  lives--; updateHud();
  if (lives <= 0) {
    player.alive = false; gameOverFlag = true; running = false; stopLoop();
    setStatus('游戏结束');
    showOverlay('💀 游戏结束', `最终得分 ${score}`, '重新开始');
  } else {
    player.invincible = 2.0;
    player.x = 1*TILE+TILE/2; player.y = 1*TILE+TILE/2;
  }
}

function checkWin() {
  if (enemies.every(e => !e.alive)) {
    running = false; stopLoop();
    level++; score += 200; updateHud();
    setTimeout(() => initLevel(), 600);
  }
}

function update(dt) {
  bombs.forEach(b => { if (!b.exploded) { b.timer -= dt; if (b.timer <= 0) explodeBomb(b); } });
  flames.forEach(f => f.timer -= dt);
  flames = flames.filter(f => f.timer > 0);
  powerups.forEach(p => p.timer -= dt);
  powerups = powerups.filter(p => p.timer > 0);
  if (player.invincible > 0) player.invincible -= dt;
  movePlayer(dt); moveEnemies(dt); checkCollisions(); checkWin();
}

// ===== Drawing =====
function draw() {
  const now = performance.now();
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = c*TILE, y = r*TILE, t = map[r][c];
    if (t === WALL) {
      ctx.fillStyle = '#4a5568'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#2d3748'; ctx.fillRect(x+1, y+1, TILE-2, TILE-2);
      ctx.fillStyle = '#4a5568';
      ctx.fillRect(x+TILE/2-1, y, 2, TILE); ctx.fillRect(x, y+TILE/2-1, TILE, 2);
    } else if (t === BRICK) {
      ctx.fillStyle = '#92613a'; ctx.fillRect(x+1, y+1, TILE-2, TILE-2);
      ctx.fillStyle = '#a0724a'; ctx.fillRect(x+2, y+2, TILE-4, TILE/2-3);
      ctx.strokeStyle = '#6b4426'; ctx.strokeRect(x+1, y+1, TILE-2, TILE-2);
    } else {
      ctx.fillStyle = (r+c)%2===0 ? '#1e1e38' : '#1a1a2e';
      ctx.fillRect(x, y, TILE, TILE);
    }
  }

  // Powerups
  ctx.font = `${TILE*0.55}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  powerups.forEach(p => {
    const x = p.c*TILE, y = p.r*TILE;
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x+2, y+2, TILE-4, TILE-4);
    ctx.fillText(p.type === 5 ? '💣' : p.type === 6 ? '🔥' : '⚡', x+TILE/2, y+TILE/2);
  });

  // Bombs
  bombs.forEach(b => {
    if (b.exploded) return;
    const x = b.c*TILE+TILE/2, y = b.r*TILE+TILE/2;
    const pulse = 1 + Math.sin(now/150)*0.08;
    const rad = TILE*0.35*pulse;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI*2);
    ctx.fillStyle = '#1c1c1c'; ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+rad*0.5, y-rad*0.8); ctx.lineTo(x+rad, y-rad*1.2);
    ctx.strokeStyle = b.timer < 0.5 ? '#ff4444' : '#ff9900'; ctx.lineWidth = 2; ctx.stroke();
    if (b.timer < 1.0) { ctx.beginPath(); ctx.arc(x+rad, y-rad*1.2, 3, 0, Math.PI*2); ctx.fillStyle = '#ffdd00'; ctx.fill(); }
  });

  // Flames
  flames.forEach(f => {
    const x = f.c*TILE, y = f.r*TILE, a = Math.min(1, f.timer*2);
    ctx.fillStyle = `rgba(255,107,53,${a*0.7})`; ctx.fillRect(x+1, y+1, TILE-2, TILE-2);
    ctx.fillStyle = `rgba(255,221,0,${a*0.5})`; ctx.fillRect(x+4, y+4, TILE-8, TILE-8);
  });

  // Enemies
  ctx.font = `${TILE*0.65}px serif`;
  enemies.forEach(e => { if (e.alive) ctx.fillText('👾', e.x, e.y); });

  // Player
  if (player.alive) {
    const blink = player.invincible > 0 && Math.floor(now/120)%2 === 0;
    if (!blink) { ctx.font = `${TILE*0.7}px serif`; ctx.fillText('🧑', player.x, player.y); }
  }
}

// ===== Game Loop =====
function loop(time) {
  if (!running || paused) return;
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  update(dt); draw();
  animationId = requestAnimationFrame(loop);
}

// ===== Keyboard =====
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' ','w','a','s','d'].includes(k)) e.preventDefault();
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

// ===== Touch D-pad: hold-to-move via touchstart/touchend =====
function bindDpad(btn) {
  const action = btn.dataset.action;
  if (!action || action === 'bomb') return;

  function press() {
    if (!running && !gameOverFlag) startGame();
    keys[action] = true;
    btn.classList.add('pressed');
  }
  function release() {
    keys[action] = false;
    btn.classList.remove('pressed');
  }

  btn.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
  btn.addEventListener('touchend', e => { e.preventDefault(); release(); }, { passive: false });
  btn.addEventListener('touchcancel', release);
  // Mouse fallback for desktop sidebar
  btn.addEventListener('mousedown', press);
  btn.addEventListener('mouseup', release);
  btn.addEventListener('mouseleave', release);
}

document.querySelectorAll('.d-btn[data-action]').forEach(bindDpad);
document.querySelectorAll('.control-btn[data-action]').forEach(btn => {
  if (btn.dataset.action === 'bomb') {
    const handler = e => { e.preventDefault(); if (!running && !gameOverFlag) startGame(); placeBomb(); };
    btn.addEventListener('touchstart', handler, { passive: false });
    btn.addEventListener('click', () => placeBomb());
  } else {
    bindDpad(btn);
  }
});

// Bomb FAB
if (bombFab) {
  const handler = e => { e.preventDefault(); if (!running && !gameOverFlag) startGame(); placeBomb(); };
  bombFab.addEventListener('touchstart', handler, { passive: false });
  bombFab.addEventListener('click', () => placeBomb());
}

// Canvas swipe
let tx0 = 0, ty0 = 0;
canvas.addEventListener('touchstart', e => { const t = e.changedTouches[0]; tx0 = t.clientX; ty0 = t.clientY; }, { passive: true });
canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
canvas.addEventListener('touchend', e => {
  const t = e.changedTouches[0];
  const dx = t.clientX - tx0, dy = t.clientY - ty0;
  if (!running && !gameOverFlag) startGame();
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { placeBomb(); return; }
  if (Math.abs(dx) > Math.abs(dy)) {
    const dir = dx > 0 ? 'right' : 'left';
    keys[dir] = true; setTimeout(() => keys[dir] = false, 180);
  } else {
    const dir = dy > 0 ? 'down' : 'up';
    keys[dir] = true; setTimeout(() => keys[dir] = false, 180);
  }
}, { passive: true });

// Buttons
if (startBtn) startBtn.addEventListener('click', () => {
  if (paused) togglePause();
  else if (gameOverFlag) { resetGame(); startGame(); }
  else startGame();
});
if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
if (restartBtn) restartBtn.addEventListener('click', resetGame);
if (pauseBtnM) pauseBtnM.addEventListener('click', togglePause);
if (restartBtnM) restartBtnM.addEventListener('click', resetGame);

// Prevent zoom
let lastTE = 0;
document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTE <= 300) e.preventDefault(); lastTE = n; }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

resetGame();
