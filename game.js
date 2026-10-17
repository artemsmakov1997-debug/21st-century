(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const tokensEl = document.getElementById('tokens');
  const missionEl = document.getElementById('missionProgress');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const soundBtn = document.getElementById('soundBtn');

  const W = canvas.width;
  const H = canvas.height;
  const laneXs = [W * 0.30, W * 0.50, W * 0.70];
  const COLORS = {
    blue: '#0A71B9',
    dark: '#0A3F72',
    green: '#79C62B',
    greenDark: '#5DAE16',
    white: '#FFFFFF',
    road: '#313A43',
    cream: '#FFF5CF'
  };

  let running = false;
  let last = 0;
  let roadOffset = 0;
  let sceneryOffset = 0;
  let spawnTimer = 0;
  let score = 0;
  let lives = 3;
  let tokens = 0;
  let speed = 500;
  let muted = false;
  let objects = [];
  let particles = [];
  let targetLane = 1;
  let previousLane = 1;
  let laneTilt = 0;

  const logo = new Image();
  logo.src = 'assets/logo.png';

  const taxiSprite = new Image();
  taxiSprite.src = 'assets/taxi-top-render.webp';

  const car = {
    x: laneXs[1],
    y: H * 0.78,
    w: 168,
    h: 320,
    invincible: 0
  };

  function reset() {
    running = true;
    last = performance.now();
    roadOffset = 0;
    sceneryOffset = 0;
    spawnTimer = 0;
    score = 0;
    lives = 3;
    tokens = 0;
    speed = 500;
    objects = [];
    particles = [];
    targetLane = 1;
    previousLane = 1;
    laneTilt = 0;
    car.x = laneXs[1];
    car.invincible = 0;
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
    const lane = Math.floor(Math.random() * 3);
    const roll = Math.random();
    let type;

    if (roll < 0.43) type = 'token';
    else if (roll < 0.55) type = 'heart';
    else if (roll < 0.65) type = 'shield';
    else if (roll < 0.76) type = 'boost';
    else if (roll < 0.89) type = 'cone';
    else type = 'puddle';

    const size = ['cone', 'puddle'].includes(type) ? 90 : 76;
    objects.push({
      type,
      lane,
      x: laneXs[lane],
      y: 210,
      size,
      hit: false,
      bob: Math.random() * Math.PI * 2
    });
  }

  function loop(t) {
    if (!running) return;
    const dt = Math.min((t - last) / 1000, 0.033);
    last = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    score += dt * 12;
    roadOffset = (roadOffset + speed * dt) % 165;
    sceneryOffset = (sceneryOffset + speed * 0.34 * dt) % 240;

    const desiredX = laneXs[targetLane];
    car.x += (desiredX - car.x) * Math.min(1, dt * 10.5);
    laneTilt += (((targetLane - previousLane) * -0.075) - laneTilt) * Math.min(1, dt * 12);
    if (Math.abs(desiredX - car.x) < 2) {
      previousLane = targetLane;
      laneTilt *= 0.65;
    }

    car.invincible = Math.max(0, car.invincible - dt);
    spawnTimer -= dt;

    if (spawnTimer <= 0) {
      spawn();
      spawnTimer = Math.max(0.48, 1.08 - score / 6500);
    }

    for (const o of objects) {
      o.y += speed * dt;
      o.bob += dt * 4;
      const hit = Math.abs(o.x - car.x) < 72 && Math.abs(o.y - car.y) < 126;
      if (hit && !o.hit) {
        o.hit = true;
        collect(o);
      }
    }

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
    }

    objects = objects.filter(o => !o.hit && o.y < H + 160);
    particles = particles.filter(p => p.life > 0);
    speed = Math.min(820, 500 + score * 0.105);
    updateHud();
  }

  function collect(o) {
    const positive = !['cone', 'puddle'].includes(o.type);

    if (o.type === 'token') {
      tokens++;
      score += 180;
      burst(o.x, o.y, COLORS.green, 12);
      beep(740, 0.06);
    }

    if (o.type === 'heart') {
      lives = Math.min(5, lives + 1);
      score += 80;
      burst(o.x, o.y, '#FF5264', 10);
      beep(620, 0.08);
    }

    if (o.type === 'shield') {
      car.invincible = 4;
      score += 120;
      burst(o.x, o.y, '#59BEFF', 12);
      beep(860, 0.09);
    }

    if (o.type === 'boost') {
      score += 300;
      speed += 85;
      burst(o.x, o.y, '#30A2FF', 16);
      beep(980, 0.08);
    }

    if (!positive) {
      if (car.invincible <= 0) {
        lives--;
        burst(car.x, car.y - 40, '#FF8A38', 18);
        beep(180, 0.14);
        if (lives <= 0) endGame();
      } else {
        score += 60;
        burst(o.x, o.y, '#8EDCFF', 8);
      }
    }

    if (tokens === 10) {
      score += 1000;
      burst(car.x, car.y - 140, '#F6C849', 28);
    }
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const life = 0.35 + Math.random() * 0.45;
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 300,
        vy: -80 - Math.random() * 260,
        life,
        maxLife: life,
        alpha: 1,
        color,
        size: 5 + Math.random() * 10
      });
    }
  }

  function endGame() {
    running = false;
    overlay.classList.add('show');
    overlay.querySelector('h1').textContent = 'Маршрут завершён';
    overlay.querySelector('p').textContent =
      `Результат: ${Math.floor(score).toLocaleString('ru-RU')} очков. Жетонов XXI: ${tokens}.`;
    startBtn.textContent = 'Играть снова';
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackdrop();
    drawSidewalks();
    drawRoad();
    drawStreetDetails();
    drawObjects();
    drawParticles();
    drawCar();
  }

  function drawBackdrop() {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.42);
  sky.addColorStop(0, '#DDF4FF');
  sky.addColorStop(0.55, '#EFF9FE');
  sky.addColorStop(1, '#F7FBFE');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const haze = ctx.createLinearGradient(0, 90, 0, 250);
  haze.addColorStop(0, 'rgba(255,255,255,0)');
  haze.addColorStop(1, 'rgba(255,255,255,.55)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 80, W, 220);

  const baseY = 185;
  for (let i = -1; i < 8; i++) {
    const x = i * 150 - sceneryOffset * 0.10;
    const h = 84 + ((i + 5) % 3) * 24;
    drawFacade(x, baseY, 118, h, i % 2 === 0 ? '#E7D6B7' : '#F0E2C8');
  }

  ctx.fillStyle = '#C9AE73';
  ctx.beginPath();
  ctx.moveTo(W * 0.49, 96);
  ctx.lineTo(W * 0.5, 42);
  ctx.lineTo(W * 0.51, 96);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(W * 0.5, 108, 24, Math.PI, 0);
  ctx.fill();

  ctx.fillStyle = 'rgba(180,205,220,.35)';
  ctx.fillRect(0, 185, W, 16);
}

  function drawSidewalks() {
  ctx.fillStyle = '#EEF3F5';
  ctx.fillRect(0, 190, W, H - 190);

  const curbLeft = roadLeftAt(H);
  const curbRight = roadRightAt(H);

  ctx.fillStyle = '#DCE5E8';
  ctx.fillRect(0, 200, 118, H - 200);
  ctx.fillRect(W - 118, 200, 118, H - 200);

  drawCanalStrip(0, 230, 38, H - 230);
  drawCanalStrip(W - 38, 230, 38, H - 230);

  drawPaving(42, 210, 62, H - 230);
  drawPaving(W - 104, 210, 62, H - 230);

  ctx.strokeStyle = 'rgba(92,120,132,.18)';
  ctx.lineWidth = 3;
  for (let y = 220 - sceneryOffset; y < H + 220; y += 150) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(Math.max(75, curbLeft - 16), y);
    ctx.moveTo(Math.min(W - 75, curbRight + 16), y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(curbLeft - 10, 210);
  ctx.lineTo(curbLeft - 28, H);
  ctx.moveTo(curbRight + 10, 210);
  ctx.lineTo(curbRight + 28, H);
  ctx.stroke();
}

  
function drawFacade(x, baseY, width, height, color) {
  ctx.save();

  ctx.fillStyle = color;
  ctx.fillRect(x, baseY - height, width, height);

  ctx.fillStyle = 'rgba(0,0,0,.06)';
  ctx.fillRect(x + width - 10, baseY - height, 10, height);

  ctx.fillStyle = '#D1B27B';
  ctx.fillRect(x, baseY - height, width, 8);

  const rows = 3;
  const cols = 3;
  const winW = 11;
  const winH = 15;
  const gapX = 28;
  const gapY = 24;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = x + 18 + c * gapX;
      const wy = baseY - height + 18 + r * gapY;

      ctx.fillStyle = '#B38A4F';
      ctx.fillRect(wx - 1, wy - 1, winW + 2, winH + 2);
      ctx.fillStyle = '#F6E6B8';
      ctx.fillRect(wx, wy, winW, winH);
    }
  }

  ctx.fillStyle = '#9A7A4B';
  ctx.fillRect(x + width * 0.42, baseY - 22, 16, 22);

  ctx.restore();
}

function drawCanalStrip(x, y, w, h) {
  const water = ctx.createLinearGradient(x, y, x + w, y);
  water.addColorStop(0, '#D7EEF7');
  water.addColorStop(0.5, '#BCE2F2');
  water.addColorStop(1, '#DFF4FA');
  ctx.fillStyle = water;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 2;
  for (let yy = y + 20; yy < y + h; yy += 70) {
    ctx.beginPath();
    ctx.moveTo(x + 6, yy);
    ctx.lineTo(x + w - 6, yy);
    ctx.stroke();
  }
}

function drawPaving(x, y, w, h) {
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  for (let yy = y; yy < y + h; yy += 52) {
    for (let xx = x; xx < x + w; xx += 26) {
      ctx.fillRect(xx, yy, 24, 24);
    }
  }
}

function drawRoadTexture() {
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 140; i++) {
    const y = 210 + ((i * 63 + roadOffset * 0.8) % (H - 200));
    const left = roadLeftAt(y);
    const right = roadRightAt(y);
    const x = left + 16 + ((i * 113) % Math.max(20, right - left - 32));
    ctx.fillStyle = i % 2 ? '#FFFFFF' : '#111A22';
    ctx.fillRect(x, y, 2, 5);
  }
  ctx.globalAlpha = 1;

  const sheen = ctx.createLinearGradient(W * 0.5, 210, W * 0.5, H);
  sheen.addColorStop(0, 'rgba(255,255,255,.08)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,.02)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.moveTo(W * 0.32, 210);
  ctx.lineTo(W * 0.68, 210);
  ctx.lineTo(W * 0.58, H);
  ctx.lineTo(W * 0.42, H);
  ctx.closePath();
  ctx.fill();
}


function roadLeftAt(y) {
    const top = W * 0.17;
    const bottom = W * 0.035;
    const t = Math.max(0, Math.min(1, (y - 205) / (H - 205)));
    return top + (bottom - top) * t;
  }

  function roadRightAt(y) {
    return W - roadLeftAt(y);
  }

  function drawRoad() {
  ctx.save();

  const roadGradient = ctx.createLinearGradient(0, 210, 0, H);
  roadGradient.addColorStop(0, '#4B5662');
  roadGradient.addColorStop(0.55, '#39424C');
  roadGradient.addColorStop(1, '#2D343D');

  ctx.fillStyle = roadGradient;
  ctx.beginPath();
  ctx.moveTo(W * 0.17, 205);
  ctx.lineTo(W * 0.83, 205);
  ctx.lineTo(W * 0.965, H);
  ctx.lineTo(W * 0.035, H);
  ctx.closePath();
  ctx.fill();

  drawRoadTexture();

  ctx.strokeStyle = '#F6F8FA';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(W * 0.17, 205);
  ctx.lineTo(W * 0.035, H);
  ctx.moveTo(W * 0.83, 205);
  ctx.lineTo(W * 0.965, H);
  ctx.stroke();

  ctx.strokeStyle = '#F8F1D0';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.setLineDash([78, 92]);
  ctx.lineDashOffset = roadOffset;

  for (const x of [W * 0.40, W * 0.60]) {
    ctx.beginPath();
    ctx.moveTo(x, 210);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (running) {
    const glow = ctx.createLinearGradient(car.x, car.y + 10, car.x, H);
    glow.addColorStop(0, 'rgba(121,198,43,.22)');
    glow.addColorStop(1, 'rgba(121,198,43,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(car.x - 52, car.y + 75);
    ctx.lineTo(car.x + 52, car.y + 75);
    ctx.lineTo(car.x + 98, H);
    ctx.lineTo(car.x - 98, H);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

  function drawStreetDetails() {
  for (let i = 0; i < 8; i++) {
    const y = 250 + ((i * 210 + sceneryOffset) % (H - 170));
    const scale = 0.52 + (y / H) * 0.72;

    drawTree(58, y, scale);
    drawTree(W - 58, y + 85, scale * 0.96);

    drawLamp(108, y + 24, scale * 0.92);
    drawLamp(W - 108, y + 108, scale * 0.92);

    if (i % 2 === 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(53,78,95,.55)';
      ctx.lineWidth = 4 * scale;
      ctx.beginPath();
      ctx.moveTo(26, y + 38);
      ctx.lineTo(26, y + 86);
      ctx.moveTo(W - 26, y + 68);
      ctx.lineTo(W - 26, y + 116);
      ctx.stroke();
      ctx.restore();
    }
  }
}

  function drawTree(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#7A5B3D';
  roundRect(ctx, -7, 20, 14, 50, 6);
  ctx.fill();

  const leaf = ctx.createRadialGradient(-10, -8, 10, 0, 0, 46);
  leaf.addColorStop(0, '#B6ED7D');
  leaf.addColorStop(0.6, '#7FD255');
  leaf.addColorStop(1, '#4FA93D');
  ctx.fillStyle = leaf;

  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.arc(-24, 6, 24, 0, Math.PI * 2);
  ctx.arc(24, 8, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath();
  ctx.arc(-10, -12, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

  function drawLamp(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = '#2B3D4D';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 48);
  ctx.lineTo(0, -30);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.quadraticCurveTo(10, -40, 22, -38);
  ctx.stroke();

  ctx.fillStyle = '#2B3D4D';
  ctx.beginPath();
  ctx.arc(24, -38, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFE4A0';
  ctx.beginPath();
  ctx.arc(24, -38, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

  function drawObjects() {
    for (const o of objects) {
      ctx.save();
      const bob = ['token', 'heart', 'shield', 'boost'].includes(o.type) ? Math.sin(o.bob) * 6 : 0;
      ctx.translate(o.x, o.y + bob);

      if (o.type === 'token') drawToken();
      if (o.type === 'heart') drawHeart();
      if (o.type === 'shield') drawShield();
      if (o.type === 'boost') drawBoost();
      if (o.type === 'cone') drawCone();
      if (o.type === 'puddle') drawPuddle();

      ctx.restore();
    }
  }

  function addSoftShadow(blur = 18, color = 'rgba(8,45,70,.30)') {
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
    ctx.shadowOffsetY = 8;
  }

  function drawToken() {
    addSoftShadow();
    const g = ctx.createLinearGradient(-34, -34, 34, 34);
    g.addColorStop(0, '#A9E855');
    g.addColorStop(1, '#5EB51B');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 25px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('XXI', 0, 1);
  }

  function drawHeart() {
    addSoftShadow(20, 'rgba(255,70,90,.35)');
    ctx.fillStyle = '#FF5264';
    ctx.font = '76px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♥', 0, 0);
  }

  function drawShield() {
    addSoftShadow(20, 'rgba(47,155,234,.35)');
    ctx.fillStyle = '#2F9BEA';
    ctx.beginPath();
    ctx.moveTo(0, -43);
    ctx.lineTo(37, -24);
    ctx.lineTo(31, 20);
    ctx.quadraticCurveTo(0, 52, -31, 20);
    ctx.lineTo(-37, -24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '42px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✚', 0, 0);
  }

  function drawBoost() {
    addSoftShadow(20, 'rgba(47,155,234,.30)');
    ctx.fillStyle = '#2B8BFF';
    ctx.font = '800 78px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('»', 0, -2);
  }

  function drawCone() {
    addSoftShadow(15);
    ctx.fillStyle = '#F36D21';
    ctx.beginPath();
    ctx.moveTo(0, -45);
    ctx.lineTo(42, 40);
    ctx.lineTo(-42, 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-30, 0, 60, 13);
    ctx.fillRect(-38, 31, 76, 13);
  }

  function drawPuddle() {
    const g = ctx.createRadialGradient(-18, -8, 5, 0, 0, 62);
    g.addColorStop(0, '#9DE2FF');
    g.addColorStop(1, '#2A9BDD');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 62, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.ellipse(-18, -8, 22, 6, 0, 0, Math.PI * 2);
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

  function drawCar() {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(laneTilt);

    // contact shadow
    ctx.fillStyle = 'rgba(7,25,38,.28)';
    ctx.shadowBlur = 28;
    ctx.shadowColor = 'rgba(7,25,38,.30)';
    ctx.beginPath();
    ctx.ellipse(0, 92, 72, 125, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    if (car.invincible > 0) {
      ctx.shadowBlur = 44;
      ctx.shadowColor = '#71D4FF';
    }

    if (taxiSprite.complete && taxiSprite.naturalWidth) {
      ctx.drawImage(taxiSprite, -car.w / 2, -car.h / 2, car.w, car.h);
    } else {
      drawFallbackTaxi();
    }

    ctx.shadowColor = 'transparent';

    ctx.restore();
  }

  function drawFallbackTaxi() {
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, -56, -112, 112, 224, 30);
    ctx.fill();
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(-56, 25, 112, 25);
    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(-56, 54, 112, 16);
    ctx.fillStyle = '#21475F';
    roundRect(ctx, -39, -88, 78, 62, 15);
    ctx.fill();
    roundRect(ctx, -39, 75, 78, 25, 10);
    ctx.fill();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) {
      c.roundRect(x, y, w, h, r);
    } else {
      const rr = Math.min(r, w / 2, h / 2);
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    }
  }

  function move(dir) {
    const next = Math.max(0, Math.min(2, targetLane + dir));
    if (next !== targetLane) {
      previousLane = targetLane;
      targetLane = next;
      laneTilt = dir * -0.13;
    }
  }

  addEventListener('keydown', e => {
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) move(-1);
    if (['ArrowRight', 'd', 'D'].includes(e.key)) move(1);
  });

  let sx = 0;
  let sy = 0;

  canvas.addEventListener('pointerdown', e => {
    sx = e.clientX;
    sy = e.clientY;
  });

  canvas.addEventListener('pointerup', e => {
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) > 25 && Math.abs(dx) > Math.abs(dy)) {
      move(dx > 0 ? 1 : -1);
    }
  });

  soundBtn.addEventListener('click', () => {
    muted = !muted;
    soundBtn.textContent = muted ? '🔇' : '🔊';
  });

  startBtn.addEventListener('click', reset);

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

  draw();
})();