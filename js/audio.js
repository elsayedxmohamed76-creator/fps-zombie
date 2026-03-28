export class ProceduralAudio {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.noiseBuffer = null;
        this.lowPulseTimer = 0;
    }

    async unlock() {
        if (!window.AudioContext && !window.webkitAudioContext) {
            return;
        }

        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.23;
            this.master.connect(this.ctx.destination);
            this.noiseBuffer = this.#createNoiseBuffer();
        }

        if (this.ctx.state === "suspended") {
            await this.ctx.resume();
        }
    }

    update(dt, healthRatio, foodRatio, waterRatio, mode) {
        if (!this.ctx || this.ctx.state !== "running" || mode !== "playing") {
            return;
        }

        this.lowPulseTimer -= dt;
        if ((healthRatio <= 0.33 || foodRatio <= 0.2 || waterRatio <= 0.2) && this.lowPulseTimer <= 0) {
            this.lowPulseTimer = 0.92;
            const freq = healthRatio <= 0.33 ? 98 : foodRatio <= 0.2 ? 110 : 125;
            this.#tone(freq, 0.16, "triangle", 0.08, 0.02, 0.2);
        }
    }

    playShot() {
        if (!this.#ready()) return;
        this.#tone(160, 0.05, "square", 0.07, 0.002, 0.05);
        this.#tone(72, 0.08, "triangle", 0.06, 0.001, 0.07);
        this.#noise(0.028, 0.045, 1200, 0.08);
    }

    playDryClick() {
        if (!this.#ready()) return;
        this.#tone(220, 0.04, "square", 0.02, 0.001, 0.03);
    }

    playHit() {
        if (!this.#ready()) return;
        this.#tone(420, 0.045, "triangle", 0.04, 0.002, 0.05);
        this.#noise(0.016, 0.03, 1800, 0.03);
    }

    playKill() {
        if (!this.#ready()) return;
        this.#tone(320, 0.09, "sawtooth", 0.05, 0.004, 0.08);
        this.#tone(520, 0.08, "triangle", 0.03, 0.01, 0.09);
    }

    playWave() {
        if (!this.#ready()) return;
        this.#tone(220, 0.12, "sawtooth", 0.08, 0.01, 0.1);
        this.#tone(440, 0.14, "triangle", 0.05, 0.02, 0.15);
    }

    playPickup(type) {
        if (!this.#ready()) return;
        const base = type === "ammo" ? 290 : type === "medkit" ? 360 : type === "food" ? 310 : type === "water" ? 440 : 420;
        this.#tone(base, 0.08, "triangle", 0.05, 0.01, 0.07);
        this.#tone(base * 1.5, 0.1, "sine", 0.03, 0.02, 0.08);
    }

    playDamage() {
        if (!this.#ready()) return;
        this.#noise(0.06, 0.08, 700, 0.07);
        this.#tone(120, 0.1, "sawtooth", 0.05, 0.002, 0.05);
    }

    playReload() {
        if (!this.#ready()) return;
        this.#tone(480, 0.03, "square", 0.03, 0.001, 0.03);
        this.#tone(620, 0.04, "square", 0.02, 0.04, 0.05);
    }

    playMelee() {
        if (!this.#ready()) return;
        this.#noise(0.03, 0.06, 1600, 0.05);
        this.#tone(170, 0.08, "square", 0.04, 0.002, 0.06);
    }

    playExplosion() {
        if (!this.#ready()) return;
        this.#noise(0.14, 0.26, 480, 0.14);
        this.#tone(58, 0.24, "triangle", 0.09, 0.001, 0.12);
    }

    playBrute() {
        if (!this.#ready()) return;
        this.#tone(74, 0.3, "sawtooth", 0.08, 0.002, 0.16);
        this.#tone(110, 0.24, "triangle", 0.05, 0.03, 0.18);
    }

    playGameOver() {
        if (!this.#ready()) return;
        this.#tone(220, 0.22, "triangle", 0.06, 0.001, 0.06);
        this.#tone(148, 0.3, "sawtooth", 0.08, 0.04, 0.12);
    }

    playVictory() {
        if (!this.#ready()) return;
        this.#tone(330, 0.12, "triangle", 0.05, 0.002, 0.08);
        this.#tone(495, 0.18, "triangle", 0.05, 0.05, 0.12);
        this.#tone(660, 0.28, "triangle", 0.04, 0.12, 0.16);
    }

    #ready() {
        return this.ctx && this.ctx.state === "running" && this.master;
    }

    #tone(freq, duration, type, gainValue, delay = 0, glideTo = null) {
        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (glideTo) {
            osc.frequency.exponentialRampToValueAtTime(glideTo, now + duration);
        }
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    }

    #noise(duration, decay, lowpassFrequency, gainValue) {
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        src.buffer = this.noiseBuffer;
        filter.type = "lowpass";
        filter.frequency.value = lowpassFrequency;
        gain.gain.setValueAtTime(gainValue, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        src.start(now);
        src.stop(now + duration);
    }

    #createNoiseBuffer() {
        const length = Math.floor(this.ctx.sampleRate * 1.5);
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }
}
