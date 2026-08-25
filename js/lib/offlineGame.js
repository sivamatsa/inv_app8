/* Offline / No Internet Arcade Experience: "Market Runner: Bull vs Bear"
   Automatically activates when network connection drops, providing an engaging,
   financial-themed arcade runner with Web Audio SFX, powerups, particle effects,
   and automatic resume upon network restoration. */
window.App = window.App || {};

App.offlineGame = (function () {
  let isOffline = !navigator.onLine;
  let gameModal = null;
  let canvas = null;
  let ctx = null;
  let animId = null;
  let audioCtx = null;
  let soundEnabled = true;

  // Game Engine State
  let gameState = 'START'; // START, PLAYING, GAMEOVER
  let score = 0;
  let coins = 0;
  let highScore = 0;
  let speed = 6;
  let frame = 0;
  let multiplier = 1;

  // Player Bull Object
  const player = {
    x: 80,
    y: 200,
    w: 48,
    h: 36,
    vy: 0,
    jumpForce: -11.5,
    gravity: 0.58,
    groundY: 230,
    isGrounded: false,
    jumpsLeft: 2,
    hasShield: false,
    shieldTimer: 0,
    isGolden: false,
    goldenTimer: 0,
  };

  let obstacles = [];
  let pickups = [];
  let particles = [];
  let bgStars = [];

  function init() {
    try {
      highScore = parseInt(localStorage.getItem('ios_market_runner_highscore') || '0', 10);
    } catch (e) {
      highScore = 0;
    }

    window.addEventListener('offline', () => {
      isOffline = true;
      handleNetworkChange(true);
    });

    window.addEventListener('online', () => {
      isOffline = false;
      handleNetworkChange(false);
    });
  }

  function playSound(type) {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (AudioCtor) audioCtx = new AudioCtor();
      }
      if (!audioCtx || audioCtx.state === 'suspended') {
        audioCtx && audioCtx.resume();
      }
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'jump') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(580, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'coin') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.setValueAtTime(980, now + 0.08);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'powerup') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.25);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.25);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {}
  }

  function handleNetworkChange(offline) {
    const banner = App.utils.qs('#networkStatusBanner');
    if (offline) {
      if (!banner) {
        const bar = document.createElement('div');
        bar.id = 'networkStatusBanner';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(90deg,#e74c3c,#c0392b);color:#fff;font-size:12px;font-weight:600;padding:6px 14px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 10px rgba(0,0,0,0.5)';
        bar.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px">
            <span style="animation:pulse 1s infinite">⚠️</span>
            <span>You are currently offline. Live data sync is paused.</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-gold btn-sm" id="btnLaunchOfflineGame" style="padding:2px 10px;font-size:11px;background:#c9a84c;color:#070d1a;font-weight:bold">🎮 Play Market Runner</button>
          </div>
        `;
        document.body.appendChild(bar);
        App.utils.qs('#btnLaunchOfflineGame', bar)?.addEventListener('click', () => openGameModal(true));
      }
      // Auto open game if user is idle or requests it
      openGameModal(false);
    } else {
      if (banner) banner.remove();
      App.utils.toast('🟢 Connection restored! Live portfolio active.', 'ok');
      const reconnectBanner = App.utils.qs('#gameReconnectNotice');
      if (reconnectBanner) {
        reconnectBanner.style.display = 'block';
      }
    }
  }

  function openGameModal(forceOpen = true) {
    if (document.getElementById('offlineGameModal')) return;

    gameModal = document.createElement('div');
    gameModal.id = 'offlineGameModal';
    gameModal.style.cssText = `
      position:fixed;inset:0;z-index:10000;background:rgba(5,9,18,0.94);
      display:flex;align-items:center;justify-content:center;padding:16px;
      backdrop-filter:blur(8px);font-family:'DM Sans',sans-serif;
    `;

    gameModal.innerHTML = `
      <div style="width:100%;max-width:760px;background:#0b1322;border:1px solid rgba(201,168,76,0.35);border-radius:16px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.85);display:flex;flex-direction:column">
        <!-- Header -->
        <div style="background:#070c16;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:22px">🐂</span>
            <div>
              <div style="font-weight:700;color:var(--gold);font-size:15px;letter-spacing:0.5px">MARKET RUNNER: BULL vs BEAR</div>
              <div style="font-size:11px;color:var(--text2)">${isOffline ? '⚡ Offline Arcade Mode &bull; Play while connection restores' : '🎮 Portfolio Mini-Game Arcade'}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <button class="btn btn-outline btn-sm" id="btnToggleGameSound" style="font-size:12px;padding:3px 8px">${soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF'}</button>
            <button class="icon-btn" id="btnCloseGameModal" style="font-size:16px">&times;</button>
          </div>
        </div>

        <!-- Connection Reconnection Banner -->
        <div id="gameReconnectNotice" style="display:${!isOffline ? 'block' : 'none'};background:rgba(22,201,163,0.18);border-bottom:1px solid rgba(22,201,163,0.35);padding:8px 16px;font-size:12px;color:var(--teal);text-align:center">
          🟢 <b>Internet connection is back!</b> You can finish this round or click <a href="#" id="btnExitToLiveApp" style="color:var(--gold);font-weight:bold;text-decoration:underline">Return to Live Application</a>.
        </div>

        <!-- Game Canvas Container -->
        <div style="position:relative;background:#050a14;padding:12px;display:flex;justify-content:center;align-items:center">
          <canvas id="marketRunnerCanvas" width="700" height="280" style="border-radius:10px;background:#040711;max-width:100%;height:auto;box-shadow:inset 0 0 20px rgba(0,0,0,0.8)"></canvas>
        </div>

        <!-- Footer Controls & Instructions -->
        <div style="background:#070c16;padding:10px 20px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--text2)">
          <div style="display:flex;align-items:center;gap:14px">
            <span>⌨️ <b>Space / &uarr;</b> Jump / Double Jump</span>
            <span>📱 <b>Tap Screen</b> to Jump</span>
            <span>🟡 <b>₹ Coins</b> = Dividends (+10)</span>
            <span>🛡️ <b>Shield</b> = Compound Armor</span>
          </div>
          <div>
            <span>High Score: <b style="color:var(--gold)" id="lblGameHighScore">${highScore}</b></span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(gameModal);

    canvas = document.getElementById('marketRunnerCanvas');
    ctx = canvas.getContext('2d');

    // Controls setup
    App.utils.qs('#btnCloseGameModal', gameModal)?.addEventListener('click', closeGameModal);
    App.utils.qs('#btnExitToLiveApp', gameModal)?.addEventListener('click', (e) => {
      e.preventDefault();
      closeGameModal();
    });

    App.utils.qs('#btnToggleGameSound', gameModal)?.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      const btn = App.utils.qs('#btnToggleGameSound', gameModal);
      if (btn) btn.textContent = soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF';
    });

    // Keyboard controls
    window.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('pointerdown', handlePointerDown);

    // Init background stars
    bgStars = [];
    for (let i = 0; i < 40; i++) {
      bgStars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * (canvas.height - 60),
        r: Math.random() * 1.8 + 0.5,
        s: Math.random() * 0.8 + 0.2
      });
    }

    resetGame();
    startGameLoop();
  }

  function closeGameModal() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    window.removeEventListener('keydown', handleKeyDown);
    if (gameModal) {
      gameModal.remove();
      gameModal = null;
    }
  }

  function handleKeyDown(e) {
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
      e.preventDefault();
      triggerJump();
    } else if (e.code === 'KeyR' && gameState === 'GAMEOVER') {
      resetGame();
      gameState = 'PLAYING';
    }
  }

  function handlePointerDown(e) {
    e.preventDefault();
    triggerJump();
  }

  function triggerJump() {
    if (gameState === 'START') {
      gameState = 'PLAYING';
      resetGame();
      return;
    }
    if (gameState === 'GAMEOVER') {
      resetGame();
      gameState = 'PLAYING';
      return;
    }

    if (player.jumpsLeft > 0) {
      player.vy = player.jumpForce;
      player.jumpsLeft--;
      player.isGrounded = false;
      playSound('jump');
      // Create jump dust particles
      for (let i = 0; i < 6; i++) {
        particles.push({
          x: player.x + player.w / 2,
          y: player.y + player.h,
          vx: (Math.random() - 0.5) * 3,
          vy: Math.random() * -2,
          color: '#c9a84c',
          life: 18
        });
      }
    }
  }

  function resetGame() {
    score = 0;
    coins = 0;
    speed = 5.5;
    multiplier = 1;
    frame = 0;
    obstacles = [];
    pickups = [];
    particles = [];

    player.x = 80;
    player.y = player.groundY;
    player.vy = 0;
    player.isGrounded = true;
    player.jumpsLeft = 2;
    player.hasShield = false;
    player.shieldTimer = 0;
    player.isGolden = false;
    player.goldenTimer = 0;
  }

  function startGameLoop() {
    function loop() {
      update();
      render();
      animId = requestAnimationFrame(loop);
    }
    animId = requestAnimationFrame(loop);
  }

  function update() {
    frame++;

    // Update Stars
    bgStars.forEach((star) => {
      star.x -= star.s;
      if (star.x < 0) star.x = canvas.width;
    });

    if (gameState !== 'PLAYING') return;

    // Increment score & speed
    score += 1;
    if (frame % 350 === 0 && speed < 12) {
      speed += 0.4;
      multiplier = +(multiplier + 0.1).toFixed(1);
    }

    // Player Physics
    player.vy += player.gravity;
    player.y += player.vy;

    if (player.y >= player.groundY) {
      player.y = player.groundY;
      player.vy = 0;
      player.isGrounded = true;
      player.jumpsLeft = 2;
    }

    // Powerup Timers
    if (player.hasShield) {
      player.shieldTimer--;
      if (player.shieldTimer <= 0) player.hasShield = false;
    }
    if (player.isGolden) {
      player.goldenTimer--;
      if (player.goldenTimer <= 0) player.isGolden = false;
    }

    // Spawn Obstacles (Bears, Volatility Bombs, Inflation Spikes)
    if (frame % Math.max(55, Math.floor(100 - speed * 4)) === 0) {
      const types = ['BEAR', 'INFLATION', 'TAX'];
      const type = types[Math.floor(Math.random() * types.length)];
      const obsH = type === 'BEAR' ? 36 : type === 'INFLATION' ? 44 : 32;
      obstacles.push({
        x: canvas.width + 20,
        y: player.groundY + player.h - obsH,
        w: 32,
        h: obsH,
        type,
        passed: false
      });
    }

    // Spawn Pickups (Dividends ₹, Compound Shields 🛡️, Golden Bull 🌟)
    if (frame % 80 === 0) {
      const r = Math.random();
      let pType = 'COIN';
      if (r > 0.88) pType = 'SHIELD';
      else if (r > 0.76) pType = 'DIVIDEND';

      const pY = player.groundY - (Math.random() > 0.5 ? 40 : 10);
      pickups.push({
        x: canvas.width + 30,
        y: pY,
        w: 22,
        h: 22,
        type: pType
      });
    }

    // Update Obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      obs.x -= speed;

      // Collision detection with player
      if (checkCollision(player, obs)) {
        if (player.hasShield || player.isGolden) {
          // Break obstacle
          player.hasShield = false;
          playSound('hit');
          for (let p = 0; p < 12; p++) {
            particles.push({
              x: obs.x + obs.w / 2,
              y: obs.y + obs.h / 2,
              vx: (Math.random() - 0.5) * 6,
              vy: (Math.random() - 0.5) * 6,
              color: '#ff6b6b',
              life: 25
            });
          }
          obstacles.splice(i, 1);
          continue;
        } else {
          // Game Over
          playSound('hit');
          gameState = 'GAMEOVER';
          if (score > highScore) {
            highScore = score;
            try { localStorage.setItem('ios_market_runner_highscore', String(highScore)); } catch (e) {}
            const hsEl = App.utils.qs('#lblGameHighScore', gameModal);
            if (hsEl) hsEl.textContent = highScore;
          }
          return;
        }
      }

      if (obs.x < -40) {
        obstacles.splice(i, 1);
      }
    }

    // Update Pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
      const item = pickups[i];
      item.x -= speed;

      if (checkCollision(player, item)) {
        if (item.type === 'COIN') {
          coins += 1;
          score += 25;
          playSound('coin');
        } else if (item.type === 'DIVIDEND') {
          coins += 5;
          score += 100;
          playSound('powerup');
        } else if (item.type === 'SHIELD') {
          player.hasShield = true;
          player.shieldTimer = 300; // 5 seconds
          playSound('powerup');
        }

        // Particle sparks
        for (let p = 0; p < 8; p++) {
          particles.push({
            x: item.x + item.w / 2,
            y: item.y + item.h / 2,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            color: item.type === 'SHIELD' ? '#4c9be8' : '#c9a84c',
            life: 20
          });
        }
        pickups.splice(i, 1);
        continue;
      }

      if (item.x < -30) {
        pickups.splice(i, 1);
      }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function checkCollision(a, b) {
    const pad = 6;
    return (
      a.x + pad < b.x + b.w - pad &&
      a.x + a.w - pad > b.x + pad &&
      a.y + pad < b.y + b.h - pad &&
      a.y + a.h - pad > b.y + pad
    );
  }

  function render() {
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#050a16');
    bgGrad.addColorStop(1, '#0c1628');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Draw Stars
    ctx.fillStyle = 'rgba(201,168,76,0.6)';
    bgStars.forEach((star) => {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Distant Candlestick Chart Cityline
    ctx.strokeStyle = 'rgba(76,155,232,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 180);
    ctx.lineTo(100, 160);
    ctx.lineTo(220, 190);
    ctx.lineTo(360, 140);
    ctx.lineTo(500, 170);
    ctx.lineTo(650, 130);
    ctx.lineTo(700, 150);
    ctx.stroke();

    // Draw Ground Grid
    const groundLevel = player.groundY + player.h;
    ctx.fillStyle = '#081122';
    ctx.fillRect(0, groundLevel, w, h - groundLevel);

    ctx.strokeStyle = 'rgba(201,168,76,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundLevel);
    ctx.lineTo(w, groundLevel);
    ctx.stroke();

    // Moving grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const gridOffset = (frame * speed) % 40;
    for (let x = -gridOffset; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, groundLevel);
      ctx.lineTo(x - 30, h);
      ctx.stroke();
    }

    // Draw Pickups
    pickups.forEach((p) => {
      if (p.type === 'COIN') {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7d5a00';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('₹', p.x + p.w / 2, p.y + p.h / 2);
      } else if (p.type === 'DIVIDEND') {
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath();
        ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a3d1b';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', p.x + p.w / 2, p.y + p.h / 2);
      } else if (p.type === 'SHIELD') {
        ctx.fillStyle = '#3498db';
        ctx.beginPath();
        ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.w / 2 + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛡️', p.x + p.w / 2, p.y + p.h / 2);
      }
    });

    // Draw Obstacles
    obstacles.forEach((obs) => {
      if (obs.type === 'BEAR') {
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.fillStyle = '#fff';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🐻', obs.x + obs.w / 2, obs.y + obs.h / 2 + 6);
      } else if (obs.type === 'INFLATION') {
        ctx.fillStyle = '#e67e22';
        ctx.beginPath();
        ctx.moveTo(obs.x + obs.w / 2, obs.y);
        ctx.lineTo(obs.x + obs.w, obs.y + obs.h);
        ctx.lineTo(obs.x, obs.y + obs.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🔥', obs.x + obs.w / 2, obs.y + obs.h - 6);
      } else if (obs.type === 'TAX') {
        ctx.fillStyle = '#9b59b6';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('📉', obs.x + obs.w / 2, obs.y + obs.h / 2 + 4);
      }
    });

    // Draw Particles
    particles.forEach((p) => {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.life / 5), 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Player Bull
    ctx.save();
    if (player.hasShield) {
      ctx.strokeStyle = '#3498db';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x + player.w / 2, player.y + player.h / 2, player.w / 2 + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bull Body
    ctx.fillStyle = player.isGolden ? '#f1c40f' : '#c9a84c';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(player.x, player.y, player.w, player.h, 8) : ctx.rect(player.x, player.y, player.w, player.h);
    ctx.fill();

    // Bull Horns & Eyes
    ctx.fillStyle = '#e8c96a';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐂', player.x + player.w / 2, player.y + player.h - 8);
    ctx.restore();

    // Draw Heads-Up Display (HUD)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 20, 26);
    ctx.fillStyle = '#f1c40f';
    ctx.fillText(`Dividends: ₹${coins * 10}`, 130, 26);
    ctx.fillStyle = '#16c9a3';
    ctx.fillText(`Multiplier: ${multiplier}x`, 260, 26);

    if (player.hasShield) {
      ctx.fillStyle = '#3498db';
      ctx.fillText(`🛡️ Shield: ${(player.shieldTimer / 60).toFixed(1)}s`, 380, 26);
    }

    // State Screens
    if (gameState === 'START') {
      ctx.fillStyle = 'rgba(4,7,17,0.75)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c9a84c';
      ctx.font = 'bold 24px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MARKET RUNNER: BULL vs BEAR', w / 2, h / 2 - 25);
      ctx.fillStyle = '#e4ecf5';
      ctx.font = '14px "DM Sans", sans-serif';
      ctx.fillText('Press SPACE, UP ARROW, or TAP SCREEN to Start Jumping', w / 2, h / 2 + 10);
      ctx.fillStyle = '#8496ac';
      ctx.font = '12px "DM Sans", sans-serif';
      ctx.fillText('Dodge Bears, Inflation & Tax Drains &bull; Collect Dividend Coins', w / 2, h / 2 + 35);
    } else if (gameState === 'GAMEOVER') {
      ctx.fillStyle = 'rgba(15,8,12,0.85)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff6b6b';
      ctx.font = 'bold 26px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PORTFOLIO DRAWDOWN (GAME OVER)', w / 2, h / 2 - 35);
      ctx.fillStyle = '#e4ecf5';
      ctx.font = '15px "DM Sans", sans-serif';
      ctx.fillText(`Final Wealth Score: ${score}  |  Dividends Collected: ₹${coins * 10}`, w / 2, h / 2);
      ctx.fillStyle = '#c9a84c';
      ctx.font = 'bold 14px "DM Sans", sans-serif';
      ctx.fillText('Press SPACE, TAP SCREEN, or Press [R] to Reinvest & Play Again', w / 2, h / 2 + 35);
    }
  }

  init();

  return {
    open: () => openGameModal(true),
    close: closeGameModal,
    isOffline: () => isOffline,
  };
})();
