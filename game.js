(() => {
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const tokensEl = document.getElementById('tokens');
  const missionEl = document.getElementById('missionProgress');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const soundBtn = document.getElementById('soundBtn');

  let W = 0;
  let H = 0;
  let running = false;
  let muted = false;
  let last = 0;
  let score = 0;
  let tokens = 0;
  let lives = 3;
  let speed = 560;
  let spawnTimer = 0;
  let targetLane = 1;
  let tilt = 0;
  let camZ = 0;          // положение камеры вдоль мира (единая прокрутка)
  let roadW = 0;         // ширина проезжей части внизу экрана, px
  let vpY = 0;           // y точки схода
  let camH = 0;          // высота камеры в единицах ширины дороги
  let time = 0;
  let objects = [];
  let particles = [];

  const taxi = new Image();
  taxi.src = 'assets/taxi-top-render.webp';

  const car = { x: 0, y: 0, w: 0, h: 0, invincible: 0 };

  const COLORS = {
    blue: '#0A71B9',
    blueDark: '#063F72',
    green: '#79C62B',
    greenDark: '#5BAE19',
    cream: '#FFF0C2',
    road: '#27313B',
    roadLight: '#394756',
    stone: '#D7C6A9',
    stoneLight: '#F4E8D2',
    water: '#0D5F91'
  };

  function resize() {
    const rect = stage.getBoundingClientRect();
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    W = rect.width;
    H = rect.height;
    roadW = W * 0.57;
    vpY = H * 0.09 - 0.5 * H * 0.91;
    camH = (H - vpY) / roadW;
    car.w = W * 0.20;
    car.h = car.w * 2.08;
    car.y = H * 0.79;
    car.x = laneX(targetLane, car.y);
  }

  function roadT(y) {
    return clamp((y - H * 0.09) / (H * 0.91), 0, 1);
  }

  function roadLeft(y) {
    const t = roadT(y);
    return lerp(W * 0.405, W * 0.215, t);
  }

  function roadRight(y) {
    return W - roadLeft(y);
  }

  function laneX(lane, y) {
    const l = roadLeft(y);
    const r = roadRight(y);
    const f = (lane + 0.5) / 3;
    return lerp(l, r, f);
  }

  function boundaryX(boundary, y) {
    const l = roadLeft(y);
    const r = roadRight(y);
    return lerp(l, r, boundary / 3);
  }

  // масштаб в точке экрана y: 1 внизу, ~0.33 у горизонта
  function sc(y) {
    return (y - vpY) / (H - vpY);
  }

  // экранный y точки на земле на расстоянии z (и обратно)
  function yAtZ(z) {
    return vpY + (H - vpY) / Math.max(z, 0.3);
  }

  function perspective(y) {
    return 1.3 * sc(y);
  }

  function reset() {
    running = true;
    last = performance.now();
    score = 0;
    tokens = 0;
    lives = 3;
    speed = 560;
    spawnTimer = 0;
    targetLane = 1;
    tilt = 0;
    camZ = 0;
    time = 0;
    objects = [];
    particles = [];
    car.invincible = 0;
    car.x = laneX(1, car.y);
    updateHud();
    overlay.classList.remove('show');
    startBtn.textContent = 'В путь';
    requestAnimationFrame(loop);
  }

  function updateHud() {
    scoreEl.textContent = Math.floor(score).toLocaleString('ru-RU');
    livesEl.textContent = '❤'.repeat(Math.max(0, lives));
    tokensEl.textContent = tokens;
    missionEl.textContent = `${Math.min(tokens, 10)}/10`;
  }

  function spawn() {
    const roll = Math.random();
    let type = 'token';
    if (roll < 0.48) type = 'token';
    else if (roll < 0.59) type = 'heart';
    else if (roll < 0.68) type = 'shield';
    else if (roll < 0.77) type = 'boost';
    else if (roll < 0.90) type = 'cone';
    else type = 'puddle';

    objects.push({
      type,
      lane: Math.floor(Math.random() * 3),
      Zw: camZ + 1 / sc(H * 0.10),   // мировая позиция: объект стоит на дороге неподвижно
      y: H * 0.10,
      size: W * (type === 'cone' ? 0.09 : type === 'puddle' ? 0.11 : 0.085),
      bob: Math.random() * Math.PI * 2,
      hit: false
    });
  }

  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const life = 0.38 + Math.random() * 0.42;
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 240,
        vy: -50 - Math.random() * 220,
        life, maxLife: life,
        alpha: 1,
        color,
        size: 3 + Math.random() * 7
      });
    }
  }

  function collect(o, x) {
    switch (o.type) {
      case 'token':
        tokens += 1;
        score += 160;
        burst(x, o.y, '#8ED83C', 16);
        beep(760, 0.06);
        break;
      case 'heart':
        lives = Math.min(5, lives + 1);
        score += 90;
        burst(x, o.y, '#FF5972', 12);
        beep(620, 0.08);
        break;
      case 'shield':
        car.invincible = 5;
        score += 120;
        burst(x, o.y, '#69D7FF', 16);
        beep(900, 0.08);
        break;
      case 'boost':
        speed += 70;
        score += 240;
        burst(x, o.y, '#5AAEFF', 16);
        beep(980, 0.08);
        break;
      case 'cone':
      case 'puddle':
        if (car.invincible <= 0) {
          lives -= 1;
          burst(car.x, car.y - 12, '#FFA74D', 18);
          beep(180, 0.15);
          if (lives <= 0) endGame();
        } else {
          score += 40;
          burst(x, o.y, '#ACEEFF', 10);
        }
        break;
    }

    if (tokens === 10) {
      score += 1000;
      burst(car.x, car.y - 90, '#F6D15C', 30);
    }
  }

  function update(dt) {
    time += dt;
    camZ += speed * 1.35 / H * dt;   // вся сцена и препятствия едут с одной скоростью
    score += dt * 12;
    speed = Math.min(850, 560 + score * 0.11);
    spawnTimer -= dt;

    if (spawnTimer <= 0) {
      spawn();
      spawnTimer = Math.max(0.43, 0.98 - score / 6200);
    }

    const desiredX = laneX(targetLane, car.y);
    const delta = desiredX - car.x;
    car.x += delta * Math.min(1, dt * 11);
    const desiredTilt = clamp(delta / 700, -0.055, 0.055);
    tilt += (desiredTilt - tilt) * Math.min(1, dt * 10);
    car.invincible = Math.max(0, car.invincible - dt);

    for (const o of objects) {
      o.bob += dt * 4;
      o.y = yAtZ(o.Zw - camZ);
      const x = laneX(o.lane, o.y);
      const hit = Math.abs(x - car.x) < W * 0.07 && Math.abs(o.y - car.y) < car.h * 0.34;
      if (hit && !o.hit) {
        o.hit = true;
        collect(o, x);
      }
    }

    objects = objects.filter(o => !o.hit && o.y < H + 100);

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 170 * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
    }
    particles = particles.filter(p => p.life > 0);
    updateHud();
  }

  /* =====================================================================
     ЛОКАЦИЯ: набережная Невы в Петербурге
     ---------------------------------------------------------------------
     Единая перспективная проекция. Координаты мира:
       X — поперёк дороги (1.0 = ширина проезжей части, 0 = центр),
       h — высота над землёй,
       z — расстояние от камеры (чем больше, тем дальше).
     Всё, что стоит на земле (дома, фонари, деревья, парапет, разметка,
     препятствия), имеет МИРОВУЮ позицию Zw и смещается только через camZ,
     то есть с той же скоростью, что и дорога. В draw нет Math.random,
     поэтому ничего не «плывёт» и не прыгает между кадрами.
     Небо и дальний силуэт города — статичный фон.
     ===================================================================== */

  const Z_NEAR = 0.5;
  const Z_FAR = 3.4;
  const FACADE_X = -0.70;
  const CURB_L = -0.53, CURB_R = 0.53;
  const PAR_IN = 0.70, PAR_OUT = 0.78, PAR_H = 0.13;
  const BAY = 0.27;

  const FACADES = [
    { wall: '#E4BF72', trim: '#FFF3D9', dark: '#B98F43' }, // охра
    { wall: '#E6B3A0', trim: '#FFEFE3', dark: '#B97D6B' }, // розовый
    { wall: '#A8C8B6', trim: '#F2FAF1', dark: '#6F9783' }, // мятный
    { wall: '#D78B67', trim: '#FBEAD8', dark: '#A25C3E' }, // терракота
    { wall: '#EDDDB9', trim: '#FFFFFF', dark: '#BBA77B' }, // кремовый
    { wall: '#9CB5CB', trim: '#F4F8FB', dark: '#657F98' }  // серо-голубой
  ];

  function hash(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  // Последовательность домов — строится один раз и циклично повторяется
  const buildings = [];
  let FACADE_CYCLE = 0;
  (function buildStreet() {
    let acc = 0;
    let prevColor = -1;
    for (let i = 0; i < 80; i++) {
      const bays = 4 + Math.floor(hash(i * 3.17) * 4);
      let c = Math.floor(hash(i * 7.31 + 2) * FACADES.length);
      if (c === prevColor) c = (c + 1 + Math.floor(hash(i + 9) * 3)) % FACADES.length;
      prevColor = c;
      const floors = hash(i * 1.93 + 5) > 0.55 ? 5 : 4;
      buildings.push({ id: i, z0: acc, bays, len: bays * BAY, floors, color: c, h: 0.22 + floors * 0.33 + 0.08 });
      acc += bays * BAY;
    }
    FACADE_CYCLE = acc;
  })();

  // Камера смотрит чуть сверху: вертикали сжаты (VK) и расходятся наружу от оси дороги (KK).
  // Это даёт «лежащие» фасады, у которых видно больше стены, а основание считается по честной перспективе.
  const VK = 0.62, KK = 0.30;
  function pt(X, h, z) {
    z = Math.max(z, 0.3);
    return [W * 0.5 + X * (1 + KK * Math.max(h, 0)) * roadW / z, vpY + (camH - VK * h) * roadW / z];
  }

  function poly(pts, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }
  function strip(X0, X1, z0, z1, h, fill) {
    poly([pt(X0, h, z0), pt(X1, h, z0), pt(X1, h, z1), pt(X0, h, z1)], fill);
  }
  function wall(X, z0, z1, h0, h1, fill) {
    poly([pt(X, h0, z0), pt(X, h0, z1), pt(X, h1, z1), pt(X, h1, z0)], fill);
  }
  function endFace(z, X0, X1, h0, h1, fill) {
    poly([pt(X0, h0, z), pt(X1, h0, z), pt(X1, h1, z), pt(X0, h1, z)], fill);
  }
  function line3(a, b, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  // Перебор мировых повторяющихся элементов (от дальних к ближним)
  function eachWorld(spacing, offset, zMin, zMax, fn) {
    const n0 = Math.ceil((camZ + zMin - offset) / spacing);
    const n1 = Math.floor((camZ + zMax - offset) / spacing);
    for (let n = n1; n >= n0; n--) fn(n, n * spacing + offset - camZ);
  }

  /* ----------------------------- ФОН ----------------------------- */

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.66);
    g.addColorStop(0, '#5F93CB');
    g.addColorStop(0.17, '#9DB4D8');
    g.addColorStop(0.33, '#EFB597');
    g.addColorStop(0.52, '#FFD7A2');
    g.addColorStop(1, '#FFE9C6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.72);

    // закатное свечение над рекой
    const sun = ctx.createRadialGradient(W * 0.7, H * 0.09, 0, W * 0.7, H * 0.09, W * 0.75);
    sun.addColorStop(0, 'rgba(255,226,160,.85)');
    sun.addColorStop(0.35, 'rgba(255,198,140,.35)');
    sun.addColorStop(1, 'rgba(255,198,140,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H * 0.4);

    // неподвижные перистые облака
    const clouds = [
      [0.16, 0.04, 0.34, 0.013, 0.32], [0.55, 0.025, 0.4, 0.011, 0.28],
      [0.30, 0.115, 0.3, 0.012, 0.30], [0.08, 0.20, 0.28, 0.012, 0.26],
      [0.82, 0.07, 0.3, 0.010, 0.30], [0.12, 0.33, 0.22, 0.010, 0.22]
    ];
    for (const [cx, cy, w, h, a] of clouds) {
      ctx.fillStyle = `rgba(255,236,226,${a})`;
      ctx.beginPath();
      ctx.ellipse(W * cx, H * cy, W * w * 0.5, H * h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(214,170,200,${a * 0.6})`;
      ctx.beginPath();
      ctx.ellipse(W * (cx + 0.03), H * (cy + h * 0.9), W * w * 0.38, H * h * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawLeftLandmarks();
  }

  // Исаакиевский собор и Адмиралтейство — далёкий статичный силуэт слева
  function drawLeftLandmarks() {
    const hz = H * 0.5; // ниже перекрывается домами
    // слои крыш города
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer === 0 ? 'rgba(214,190,190,.6)' : 'rgba(184,166,178,.6)';
      const base = hz;
      for (let i = 0; i < 16; i++) {
        const bw = W * (0.05 + hash(i + layer * 20) * 0.04);
        const x = i * W * 0.045 - W * 0.02 + layer * W * 0.02;
        const top = H * (0.30 + hash(i * 2.3 + layer * 7) * 0.05) - (i % 3 === 0 ? H * 0.012 : 0);
        const yTop = layer === 0 ? top : top + H * 0.035;
        ctx.fillRect(x, yTop, bw, base - yTop);
      }
    }

    // Исаакиевский собор
    const ix = W * 0.15, iy = H * 0.275;
    ctx.save();
    const body = ctx.createLinearGradient(0, iy - H * 0.1, 0, iy + H * 0.04);
    body.addColorStop(0, '#E3BE74');
    body.addColorStop(1, '#B79A7A');
    // портик и тело
    ctx.fillStyle = 'rgba(176,156,150,.92)';
    ctx.fillRect(ix - W * 0.12, iy, W * 0.24, H * 0.26);
    ctx.fillStyle = 'rgba(206,188,178,.9)';
    ctx.fillRect(ix - W * 0.12, iy - H * 0.006, W * 0.24, H * 0.012);
    // барабан с колоннами
    ctx.fillStyle = 'rgba(190,172,164,.95)';
    ctx.fillRect(ix - W * 0.055, iy - H * 0.045, W * 0.11, H * 0.045);
    ctx.strokeStyle = 'rgba(130,112,108,.55)';
    ctx.lineWidth = 1;
    for (let k = -4; k <= 4; k++) {
      ctx.beginPath();
      ctx.moveTo(ix + k * W * 0.0125, iy - H * 0.043);
      ctx.lineTo(ix + k * W * 0.0125, iy - H * 0.003);
      ctx.stroke();
    }
    // золотой купол
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(ix, iy - H * 0.045, W * 0.058, H * 0.052, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,236,170,.55)';
    ctx.beginPath();
    ctx.ellipse(ix - W * 0.016, iy - H * 0.068, W * 0.016, H * 0.02, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // фонарик и крест
    ctx.fillStyle = '#D9B563';
    ctx.fillRect(ix - W * 0.008, iy - H * 0.112, W * 0.016, H * 0.014);
    ctx.strokeStyle = '#D9B563';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ix, iy - H * 0.112);
    ctx.lineTo(ix, iy - H * 0.13);
    ctx.moveTo(ix - 3, iy - H * 0.124);
    ctx.lineTo(ix + 3, iy - H * 0.124);
    ctx.stroke();
    // четыре малых купола
    for (const dx of [-0.092, 0.092]) {
      ctx.fillStyle = '#D2AE63';
      ctx.beginPath();
      ctx.ellipse(ix + W * dx, iy, W * 0.017, H * 0.016, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(ix + W * dx - W * 0.012, iy, W * 0.024, H * 0.012);
    }
    ctx.restore();
  }

  // Дальний берег: Стрелка с Ростральными колоннами, Петропавловский шпиль, мост
  function drawFarBank() {
    const y0 = H * 0.093;
    ctx.save();
    // низкая линия набережной напротив
    ctx.fillStyle = 'rgba(160,140,150,.82)';
    ctx.fillRect(W * 0.62, y0 - H * 0.011, W * 0.4, H * 0.014);
    const heights = [0.016, 0.022, 0.014, 0.026, 0.018, 0.012, 0.024, 0.016, 0.02, 0.013];
    for (let i = 0; i < heights.length; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(168,146,152,.85)' : 'rgba(186,160,160,.85)';
      ctx.fillRect(W * (0.64 + i * 0.036), y0 - H * heights[i] - H * 0.008, W * 0.032, H * heights[i]);
    }
    // здание Биржи (портик)
    ctx.fillStyle = 'rgba(204,176,150,.92)';
    ctx.fillRect(W * 0.7, y0 - H * 0.03, W * 0.13, H * 0.03);
    ctx.fillStyle = 'rgba(224,204,180,.95)';
    ctx.beginPath();
    ctx.moveTo(W * 0.695, y0 - H * 0.03);
    ctx.lineTo(W * 0.765, y0 - H * 0.043);
    ctx.lineTo(W * 0.835, y0 - H * 0.03);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,98,92,.5)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 9; k++) {
      ctx.beginPath();
      ctx.moveTo(W * (0.708 + k * 0.014), y0 - H * 0.029);
      ctx.lineTo(W * (0.708 + k * 0.014), y0);
      ctx.stroke();
    }
    // Ростральные колонны
    for (const cx of [0.66, 0.855]) {
      ctx.fillStyle = '#9E5F4E';
      ctx.beginPath();
      ctx.moveTo(W * cx - W * 0.008, y0);
      ctx.lineTo(W * cx - W * 0.005, y0 - H * 0.055);
      ctx.lineTo(W * cx + W * 0.005, y0 - H * 0.055);
      ctx.lineTo(W * cx + W * 0.008, y0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#C9A86A';
      ctx.fillRect(W * cx - W * 0.011, y0 - H * 0.059, W * 0.022, H * 0.005);
      const fl = ctx.createRadialGradient(W * cx, y0 - H * 0.066, 0, W * cx, y0 - H * 0.066, W * 0.03);
      fl.addColorStop(0, 'rgba(255,205,110,.9)');
      fl.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = fl;
      ctx.beginPath();
      ctx.arc(W * cx, y0 - H * 0.066, W * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
    // Петропавловская крепость — тонкий золотой шпиль
    const sx = W * 0.93;
    ctx.fillStyle = 'rgba(196,170,150,.9)';
    ctx.fillRect(sx - W * 0.035, y0 - H * 0.022, W * 0.07, H * 0.022);
    ctx.fillStyle = 'rgba(214,190,160,.95)';
    ctx.fillRect(sx - W * 0.012, y0 - H * 0.05, W * 0.024, H * 0.03);
    ctx.fillStyle = '#E7C36C';
    ctx.beginPath();
    ctx.moveTo(sx, y0 - H * 0.115);
    ctx.lineTo(sx + W * 0.008, y0 - H * 0.05);
    ctx.lineTo(sx - W * 0.008, y0 - H * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#E7C36C';
    ctx.fillRect(sx - 1, y0 - H * 0.125, 2, H * 0.012);
    // Адмиралтейская игла слева над улицей
    const ax = W * 0.405;
    ctx.fillStyle = 'rgba(214,176,100,.9)';
    ctx.beginPath();
    ctx.moveTo(ax, y0 - H * 0.082);
    ctx.lineTo(ax + W * 0.006, y0 - H * 0.026);
    ctx.lineTo(ax - W * 0.006, y0 - H * 0.026);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(176,150,140,.9)';
    ctx.fillRect(ax - W * 0.02, y0 - H * 0.026, W * 0.04, H * 0.026);
    ctx.restore();
  }

  /* ---------------------------- МИР ----------------------------- */

  function drawWater() {
    const a = pt(PAR_OUT, PAR_H, Z_NEAR);
    const b = pt(PAR_OUT, PAR_H, Z_FAR);
    const g = ctx.createLinearGradient(0, H * 0.09, 0, H);
    g.addColorStop(0, '#E9BE98');
    g.addColorStop(0.12, '#B9A8AE');
    g.addColorStop(0.32, '#5E8CAE');
    g.addColorStop(0.62, '#1E5C86');
    g.addColorStop(1, '#0F3A5E');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(W + 40, b[1]);
    ctx.lineTo(W + 40, a[1]);
    ctx.closePath();
    ctx.fill();

    // золотая дорожка заката
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(W + 40, b[1]);
    ctx.lineTo(W + 40, a[1]);
    ctx.closePath();
    ctx.clip();
    const glint = ctx.createLinearGradient(W * 0.7, H * 0.09, W * 0.95, H);
    glint.addColorStop(0, 'rgba(255,214,150,.5)');
    glint.addColorStop(0.5, 'rgba(255,190,110,.14)');
    glint.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = glint;
    ctx.fillRect(W * 0.55, H * 0.09, W * 0.5, H * 0.91);

    // рябь — привязана к миру, поэтому уезжает вместе с дорогой
    eachWorld(0.06, 0, Z_NEAR, Z_FAR, (n, z) => {
      for (let k = 0; k < 2; k++) {
        const id = n * 2 + k;
        const X = PAR_OUT + 0.03 + Math.pow(hash(id * 1.7 + 4), 1.7) * 2.4;
        const len = 0.05 + hash(id + 99) * 0.12;
        const [x, y] = pt(X, -0.42, z);
        const s = roadW / z;
        const far = clamp((z - 1) / 2.2, 0, 1);
        const tw = 0.55 + 0.45 * Math.sin(time * 2.2 + id);
        ctx.strokeStyle = far > 0.55
          ? `rgba(255,214,160,${(0.16 + far * 0.3) * tw})`
          : `rgba(205,236,255,${(0.14 + (1 - far) * 0.12) * tw})`;
        ctx.lineWidth = Math.max(0.7, s * 0.012);
        ctx.beginPath();
        ctx.moveTo(x - len * s, y);
        ctx.lineTo(x + len * s, y);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  function drawFacade() {
    const fx = FACADE_X;
    const c0 = Math.floor((camZ + Z_NEAR) / FACADE_CYCLE) - 0;
    const c1 = Math.floor((camZ + Z_FAR) / FACADE_CYCLE);
    const list = [];
    for (let c = c0; c <= c1; c++) {
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        const zA = c * FACADE_CYCLE + b.z0 - camZ;
        const zB = zA + b.len;
        if (zB < Z_NEAR || zA > Z_FAR) continue;
        const prev = buildings[(i + buildings.length - 1) % buildings.length];
        list.push({ b, zA, zB, hPrev: prev.h, key: c * 1000 + i });
      }
    }
    list.sort((p, q) => q.zA - p.zA); // от дальних к ближним

    for (const it of list) drawBuilding(it.b, it.zA, it.zB, it.hPrev, it.key);
  }

  function drawBuilding(b, zA, zB, hPrev, key) {
    const fx = FACADE_X;
    const pal = FACADES[b.color];
    const Ht = b.h;
    const zs = Math.max(zA, Z_NEAR);

    // торец, если он выше соседа
    if (Ht > hPrev) {
      const ef = shade(pal.wall, -52);
      endFace(zA, fx - 1.2, fx, hPrev, Ht, ef);
      endFace(zA, fx - 1.2, fx, Ht - 0.05, Ht, shade(pal.trim, -70));
    }
    // стена
    const gx = pt(fx, 0, zs)[0], gx2 = pt(fx, 0, zB)[0];
    const wg = ctx.createLinearGradient(gx, 0, gx2, 0);
    wg.addColorStop(0, shade(pal.wall, -10));
    wg.addColorStop(1, shade(pal.wall, 14));
    wall(fx, zA, zB, 0, Ht, wg);

    // цоколь (рустовка)
    wall(fx, zA, zB, 0, 0.22, '#9C8F86');
    for (const hh of [0.073, 0.147]) {
      line3(pt(fx, hh, Math.max(zA, 0.35)), pt(fx, hh, zB), 'rgba(70,58,52,.35)', 1);
    }

    const far = zA > 2.7;
    // окна
    if (!far) {
      for (let k = 0; k < b.bays; k++) {
        const zc = zA + (k + 0.5) * BAY;
        const w2 = 0.085;
        const za = zc - w2, zb = zc + w2;
        if (zb < Z_NEAR || za > Z_FAR) continue;

        // нижний этаж: лавки/арки
        const lit0 = hash(key * 13 + k * 3.3) > 0.3;
        const door = k % 3 === 1;
        wall(fx + 0.004, za, zb, 0.02, door ? 0.2 : 0.18, door ? '#3A2E2A' : (lit0 ? '#FFD580' : '#59606E'));
        wall(fx + 0.006, za - 0.012, za, 0.02, 0.2, pal.trim);
        wall(fx + 0.006, zb, zb + 0.012, 0.02, 0.2, pal.trim);

        for (let f = 0; f < b.floors; f++) {
          const h0 = 0.22 + f * 0.33;
          const lit = hash(key * 31 + k * 7.1 + f * 3.7) > 0.52;
          const frame = f === 0 ? 0.012 : 0.008;
          wall(fx + 0.004, za - frame, zb + frame, h0 + 0.07 - frame, h0 + 0.27 + frame, pal.trim);
          const gl = lit ? '#FFCF73' : (f === 0 ? '#7F97B3' : '#6F89A8');
          wall(fx + 0.006, za, zb, h0 + 0.07, h0 + 0.27, gl);
          // переплёт
          if (zc < 2.2) {
            const zm = zc;
            line3(pt(fx + 0.007, h0 + 0.07, zm), pt(fx + 0.007, h0 + 0.27, zm), 'rgba(255,248,230,.75)', 0.8);
            line3(pt(fx + 0.007, h0 + 0.17, za), pt(fx + 0.007, h0 + 0.17, zb), 'rgba(255,248,230,.55)', 0.7);
          }
          // сандрик
          if (f === 0) {
            wall(fx + 0.008, za - 0.022, zb + 0.022, h0 + 0.27 + frame, h0 + 0.31, pal.trim);
          } else {
            wall(fx + 0.006, za - 0.014, zb + 0.014, h0 + 0.27 + frame, h0 + 0.295, pal.trim);
          }
        }
      }
    }

    // пояс над цоколем
    wall(fx + 0.012, zA, zB, 0.215, 0.24, pal.trim);
    // межэтажные тяги
    for (let f = 1; f < b.floors; f++) {
      const hh = 0.22 + f * 0.33 - 0.005;
      wall(fx + 0.008, zA, zB, hh - 0.008, hh + 0.008, pal.trim);
    }
    // карниз
    wall(fx, zA, zB, Ht - 0.04, Ht - 0.005, 'rgba(60,40,30,.28)');
    wall(fx + 0.045, zA, zB, Ht - 0.02, Ht + 0.0, shade(pal.trim, -14));
    wall(fx + 0.045, zA, zB, Ht, Ht + 0.01, pal.trim);
    // лопатки по краям
    wall(fx + 0.014, zA, zA + 0.03, 0.22, Ht, pal.trim);
    wall(fx + 0.014, zB - 0.03, zB, 0.22, Ht, pal.trim);
  }

  function drawGround() {
    const gg = ctx.createLinearGradient(0, H * 0.09, 0, H);
    gg.addColorStop(0, '#D4C4B2');
    gg.addColorStop(1, '#A89A8E');

    // тротуары
    strip(FACADE_X, CURB_L, Z_NEAR, Z_FAR, 0, gg);
    // тень от дома на тротуаре
    strip(FACADE_X, FACADE_X + 0.05, Z_NEAR, Z_FAR, 0, 'rgba(60,40,36,.22)');
    strip(CURB_R, PAR_IN, Z_NEAR, Z_FAR, 0, gg);
    // гранитные бордюры
    strip(CURB_L, -0.50, Z_NEAR, Z_FAR, 0.0, '#D7D1C8');
    strip(0.50, CURB_R, Z_NEAR, Z_FAR, 0.0, '#D7D1C8');

    // швы плитки
    ctx.lineWidth = 1;
    eachWorld(0.11, 0, Z_NEAR, Z_FAR, (n, z) => {
      const a = 0.10 + 0.08 * clamp((3 - z) / 2, 0, 1);
      ctx.strokeStyle = `rgba(88,70,58,${a})`;
      for (const [x0, x1] of [[FACADE_X, CURB_L], [CURB_R, PAR_IN]]) {
        const p = pt(x0, 0, z), q = pt(x1, 0, z);
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
    });
    ctx.strokeStyle = 'rgba(88,70,58,.14)';
    for (const X of [-0.615, 0.615]) {
      const p = pt(X, 0, Z_NEAR), q = pt(X, 0, Z_FAR);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }

    drawRoadSurface();
  }

  function drawRoadSurface() {
    const yTop = H * 0.09;
    const g = ctx.createLinearGradient(0, yTop, 0, H);
    g.addColorStop(0, '#4E5A6A');
    g.addColorStop(0.38, '#36424F');
    g.addColorStop(1, '#222C36');
    strip(-0.50, 0.50, Z_NEAR, Z_FAR, 0, g);

    ctx.save();
    ctx.beginPath();
    const p = [pt(-0.5, 0, Z_NEAR), pt(0.5, 0, Z_NEAR), pt(0.5, 0, Z_FAR), pt(-0.5, 0, Z_FAR)];
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
    ctx.clip();

    // фактура асфальта — крапинки закреплены за миром
    eachWorld(0.065, 0, Z_NEAR, Z_FAR, (n, z) => {
      for (let k = 0; k < 3; k++) {
        const id = n * 3 + k;
        const X = hash(id * 1.31) - 0.5;
        const [x, y] = pt(X, 0, z);
        const s = roadW / z;
        const a = 0.03 + hash(id + 5) * 0.05;
        ctx.fillStyle = hash(id + 9) > 0.5 ? `rgba(255,255,255,${a})` : `rgba(5,12,18,${a + 0.04})`;
        ctx.fillRect(x, y, Math.max(1, s * 0.008), Math.max(1, s * 0.012));
      }
    });

    // швы и заплатки асфальта
    eachWorld(1.9, 0.4, Z_NEAR, Z_FAR, (n, z) => {
      const a = pt(-0.5, 0, z), b = pt(0.5, 0, z);
      ctx.strokeStyle = 'rgba(8,14,20,.32)';
      ctx.lineWidth = Math.max(1, roadW / z * 0.008);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
    eachWorld(2.7, 1.1, Z_NEAR, Z_FAR, (n, z) => {
      const X0 = -0.45 + hash(n * 3.3) * 0.5;
      strip(X0, X0 + 0.28, z, z + 0.1, 0, 'rgba(14,22,30,.16)');
    });

    // тёплые пятна света от фонарей
    eachWorld(LAMP_SP, 0, Z_NEAR, Z_FAR + 0.6, (n, z) => {
      for (const side of [-1, 1]) {
        const zz = z + (side < 0 ? LAMP_SP * 0.5 : 0);
        const [x, y] = pt(side * 0.33, 0, zz);
        const rx = 0.34 * roadW / zz;
        const ry = 0.26 * (H - vpY) / (zz * zz);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ry / rx);
        const lg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        lg.addColorStop(0, 'rgba(255,205,120,.20)');
        lg.addColorStop(1, 'rgba(255,205,120,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // пешеходный переход
    eachWorld(15, 4.5, Z_NEAR, Z_FAR, (n, z) => {
      for (let i = 0; i < 9; i++) {
        const X = -0.46 + i * 0.1;
        strip(X, X + 0.055, z, z + 0.11, 0, 'rgba(240,236,226,.86)');
      }
    });
    ctx.restore();

    // край проезжей части и разметка
    strip(-0.495, -0.478, Z_NEAR, Z_FAR, 0, 'rgba(244,238,222,.92)');
    strip(0.478, 0.495, Z_NEAR, Z_FAR, 0, 'rgba(244,238,222,.92)');
    eachWorld(0.12, 0, Z_NEAR, Z_FAR, (n, z) => {
      for (const X of [-1 / 6, 1 / 6]) {
        strip(X - 0.009, X + 0.009, z, z + 0.058, 0, 'rgba(255,241,198,.95)');
      }
    });
  }

  function drawParapet() {
    // гранитный парапет вдоль Невы
    const lowFace = ctx.createLinearGradient(0, H * 0.09, 0, H);
    lowFace.addColorStop(0, '#9B908B');
    lowFace.addColorStop(1, '#6F6560');
    wall(PAR_IN, Z_NEAR, Z_FAR, 0, PAR_H, lowFace);
    strip(PAR_IN, PAR_OUT, Z_NEAR, Z_FAR, PAR_H, '#BDB3AC');
    strip(PAR_IN - 0.006, PAR_IN + 0.012, Z_NEAR, Z_FAR, PAR_H + 0.002, '#D5CCC5');

    // швы блоков
    eachWorld(0.16, 0, Z_NEAR, Z_FAR, (n, z) => {
      line3(pt(PAR_IN, 0, z), pt(PAR_IN, PAR_H, z), 'rgba(40,30,28,.35)', 1);
      line3(pt(PAR_IN, PAR_H, z), pt(PAR_OUT, PAR_H, z), 'rgba(60,50,46,.3)', 0.8);
    });
    line3(pt(PAR_IN, PAR_H * 0.5, Z_NEAR), pt(PAR_IN, PAR_H * 0.5, Z_FAR), 'rgba(40,30,28,.22)', 1);

    // тумбы парапета
    eachWorld(1.7, 0.4, Z_NEAR, Z_FAR, (n, z) => {
      const hh = PAR_H + 0.045;
      wall(PAR_IN - 0.012, z, z + 0.09, 0, hh, '#85796F');
      strip(PAR_IN - 0.012, PAR_OUT + 0.01, z, z + 0.09, hh, '#B3A79D');
      endFace(z, PAR_IN - 0.012, PAR_OUT + 0.01, PAR_H, hh, '#988C83');
    });
  }

  /* --------------------------- ДЕКОР ---------------------------- */

  const LAMP_SP = 0.85;
  const TREE_SP = 0.85;

  function drawDecor() {
    const items = [];
    eachWorld(LAMP_SP, 0, Z_NEAR - 0.2, Z_FAR, (n, z) => items.push({ z, fn: () => drawLamp(0.605, z, 1) }));
    eachWorld(LAMP_SP, LAMP_SP * 0.5, Z_NEAR - 0.2, Z_FAR, (n, z) => items.push({ z, fn: () => drawLamp(-0.57, z, -1) }));
    eachWorld(TREE_SP, TREE_SP * 0.25, Z_NEAR - 0.3, Z_FAR, (n, z) => items.push({ z, fn: () => drawTree(-0.62, z, n) }));
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.fn();
  }

  function drawLamp(X, z, side) {
    const [x, y] = pt(X, 0, z);
    if (y < H * 0.085) return;
    const s = roadW / z;
    const arm = -side; // консоль уходит в сторону проезжей части
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, -X * KK, 1, 0, 0);

    // тень
    ctx.fillStyle = 'rgba(20,16,14,.18)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.06 * s, 0.03 * (H - vpY) / (z * z) * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // гранитный постамент
    ctx.fillStyle = '#7C726C';
    rr(-0.04 * s, -0.09 * s, 0.08 * s, 0.09 * s, 0.01 * s);
    ctx.fill();
    ctx.fillStyle = '#B2A8A0';
    rr(-0.046 * s, -0.1 * s, 0.092 * s, 0.014 * s, 0.006 * s);
    ctx.fill();

    // чугунная опора
    const post = '#1E282B';
    ctx.fillStyle = post;
    ctx.beginPath();
    ctx.moveTo(-0.022 * s, -0.1 * s);
    ctx.lineTo(0.022 * s, -0.1 * s);
    ctx.lineTo(0.011 * s, -0.5 * s);
    ctx.lineTo(-0.011 * s, -0.5 * s);
    ctx.closePath();
    ctx.fill();
    // кольца
    ctx.fillStyle = '#323F42';
    for (const hh of [0.16, 0.30, 0.46]) rr(-0.02 * s, -hh * s, 0.04 * s, 0.018 * s, 0.006 * s), ctx.fill();

    // завиток-консоль
    ctx.strokeStyle = post;
    ctx.lineWidth = Math.max(1, 0.014 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -0.46 * s);
    ctx.quadraticCurveTo(arm * 0.02 * s, -0.56 * s, arm * 0.13 * s, -0.56 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(arm * 0.045 * s, -0.43 * s, 0.03 * s, Math.PI * 0.3, Math.PI * 1.5, arm < 0);
    ctx.stroke();

    // подвесной фонарь
    const lx = arm * 0.13 * s, ly = -0.56 * s;
    // свечение
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(lx, ly - 0.04 * s, 0, lx, ly - 0.04 * s, 0.34 * s);
    gl.addColorStop(0, 'rgba(255,206,120,.75)');
    gl.addColorStop(0.4, 'rgba(255,184,86,.22)');
    gl.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(lx, ly - 0.04 * s, 0.34 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = post;
    ctx.beginPath();
    ctx.moveTo(lx - 0.045 * s, ly - 0.07 * s);
    ctx.lineTo(lx + 0.045 * s, ly - 0.07 * s);
    ctx.lineTo(lx + 0.0 * s, ly - 0.105 * s);
    ctx.closePath();
    ctx.fill();
    const glass = ctx.createLinearGradient(0, ly - 0.07 * s, 0, ly + 0.03 * s);
    glass.addColorStop(0, '#FFF1B8');
    glass.addColorStop(1, '#FFC25E');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(lx - 0.04 * s, ly - 0.07 * s);
    ctx.lineTo(lx + 0.04 * s, ly - 0.07 * s);
    ctx.lineTo(lx + 0.03 * s, ly + 0.025 * s);
    ctx.lineTo(lx - 0.03 * s, ly + 0.025 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = post;
    ctx.fillRect(lx - 0.034 * s, ly + 0.025 * s, 0.068 * s, 0.012 * s);
    ctx.restore();
  }

  const TREE_TONES = [
    ['#B9DB6A', '#6FB04A', '#2F7440'],   // зелёная
    ['#F0DB6B', '#C9B034', '#7A8A24'],   // золотая
    ['#F4B25A', '#D4802D', '#8E4A1D'],   // оранжевая
    ['#B9DB6A', '#6FB04A', '#2F7440']
  ];

  function drawTree(X, z, n) {
    const [x, y] = pt(X, 0, z);
    if (y < H * 0.085) return;
    const s = roadW / z;
    const tone = TREE_TONES[Math.floor(hash(n * 5.7 + 1) * TREE_TONES.length)];
    const cy = -0.78 * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, -X * KK, 1, 0, 0);

    ctx.fillStyle = 'rgba(24,26,20,.17)';
    ctx.beginPath();
    ctx.ellipse(0.04 * s, 0, 0.17 * s, 0.07 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#5B4331';
    ctx.beginPath();
    ctx.moveTo(-0.024 * s, 0);
    ctx.lineTo(0.024 * s, 0);
    ctx.lineTo(0.014 * s, -0.7 * s);
    ctx.lineTo(-0.014 * s, -0.7 * s);
    ctx.closePath();
    ctx.fill();
    // ограда приствольного круга
    ctx.strokeStyle = '#242D30';
    ctx.lineWidth = Math.max(1, 0.01 * s);
    ctx.strokeRect(-0.06 * s, -0.045 * s, 0.12 * s, 0.045 * s);

    const grad = ctx.createRadialGradient(-0.07 * s, cy - 0.08 * s, 0.02 * s, 0, cy, 0.25 * s);
    grad.addColorStop(0, tone[0]);
    grad.addColorStop(0.5, tone[1]);
    grad.addColorStop(1, tone[2]);
    ctx.fillStyle = grad;
    ctx.beginPath();
    const blobs = [[0, 0, 0.17], [-0.12, 0.04, 0.12], [0.12, 0.05, 0.12], [0.02, -0.12, 0.13], [-0.07, -0.07, 0.13], [0.08, -0.06, 0.13]];
    for (const [bx, by, br] of blobs) {
      ctx.moveTo(bx * s + br * s, cy + by * s);
      ctx.arc(bx * s, cy + by * s, br * s, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  function drawHaze() {
    const g = ctx.createLinearGradient(0, H * 0.07, 0, H * 0.21);
    g.addColorStop(0, 'rgba(240,214,190,0)');
    g.addColorStop(0.15, 'rgba(240,214,190,.88)');
    g.addColorStop(0.2, 'rgba(240,214,190,1)');
    g.addColorStop(0.36, 'rgba(240,214,190,.72)');
    g.addColorStop(1, 'rgba(240,214,190,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.07, W, H * 0.14);
  }
  // Дальний мост — висит над водой, рядом с горизонтом
  function drawFarBridge() {
    const yb = H * 0.104;
    const x0 = W * 0.60;
    ctx.save();
    ctx.fillStyle = 'rgba(122,98,100,.9)';
    ctx.fillRect(x0, yb, W - x0, H * 0.008);
    ctx.fillStyle = 'rgba(96,78,84,.9)';
    ctx.fillRect(x0, yb - H * 0.004, W - x0, H * 0.004);
    // арки
    ctx.fillStyle = 'rgba(80,66,76,.75)';
    for (let i = 0; i < 6; i++) {
      const ax = x0 + (W - x0) * (i + 0.5) / 6;
      ctx.beginPath();
      ctx.ellipse(ax, yb + H * 0.008, (W - x0) / 14, H * 0.009, 0, Math.PI, 0);
      ctx.fill();
    }
    // фонари на мосту
    for (let i = 0; i < 12; i++) {
      const lx = x0 + 6 + i * (W - x0) / 11.5;
      ctx.fillStyle = 'rgba(255,214,140,.95)';
      ctx.beginPath();
      ctx.arc(lx, yb - H * 0.009, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawScene() {
    drawSky();
    drawFarBank();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, H * 0.09, W, H);
    ctx.clip();
    drawWater();
    drawFacade();
    drawGround();
    drawParapet();
    drawDecor();
    ctx.restore();

    drawFarBridge();
    drawHaze();
    drawAtmosphere();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function drawAtmosphere() {
    const vignette = ctx.createRadialGradient(W * 0.5, H * 0.48, W * 0.1, W * 0.5, H * 0.48, W * 0.75);
    vignette.addColorStop(0, 'rgba(255,255,255,0)');
    vignette.addColorStop(1, 'rgba(8,21,31,.18)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    const warm = ctx.createLinearGradient(0, H * 0.3, 0, H);
    warm.addColorStop(0, 'rgba(255,183,90,0)');
    warm.addColorStop(1, 'rgba(255,168,65,.06)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, H * 0.3, W, H * 0.7);
  }

  function drawGlowTrail() {
    const glow = ctx.createLinearGradient(car.x, car.y - 40, car.x, H);
    glow.addColorStop(0, 'rgba(121,198,43,.02)');
    glow.addColorStop(0.55, 'rgba(121,198,43,.12)');
    glow.addColorStop(1, 'rgba(121,198,43,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(car.x - car.w * 0.18, car.y + car.h * 0.16);
    ctx.lineTo(car.x + car.w * 0.18, car.y + car.h * 0.16);
    ctx.lineTo(car.x + car.w * 0.42, H);
    ctx.lineTo(car.x - car.w * 0.42, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawToken(o, x) {
    const y = o.y + Math.sin(o.bob) * 3;
    const scale = perspective(o.y);
    const r = o.size * 0.45 * scale;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#B5EC63');
    g.addColorStop(1, '#72C52A');
    ctx.save();
    ctx.shadowBlur = 22 * scale;
    ctx.shadowColor = 'rgba(131,205,52,.45)';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = Math.max(2, 4 * scale);
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(9, r * 0.72)}px Arial`;
    ctx.fillText('XXI', x, y + 1);
    ctx.restore();
  }

  function drawHeart(o, x) {
    const scale = perspective(o.y);
    ctx.save();
    ctx.fillStyle = '#FF5874';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(18, o.size * 0.9 * scale)}px Arial`;
    ctx.shadowBlur = 18 * scale;
    ctx.shadowColor = 'rgba(255,88,116,.35)';
    ctx.fillText('♥', x, o.y + Math.sin(o.bob) * 3);
    ctx.restore();
  }

  function drawShield(o, x) {
    const scale = perspective(o.y);
    const size = o.size * scale;
    ctx.save();
    ctx.translate(x, o.y + Math.sin(o.bob) * 3);
    ctx.shadowBlur = 18 * scale;
    ctx.shadowColor = 'rgba(87,191,255,.35)';
    ctx.fillStyle = '#43AAFF';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.5);
    ctx.lineTo(size * 0.34, -size * 0.18);
    ctx.lineTo(size * 0.28, size * 0.24);
    ctx.quadraticCurveTo(0, size * 0.58, -size * 0.28, size * 0.24);
    ctx.lineTo(-size * 0.34, -size * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.max(12, size * 0.5)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✚', 0, 1);
    ctx.restore();
  }

  function drawBoost(o, x) {
    const scale = perspective(o.y);
    ctx.save();
    ctx.translate(x, o.y + Math.sin(o.bob) * 3);
    ctx.shadowBlur = 16 * scale;
    ctx.shadowColor = 'rgba(90,174,255,.35)';
    ctx.fillStyle = '#378FFF';
    ctx.font = `700 ${Math.max(18, o.size * 0.86 * scale)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('»', 0, 0);
    ctx.restore();
  }

  function drawCone(o, x) {
    const scale = perspective(o.y);
    const size = o.size * scale;
    ctx.save();
    ctx.translate(x, o.y);
    ctx.shadowBlur = 12 * scale;
    ctx.shadowColor = 'rgba(243,109,33,.30)';
    ctx.fillStyle = '#F36D21';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.5);
    ctx.lineTo(size * 0.42, size * 0.44);
    ctx.lineTo(-size * 0.42, size * 0.44);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff';
    ctx.fillRect(-size * 0.3, -size * 0.05, size * 0.6, size * 0.11);
    ctx.fillRect(-size * 0.38, size * 0.25, size * 0.76, size * 0.11);
    ctx.restore();
  }

  function drawPuddle(o, x) {
    const scale = perspective(o.y);
    const size = o.size * scale;
    ctx.save();
    const g = ctx.createRadialGradient(x - size * 0.15, o.y - size * 0.12, size * 0.1, x, o.y, size * 0.6);
    g.addColorStop(0, '#A8E3FF');
    g.addColorStop(1, '#2E9DDD');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, o.y, size * 0.58, size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.ellipse(x - size * 0.18, o.y - size * 0.07, size * 0.18, size * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawObjects() {
    for (const o of objects) {
      const x = laneX(o.lane, o.y);
      ctx.globalAlpha = clamp((o.y - H * 0.10) / (H * 0.07), 0, 1);
      if (o.type === 'token') drawToken(o, x);
      else if (o.type === 'heart') drawHeart(o, x);
      else if (o.type === 'shield') drawShield(o, x);
      else if (o.type === 'boost') drawBoost(o, x);
      else if (o.type === 'cone') drawCone(o, x);
      else if (o.type === 'puddle') drawPuddle(o, x);
    }
    ctx.globalAlpha = 1;
  }

  function drawCar() {
    const bob = Math.sin(time * 3.5) * 2;
    ctx.save();
    ctx.translate(car.x, car.y + bob);
    ctx.rotate(tilt);

    ctx.fillStyle = 'rgba(7,22,34,.28)';
    ctx.beginPath();
    ctx.ellipse(0, car.h * 0.33, car.w * 0.42, car.h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    if (car.invincible > 0) {
      ctx.shadowBlur = 36;
      ctx.shadowColor = 'rgba(98,216,255,.9)';
    }

    if (taxi.complete && taxi.naturalWidth) {
      ctx.drawImage(taxi, -car.w / 2, -car.h / 2, car.w, car.h);
    } else {
      ctx.fillStyle = '#fff';
      rr(-car.w / 2, -car.h / 2, car.w, car.h, 18);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawScene();
    drawGlowTrail();
    drawObjects();
    drawParticles();
    drawCar();
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    overlay.classList.add('show');
    overlay.querySelector('h1').textContent = 'Маршрут завершён';
    overlay.querySelector('p').textContent = `Результат: ${Math.floor(score).toLocaleString('ru-RU')} очков. Жетонов XXI: ${tokens}.`;
    startBtn.textContent = 'Играть снова';
  }

  function move(dir) {
    targetLane = Math.max(0, Math.min(2, targetLane + dir));
  }

  let startX = 0;
  let startY = 0;
  stage.addEventListener('pointerdown', e => {
    startX = e.clientX;
    startY = e.clientY;
  });
  stage.addEventListener('pointerup', e => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
  });
  window.addEventListener('keydown', e => {
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) move(-1);
    if (['ArrowRight', 'd', 'D'].includes(e.key)) move(1);
  });
  startBtn.addEventListener('click', reset);
  soundBtn.addEventListener('click', () => {
    muted = !muted;
    soundBtn.textContent = muted ? '🔇' : '🔊';
  });
  window.addEventListener('resize', resize);

  function beep(freq, dur) {
    if (muted) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = freq;
      o.type = 'sine';
      g.gain.value = 0.025;
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.stop(ac.currentTime + dur + 0.02);
    } catch {}
  }

  function rr(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, radius);
      return;
    }
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  resize();
  updateHud();
  draw();
})();
