/**
 * Elite Edition ERP — Subtle Haptic & Acoustic Sound Effects Engine
 *
 * Synthesizes Apple macOS / iOS style gentle acoustic micro-sounds
 * using the native browser Web Audio API:
 * - Zero external sound files or CDNs needed (0 KB network overhead)
 * - Zero latency (<1ms instant playback)
 * - Automatic mobile haptic vibration pulse (navigator.vibrate)
 * - User-controlled volume and Mute/Unmute persistent settings
 */

const LS_SOUND_KEY = 'elite_erp_sound_enabled';
const LS_VOLUME_KEY = 'elite_erp_sound_volume';

class SoundEffectsEngine {
  constructor() {
    this.audioCtx = null;
    this.enabled = this.readSetting(LS_SOUND_KEY, 'on') === 'on';
    const savedVol = parseFloat(this.readSetting(LS_VOLUME_KEY, '0.5'));
    this.volume = isNaN(savedVol) ? 0.5 : Math.max(0, Math.min(1, savedVol));

    // Listen for cross-tab or cross-component sound settings changes
    if (typeof window !== 'undefined') {
      window.addEventListener('elite-sound-setting-change', (e) => {
        if (e.detail?.enabled !== undefined) this.enabled = !!e.detail.enabled;
        if (typeof e.detail?.volume === 'number') this.volume = e.detail.volume;
      });
    }
  }

  readSetting(key, fallback) {
    try {
      if (typeof localStorage === 'undefined') return fallback;
      const val = localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch (_) {
      return fallback;
    }
  }

  getAudioContext() {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.audioCtx) {
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  isEnabled() {
    return this.enabled;
  }

  getVolume() {
    return this.volume;
  }

  setEnabled(val) {
    this.enabled = !!val;
    try {
      localStorage.setItem(LS_SOUND_KEY, this.enabled ? 'on' : 'off');
      window.dispatchEvent(
        new CustomEvent('elite-sound-setting-change', {
          detail: { enabled: this.enabled, volume: this.volume }
        })
      );
    } catch (_) {}
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, Number(vol) || 0));
    try {
      localStorage.setItem(LS_VOLUME_KEY, String(this.volume));
      window.dispatchEvent(
        new CustomEvent('elite-sound-setting-change', {
          detail: { enabled: this.enabled, volume: this.volume }
        })
      );
    } catch (_) {}
  }

  triggerHaptic(duration = 10) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(duration);
      } catch (_) {}
    }
  }

  /**
   * 1. Success Chime (Velvety ascending chord: C5 -> E5 -> G5)
   * Perfect for saving bills, generating invoices, completing inward.
   */
  playSuccess() {
    if (!this.enabled || this.volume <= 0) return;
    this.triggerHaptic(14);
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.09 * this.volume, now);
      masterGain.connect(ctx.destination);

      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.055);

        noteGain.gain.setValueAtTime(0, now + i * 0.055);
        noteGain.gain.linearRampToValueAtTime(1, now + i * 0.055 + 0.015);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.28);

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(now + i * 0.055);
        osc.stop(now + i * 0.055 + 0.3);
      });
    } catch (_) {}
  }

  /**
   * 2. Task Done Tone (Rewarding crystalline ping: A5 -> D6)
   * Plays when dragging a task to Done or checking off a work item.
   */
  playTaskDone() {
    if (!this.enabled || this.volume <= 0) return;
    this.triggerHaptic(18);
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.09); // D6

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12 * this.volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.36);
    } catch (_) {}
  }

  /**
   * 3. Subtle Tactile Click (Short 20ms mechanical tick)
   * Ideal for primary button taps, tab switches, and card clicks.
   */
  playClick() {
    if (!this.enabled || this.volume <= 0) return;
    this.triggerHaptic(8);
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.022);

      gain.gain.setValueAtTime(0.06 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.025);
    } catch (_) {}
  }

  /**
   * 4. Challan Dispatch / Print (Crisp mechanical snap: G5 -> C6)
   * Confirms a physical print, dispatch or document export.
   */
  playDispatch() {
    if (!this.enabled || this.volume <= 0) return;
    this.triggerHaptic(15);
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(783.99, now); // G5
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.08); // C6

      gain.gain.setValueAtTime(0.09 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.24);
    } catch (_) {}
  }

  /**
   * 5. Warning / Missing Field Tap (Soft low double marimba: F4 -> D4)
   * Gentle, non-jarring feedback when validation fails.
   */
  playWarning() {
    if (!this.enabled || this.volume <= 0) return;
    this.triggerHaptic([10, 30, 10]);
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [349.23, 293.66]; // F4, D4
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.1);

        gain.gain.setValueAtTime(0.08 * this.volume, now + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.14);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.15);
      });
    } catch (_) {}
  }
}

export const soundEffects = new SoundEffectsEngine();
export default soundEffects;
