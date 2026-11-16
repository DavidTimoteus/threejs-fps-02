// Tactical HUD Engine.
// Manages the top round scoreboard, radar minimap, health/armor gauges, ammo counter, killfeed, and buy menu.

export function createHud() {
  const ammoMagEl = document.getElementById('ammo-mag');
  const ammoReserveEl = document.getElementById('ammo-reserve');
  const ammoContainer = document.getElementById('ammo');
  const hpEl = document.getElementById('health-val');
  const armorEl = document.getElementById('armor-val');
  const roundTimerEl = document.getElementById('round-timer');
  const scoreCtEl = document.getElementById('score-ct');
  const scoreTEl = document.getElementById('score-t');
  const moneyEl = document.getElementById('money-val');
  const killfeedEl = document.getElementById('killfeed');
  const objectiveEl = document.getElementById('objective-banner');
  const hitmarkerEl = document.getElementById('hitmarker');
  const buyMenuEl = document.getElementById('buy-menu');
  const overlayEl = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const radarCanvas = document.getElementById('radar');
  const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
  const weaponEl = document.getElementById('weapon-name');
  const heEl = document.getElementById('nade-he');
  const smokeEl = document.getElementById('nade-smoke');
  const damageEl = document.getElementById('damage-flash');

  let playCallback = null;
  let lastObjective = null;
  let lastProgress = -1;

  document.getElementById('play-btn')?.addEventListener('click', () => {
    if (playCallback) playCallback();
  });

  return {
    onPlay(cb) { playCallback = cb; },

    setAmmo(mag, reserve) {
      if (ammoMagEl) ammoMagEl.textContent = mag;
      if (ammoReserveEl) ammoReserveEl.textContent = `/ ${reserve}`;
      if (ammoContainer) {
        if (mag === 0) ammoContainer.classList.add('empty');
        else ammoContainer.classList.remove('empty');
      }
    },

    setHealth(hp, armor) {
      if (hpEl) hpEl.textContent = Math.max(0, Math.round(hp));
      if (armorEl) armorEl.textContent = Math.max(0, Math.round(armor));
    },

    setScores(ctScore, tScore, timerSec, ctAlive, tAlive) {
      if (scoreCtEl) scoreCtEl.textContent = ctScore;
      if (scoreTEl) scoreTEl.textContent = tScore;
      if (roundTimerEl) {
        const m = Math.floor(timerSec / 60);
        const s = Math.floor(timerSec % 60);
        roundTimerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
      }
    },

    setMoney(amount) {
      if (moneyEl) moneyEl.textContent = `$${amount}`;
    },

    showObjective(text, progress = 0) {
      if (!objectiveEl) return;
      const pct = Math.round(progress * 100);
      if (text === lastObjective && pct === lastProgress) return; // called every tick: touch the DOM only on change
      lastObjective = text;
      lastProgress = pct;
      if (!text) {
        objectiveEl.style.display = 'none';
        return;
      }
      objectiveEl.style.display = 'block';
      objectiveEl.innerHTML = `<div>${text}</div>${pct > 0 ? `<div class="bar" style="width: ${pct}%"></div>` : ''}`;
    },

    setLoadout(weaponName, hasHe, hasSmoke) {
      if (weaponEl) weaponEl.textContent = weaponName;
      if (heEl) heEl.classList.toggle('owned', hasHe);
      if (smokeEl) smokeEl.classList.toggle('owned', hasSmoke);
    },

    damageFlash() {
      if (!damageEl) return;
      damageEl.classList.remove('on');
      void damageEl.offsetWidth; // restart the CSS fade
      damageEl.classList.add('on');
    },

    pushKillfeed(killer, victim, isHeadshot) {
      if (!killfeedEl) return;
      const item = document.createElement('div');
      item.className = 'kill-item';
      item.innerHTML = `<span class="killer">${killer}</span> ${isHeadshot ? '💥🎯' : '🔫'} <span class="victim">${victim}</span>`;
      killfeedEl.appendChild(item);
      setTimeout(() => {
        item.style.opacity = '0';
        setTimeout(() => item.remove(), 400);
      }, 3500);
    },

    hitMarker(killed, durationMs = 90) {
      if (!hitmarkerEl) return;
      hitmarkerEl.classList.add('on');
      if (killed) hitmarkerEl.classList.add('kill');
      setTimeout(() => {
        hitmarkerEl.classList.remove('on');
        hitmarkerEl.classList.remove('kill');
      }, durationMs);
    },

    toggleBuyMenu(show, inventory, economy) {
      if (!buyMenuEl) return;
      buyMenuEl.style.display = show ? 'grid' : 'none';
    },

    drawRadar(player, bots, sites, c4, clouds) {
      if (!radarCtx) return;
      const w = radarCanvas.width;
      const h = radarCanvas.height;
      radarCtx.clearRect(0, 0, w, h);

      // Radar background & grid
      radarCtx.fillStyle = 'rgba(20, 24, 32, 0.75)';
      radarCtx.fillRect(0, 0, w, h);
      radarCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      radarCtx.strokeRect(0, 0, w, h);

      const mapScale = 2.4; // 50m mapped to canvas
      const cx = w / 2;
      const cy = h / 2;

      // Draw active smoke clouds on radar
      if (clouds) {
        radarCtx.fillStyle = 'rgba(195, 202, 210, 0.45)';
        for (const c of clouds) {
          if (!c.active || c.radius < 0.5) continue;
          radarCtx.beginPath();
          radarCtx.arc(cx + c.center.x * mapScale, cy + c.center.z * mapScale, c.radius * mapScale, 0, Math.PI * 2);
          radarCtx.fill();
        }
      }

      // Draw Bomb Sites
      if (sites) {
        radarCtx.font = '10px monospace';
        radarCtx.fillStyle = '#44d7b6';
        radarCtx.fillText('A', cx + sites.A.x * mapScale - 4, cy + sites.A.z * mapScale + 4);
        radarCtx.fillStyle = '#d744b6';
        radarCtx.fillText('B', cx + sites.B.x * mapScale - 4, cy + sites.B.z * mapScale + 4);
      }

      // Draw C4 if planted
      if (c4 && c4.isPlanted) {
        radarCtx.fillStyle = '#e64c4c';
        radarCtx.beginPath();
        radarCtx.arc(cx + c4.position.x * mapScale, cy + c4.position.z * mapScale, 4, 0, Math.PI * 2);
        radarCtx.fill();
      }

      // Draw Bots
      if (bots) {
        for (const b of bots) {
          if (!b.alive) continue;
          radarCtx.fillStyle = b.cfg.team === 'CT' ? '#4b94ea' : '#e8a338';
          radarCtx.beginPath();
          radarCtx.arc(cx + b.position.x * mapScale, cy + b.position.z * mapScale, 3, 0, Math.PI * 2);
          radarCtx.fill();
        }
      }

      // Draw Player
      if (player) {
        const px = cx + player.state.position.x * mapScale;
        const py = cy + player.state.position.z * mapScale;
        radarCtx.fillStyle = '#ffffff';
        radarCtx.beginPath();
        radarCtx.arc(px, py, 4, 0, Math.PI * 2);
        radarCtx.fill();

        // Direction pointer
        radarCtx.strokeStyle = '#ffffff';
        radarCtx.beginPath();
        radarCtx.moveTo(px, py);
        radarCtx.lineTo(px - Math.sin(player.state.yaw) * 8, py - Math.cos(player.state.yaw) * 8);
        radarCtx.stroke();
      }
    },

    showOverlay(type, roundScore = 0) {
      if (!overlayEl) return;
      overlayEl.removeAttribute('hidden');
      if (type === 'start') {
        overlayTitle.textContent = 'TACTICAL STRIKE';
        overlayMsg.textContent = 'Counter-Terrorists vs Terrorists. Plant or Defuse the C4, eliminate enemies, manage your economy.';
      } else if (type === 'paused') {
        overlayTitle.textContent = 'PAUSED';
        overlayMsg.textContent = 'Click to resume tactical mission.';
      } else if (type === 'end') {
        overlayTitle.textContent = 'MISSION COMPLETE';
        overlayMsg.textContent = `Round finished. Score: ${roundScore}. Press Play to start next round.`;
      }
    },

    hideOverlay() {
      if (overlayEl) overlayEl.setAttribute('hidden', '');
    }
  };
}
