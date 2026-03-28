import { clamp, formatCombo, formatWave } from "./utils.js";

export class UIController {
    constructor() {
        this.overlay = document.getElementById("overlay");
        this.overlayTag = document.getElementById("overlayTag");
        this.overlayTitle = document.getElementById("overlayTitle");
        this.overlayLead = document.getElementById("overlayLead");
        this.overlayMeta = document.getElementById("overlayMeta");
        this.overlayScore = document.getElementById("overlayScore");
        this.startButton = document.getElementById("startButton");
        this.restartButton = document.getElementById("restartButton");

        this.healthValue = document.getElementById("healthValue");
        this.armorValue = document.getElementById("armorValue");
        this.staminaValue = document.getElementById("staminaValue");
        this.foodValue = document.getElementById("foodValue");
        this.waterValue = document.getElementById("waterValue");
        this.ammoValue = document.getElementById("ammoValue");
        this.reserveAmmoValue = document.getElementById("reserveAmmoValue");
        this.waveValue = document.getElementById("waveValue");
        this.aliveValue = document.getElementById("aliveValue");
        this.scoreValue = document.getElementById("scoreValue");
        this.comboValue = document.getElementById("comboValue");
        this.objectiveText = document.getElementById("objectiveText");
 
        this.healthBar = document.getElementById("healthBar");
        this.armorBar = document.getElementById("armorBar");
        this.staminaBar = document.getElementById("staminaBar");
        this.foodBar = document.getElementById("foodBar");
        this.waterBar = document.getElementById("waterBar");
        this.ammoBar = document.getElementById("ammoBar");

        this.damageFlash = document.getElementById("damageFlash");
        this.lowHealthVignette = document.getElementById("lowHealthVignette");
        this.hitMarker = document.getElementById("hitMarker");

        this.waveBanner = document.getElementById("waveBanner");
        this.waveBannerTitle = document.getElementById("waveBannerTitle");
        this.waveBannerSubtitle = document.getElementById("waveBannerSubtitle");

        this.bannerTimer = 0;
        this.hitMarkerTimer = 0;
        this.damageTimer = 0;
    }

    bindActions({ onStart, onRestart }) {
        this.startButton.addEventListener("click", onStart);
        this.restartButton.addEventListener("click", onRestart);
    }

    update(snapshot, dt) {
        this.healthValue.textContent = Math.ceil(snapshot.player.health);
        this.armorValue.textContent = Math.ceil(snapshot.player.armor);
        this.staminaValue.textContent = Math.ceil(snapshot.player.stamina);
        this.foodValue.textContent = Math.ceil(snapshot.player.food);
        this.waterValue.textContent = Math.ceil(snapshot.player.water);
        this.ammoValue.textContent = snapshot.player.ammo;
        this.reserveAmmoValue.textContent = snapshot.player.reserveAmmo;
        this.waveValue.textContent = formatWave(snapshot.wave, snapshot.totalWaves);
        this.aliveValue.textContent = String(snapshot.enemiesAlive);
        this.scoreValue.textContent = snapshot.score.toLocaleString();
        this.comboValue.textContent = formatCombo(snapshot.combo);
        this.objectiveText.textContent = snapshot.objective;

        this.healthBar.style.width = `${snapshot.player.health}%`;
        this.armorBar.style.width = `${snapshot.player.armor}%`;
        this.staminaBar.style.width = `${snapshot.player.stamina}%`;
        this.foodBar.style.width = `${snapshot.player.food}%`;
        this.waterBar.style.width = `${snapshot.player.water}%`;
        this.ammoBar.style.width = `${(snapshot.player.ammo / snapshot.player.maxAmmo) * 100}%`;

        this.healthBar.style.background = snapshot.player.health < 33
            ? "linear-gradient(90deg, #ff4d4d, #ff7b5c)"
            : snapshot.player.health < 66
                ? "linear-gradient(90deg, #ffc857, #ff9f45)"
                : "linear-gradient(90deg, #7dd3ff, #72ffc6)";

        this.foodBar.style.background = snapshot.player.food < 20
            ? "linear-gradient(90deg, #ff4d4d, #ff7b5c)"
            : "linear-gradient(90deg, #ffa500, #ffd700)";

        this.waterBar.style.background = snapshot.player.water < 20
            ? "linear-gradient(90deg, #ff4d4d, #ff7b5c)"
            : "linear-gradient(90deg, #00bfff, #1e90ff)";

        this.lowHealthVignette.style.opacity = String(clamp((33 - snapshot.player.health) / 33, 0, 1));

        this.bannerTimer = Math.max(0, this.bannerTimer - dt);
        this.waveBanner.classList.toggle("visible", this.bannerTimer > 0);

        this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
        this.hitMarker.classList.toggle("visible", this.hitMarkerTimer > 0);

        this.damageTimer = Math.max(0, this.damageTimer - dt);
        document.body.classList.toggle("damage", this.damageTimer > 0);
        document.body.classList.toggle("low-health", snapshot.player.health <= 33);
        document.body.style.setProperty("--crosshair-scale", String(1 + snapshot.crosshairKick * 0.22));
    }

    flashHitMarker() {
        this.hitMarkerTimer = 0.12;
    }

    flashDamage() {
        this.damageTimer = 0.14;
    }

    showBanner(title, subtitle, duration = 2.4) {
        this.waveBannerTitle.textContent = title;
        this.waveBannerSubtitle.textContent = subtitle;
        this.bannerTimer = duration;
        this.waveBanner.classList.add("visible");
    }

    showOverlay(mode, payload = {}) {
        this.overlay.dataset.mode = mode;
        this.overlay.classList.add("visible");
        this.startButton.style.display = mode === "intro" || mode === "paused" ? "inline-flex" : "none";
        this.restartButton.classList.toggle("visible", mode === "gameover" || mode === "victory");

        if (mode === "intro") {
            this.overlayTag.textContent = payload.tag ?? "Arcade Zombie FPS";
            this.overlayTitle.textContent = payload.title ?? "Meraviglia";
            this.overlayLead.textContent = payload.lead ?? "Survive five waves and secure the final extraction route.";
            this.overlayMeta.textContent = payload.meta ?? "Deploy to begin the breach response.";
            this.overlayScore.textContent = "";
        } else if (mode === "paused") {
            this.overlayTag.textContent = "Combat Interrupted";
            this.overlayTitle.textContent = "Resume Sweep";
            this.overlayLead.textContent = payload.lead ?? "Cursor unlocked. Re-enter the yard when you're ready.";
            this.overlayMeta.textContent = payload.meta ?? "Click deploy to lock back in.";
            this.overlayScore.textContent = payload.scoreText ?? "";
        } else if (mode === "gameover") {
            this.overlayTag.textContent = "Run Failed";
            this.overlayTitle.textContent = "The Yard Fell";
            this.overlayLead.textContent = payload.lead ?? "You were surrounded before extraction could stabilize.";
            this.overlayMeta.textContent = payload.meta ?? "Restart the run and keep the route alive.";
            this.overlayScore.textContent = payload.scoreText ?? "";
        } else if (mode === "victory") {
            this.overlayTag.textContent = "Extraction Secured";
            this.overlayTitle.textContent = "Meraviglia Holds";
            this.overlayLead.textContent = payload.lead ?? "The brute is down and the route is clear. You kept the quarantine line intact.";
            this.overlayMeta.textContent = payload.meta ?? "Restart to push for a cleaner, higher-score run.";
            this.overlayScore.textContent = payload.scoreText ?? "";
        }
    }

    hideOverlay() {
        this.overlay.classList.remove("visible");
    }
}
