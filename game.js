// --- Game Settings & Constants ---
const LOGICAL_WIDTH = 600;
const LOGICAL_HEIGHT = 800;

// Levels layouts
const LEVELS = [
  // Level 1: Standard Retro Layout
  [
    "  AAAAAA  ",
    " CCCCCCCC ",
    "PPPPPPPPPP",
    "GGGGGGGGGG",
    " Y  YY  Y "
  ],
  // Level 2: Alternating Waves
  [
    "A A A A A ",
    " CCCCCCCC ",
    " P A A P ",
    " GGGGGGGG ",
    " Y Y Y Y "
  ],
  // Level 3: Space Fortress (Hard)
  [
    "  A AA A  ",
    " ACCCCCCA ",
    "APYYYYYYPA",
    " AAGGGGAA ",
    "   AYYA   "
  ],
  // Level 4: Cyber Neon X (Final Stage!)
  [
    "A        A",
    " ACCCCCCA ",
    "  APYYPA  ",
    "   AGGA   ",
    "  APYYPA  ",
    " ACCCCCCA ",
    "A        A"
  ]
];

// --- Audio Synthesizer ---
class SoundSynth {
  constructor() {
    this.audioCtx = null;
    this.muted = false;
  }

  init() {
    if (this.audioCtx) return;
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  playTone(freqStart, freqEnd, duration, type = 'sine', gainStart = 0.1) {
    if (this.muted) return;
    this.init(); // Initialize context if not done yet
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    try {
      const osc = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, this.audioCtx.currentTime);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(freqEnd, this.audioCtx.currentTime + duration);
      }

      gainNode.gain.setValueAtTime(gainStart, this.audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);

      osc.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  playPaddleHit() {
    this.playTone(150, 300, 0.12, 'triangle', 0.2);
  }

  playWallHit() {
    this.playTone(200, 200, 0.05, 'sine', 0.08);
  }

  playBrickBreak(isGold = false) {
    if (isGold) {
      this.playTone(350, 700, 0.25, 'sawtooth', 0.1);
      setTimeout(() => this.playTone(500, 1000, 0.25, 'sawtooth', 0.08), 60);
    } else {
      this.playTone(250, 80, 0.2, 'triangle', 0.18);
    }
  }

  playPowerup() {
    this.playTone(261.63, 523.25, 0.1, 'sine', 0.12);
    setTimeout(() => this.playTone(329.63, 659.25, 0.1, 'sine', 0.12), 60);
    setTimeout(() => this.playTone(392.00, 783.99, 0.1, 'sine', 0.12), 120);
    setTimeout(() => this.playTone(523.25, 1046.50, 0.25, 'sine', 0.15), 180);
  }

  playLaser() {
    this.playTone(600, 120, 0.1, 'sawtooth', 0.05);
  }

  playLoseLife() {
    this.playTone(350, 80, 0.45, 'sawtooth', 0.2);
  }

  playLevelUp() {
    const notes = [261.6, 329.6, 392.0, 523.3, 659.3, 784.0, 1046.5];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, freq * 1.1, 0.2, 'sine', 0.12);
      }, idx * 75);
    });
  }

  playGameOver() {
    this.playTone(180, 60, 0.6, 'sawtooth', 0.25);
    setTimeout(() => this.playTone(140, 50, 0.6, 'sawtooth', 0.25), 250);
    setTimeout(() => this.playTone(100, 30, 0.8, 'sawtooth', 0.25), 500);
  }

  playGameWin() {
    const chord = [261.6, 329.6, 392.0, 523.3];
    chord.forEach(freq => {
      this.playTone(freq, freq * 1.5, 1.5, 'sine', 0.08);
      this.playTone(freq * 2, freq * 3, 1.5, 'triangle', 0.05);
    });
  }

  playSpeedUpWarning() {
    this.playTone(440, 880, 0.2, 'sawtooth', 0.1);
    setTimeout(() => this.playTone(554.37, 1108.73, 0.25, 'sawtooth', 0.1), 100);
  }
}

const synth = new SoundSynth();

// --- Game Engine Class ---
class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    // Game state
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('neon_high_score')) || 0;
    this.level = 1;
    this.lives = 3;
    this.state = 'START'; // START, RUNNING, PAUSED, LEVEL_UP, GAME_OVER, WIN
    
    // Entities
    this.paddle = {
      x: 250,
      y: 730,
      width: 100,
      targetWidth: 100,
      height: 14,
      speed: 8,
      laserActive: 0, // frame duration for laser powerup
      lastShotTime: 0
    };
    
    this.balls = [];
    this.bricks = [];
    this.powerups = [];
    this.lasers = [];
    this.particles = [];
    
    // Inputs state
    this.keys = {};
    this.pointerX = null;
    this.isLaunching = false;
    
    // Timing / Game Loop
    this.lastTime = 0;
    this.animationId = null;
    this.slowMoActive = 0; // frame duration for slow motion
    
    // Speed Escalation State
    this.levelTime = 0;
    this.speedUpWarningPlayed = false;
    this.warningTimer = 0;
    this.lastSpeedMultiplierString = '';
    
    this.initUI();
    this.initEvents();
    this.resize();
  }

  initUI() {
    // Populate Initial High Score
    document.getElementById('high-val').innerText = String(this.highScore).padStart(6, '0');
    this.updateLivesUI();
  }

  updateLivesUI() {
    const container = document.getElementById('lives-container');
    container.innerHTML = '';
    for (let i = 0; i < this.lives; i++) {
      const heart = document.createElement('span');
      heart.className = 'life-indicator';
      container.appendChild(heart);
    }
  }

  initEvents() {
    // Resize Event
    window.addEventListener('resize', () => this.resize());

    // Keyboard Events
    window.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
      
      // Prevent scrolling
      if (['ArrowLeft', 'ArrowRight', ' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
      }

      // Space key for Launching Ball / Shooting Laser
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (this.state === 'RUNNING') {
          this.handleActionKey();
        }
      }

      // Pause Game shortcut
      if (e.key === 'p' || e.key === 'P') {
        this.togglePause();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
    });

    // Pointer (Mouse / Touch) Events
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = LOGICAL_WIDTH / rect.width;
      this.pointerX = (e.clientX - rect.left) * scaleX;
    });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = LOGICAL_WIDTH / rect.width;
        this.pointerX = (e.touches[0].clientX - rect.left) * scaleX;
      }
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchstart', (e) => {
      if (this.state === 'RUNNING') {
        this.handleActionKey();
      }
      e.preventDefault();
    }, { passive: false });

    // Overlay Buttons Action
    document.getElementById('start-btn').addEventListener('click', () => {
      synth.init();
      this.startGame();
    });
    
    document.getElementById('resume-btn').addEventListener('click', () => this.togglePause());
    document.getElementById('restart-btn').addEventListener('click', () => this.restartGame());
    document.getElementById('win-restart-btn').addEventListener('click', () => this.restartGame());
    
    // Mute Button Handler
    const muteBtn = document.getElementById('mute-btn');
    const soundOn = document.getElementById('sound-on-icon');
    const soundOff = document.getElementById('sound-off-icon');

    muteBtn.addEventListener('click', () => {
      synth.muted = !synth.muted;
      if (synth.muted) {
        soundOn.classList.add('hidden');
        soundOff.classList.remove('hidden');
      } else {
        soundOn.classList.remove('hidden');
        soundOff.classList.add('hidden');
        synth.init();
      }
    });
  }

  resize() {
    const dpr = 1;
    const wrapper = this.canvas.parentElement;
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';

    this.ctx.resetTransform();
    this.ctx.scale(this.canvas.width / LOGICAL_WIDTH, this.canvas.height / LOGICAL_HEIGHT);
  }

  // --- Game Loop States Transitions ---
  startGame() {
    this.state = 'RUNNING';
    this.score = 0;
    this.level = 1;
    this.lives = 3;
    this.slowMoActive = 0;
    
    this.updateHUD();
    this.updateLivesUI();
    this.loadLevel(this.level);
    this.showScreen('');
    
    this.lastTime = performance.now();
    if (!this.animationId) {
      this.animationId = requestAnimationFrame((time) => this.loop(time));
    }
  }

  restartGame() {
    this.startGame();
  }

  loadLevel(levelIndex) {
    this.balls = [];
    this.powerups = [];
    this.lasers = [];
    this.particles = [];
    this.slowMoActive = 0;
    this.paddle.laserActive = 0;
    this.paddle.width = 100;
    this.paddle.targetWidth = 100;
    this.paddle.x = (LOGICAL_WIDTH - this.paddle.width) / 2;

    // Reset Speed Escalation
    this.levelTime = 0;
    this.speedUpWarningPlayed = false;
    this.warningTimer = 0;
    this.lastSpeedMultiplierString = '';

    // Reset standard ball attached to paddle
    this.balls.push({
      x: LOGICAL_WIDTH / 2,
      y: this.paddle.y - 10,
      dx: 0,
      dy: 0,
      radius: 8,
      speed: 6,
      attached: true,
      history: []
    });

    // Parse level template
    const layout = LEVELS[Math.min(levelIndex - 1, LEVELS.length - 1)];
    this.bricks = [];
    
    const rows = layout.length;
    const cols = layout[0].length;
    
    const brickHeight = 24;
    const topMargin = 80;
    const sideMargin = 15;
    
    const brickWidth = (LOGICAL_WIDTH - (sideMargin * 2)) / cols;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const char = layout[r][c];
        if (char === ' ') continue;

        let hits = 1;
        let color = '#00f0ff';
        let isGold = false;

        switch(char) {
          case 'A': // Armored (2 hits, neon pink/red)
            hits = 2;
            color = '#ff007f';
            break;
          case 'C': // Cyan (1 hit)
            color = '#00f0ff';
            break;
          case 'P': // Purple (1 hit)
            color = '#bf5af2';
            break;
          case 'G': // Green (1 hit)
            color = '#39ff14';
            break;
          case 'Y': // Gold powerup brick (1 hit)
            color = '#ffeb3b';
            isGold = true;
            break;
        }

        this.bricks.push({
          x: sideMargin + (c * brickWidth),
          y: topMargin + (r * brickHeight),
          width: brickWidth,
          height: brickHeight,
          hitsLeft: hits,
          maxHits: hits,
          color: color,
          isGold: isGold
        });
      }
    }
  }

  showScreen(screenId) {
    // Hide all overlay screens
    document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
    
    // Show requested overlay
    if (screenId) {
      document.getElementById(screenId).classList.add('active');
    }
  }

  togglePause() {
    if (this.state === 'RUNNING') {
      this.state = 'PAUSED';
      this.showScreen('pause-screen');
    } else if (this.state === 'PAUSED') {
      this.state = 'RUNNING';
      this.showScreen('');
      this.lastTime = performance.now();
    }
  }

  handleActionKey() {
    // Launch attached ball
    this.balls.forEach(ball => {
      if (ball.attached) {
        ball.attached = false;
        ball.dx = (Math.random() * 4) - 2; // Random slight angle launch
        ball.dy = -ball.speed;
        synth.playPaddleHit();
      }
    });

    // Shoot lasers if active
    if (this.paddle.laserActive > 0) {
      const now = performance.now();
      if (now - this.paddle.lastShotTime > 250) { // Laser fire delay
        this.lasers.push({
          x: this.paddle.x + 8,
          y: this.paddle.y,
          dy: -8,
          width: 4,
          height: 12
        });
        this.lasers.push({
          x: this.paddle.x + this.paddle.width - 12,
          y: this.paddle.y,
          dy: -8,
          width: 4,
          height: 12
        });
        this.paddle.lastShotTime = now;
        synth.playLaser();
      }
    }
  }

  loseLife() {
    this.lives--;
    this.updateLivesUI();
    synth.playLoseLife();
    
    // Spawn floating sparks
    this.spawnSparks(this.paddle.x + this.paddle.width / 2, this.paddle.y, '#ff007f', 30);

    if (this.lives <= 0) {
      this.gameOver();
    } else {
      // Re-attach a fresh ball to paddle
      this.balls = [{
        x: this.paddle.x + (this.paddle.width / 2),
        y: this.paddle.y - 10,
        dx: 0,
        dy: 0,
        radius: 8,
        speed: 6,
        attached: true,
        history: []
      }];
      this.paddle.laserActive = 0;
      this.paddle.width = 100;
      this.paddle.targetWidth = 100;
      this.slowMoActive = 0;
      
      // Reset Speed Escalation on losing life
      this.levelTime = 0;
      this.speedUpWarningPlayed = false;
      this.warningTimer = 0;
      this.lastSpeedMultiplierString = '';
    }
  }

  gameOver() {
    this.state = 'GAME_OVER';
    document.getElementById('final-score').innerText = this.score;
    this.showScreen('game-over-screen');
    synth.playGameOver();
    
    // Save High Score
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('neon_high_score', this.highScore);
      document.getElementById('high-val').innerText = String(this.highScore).padStart(6, '0');
    }
  }

  levelUp() {
    synth.playLevelUp();
    this.level++;
    if (this.level > LEVELS.length) {
      this.winGame();
    } else {
      this.state = 'RUNNING';
      document.getElementById('level-val').innerText = this.level;
      this.loadLevel(this.level);
    }
  }

  winGame() {
    this.state = 'WIN';
    document.getElementById('win-score').innerText = this.score;
    this.showScreen('win-screen');
    synth.playGameWin();

    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('neon_high_score', this.highScore);
      document.getElementById('high-val').innerText = String(this.highScore).padStart(6, '0');
    }
  }

  updateHUD() {
    document.getElementById('score-val').innerText = String(this.score).padStart(6, '0');
    document.getElementById('level-val').innerText = this.level;
    this.updateSpeedHUD();
  }

  updateSpeedHUD() {
    const currentLevelBaseSpeed = 6;
    let timeFactor = 0;
    const speedUpStart = 15000;
    if (this.levelTime > speedUpStart) {
      timeFactor = (this.levelTime - speedUpStart) / 1000;
    }
    const targetSpeed = Math.min(18, currentLevelBaseSpeed + timeFactor * 0.15);
    const speedMultiplier = (targetSpeed / 6.0).toFixed(1) + 'x';
    
    if (speedMultiplier !== this.lastSpeedMultiplierString) {
      this.lastSpeedMultiplierString = speedMultiplier;
      const speedEl = document.getElementById('speed-val');
      if (speedEl) {
        speedEl.innerText = speedMultiplier;
        if (targetSpeed > 6.0) {
          speedEl.className = 'hud-value neon-pink';
        } else {
          speedEl.className = 'hud-value neon-green';
        }
      }
    }
  }

  // --- Mechanics updates ---
  update(dt) {
    if (this.state !== 'RUNNING') return;

    // 1. Slow Mo & Laser Timers
    if (this.slowMoActive > 0) this.slowMoActive--;
    if (this.paddle.laserActive > 0) this.paddle.laserActive--;

    // Update speed escalation timer and warning
    const hasActiveBall = this.balls.some(b => !b.attached);
    if (hasActiveBall) {
      this.levelTime += dt;
    }

    const currentLevelBaseSpeed = 6;
    let timeFactor = 0;
    const speedUpStart = 15000; // 15 seconds
    if (this.levelTime > speedUpStart) {
      timeFactor = (this.levelTime - speedUpStart) / 1000;
      
      if (!this.speedUpWarningPlayed) {
        this.speedUpWarningPlayed = true;
        synth.playSpeedUpWarning();
        this.warningTimer = 120; // 2 seconds (120 frames at 60fps)
      }
    }

    const targetSpeed = Math.min(18, currentLevelBaseSpeed + timeFactor * 0.15);
    this.balls.forEach(ball => {
      if (!ball.attached) {
        ball.speed = targetSpeed;
      }
    });

    if (this.warningTimer > 0) {
      this.warningTimer--;
    }

    this.updateSpeedHUD();

    // 2. Paddle movement (Keyboard priority, with mouse/touch support)
    let keyboardMoved = false;
    if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) {
      this.paddle.x -= this.paddle.speed;
      keyboardMoved = true;
      this.pointerX = null; // キーボード入力が検知されたらマウス座標をクリアして干渉を防ぐ
    }
    if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) {
      this.paddle.x += this.paddle.speed;
      keyboardMoved = true;
      this.pointerX = null;
    }

    if (!keyboardMoved && this.pointerX !== null) {
      // マウス/タッチ座標へのスムーズな吸着移動
      const targetX = this.pointerX - (this.paddle.width / 2);
      this.paddle.x += (targetX - this.paddle.x) * 0.2;
    }
    
    // Bounds check paddle
    if (this.paddle.x < 0) this.paddle.x = 0;
    if (this.paddle.x + this.paddle.width > LOGICAL_WIDTH) this.paddle.x = LOGICAL_WIDTH - this.paddle.width;

    // Handle width animation (expanding paddle smoothly)
    if (Math.abs(this.paddle.width - this.paddle.targetWidth) > 0.5) {
      this.paddle.width += (this.paddle.targetWidth - this.paddle.width) * 0.1;
    }

    // 3. Balls update
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];

      if (ball.attached) {
        ball.x = this.paddle.x + (this.paddle.width / 2);
        ball.y = this.paddle.y - ball.radius;
        ball.history = [];
        continue;
      }

      // Physics rate scaling (Speed reduction during slow motion powerup)
      const currentSpeed = this.slowMoActive > 0 ? ball.speed * 0.6 : ball.speed;
      const speedScale = currentSpeed / Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
      if (isFinite(speedScale)) {
        ball.dx *= speedScale;
        ball.dy *= speedScale;
      }

      // History tracking for trail
      ball.history.push({ x: ball.x, y: ball.y });
      if (ball.history.length > 8) {
        ball.history.shift();
      }

      // Move ball
      ball.x += ball.dx;
      ball.y += ball.dy;

      // Wall bounce: Left / Right
      if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.dx = -ball.dx;
        synth.playWallHit();
      } else if (ball.x + ball.radius >= LOGICAL_WIDTH) {
        ball.x = LOGICAL_WIDTH - ball.radius;
        ball.dx = -ball.dx;
        synth.playWallHit();
      }

      // Wall bounce: Top
      if (ball.y - ball.radius <= 0) {
        ball.y = ball.radius;
        ball.dy = -ball.dy;
        synth.playWallHit();
      }

      // Out of bounds: Bottom (Loss of ball)
      if (ball.y - ball.radius > LOGICAL_HEIGHT) {
        this.balls.splice(i, 1);
        continue;
      }

      // Paddle collision
      if (this.checkBallPaddleCollision(ball, this.paddle)) {
        synth.playPaddleHit();
      }

      // Bricks Collision check
      for (let b = this.bricks.length - 1; b >= 0; b--) {
        const brick = this.bricks[b];
        if (this.checkBallBrickCollision(ball, brick)) {
          brick.hitsLeft--;
          
          if (brick.hitsLeft <= 0) {
            // Destroy brick
            this.bricks.splice(b, 1);
            this.score += brick.isGold ? 150 : 100;
            this.updateHUD();
            synth.playBrickBreak(brick.isGold);
            this.spawnSparks(brick.x + brick.width/2, brick.y + brick.height/2, brick.color, 12);
            
            // Spawn Powerup
            if (brick.isGold || Math.random() < 0.25) {
              this.spawnPowerup(brick.x + brick.width / 2, brick.y + brick.height / 2);
            }
          } else {
            // Damaged brick (Armored brick case)
            synth.playPaddleHit(); // generic metallic hit sound
            brick.color = 'rgba(255, 0, 127, 0.5)'; // dim glow
            this.spawnSparks(brick.x + brick.width/2, brick.y + brick.height/2, '#ff007f', 5);
          }
          break; // only hit one brick per frame per ball
        }
      }
    }

    // No balls left, lose life
    if (this.balls.length === 0) {
      this.loseLife();
    }

    // Level clearance check
    if (this.bricks.length === 0) {
      this.levelUp();
    }

    // 4. Powerups update
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.y += p.dy;

      // Paddle collect detection
      if (p.y + p.height >= this.paddle.y && 
          p.y <= this.paddle.y + this.paddle.height &&
          p.x + p.width >= this.paddle.x &&
          p.x <= this.paddle.x + this.paddle.width) {
        
        this.applyPowerup(p.type);
        this.powerups.splice(i, 1);
        synth.playPowerup();
        continue;
      }

      // Out of screen
      if (p.y > LOGICAL_HEIGHT) {
        this.powerups.splice(i, 1);
      }
    }

    // 5. Lasers updates
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const laser = this.lasers[i];
      laser.y += laser.dy;

      // Laser hitting brick
      let hit = false;
      for (let b = this.bricks.length - 1; b >= 0; b--) {
        const brick = this.bricks[b];
        if (laser.x >= brick.x && laser.x <= brick.x + brick.width &&
            laser.y >= brick.y && laser.y <= brick.y + brick.height) {
          
          hit = true;
          brick.hitsLeft--;
          if (brick.hitsLeft <= 0) {
            this.bricks.splice(b, 1);
            this.score += brick.isGold ? 150 : 100;
            this.updateHUD();
            synth.playBrickBreak(brick.isGold);
            this.spawnSparks(brick.x + brick.width/2, brick.y + brick.height/2, brick.color, 12);
            
            if (brick.isGold || Math.random() < 0.25) {
              this.spawnPowerup(brick.x + brick.width/2, brick.y + brick.height/2);
            }
          } else {
            brick.color = 'rgba(255, 0, 127, 0.5)';
            this.spawnSparks(brick.x + brick.width/2, brick.y + brick.height/2, '#ff007f', 4);
          }
          break;
        }
      }

      if (hit || laser.y < 0) {
        this.lasers.splice(i, 1);
      }
    }

    // 6. Sparks/particles updates
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.dx;
      p.y += p.dy;
      p.dy += 0.05; // gravity
      p.life++;
      p.alpha = 1 - (p.life / p.maxLife);
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
  }

  // --- Collisions Solvers ---
  checkBallPaddleCollision(ball, paddle) {
    if (ball.y + ball.radius >= paddle.y && 
        ball.y - ball.radius <= paddle.y + paddle.height &&
        ball.x + ball.radius >= paddle.x && 
        ball.x - ball.radius <= paddle.x + paddle.width) {
      
      const relativeIntersectX = (paddle.x + (paddle.width / 2)) - ball.x;
      const normalizedIntersectX = relativeIntersectX / (paddle.width / 2);
      
      const maxBounceAngle = 5 * Math.PI / 12; // 75 deg max
      const bounceAngle = normalizedIntersectX * maxBounceAngle;
      
      ball.dx = -ball.speed * Math.sin(bounceAngle);
      ball.dy = -ball.speed * Math.cos(bounceAngle);
      
      ball.y = paddle.y - ball.radius; // reset ball position above paddle
      return true;
    }
    return false;
  }

  checkBallBrickCollision(ball, brick) {
    const testX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
    const testY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));
    
    const distX = ball.x - testX;
    const distY = ball.y - testY;
    const distance = Math.sqrt(distX * distX + distY * distY);
    
    if (distance < ball.radius) {
      const fromLeft = ball.x < brick.x;
      const fromRight = ball.x > brick.x + brick.width;
      const fromTop = ball.y < brick.y;
      const fromBottom = ball.y > brick.y + brick.height;
      
      if (fromLeft && ball.dx > 0) {
        ball.dx = -ball.dx;
        ball.x = brick.x - ball.radius;
      } else if (fromRight && ball.dx < 0) {
        ball.dx = -ball.dx;
        ball.x = brick.x + brick.width + ball.radius;
      }
      
      if (fromTop && ball.dy > 0) {
        ball.dy = -ball.dy;
        ball.y = brick.y - ball.radius;
      } else if (fromBottom && ball.dy < 0) {
        ball.dy = -ball.dy;
        ball.y = brick.y + brick.height + ball.radius;
      }
      
      if (!fromLeft && !fromRight && !fromTop && !fromBottom) {
        ball.dy = -ball.dy;
      }
      return true;
    }
    return false;
  }

  spawnSparks(x, y, color, count) {
    // Sparks disabled for maximum rendering performance
  }

  spawnPowerup(x, y) {
    const types = ['MULTIBALL', 'EXPAND', 'SLOW', 'LASER'];
    const type = types[Math.floor(Math.random() * types.length)];
    this.powerups.push({
      x: x - 12,
      y: y,
      width: 24,
      height: 24,
      dy: 2.5,
      type: type
    });
  }

  applyPowerup(type) {
    switch (type) {
      case 'MULTIBALL':
        // Generate two extra balls starting from a random active ball
        const sourceBall = this.balls[0] || { x: LOGICAL_WIDTH / 2, y: 500, dx: 0, dy: -6, speed: 6 };
        for (let i = 0; i < 2; i++) {
          this.balls.push({
            x: sourceBall.x,
            y: sourceBall.y,
            dx: sourceBall.dx + (Math.random() - 0.5) * 4,
            dy: -Math.abs(sourceBall.dy),
            radius: 8,
            speed: sourceBall.speed,
            attached: false,
            history: []
          });
        }
        break;
      case 'EXPAND':
        this.paddle.targetWidth = 150;
        // reset width after 10 seconds (600 frames at 60fps)
        setTimeout(() => {
          this.paddle.targetWidth = 100;
        }, 10000);
        break;
      case 'SLOW':
        this.slowMoActive = 600; // 10s of slow ball motion
        break;
      case 'LASER':
        this.paddle.laserActive = 600; // 10s of laser capability
        break;
    }
  }

  draw(time) {
    this.ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 2. Draw Bricks (optimized flat fillRect)
    this.bricks.forEach(brick => {
      this.ctx.fillStyle = brick.color;
      this.ctx.fillRect(brick.x + 1, brick.y + 1, brick.width - 2, brick.height - 2);
    });

    // 3. Draw Paddle (optimized flat fillRect)
    this.ctx.fillStyle = '#ff007f';
    this.ctx.fillRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height);

    // Draw Laser Guns on paddle edges if active (optimized flat fillRect)
    if (this.paddle.laserActive > 0) {
      this.ctx.fillStyle = '#ffeb3b';
      this.ctx.fillRect(this.paddle.x + 2, this.paddle.y - 4, 4, 6);
      this.ctx.fillRect(this.paddle.x + this.paddle.width - 6, this.paddle.y - 4, 4, 6);
    }

    // 4. Draw Lasers (optimized flat fillRect)
    this.ctx.fillStyle = '#00f0ff';
    this.lasers.forEach(laser => {
      this.ctx.fillRect(laser.x, laser.y, laser.width, laser.height);
    });

    // 5. Draw Powerups (optimized flat circles)
    this.powerups.forEach(p => {
      this.ctx.save();
      let color = '#ffffff';
      let symbol = '';

      switch(p.type) {
        case 'MULTIBALL': color = '#ff007f'; symbol = 'M'; break;
        case 'EXPAND': color = '#ffeb3b'; symbol = 'E'; break;
        case 'SLOW': color = '#39ff14'; symbol = 'S'; break;
        case 'LASER': color = '#00f0ff'; symbol = 'L'; break;
      }

      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(p.x + p.width/2, p.y + p.height/2, p.width/2 - 2, 0, Math.PI * 2);
      this.ctx.fill();

      // Simple label inside powerup
      this.ctx.fillStyle = '#050212';
      this.ctx.font = 'bold 11px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(symbol, p.x + p.width/2, p.y + p.height/2);
      this.ctx.restore();
    });

    // 6. Draw Balls (optimized flat circles, no trails, no outline glows)
    this.ctx.fillStyle = '#00f0ff';
    this.balls.forEach(ball => {
      this.ctx.beginPath();
      this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // 7. Draw Warning Overlay (SPEED UP!)
    if (this.warningTimer > 0) {
      this.ctx.save();
      // Flashes every 15 frames
      if (Math.floor(this.warningTimer / 15) % 2 === 0) {
        this.ctx.fillStyle = '#ff007f';
        this.ctx.shadowColor = '#ff007f';
        this.ctx.shadowBlur = 15;
        this.ctx.font = 'bold 36px "Orbitron", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('SPEED UP!', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
      }
      this.ctx.restore();
    }
  }

  // --- Animation loop ---
  loop(time) {
    const dt = time - this.lastTime;
    this.lastTime = time;

    this.update(dt);
    this.draw(time);

    this.animationId = requestAnimationFrame((t) => this.loop(t));
  }
}

// Start Game instance
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
