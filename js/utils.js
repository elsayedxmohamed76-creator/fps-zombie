import * as THREE from "three";

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function createRng(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), t | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

export function range(rng, min, max) {
    return min + (max - min) * rng();
}

export function pickWeighted(rng, entries) {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = rng() * total;
    for (const entry of entries) {
        cursor -= entry.weight;
        if (cursor <= 0) {
            return entry.value;
        }
    }
    return entries[entries.length - 1].value;
}

export function shuffle(rng, array) {
    const output = [...array];
    for (let i = output.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [output[i], output[j]] = [output[j], output[i]];
    }
    return output;
}

export function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
}

export function distanceXZ(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

export function forwardFromAngles(yaw, pitch = 0) {
    const forward = new THREE.Vector3(0, 0, -1);
    const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");
    return forward.applyEuler(euler).normalize();
}

export function formatCombo(combo) {
    return `x${combo.toFixed(1)}`;
}

export function formatWave(wave, total) {
    return `${wave} / ${total}`;
}
