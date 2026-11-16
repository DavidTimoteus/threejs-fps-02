// Procedural Web Audio synthesizer for Tactical Strike.
// Every effect is synthesized at run time: no audio files, no network requests. One white-noise
// buffer is rendered once and reused by every noise burst.

let ctx = null;
let noiseBuffer = null;

function getAudioContext() {
  if (!ctx && (window.AudioContext || window.webkitAudioContext)) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function getNoiseBuffer(ac) {
  if (!noiseBuffer) {
    const length = ac.sampleRate; // one second, sliced by each burst's duration
    noiseBuffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

export function createAudio() {
  function playNoise(duration, filterFreq, gainStart, decay, filterType = 'lowpass') {
    const ac = getAudioContext();
    if (!ac || gainStart <= 0.001) return;
    try {
      const noise = ac.createBufferSource();
      noise.buffer = getNoiseBuffer(ac);
      const filter = ac.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq, ac.currentTime);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(gainStart, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + decay);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      const slice = Math.min(duration, 0.95);
      noise.start(ac.currentTime, Math.random() * (1 - slice), slice);
    } catch (_) { /* audio is optional */ }
  }

  function playTone(freq, duration, type = 'sine', gainVal = 0.2, endFreq = 0) {
    const ac = getAudioContext();
    if (!ac || gainVal <= 0.001) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (endFreq > 0) osc.frequency.exponentialRampToValueAtTime(endFreq, ac.currentTime + duration);
      gain.gain.setValueAtTime(gainVal, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + duration);
    } catch (_) { /* audio is optional */ }
  }

  return {
    init() {
      getAudioContext();
    },
    // volume 0..1 lets distant bot gunfire sound quieter than the player's own.
    playGunshot(weaponType, volume = 1) {
      if (weaponType === 'knife') {
        playNoise(0.08, 1200, 0.25 * volume, 0.08);
      } else if (weaponType === 'deagle') {
        playTone(140, 0.12, 'triangle', 0.45 * volume);
        playNoise(0.22, 1800, 0.6 * volume, 0.22);
      } else if (weaponType === 'awp') {
        playTone(90, 0.35, 'sine', 0.7 * volume);
        playNoise(0.45, 1200, 0.9 * volume, 0.45);
      } else {
        playTone(180, 0.09, 'sawtooth', 0.4 * volume);
        playNoise(0.18, 2200, 0.5 * volume, 0.18);
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
      playTone(55, 0.7, 'sine', 0.85);
      playTone(95, 0.4, 'triangle', 0.6);
      playNoise(0.85, 900, 0.95, 0.8);
    },
    // Smoke canister: a soft pop, then a long high-passed hiss as the cloud vents.
    playSmokePop() {
      playTone(320, 0.12, 'sine', 0.3, 120);
      playNoise(0.95, 2500, 0.28, 0.95, 'highpass');
    },
    playFootstep(volume = 0.15) {
      playNoise(0.05, 600, volume, 0.05);
    },
    playHit(isHeadshot) {
      if (isHeadshot) {
        playTone(1800, 0.08, 'triangle', 0.4);
        playTone(2400, 0.06, 'sine', 0.35);
      } else {
        playTone(650, 0.05, 'sine', 0.25);
      }
    },
    playHurt() {
      playTone(220, 0.12, 'square', 0.18, 110);
    },
    playBombBeep(faster = false) {
      playTone(faster ? 1600 : 1200, 0.06, 'sine', 0.3);
    },
    playDefuse() {
      playTone(900, 0.04, 'square', 0.15);
    },
  };
}
