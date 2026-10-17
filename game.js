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

  const dpr = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W = 0;
  let H = 0;
  let laneXs = [];
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
  let pulse = 0;
  let objects = [];
  let particles = [];

  const taxi = new Image();
  taxi.src = 'assets/taxi-top-render.webp';

  const car = { x:0, y:0, w:0, h:0, invincible:0 };

  function resize() {
    const rect = stage.getBoundingClientRect();
    const scale = dpr();
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    W = rect.width;
    H = rect.height;

    laneXs = [W * 0.39, W * 0.50, W * 0.61];
    car.w = W * 0.21;
    car.h = car.w * 2.08;
    car.y = H * 0.79;
    if (!running) car.x = laneXs[1];
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
    pulse = 0;
    objects = [];
    particles = [];
    car.invincible = 0;
    car.x = laneXs[1];
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
    const r = Math.random();
    let type = 'token';
    if (r < 0.48) type = 'token';
    else if (r < 0.59) type = 'heart';
    else if (r < 0.68) type = 'shield';
    else if (r < 0.77) type = 'boost';
    else if (r < 0.90) type = 'cone';
    else type = 'puddle';

    const lane = Math.floor(Math.random() * 3);
    objects.push({
      type,
      lane,
      x: laneXs[lane],
      y: -60,
      size: W * (type === 'cone' ? 0.09 : type === 'puddle' ? 0.11 : 0.085),
      bob: Math.random() * Math.PI * 2,
      hit: false
    });
  }

  function burst(x, y, color, count=12) {
    for (let i=0;i<count;i++) {
      const life = 0.4 + Math.random() * 0.45;
      particles.push({
        x,y,
        vx:(Math.random()-0.5)*240,
        vy:-40-Math.random()*220,
        life,maxLife:life,alpha:1,color,
        size:3+Math.random()*7
      });
    }
  }

  function collect(o) {
    switch(o.type) {
      case 'token':
        tokens += 1; score += 160; burst(o.x,o.y,'#8ED83C',16); beep(760,.06); break;
      case 'heart':
        lives = Math.min(5,lives+1); score += 90; burst(o.x,o.y,'#FF5972',12); beep(620,.08); break;
      case 'shield':
        car.invincible = 5; score += 120; burst(o.x,o.y,'#69D7FF',16); beep(900,.08); break;
      case 'boost':
        speed += 70; score += 240; burst(o.x,o.y,'#5AAEFF',16); beep(980,.08); break;
      case 'cone':
      case 'puddle':
        if (car.invincible <= 0) {
          lives -= 1;
          burst(car.x,car.y-14,'#FFA74D',18);
          beep(180,.15);
          if (lives <= 0) endGame();
        } else {
          score += 40;
          burst(o.x,o.y,'#ACEEFF',10);
        }
        break;
    }
    if (tokens === 10) {
      score += 1000;
      burst(car.x,car.y-90,'#F6D15C',30);
    }
  }

  function update(dt) {
    pulse += dt;
    score += dt * 12;
    speed = Math.min(830, 560 + score * 0.11);
    spawnTimer -= dt;

    if (spawnTimer <= 0) {
      spawn();
      spawnTimer = Math.max(0.42, 0.98 - score / 6200);
    }

    const desiredX = laneXs[targetLane];
    car.x += (desiredX - car.x) * Math.min(1, dt * 11);
    const desiredTilt = Math.max(-0.055, Math.min(0.055, (desiredX - car.x) / 450));
    tilt += (desiredTilt - tilt) * Math.min(1, dt * 10);
    car.invincible = Math.max(0, car.invincible - dt);

    for (const o of objects) {
      o.bob += dt * 4;
      o.y += speed * dt;
      const hit = Math.abs(o.x-car.x) < W*0.07 && Math.abs(o.y-car.y) < car.h*0.36;
      if (hit && !o.hit) {
        o.hit = true;
        collect(o);
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

  function drawGlowTrail() {
    const glow = ctx.createLinearGradient(car.x, car.y-40, car.x, H);
    glow.addColorStop(0,'rgba(121,198,43,.02)');
    glow.addColorStop(.55,'rgba(121,198,43,.11)');
    glow.addColorStop(1,'rgba(121,198,43,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(car.x-car.w*.18,car.y+car.h*.16);
    ctx.lineTo(car.x+car.w*.18,car.y+car.h*.16);
    ctx.lineTo(car.x+car.w*.42,H);
    ctx.lineTo(car.x-car.w*.42,H);
    ctx.closePath();
    ctx.fill();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha=p.alpha;
      ctx.fillStyle=p.color;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.size,0,Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawToken(o) {
    const y=o.y+Math.sin(o.bob)*3;
    const r=o.size*.45;
    const g=ctx.createRadialGradient(o.x-r*.3,y-r*.3,r*.1,o.x,y,r);
    g.addColorStop(0,'#B5EC63');
    g.addColorStop(1,'#72C52A');
    ctx.save();
    ctx.shadowBlur=22; ctx.shadowColor='rgba(131,205,52,.45)';
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(o.x,y,r,0,Math.PI*2); ctx.fill();
    ctx.shadowColor='transparent';
    ctx.lineWidth=4; ctx.strokeStyle='rgba(255,255,255,.95)'; ctx.stroke();
    ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=`700 ${Math.max(13,r*.7)}px Arial`;
    ctx.fillText('XXI',o.x,y+1);
    ctx.restore();
  }

  function drawHeart(o) {
    ctx.save();
    ctx.fillStyle='#FF5874';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=`700 ${Math.max(26,o.size*.9)}px Arial`;
    ctx.shadowBlur=18; ctx.shadowColor='rgba(255,88,116,.35)';
    ctx.fillText('♥',o.x,o.y+Math.sin(o.bob)*3);
    ctx.restore();
  }

  function drawShield(o) {
    ctx.save();
    ctx.translate(o.x,o.y+Math.sin(o.bob)*3);
    ctx.shadowBlur=18; ctx.shadowColor='rgba(87,191,255,.35)';
    ctx.fillStyle='#43AAFF';
    ctx.beginPath();
    ctx.moveTo(0,-o.size*.5);
    ctx.lineTo(o.size*.34,-o.size*.18);
    ctx.lineTo(o.size*.28,o.size*.24);
    ctx.quadraticCurveTo(0,o.size*.58,-o.size*.28,o.size*.24);
    ctx.lineTo(-o.size*.34,-o.size*.18);
    ctx.closePath(); ctx.fill();
    ctx.shadowColor='transparent';
    ctx.fillStyle='#fff'; ctx.font=`700 ${Math.max(18,o.size*.5)}px Arial`;
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('✚',0,1);
    ctx.restore();
  }

  function drawBoost(o) {
    ctx.save();
    ctx.translate(o.x,o.y+Math.sin(o.bob)*3);
    ctx.shadowBlur=16; ctx.shadowColor='rgba(90,174,255,.35)';
    ctx.fillStyle='#378FFF'; ctx.font=`700 ${Math.max(28,o.size*.86)}px Arial`;
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('»',0,0);
    ctx.restore();
  }

  function drawCone(o) {
    ctx.save();
    ctx.translate(o.x,o.y);
    ctx.shadowBlur=12; ctx.shadowColor='rgba(243,109,33,.30)';
    ctx.fillStyle='#F36D21';
    ctx.beginPath(); ctx.moveTo(0,-o.size*.5); ctx.lineTo(o.size*.42,o.size*.44); ctx.lineTo(-o.size*.42,o.size*.44); ctx.closePath(); ctx.fill();
    ctx.shadowColor='transparent'; ctx.fillStyle='#fff';
    ctx.fillRect(-o.size*.3,-o.size*.05,o.size*.6,o.size*.11);
    ctx.fillRect(-o.size*.38,o.size*.25,o.size*.76,o.size*.11);
    ctx.restore();
  }

  function drawPuddle(o) {
    ctx.save();
    const g=ctx.createRadialGradient(o.x-o.size*.15,o.y-o.size*.12,o.size*.1,o.x,o.y,o.size*.6);
    g.addColorStop(0,'#A8E3FF'); g.addColorStop(1,'#2E9DDD');
    ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(o.x,o.y,o.size*.58,o.size*.28,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(o.x-o.size*.18,o.y-o.size*.07,o.size*.18,o.size*.06,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawObjects() {
    for (const o of objects) {
      if (o.type==='token') drawToken(o);
      else if (o.type==='heart') drawHeart(o);
      else if (o.type==='shield') drawShield(o);
      else if (o.type==='boost') drawBoost(o);
      else if (o.type==='cone') drawCone(o);
      else if (o.type==='puddle') drawPuddle(o);
    }
  }

  function drawCar() {
    const bob=Math.sin(pulse*3.5)*2;
    ctx.save();
    ctx.translate(car.x,car.y+bob);
    ctx.rotate(tilt);

    ctx.fillStyle='rgba(7,22,34,.26)';
    ctx.beginPath();
    ctx.ellipse(0,car.h*.33,car.w*.42,car.h*.2,0,0,Math.PI*2);
    ctx.fill();

    if (car.invincible > 0) {
      ctx.shadowBlur=36;
      ctx.shadowColor='rgba(98,216,255,.9)';
    }

    if (taxi.complete && taxi.naturalWidth) {
      ctx.drawImage(taxi,-car.w/2,-car.h/2,car.w,car.h);
    } else {
      ctx.fillStyle='#fff';
      ctx.fillRect(-car.w/2,-car.h/2,car.w,car.h);
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0,0,W,H);
    drawGlowTrail();
    drawObjects();
    drawParticles();
    drawCar();
  }

  function loop(now) {
    if (!running) return;
    const dt=Math.min((now-last)/1000,.033);
    last=now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function endGame() {
    running=false;
    overlay.classList.add('show');
    overlay.querySelector('h1').textContent='Маршрут завершён';
    overlay.querySelector('p').textContent=`Результат: ${Math.floor(score).toLocaleString('ru-RU')} очков. Жетонов XXI: ${tokens}.`;
    startBtn.textContent='Играть снова';
  }

  function move(dir) {
    targetLane=Math.max(0,Math.min(2,targetLane+dir));
  }

  let startX=0,startY=0;
  stage.addEventListener('pointerdown',e=>{startX=e.clientX;startY=e.clientY;});
  stage.addEventListener('pointerup',e=>{
    const dx=e.clientX-startX,dy=e.clientY-startY;
    if (Math.abs(dx)>28 && Math.abs(dx)>Math.abs(dy)) move(dx>0?1:-1);
  });
  window.addEventListener('keydown',e=>{
    if (['ArrowLeft','a','A'].includes(e.key)) move(-1);
    if (['ArrowRight','d','D'].includes(e.key)) move(1);
  });
  startBtn.addEventListener('click',reset);
  soundBtn.addEventListener('click',()=>{muted=!muted;soundBtn.textContent=muted?'🔇':'🔊';});
  window.addEventListener('resize',resize);

  function beep(freq,dur) {
    if (muted) return;
    try {
      const ac=new (window.AudioContext||window.webkitAudioContext)();
      const o=ac.createOscillator();
      const g=ac.createGain();
      o.frequency.value=freq; o.type='sine'; g.gain.value=.025;
      o.connect(g); g.connect(ac.destination); o.start();
      g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+dur);
      o.stop(ac.currentTime+dur+.02);
    } catch {}
  }

  resize();
  updateHud();
  draw();
})();