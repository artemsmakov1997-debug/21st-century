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

  const W = canvas.width, H = canvas.height;
  const laneXs = [W*0.29, W*0.5, W*0.71];
  const COLORS = { blue:'#0A71B9', dark:'#0A3F72', green:'#79C62B', white:'#fff' };

  let running=false, last=0, roadOffset=0, spawnTimer=0, score=0, lives=3, tokens=0, speed=500, muted=false;
  let objects=[];
  let targetLane=1;

  const logo = new Image();
  logo.src = 'assets/logo.png';

  const car = { x: laneXs[1], y:H*0.78, w:150, h:260, invincible:0 };

  function reset(){
    running=true; last=performance.now(); roadOffset=0; spawnTimer=0; score=0; lives=3; tokens=0; speed=500; objects=[]; targetLane=1;
    car.x=laneXs[1]; car.invincible=0; updateHud(); overlay.classList.remove('show');
    requestAnimationFrame(loop);
  }

  function updateHud(){
    scoreEl.textContent=Math.floor(score).toLocaleString('ru-RU');
    livesEl.textContent='❤'.repeat(Math.max(0,lives));
    tokensEl.textContent=tokens;
    missionEl.textContent=`${Math.min(tokens,10)}/10`;
  }

  function spawn(){
    const lane=Math.floor(Math.random()*3);
    const roll=Math.random();
    let type;
    if(roll<0.44) type='token';
    else if(roll<0.57) type='heart';
    else if(roll<0.66) type='shield';
    else if(roll<0.78) type='boost';
    else if(roll<0.9) type='cone';
    else type='puddle';
    const size = ['cone','puddle'].includes(type) ? 90 : 72;
    objects.push({type,lane,x:laneXs[lane],y:-120,size,hit:false});
  }

  function loop(t){
    if(!running) return;
    const dt=Math.min((t-last)/1000,0.033); last=t;
    update(dt); draw();
    requestAnimationFrame(loop);
  }

  function update(dt){
    score += dt*12;
    roadOffset=(roadOffset+speed*dt)%160;
    car.x += (laneXs[targetLane]-car.x)*Math.min(1,dt*11);
    car.invincible=Math.max(0,car.invincible-dt);
    spawnTimer -= dt;
    if(spawnTimer<=0){spawn();spawnTimer=Math.max(.42,1.05-score/6000)}

    for(const o of objects){
      o.y += speed*dt;
      const hit = Math.abs(o.x-car.x)<82 && Math.abs(o.y-car.y)<135;
      if(hit && !o.hit){o.hit=true; collect(o)}
    }
    objects=objects.filter(o=>!o.hit && o.y<H+160);
    speed=Math.min(850,500+score*.12);
    updateHud();
  }

  function collect(o){
    if(o.type==='token'){tokens++;score+=180;beep(740,.06)}
    if(o.type==='heart'){lives=Math.min(5,lives+1);score+=80;beep(620,.08)}
    if(o.type==='shield'){car.invincible=4;score+=120;beep(860,.09)}
    if(o.type==='boost'){score+=300;speed+=90;beep(980,.08)}
    if(o.type==='cone'||o.type==='puddle'){
      if(car.invincible<=0){lives--;beep(180,.14);if(lives<=0) endGame()}
      else score+=60;
    }
    if(tokens===10) score+=1000;
  }

  function endGame(){
    running=false;
    overlay.classList.add('show');
    overlay.querySelector('h1').textContent='Маршрут завершён';
    overlay.querySelector('p').textContent=`Результат: ${Math.floor(score).toLocaleString('ru-RU')} очков. Жетонов XXI: ${tokens}.`;
    startBtn.textContent='Играть снова';
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    drawCity(); drawRoad(); drawObjects(); drawCar();
  }

  function drawCity(){
    const g=ctx.createLinearGradient(0,0,0,H*.45);g.addColorStop(0,'#BFEAFF');g.addColorStop(1,'#F8FBFD');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#E6D7B8';
    for(let i=0;i<7;i++){const x=i*150-50;const h=95+(i%3)*35;ctx.fillRect(x,150-h,120,h);ctx.fillStyle='#C8A769';for(let r=0;r<3;r++)for(let c=0;c<3;c++)ctx.fillRect(x+18+c*30,80-h+r*28,12,18);ctx.fillStyle='#E6D7B8'}
    ctx.fillStyle='#7FC96A';
    for(let i=0;i<9;i++){ctx.beginPath();ctx.arc(40+i*110,210+(i%2)*10,45,0,Math.PI*2);ctx.fill()}
  }

  function drawRoad(){
    ctx.fillStyle='#3D4650';ctx.beginPath();ctx.moveTo(W*.16,220);ctx.lineTo(W*.84,220);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();
    ctx.fillStyle='#222A31';ctx.fillRect(0,H*.88,W,H*.12);
    ctx.strokeStyle='#F8F2D8';ctx.lineWidth=11;ctx.setLineDash([70,90]);ctx.lineDashOffset=roadOffset;
    for(const x of [W*.395,W*.605]){ctx.beginPath();ctx.moveTo(x,220);ctx.lineTo(x,H);ctx.stroke()}ctx.setLineDash([]);
    ctx.strokeStyle='#FFFFFF';ctx.lineWidth=8;for(const x of [W*.16,W*.84]){ctx.beginPath();ctx.moveTo(x,220);ctx.lineTo(x===W*.16?0:W,H);ctx.stroke()}
  }

  function drawObjects(){
    for(const o of objects){ctx.save();ctx.translate(o.x,o.y);const s=o.size;
      if(o.type==='token'){ctx.fillStyle=COLORS.green;ctx.beginPath();ctx.arc(0,0,s*.46,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=6;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 28px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('XXI',0,1)}
      if(o.type==='heart'){ctx.fillStyle='#FF4D5A';ctx.font='70px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('♥',0,0)}
      if(o.type==='shield'){ctx.fillStyle='#2F9BEA';roundRect(ctx,-36,-44,72,88,18);ctx.fill();ctx.fillStyle='#fff';ctx.font='46px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✚',0,0)}
      if(o.type==='boost'){ctx.fillStyle='#2B8BFF';ctx.font='72px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('»',0,0)}
      if(o.type==='cone'){ctx.fillStyle='#F36D21';ctx.beginPath();ctx.moveTo(0,-45);ctx.lineTo(42,40);ctx.lineTo(-42,40);ctx.closePath();ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(-30,2,60,14)}
      if(o.type==='puddle'){ctx.fillStyle='#4EB8F7';ctx.beginPath();ctx.ellipse(0,0,60,28,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.ellipse(-15,-8,20,6,0,0,Math.PI*2);ctx.fill()}
    ctx.restore()}
  }

  function drawCar(){
    ctx.save();ctx.translate(car.x,car.y);if(car.invincible>0){ctx.shadowBlur=38;ctx.shadowColor='#7AD8FF'}
    ctx.fillStyle='#111827';roundRect(ctx,-72,-128,144,256,38);ctx.fill();
    ctx.fillStyle='#fff';roundRect(ctx,-62,-118,124,236,34);ctx.fill();
    ctx.fillStyle=COLORS.green;ctx.fillRect(-62,30,124,28);ctx.fillStyle='#2C8DDA';ctx.fillRect(-62,61,124,18);
    ctx.fillStyle='#CFEAF7';roundRect(ctx,-44,-92,88,72,18);ctx.fill();
    ctx.fillStyle='#CFEAF7';roundRect(ctx,-44,72,88,30,12);ctx.fill();
    ctx.fillStyle=COLORS.blue;ctx.font='bold 24px Arial';ctx.textAlign='center';ctx.fillText('XXI ВЕК',0,15);
    if(logo.complete){ctx.drawImage(logo,-29,-8,58,58)}
    ctx.restore();
  }

  function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r)}

  function move(dir){targetLane=Math.max(0,Math.min(2,targetLane+dir))}
  addEventListener('keydown',e=>{if(['ArrowLeft','a','A'].includes(e.key))move(-1);if(['ArrowRight','d','D'].includes(e.key))move(1)})
  let sx=0,sy=0;
  canvas.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY});
  canvas.addEventListener('pointerup',e=>{const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)>25&&Math.abs(dx)>Math.abs(dy))move(dx>0?1:-1)});

  soundBtn.addEventListener('click',()=>{muted=!muted;soundBtn.textContent=muted?'🔇':'🔊'});
  startBtn.addEventListener('click',reset);

  function beep(freq,dur){if(muted)return;try{const ac=new (window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator();const g=ac.createGain();o.frequency.value=freq;o.type='sine';g.gain.value=.03;o.connect(g);g.connect(ac.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+dur);o.stop(ac.currentTime+dur+.02)}catch{}}
  draw();
})();