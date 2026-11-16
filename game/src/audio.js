// Procedural Web Audio Synthesizer for Tactical Strike FPS.
// 100% self-contained synthesized sound effects with zero external audio assets or network requests.

let ctx = null;

function getAudioContext() {
  if (!ctx && (window.AudioContext || window.webkitAudioContext)) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function createAudio() {
  function playNoise(duration, filterFreq, gainStart, decay) {
    const ac = getAudioContext();
    if (!ac) return;
    try {
      const bufferSize = ac.sampleRate * duration;
      const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ac.createBufferSource();
      noise.buffer = buffer;

      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, ac.currentTime);

      const gain = ac.createGain();
      gain.gain.setValueAtTime(gainStart, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + decay);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);

      noise.start();
    } catch (_) {}
  }

  function playTone(freq, duration, type = 'sine', gainVal = 0.2) {
    const ac = getAudioContext();
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      gain.gain.setValueAtTime(gainVal, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + duration);
    } catch (_) {}
  }

  return {
    init() {
      getAudioContext();
    },
    playGunshot(weaponType) {
      const ac = getAudioContext();
      if (!ac) return;
      if (weaponType === 'knife') {
        playNoise(0.08, 1200, 0.25, 0.08);
      } else if (weaponType === 'deagle') {
        playTone(140, 0.12, 'triangle', 0.45);
        playNoise(0.22, 1800, 0.6, 0.22);
      } else if (weaponType === 'awp') {
        playTone(90, 0.35, 'sine', 0.7);
        playNoise(0.45, 1200, 0.9, 0.45);
      } else {
        // AK-47 / Rifle default
        playTone(180, 0.09, 'sawtooth', 0.4);
        playNoise(0.18, 2200, 0.5, 0.18);
      }
    },
    playGrenadeThrow() {
      playNoise(0.12, 800, 0.2, 0.12);
    },
    playGrenadeBounce() {
      playTone(1200, 0.04, 'triangle', 0.15);
      playNoise(0.05, 3000, 0.2, 0.05);
    },
    playExplosion() {
      // Sub-bass concussive blast + noise decay
      playTone(55, 0.7, 'sine', 0.85);
      playTone(95, 0.4, 'triangle', 0.6);
      playNoise(0.85, 900, 0.95, 0.8);
    },
    playHit(isHeadshot) {
      if (isHeadshot) {
        playTone(1800, 0.08, 'triangle', 0.4);
        playTone(2400, 0.06, 'sine', 0.35);
      } else {
        playTone(650, 0.05, 'sine', 0.25);
      }
    },
    playBombBeep(faster = false) {
      playTone(faster ? 1600 : 1200, 0.06, 'sine', 0.3);
    },
    playDefuse() {
      playTone(900, 0.04, 'square', 0.15);
    }
  };
}
