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
  let sceneOffset = 0;
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

  function perspective(y) {
    return 0.35 + roadT(y) * 0.95;
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
    sceneOffset = 0;
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
      y: H * 0.08,
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
    sceneOffset += speed * dt * 0.68;
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
      o.y += speed * dt;
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

  function drawScene() {
    drawSky();
    drawHorizon();
    drawWater();
    drawArchitecture();
    drawRoad();
    drawSidewalks();
    drawRailings();
    drawStreetDecor();
    drawAtmosphere();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.32);
    g.addColorStop(0, '#6FA8D8');
    g.addColorStop(0.35, '#F5A77B');
    g.addColorStop(0.72, '#FFD7A0');
    g.addColorStop(1, '#D6E7EF');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 6; i++) {
      const x = W * (0.08 + i * 0.18) + Math.sin(time * 0.05 + i) * 8;
      const y = H * (0.035 + (i % 2) * 0.018);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, W * 0.18);
      rg.addColorStop(0, 'rgba(255,214,184,.20)');
      rg.addColorStop(1, 'rgba(255,214,184,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, W * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHorizon() {
    const y = H * 0.115;

    const haze = ctx.createLinearGradient(0, y - 25, 0, y + 55);
    haze.addColorStop(0, 'rgba(255,240,218,.12)');
    haze.addColorStop(1, 'rgba(228,235,237,.92)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, y - 28, W, 90);

    ctx.fillStyle = '#738596';
    for (let i = 0; i < 11; i++) {
      const bw = W * (0.045 + (i % 3) * 0.012);
      const bh = H * (0.025 + (i % 4) * 0.009);
      const x = i * W / 10 - bw * 0.5;
      ctx.globalAlpha = 0.42;
      ctx.fillRect(x, y - bh, bw, bh);
    }
    ctx.globalAlpha = 1;

    drawDome(W * 0.72, y - H * 0.028, W * 0.055);
    drawSpire(W * 0.44, y - H * 0.018, W * 0.028, H * 0.075);
    drawSpire(W * 0.61, y - H * 0.01, W * 0.022, H * 0.055);

    drawBridge();
  }

  function drawDome(x, y, r) {
    ctx.save();
    ctx.fillStyle = 'rgba(87,105,123,.72)';
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - r * 0.62, y, r * 1.24, r * 0.54);
    ctx.strokeStyle = 'rgba(74,88,105,.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.08);
    ctx.lineTo(x, y - r * 0.1);
    ctx.stroke();
    ctx.restore();
  }

  function drawSpire(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(75,94,112,.72)';
    ctx.fillRect(x - w * 0.45, y, w * 0.9, h * 0.52);
    ctx.beginPath();
    ctx.moveTo(x, y - h * 0.6);
    ctx.lineTo(x + w * 0.22, y);
    ctx.lineTo(x - w * 0.22, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBridge() {
    const y = H * 0.145;
    ctx.save();
    ctx.strokeStyle = '#9A8770';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W * 0.71, y);
    ctx.quadraticCurveTo(W * 0.86, y - 13, W, y + 4);
    ctx.stroke();

    ctx.strokeStyle = '#5F5A57';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const x = W * 0.73 + i * W * 0.035;
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWater() {
    const x0 = W * 0.815;
    const g = ctx.createLinearGradient(x0, 0, W, 0);
    g.addColorStop(0, '#164F75');
    g.addColorStop(0.45, '#0C6A9D');
    g.addColorStop(1, '#0B466F');
    ctx.fillStyle = g;
    ctx.fillRect(x0, H * 0.11, W - x0, H * 0.89);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, H * 0.11, W - x0, H * 0.89);
    ctx.clip();

    for (let i = 0; i < 44; i++) {
      const y = ((i * 31 + sceneOffset * 0.22) % (H * 1.1)) + H * 0.08;
      const amp = 5 + (i % 5) * 3;
      const x = x0 + W * 0.015 + ((i * 37) % Math.max(16, W * 0.15));
      const width = W * (0.035 + (i % 4) * 0.018);
      const alpha = 0.12 + (i % 5) * 0.035;
      ctx.strokeStyle = i % 3 === 0 ? `rgba(255,190,94,${alpha + 0.1})` : `rgba(199,235,255,${alpha})`;
      ctx.lineWidth = 1.2 + (i % 3) * 0.7;
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const px = x + width * k / 12;
        const py = y + Math.sin(k * 0.8 + time * 2 + i) * amp * 0.12;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    const refl = ctx.createLinearGradient(0, H * 0.12, 0, H);
    refl.addColorStop(0, 'rgba(255,185,92,.26)');
    refl.addColorStop(0.5, 'rgba(255,185,92,.06)');
    refl.addColorStop(1, 'rgba(255,185,92,0)');
    ctx.fillStyle = refl;
    ctx.fillRect(x0 + W * 0.06, H * 0.12, W * 0.035, H * 0.8);
    ctx.restore();
  }

  function drawArchitecture() {
    const facadeRight = W * 0.19;
    const fg = ctx.createLinearGradient(0, 0, facadeRight, 0);
    fg.addColorStop(0, '#B8824D');
    fg.addColorStop(0.45, '#E5BD82');
    fg.addColorStop(1, '#B88959');
    ctx.fillStyle = fg;
    ctx.fillRect(0, H * 0.10, facadeRight, H * 0.90);

    const edge = ctx.createLinearGradient(facadeRight - 18, 0, facadeRight, 0);
    edge.addColorStop(0, 'rgba(62,47,35,0)');
    edge.addColorStop(1, 'rgba(45,35,30,.32)');
    ctx.fillStyle = edge;
    ctx.fillRect(facadeRight - 18, H * 0.1, 18, H * 0.9);

    const cycle = 148;
    const off = sceneOffset * 0.34;
    for (let row = -1; row < Math.ceil(H / cycle) + 2; row++) {
      const y = H * 0.14 + ((row * cycle + off) % (H + cycle)) - cycle;
      const s = perspective(y);
      drawWindow(W * 0.055, y, s);
      drawWindow(W * 0.13, y + 24 * s, s * 0.96);
      if (row % 2 === 0) drawAwning(W * 0.09, y + 72 * s, s);
    }

    ctx.strokeStyle = 'rgba(255,234,202,.45)';
    ctx.lineWidth = 1;
    for (let x = 12; x < facadeRight; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, H * 0.1);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  }

  function drawWindow(x, y, s) {
    const w = 25 * s;
    const h = 35 * s;
    ctx.save();
    ctx.shadowBlur = 10 * s;
    ctx.shadowColor = 'rgba(255,191,93,.24)';
    ctx.fillStyle = '#6F4D32';
    rr(x - w / 2, y - h / 2, w, h, 3 * s);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, '#FFE1A7');
    g.addColorStop(1, '#B87943');
    ctx.fillStyle = g;
    rr(x - w * 0.37, y - h * 0.38, w * 0.74, h * 0.76, 2 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,245,224,.65)';
    ctx.lineWidth = Math.max(0.6, s);
    ctx.beginPath();
    ctx.moveTo(x, y - h * 0.34);
    ctx.lineTo(x, y + h * 0.34);
    ctx.stroke();
    ctx.restore();
  }

  function drawAwning(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#F6E7CE';
    ctx.beginPath();
    ctx.moveTo(-28 * s, 0);
    ctx.lineTo(28 * s, 0);
    ctx.lineTo(18 * s, 18 * s);
    ctx.lineTo(-18 * s, 18 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(126,88,57,.28)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 9 * s, 2 * s);
      ctx.lineTo(i * 6 * s, 16 * s);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRoad() {
    const yTop = H * 0.09;
    const g = ctx.createLinearGradient(0, yTop, 0, H);
    g.addColorStop(0, '#455466');
    g.addColorStop(0.38, '#34414F');
    g.addColorStop(1, '#222C36');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(roadLeft(yTop), yTop);
    ctx.lineTo(roadRight(yTop), yTop);
    ctx.lineTo(roadRight(H), H);
    ctx.lineTo(roadLeft(H), H);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(roadLeft(yTop), yTop);
    ctx.lineTo(roadRight(yTop), yTop);
    ctx.lineTo(roadRight(H), H);
    ctx.lineTo(roadLeft(H), H);
    ctx.closePath();
    ctx.clip();

    for (let i = 0; i < 90; i++) {
      const y = H * 0.1 + ((i * 79 + sceneOffset * 0.95) % (H * 0.95));
      const l = roadLeft(y);
      const r = roadRight(y);
      const x = l + ((i * 113) % Math.max(10, r - l));
      const a = 0.025 + (i % 5) * 0.009;
      ctx.fillStyle = i % 2 ? `rgba(255,255,255,${a})` : `rgba(5,12,18,${a + 0.02})`;
      ctx.fillRect(x, y, 1 + perspective(y) * 0.6, 2 + perspective(y) * 3);
    }

    const sheen = ctx.createLinearGradient(W * 0.5, yTop, W * 0.5, H);
    sheen.addColorStop(0, 'rgba(255,208,126,.03)');
    sheen.addColorStop(0.5, 'rgba(255,202,105,.07)');
    sheen.addColorStop(1, 'rgba(255,202,105,.025)');
    ctx.fillStyle = sheen;
    ctx.fillRect(W * 0.42, yTop, W * 0.16, H - yTop);

    ctx.restore();

    ctx.strokeStyle = 'rgba(244,238,222,.94)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(roadLeft(yTop), yTop);
    ctx.lineTo(roadLeft(H), H);
    ctx.moveTo(roadRight(yTop), yTop);
    ctx.lineTo(roadRight(H), H);
    ctx.stroke();

    drawLaneDashes(1);
    drawLaneDashes(2);
  }

  function drawLaneDashes(boundary) {
    const cycle = 92;
    const shift = sceneOffset % cycle;

    for (let i = -1; i < Math.ceil(H / cycle) + 2; i++) {
      const y = H * 0.1 + i * cycle + shift;
      if (y < H * 0.09 || y > H + 50) continue;

      const s = perspective(y);
      const len = 11 + 28 * s;
      const x1 = boundaryX(boundary, y);
      const x2 = boundaryX(boundary, y + len);

      ctx.strokeStyle = 'rgba(255,241,198,.94)';
      ctx.lineWidth = 1.8 + s * 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y + len);
      ctx.stroke();
    }
  }

  function drawSidewalks() {
    const yTop = H * 0.09;

    const leftG = ctx.createLinearGradient(0, 0, W * 0.31, 0);
    leftG.addColorStop(0, '#B58C62');
    leftG.addColorStop(0.5, '#D8C3A5');
    leftG.addColorStop(1, '#B99E7A');

    ctx.fillStyle = leftG;
    ctx.beginPath();
    ctx.moveTo(W * 0.19, yTop);
    ctx.lineTo(roadLeft(yTop), yTop);
    ctx.lineTo(roadLeft(H), H);
    ctx.lineTo(W * 0.19, H);
    ctx.closePath();
    ctx.fill();

    const rightG = ctx.createLinearGradient(W * 0.69, 0, W * 0.84, 0);
    rightG.addColorStop(0, '#BFA686');
    rightG.addColorStop(0.55, '#E0CDB0');
    rightG.addColorStop(1, '#9A7F64');
    ctx.fillStyle = rightG;
    ctx.beginPath();
    ctx.moveTo(roadRight(yTop), yTop);
    ctx.lineTo(W * 0.815, yTop);
    ctx.lineTo(W * 0.815, H);
    ctx.lineTo(roadRight(H), H);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 30; i++) {
      const y = H * 0.1 + ((i * 54 + sceneOffset * 0.72) % (H * 0.95));
      const s = perspective(y);
      ctx.strokeStyle = `rgba(104,84,66,${0.12 + s * 0.06})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W * 0.19, y);
      ctx.lineTo(roadLeft(y) - 2, y + s * 4);
      ctx.moveTo(roadRight(y) + 2, y + s * 4);
      ctx.lineTo(W * 0.815, y);
      ctx.stroke();
    }
  }

  function drawRailings() {
    ctx.strokeStyle = '#202A31';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W * 0.805, H * 0.1);
    ctx.lineTo(W * 0.805, H);
    ctx.stroke();

    const cycle = 82;
    for (let i = -1; i < Math.ceil(H / cycle) + 2; i++) {
      const y = H * 0.1 + ((i * cycle + sceneOffset * 0.82) % (H + cycle));
      const s = perspective(y);
      const x = W * 0.805;
      ctx.strokeStyle = '#1B242A';
      ctx.lineWidth = 1.2 + s * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y - 12 * s);
      ctx.lineTo(x, y + 24 * s);
      ctx.stroke();

      ctx.fillStyle = '#303941';
      ctx.beginPath();
      ctx.arc(x, y - 14 * s, 3.5 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStreetDecor() {
    const cycle = 190;
    for (let i = -1; i < Math.ceil(H / cycle) + 2; i++) {
      const y = H * 0.12 + ((i * cycle + sceneOffset * 0.78) % (H + cycle));
      const s = perspective(y);

      drawTree(W * 0.235, y, s * 0.92);
      drawLamp(roadRight(y) + W * 0.055, y + 36 * s, s);
      if (i % 2 === 0) {
        drawPlanter(roadRight(y) + W * 0.085, y + 75 * s, s * 0.85);
        drawPlanter(W * 0.205, y + 102 * s, s * 0.80);
      }
    }
  }

  function drawTree(x, y, s) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(24,34,29,.14)';
    ctx.beginPath();
    ctx.ellipse(8 * s, 34 * s, 24 * s, 10 * s, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#684A32';
    rr(-3 * s, 10 * s, 6 * s, 35 * s, 3 * s);
    ctx.fill();

    const grad = ctx.createRadialGradient(-8 * s, -14 * s, 3, 0, 0, 34 * s);
    grad.addColorStop(0, '#B5DF64');
    grad.addColorStop(0.45, '#6BB94B');
    grad.addColorStop(1, '#2E743C');
    ctx.fillStyle = grad;
    ctx.shadowBlur = 8 * s;
    ctx.shadowColor = 'rgba(23,71,32,.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 24 * s, 0, Math.PI * 2);
    ctx.arc(-14 * s, 5 * s, 16 * s, 0, Math.PI * 2);
    ctx.arc(15 * s, 7 * s, 15 * s, 0, Math.PI * 2);
    ctx.arc(4 * s, -16 * s, 17 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLamp(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#20292F';
    ctx.lineWidth = Math.max(1, 2.2 * s);
    ctx.beginPath();
    ctx.moveTo(0, 24 * s);
    ctx.lineTo(0, -28 * s);
    ctx.quadraticCurveTo(0, -37 * s, 8 * s, -40 * s);
    ctx.stroke();

    const glow = ctx.createRadialGradient(8 * s, -42 * s, 0, 8 * s, -42 * s, 20 * s);
    glow.addColorStop(0, 'rgba(255,211,115,.72)');
    glow.addColorStop(1, 'rgba(255,193,77,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(8 * s, -42 * s, 20 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFD37B';
    rr(3 * s, -49 * s, 10 * s, 14 * s, 2 * s);
    ctx.fill();
    ctx.strokeStyle = '#1C242A';
    ctx.stroke();
    ctx.restore();
  }

  function drawPlanter(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#5E4534';
    rr(-11 * s, -4 * s, 22 * s, 16 * s, 3 * s);
    ctx.fill();

    const colors = ['#F46A78', '#EFA2C6', '#FFF2D0'];
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc((-8 + (i % 4) * 5) * s, (-8 - Math.floor(i / 4) * 4) * s, 3.5 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
      if (o.type === 'token') drawToken(o, x);
      else if (o.type === 'heart') drawHeart(o, x);
      else if (o.type === 'shield') drawShield(o, x);
      else if (o.type === 'boost') drawBoost(o, x);
      else if (o.type === 'cone') drawCone(o, x);
      else if (o.type === 'puddle') drawPuddle(o, x);
    }
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