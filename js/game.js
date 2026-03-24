import * as THREE from "three";
import { ProceduralAudio } from "./audio.js";
import { ENEMY_TYPES, FIXED_DT, GAME_CONFIG, PICKUP_TYPES, WAVE_CONFIGS } from "./config.js";
import { createEnemyMesh, createPickupMesh, createTracer, createWeaponMesh } from "./factories.js";
import { UIController } from "./ui.js";
import { createWorld, moveAndCollide } from "./world.js";
import { clamp, createRng, distanceXZ, forwardFromAngles, pickWeighted, range, shuffle } from "./utils.js";

const params = new URLSearchParams(window.location.search);

class FPSZombieMeraviglia {
    constructor() {
        this.options = {
            debug: params.get("debug") === "1",
            autostart: params.get("autostart") === "1",
            seedProvided: params.has("seed"),
            seed: params.has("seed") ? Number.parseInt(params.get("seed"), 10) >>> 0 : Date.now() >>> 0,
        };

        this.baseSeed = this.options.seed;
        this.rng = createRng(this.baseSeed);
        this.enemyId = 0;
        this.pointerLocked = false;
        this.accumulator = 0;
        this.lastFrame = performance.now();
        this.elapsed = 0;
        this.crosshairKick = 0;
        this.pendingLook = { x: 0, y: 0 };
        this.screenShake = 0;
        this.screenShakeOffset = new THREE.Vector3();
        this.slowMoTimer = 0;
        this.slowMoScale = 1;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 180);
        this.cameraRig = new THREE.Group();
        this.pitchPivot = new THREE.Group();
        this.scene.add(this.cameraRig);
        this.cameraRig.add(this.pitchPivot);
        this.pitchPivot.add(this.camera);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.domElement.tabIndex = 0;
        document.getElementById("gameRoot").appendChild(this.renderer.domElement);

        this.flashlight = new THREE.SpotLight(0xffddb1, 3.4, 48, Math.PI / 4.6, 0.4, 1.65);
        this.flashlight.castShadow = true;
        this.flashlight.position.set(0, 0.15, 0.15);
        this.flashlight.target.position.set(0, -0.08, -6);
        this.pitchPivot.add(this.flashlight);
        this.pitchPivot.add(this.flashlight.target);

        const weaponView = createWeaponMesh();
        this.weapon = weaponView.weapon;
        this.muzzleFlash = weaponView.muzzleFlash;
        this.camera.add(this.weapon);

        this.world = createWorld(this.scene, this.rng);
        this.world.barrels.forEach((barrel) => {
            barrel.body.userData.barrelRef = barrel;
            barrel.stripe.userData.barrelRef = barrel;
        });

        this.ui = new UIController();
        this.audio = new ProceduralAudio();
        this.ui.bindActions({
            onStart: () => this.handleStartAction(),
            onRestart: () => this.restartRun(),
        });

        this.raycaster = new THREE.Raycaster();
        this.tmpVecA = new THREE.Vector3();
        this.tmpVecB = new THREE.Vector3();
        this.tmpVecC = new THREE.Vector3();
        this.tmpQuat = new THREE.Quaternion();

        this.dynamic = {
            enemies: [],
            pickups: [],
            tracers: [],
            particles: [],
        };

        this.input = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            sprint: false,
            reload: false,
            melee: false,
            fire: false,
            lookX: 0,
            lookY: 0,
        };
        this.prevDebugButtons = { reload: false, melee: false };
        this.player = null;
        this.state = null;

        this.bindEvents();
        this.prepareRun(this.baseSeed);
        this.exposeDebug();

        if (this.options.autostart) {
            if (this.options.debug) {
                this.beginRun();
            } else {
                this.ui.hideOverlay();
                this.state.objective = "Click inside the yard to deploy and lock cursor.";
            }
        } else {
            this.ui.showOverlay("intro");
        }

        this.ui.update(this.getHudSnapshot(), 0);
        this.render();
        requestAnimationFrame((ts) => this.loop(ts));
    }

    bindEvents() {
        window.addEventListener("resize", () => this.handleResize());
        window.addEventListener("contextmenu", (event) => event.preventDefault());

        document.addEventListener("keydown", (event) => {
            if (event.repeat) {
                return;
            }
            switch (event.code) {
                case "KeyW":
                case "ArrowUp":
                    this.input.forward = true;
                    break;
                case "KeyS":
                case "ArrowDown":
                    this.input.backward = true;
                    break;
                case "KeyA":
                case "ArrowLeft":
                    this.input.left = true;
                    break;
                case "KeyD":
                case "ArrowRight":
                    this.input.right = true;
                    break;
                case "ShiftLeft":
                case "ShiftRight":
                    this.input.sprint = true;
                    break;
                case "KeyR":
                    this.tryReload();
                    break;
                case "KeyF":
                    this.tryMelee();
                    break;
                default:
                    break;
            }
        });

        document.addEventListener("keyup", (event) => {
            switch (event.code) {
                case "KeyW":
                case "ArrowUp":
                    this.input.forward = false;
                    break;
                case "KeyS":
                case "ArrowDown":
                    this.input.backward = false;
                    break;
                case "KeyA":
                case "ArrowLeft":
                    this.input.left = false;
                    break;
                case "KeyD":
                case "ArrowRight":
                    this.input.right = false;
                    break;
                case "ShiftLeft":
                case "ShiftRight":
                    this.input.sprint = false;
                    break;
                default:
                    break;
            }
        });

        document.addEventListener("mousemove", (event) => {
            if (!this.pointerLocked || this.options.debug) {
                return;
            }
            this.pendingLook.x += event.movementX;
            this.pendingLook.y += event.movementY;
        });

        document.addEventListener("mousedown", async (event) => {
            if (event.button !== 0) {
                return;
            }
            await this.audio.unlock();
            if (!this.options.debug && !this.pointerLocked) {
                this.requestPointerLock();
                return;
            }
            this.input.fire = true;
        });

        document.addEventListener("mouseup", (event) => {
            if (event.button === 0) {
                this.input.fire = false;
            }
        });

        this.renderer.domElement.addEventListener("click", async () => {
            await this.audio.unlock();
            this.renderer.domElement.focus();
            if (!this.options.debug && !this.pointerLocked) {
                this.requestPointerLock();
            }
        });

        document.addEventListener("pointerlockchange", () => {
            this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
            if (this.pointerLocked) {
                this.beginRun();
                this.ui.hideOverlay();
                this.input.fire = false;
            } else if (!this.options.debug && this.state.mode === "playing" && this.state.wave > 0) {
                this.state.mode = "paused";
                this.ui.showOverlay("paused", {
                    scoreText: `Score ${this.state.score.toLocaleString()}  •  Combo ${this.state.combo.toFixed(1)}`,
                });
                this.input.fire = false;
            }
        });
    }

    exposeDebug() {
        window.render_game_to_text = () => JSON.stringify(this.getTextSnapshot());
        window.advanceTime = async (ms) => {
            const steps = Math.max(1, Math.round(ms / (FIXED_DT * 1000)));
            for (let i = 0; i < steps; i++) {
                this.step(FIXED_DT);
            }
            this.render();
        };
        window.__fpsZombieDebug = {
            reset: (seed) => {
                const nextSeed = Number.isFinite(seed) ? Number(seed) >>> 0 : this.baseSeed;
                this.prepareRun(nextSeed);
                if (this.options.debug) {
                    this.beginRun();
                }
            },
            setInput: (payload = {}) => {
                Object.assign(this.input, {
                    forward: Boolean(payload.forward ?? this.input.forward),
                    backward: Boolean(payload.backward ?? this.input.backward),
                    left: Boolean(payload.left ?? this.input.left),
                    right: Boolean(payload.right ?? this.input.right),
                    sprint: Boolean(payload.sprint ?? this.input.sprint),
                    fire: Boolean(payload.fire ?? this.input.fire),
                    reload: Boolean(payload.reload ?? false),
                    melee: Boolean(payload.melee ?? false),
                    lookX: Number(payload.lookX ?? this.input.lookX),
                    lookY: Number(payload.lookY ?? this.input.lookY),
                });
            },
        };
    }

    requestPointerLock() {
        if (this.options.debug) {
            this.beginRun();
            this.ui.hideOverlay();
            return;
        }
        this.renderer.domElement.requestPointerLock?.();
    }

    prepareRun(seed) {
        this.baseSeed = seed >>> 0;
        this.rng = createRng(this.baseSeed);
        this.enemyId = 0;
        this.clearDynamic();

        this.world.barrels.forEach((barrel) => {
            barrel.exploded = false;
            barrel.armed = false;
            barrel.collider.active = true;
            barrel.group.visible = true;
            barrel.group.scale.set(1, 1, 1);
            barrel.body.material.opacity = 1;
            barrel.body.material.transparent = false;
        });
        this.world.setBarrelsActive(false);

        this.player = {
            position: new THREE.Vector3(0, 0, 26),
            velocity: new THREE.Vector3(),
            externalVelocity: new THREE.Vector3(),
            yaw: 0,
            pitch: -0.04,
            health: GAME_CONFIG.maxHealth,
            stamina: GAME_CONFIG.maxStamina,
            ammo: GAME_CONFIG.maxAmmo,
            reserveAmmo: GAME_CONFIG.startingReserveAmmo,
            maxAmmo: GAME_CONFIG.maxAmmo,
            fireCooldown: 0,
            reloadTimer: 0,
            isReloading: false,
            meleeCooldown: 0,
        };

        this.state = {
            mode: this.options.autostart && this.options.debug ? "playing" : "intro",
            runStarted: false,
            wave: 0,
            totalWaves: WAVE_CONFIGS.length,
            objective: "Deploy and survive the breach.",
            score: 0,
            combo: 1,
            comboTimer: 0,
            interWaveTimer: 0,
            waveConfig: null,
            spawnQueue: [],
            spawnTimer: 0,
            waveClearProcessed: false,
            enemiesAlive: 0,
            kills: 0,
        };

        this.pendingLook.x = 0;
        this.pendingLook.y = 0;
        this.crosshairKick = 0;
        this.screenShake = 0;
        this.slowMoTimer = 0;
        this.slowMoScale = 1;

        Object.assign(this.input, {
            forward: false,
            backward: false,
            left: false,
            right: false,
            sprint: false,
            reload: false,
            melee: false,
            fire: false,
            lookX: 0,
            lookY: 0,
        });
        this.prevDebugButtons.reload = false;
        this.prevDebugButtons.melee = false;

        this.camera.position.set(0, 0, 0);
        this.ui.showOverlay("intro");
        this.ui.update(this.getHudSnapshot(), 0);
        this.render();
    }

    clearDynamic() {
        for (const key of ["enemies", "pickups", "tracers", "particles"]) {
            this.dynamic[key].forEach((entry) => {
                const node = entry.mesh ?? entry.group ?? entry.line;
                if (node) {
                    this.scene.remove(node);
                }
            });
            this.dynamic[key] = [];
        }
    }

    beginRun() {
        if (!this.state.runStarted) {
            this.state.runStarted = true;
            this.state.mode = "playing";
            this.startWave(1);
            this.ui.hideOverlay();
            return;
        }
        if (this.state.mode === "paused" || this.state.mode === "intro") {
            this.state.mode = "playing";
            this.ui.hideOverlay();
        }
    }

    restartRun() {
        const nextSeed = this.options.seedProvided ? this.baseSeed : Date.now() >>> 0;
        this.prepareRun(nextSeed);
        if (this.options.debug) {
            this.beginRun();
            this.ui.hideOverlay();
        } else {
            this.requestPointerLock();
        }
    }

    handleStartAction() {
        this.audio.unlock();
        if (this.options.debug) {
            this.beginRun();
            this.ui.hideOverlay();
        } else {
            this.requestPointerLock();
        }
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    loop(timestamp) {
        const delta = Math.min(0.05, (timestamp - this.lastFrame) / 1000);
        this.lastFrame = timestamp;
        if (!this.options.debug) {
            this.accumulator += delta;
            while (this.accumulator >= FIXED_DT) {
                this.step(FIXED_DT);
                this.accumulator -= FIXED_DT;
            }
        }
        this.render();
        requestAnimationFrame((ts) => this.loop(ts));
    }

    step(dt) {
        const timeScale = this.slowMoTimer > 0 ? this.slowMoScale : 1;
        const scaledDt = dt * timeScale;
        this.elapsed += scaledDt;

        this.handleDebugEdges();
        this.updatePlayerLook(scaledDt);

        if (this.state.mode === "playing") {
            this.updatePlayer(scaledDt);
            this.updateDirector(scaledDt);
            this.updateEnemies(scaledDt);
            this.updatePickups(scaledDt);
        }

        this.updateEffects(scaledDt);
        this.world.update(scaledDt, this.elapsed);
        this.audio.update(scaledDt, this.player.health / GAME_CONFIG.maxHealth, this.state.mode);

        this.player.fireCooldown = Math.max(0, this.player.fireCooldown - scaledDt);
        this.player.meleeCooldown = Math.max(0, this.player.meleeCooldown - scaledDt);
        this.player.reloadTimer = Math.max(0, this.player.reloadTimer - scaledDt);

        if (this.player.isReloading && this.player.reloadTimer <= 0) {
            this.finishReload();
        }

        if (this.state.comboTimer > 0) {
            this.state.comboTimer = Math.max(0, this.state.comboTimer - scaledDt);
            if (this.state.comboTimer === 0) {
                this.state.combo = 1;
            }
        }

        this.crosshairKick = Math.max(0, this.crosshairKick - scaledDt * 5.5);
        this.screenShake = Math.max(0, this.screenShake - scaledDt * 2.6);
        this.slowMoTimer = Math.max(0, this.slowMoTimer - dt);
        this.slowMoScale = this.slowMoTimer > 0 ? this.slowMoScale : 1;

        this.state.enemiesAlive = this.dynamic.enemies.length;
        this.refreshObjective();
        this.ui.update(this.getHudSnapshot(), scaledDt);
    }

    handleDebugEdges() {
        if (!this.options.debug) {
            return;
        }
        if (this.input.reload && !this.prevDebugButtons.reload) {
            this.tryReload();
        }
        if (this.input.melee && !this.prevDebugButtons.melee) {
            this.tryMelee();
        }
        this.prevDebugButtons.reload = this.input.reload;
        this.prevDebugButtons.melee = this.input.melee;
    }

    updatePlayerLook(dt) {
        let lookX = 0;
        let lookY = 0;

        if (this.pointerLocked) {
            lookX += this.pendingLook.x * 0.0022;
            lookY += this.pendingLook.y * 0.0018;
        }

        if (this.options.debug) {
            lookX += this.input.lookX * dt * 1.45;
            lookY += this.input.lookY * dt * 1.35;
        }

        this.pendingLook.x = 0;
        this.pendingLook.y = 0;

        this.player.yaw -= lookX;
        this.player.pitch = clamp(this.player.pitch - lookY, -1.1, 1.05);
    }

    updatePlayer(dt) {
        const interactive = this.options.debug || this.pointerLocked;
        if (!interactive) {
            return;
        }

        const forward = Number(this.input.forward) - Number(this.input.backward);
        const strafe = Number(this.input.right) - Number(this.input.left);
        const moveIntent = new THREE.Vector3(strafe, 0, -forward);

        const moving = moveIntent.lengthSq() > 0;
        if (moving) {
            moveIntent.normalize();
            moveIntent.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
        }

        const canSprint = this.input.sprint && moving && this.player.stamina > 4 && !this.player.isReloading;
        const speed = canSprint ? GAME_CONFIG.sprintSpeed : GAME_CONFIG.walkSpeed;

        if (canSprint) {
            this.player.stamina = Math.max(0, this.player.stamina - GAME_CONFIG.sprintDrain * dt);
        } else {
            this.player.stamina = Math.min(GAME_CONFIG.maxStamina, this.player.stamina + GAME_CONFIG.staminaRegen * dt);
        }

        this.player.velocity.copy(moveIntent).multiplyScalar(speed);
        this.player.externalVelocity.lerp(this.tmpVecA.set(0, 0, 0), 1 - Math.exp(-5.5 * dt));

        const totalMove = this.tmpVecB.copy(this.player.velocity).add(this.player.externalVelocity).multiplyScalar(dt);
        moveAndCollide(this.player.position, totalMove, GAME_CONFIG.playerRadius, this.world.colliders);

        if (this.input.fire) {
            this.fireWeapon();
        }

        const bobAmount = moving ? (canSprint ? 0.14 : 0.08) : 0.02;
        const bob = Math.sin(this.elapsed * (canSprint ? 12 : 8)) * bobAmount;
        const sway = Math.cos(this.elapsed * (canSprint ? 10 : 7)) * bobAmount * 0.55;

        this.cameraRig.position.set(this.player.position.x, GAME_CONFIG.playerHeight, this.player.position.z);
        this.cameraRig.rotation.y = this.player.yaw;
        this.pitchPivot.rotation.x = this.player.pitch;

        this.weapon.position.set(
            0.56 + sway * 0.12,
            -0.46 + bob * 0.08 - this.crosshairKick * 0.08,
            -0.92 + this.crosshairKick * 0.22,
        );
        this.weapon.rotation.set(
            -0.08 - bob * 0.04,
            Math.PI + 0.03 + sway * 0.04,
            0.02 + sway * 0.03,
        );
        this.muzzleFlash.material.opacity = Math.max(0, this.muzzleFlash.material.opacity - dt * 12);
    }

    fireWeapon() {
        if (this.player.fireCooldown > 0 || this.player.isReloading || this.state.mode !== "playing") {
            return;
        }

        if (this.player.ammo <= 0) {
            this.player.fireCooldown = 0.14;
            this.audio.playDryClick();
            return;
        }

        this.player.ammo -= 1;
        this.player.fireCooldown = 1 / GAME_CONFIG.fireRate;
        this.crosshairKick = Math.min(1.2, this.crosshairKick + 0.45);
        this.muzzleFlash.material.opacity = 1;
        this.audio.playShot();

        const origin = new THREE.Vector3();
        this.camera.getWorldPosition(origin);

        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.camera.getWorldQuaternion(this.tmpQuat));
        direction.x += range(this.rng, -GAME_CONFIG.bulletSpread, GAME_CONFIG.bulletSpread);
        direction.y += range(this.rng, -GAME_CONFIG.bulletSpread * 0.75, GAME_CONFIG.bulletSpread * 0.75);
        direction.z += range(this.rng, -GAME_CONFIG.bulletSpread, GAME_CONFIG.bulletSpread);
        direction.normalize();

        this.raycaster.set(origin, direction);
        this.raycaster.far = GAME_CONFIG.bulletRange;

        const targets = [];
        this.dynamic.enemies.forEach((enemy) => targets.push(...enemy.hitMeshes));
        this.world.barrels.forEach((barrel) => {
            if (!barrel.exploded) {
                targets.push(barrel.body, barrel.stripe);
            }
        });

        const intersections = this.raycaster.intersectObjects(targets, false);
        const endPoint = origin.clone().add(direction.clone().multiplyScalar(GAME_CONFIG.bulletRange));

        if (intersections.length > 0) {
            const hit = intersections[0];
            endPoint.copy(hit.point);
            if (hit.object.userData.enemyRef) {
                this.damageEnemy(hit.object.userData.enemyRef, GAME_CONFIG.bulletDamage, hit.point, direction.clone().multiplyScalar(2.8));
                this.ui.flashHitMarker();
                this.audio.playHit();
            } else if (hit.object.userData.barrelRef) {
                this.explodeBarrel(hit.object.userData.barrelRef);
            }
        }

        const tracer = createTracer(origin, endPoint);
        this.scene.add(tracer);
        this.dynamic.tracers.push({ line: tracer, life: 0.08 });

        this.spawnParticles(endPoint, intersections.length > 0 ? 0xff784d : 0xffd699, intersections.length > 0 ? 7 : 3, 2.2);
    }

    tryReload() {
        if (this.player.isReloading || this.player.ammo >= GAME_CONFIG.maxAmmo || this.player.reserveAmmo <= 0 || this.state.mode === "gameover" || this.state.mode === "victory") {
            return;
        }
        this.player.isReloading = true;
        this.player.reloadTimer = GAME_CONFIG.reloadDuration;
        this.audio.playReload();
    }

    finishReload() {
        const needed = GAME_CONFIG.maxAmmo - this.player.ammo;
        const transfer = Math.min(needed, this.player.reserveAmmo);
        this.player.reserveAmmo -= transfer;
        this.player.ammo += transfer;
        this.player.isReloading = false;
    }

    tryMelee() {
        if (this.player.meleeCooldown > 0 || this.state.mode !== "playing") {
            return;
        }
        this.player.meleeCooldown = GAME_CONFIG.meleeCooldown;
        this.screenShake = Math.max(this.screenShake, 0.18);
        this.audio.playMelee();

        const forward = forwardFromAngles(this.player.yaw, 0);
        const hits = [];

        for (const enemy of this.dynamic.enemies) {
            const toEnemy = this.tmpVecA.copy(enemy.position).sub(this.player.position);
            const dist = toEnemy.length();
            if (dist > GAME_CONFIG.meleeRange) {
                continue;
            }
            toEnemy.normalize();
            const alignment = toEnemy.dot(forward);
            if (alignment < 0.18) {
                continue;
            }
            hits.push({ enemy, dist });
        }

        hits.sort((a, b) => a.dist - b.dist);
        hits.slice(0, 3).forEach(({ enemy }) => {
            const push = enemy.position.clone().sub(this.player.position).normalize().multiplyScalar(GAME_CONFIG.meleePush);
            enemy.knockback.add(push);
            enemy.stunTimer = Math.max(enemy.stunTimer, 0.55);
            this.damageEnemy(enemy, GAME_CONFIG.meleeDamage, enemy.position.clone().setY(1.2), push.multiplyScalar(0.24));
        });
    }

    updateDirector(dt) {
        if (!this.state.waveConfig) {
            return;
        }

        if (this.state.interWaveTimer > 0) {
            this.state.interWaveTimer = Math.max(0, this.state.interWaveTimer - dt);
            if (this.state.interWaveTimer === 0 && this.state.wave < this.state.totalWaves) {
                this.startWave(this.state.wave + 1);
            }
            return;
        }

        if (this.state.spawnQueue.length > 0) {
            this.state.spawnTimer -= dt;
            if (this.state.spawnTimer <= 0) {
                const nextType = this.state.spawnQueue.shift();
                this.spawnEnemy(nextType);
                this.state.spawnTimer = this.state.waveConfig.spawnInterval * range(this.rng, 0.82, 1.12);
            }
            return;
        }

        if (!this.state.waveClearProcessed && this.dynamic.enemies.length === 0) {
            this.state.waveClearProcessed = true;
            if (this.state.wave === this.state.totalWaves) {
                this.handleVictory();
                return;
            }
            this.triggerSlowMo(0.32, 0.45);
            this.ui.showBanner("Wave Clear", "Resupply window open", 1.8);
            this.audio.playWave();
            this.spawnSupportPickups();
            this.state.interWaveTimer = GAME_CONFIG.waveDelay;
        }
    }

    startWave(waveNumber) {
        this.state.wave = waveNumber;
        this.state.waveConfig = WAVE_CONFIGS[waveNumber - 1];
        this.state.waveClearProcessed = false;
        this.state.interWaveTimer = 0;
        this.state.spawnTimer = 0.4;

        const queue = [];
        Object.entries(this.state.waveConfig.composition).forEach(([type, count]) => {
            for (let i = 0; i < count; i++) {
                queue.push(type);
            }
        });
        this.state.spawnQueue = shuffle(this.rng, queue);

        if (waveNumber >= 3) {
            this.world.setBarrelsActive(true);
        }

        this.ui.showBanner(this.state.waveConfig.banner, this.state.waveConfig.subtitle, 2.6);
        this.audio.playWave();
    }

    spawnEnemy(typeId) {
        const config = ENEMY_TYPES[typeId];
        const spawn = this.pickSpawnPoint();
        const visual = createEnemyMesh(config);
        const baseHeight = visual.group.position.y;
        visual.group.position.set(spawn.x, baseHeight, spawn.z);
        this.scene.add(visual.group);

        const enemy = {
            id: ++this.enemyId,
            typeId,
            config,
            mesh: visual.group,
            hitMeshes: visual.hitMeshes,
            animatedParts: visual.animatedParts,
            materials: visual.materials,
            baseEmissive: visual.materials.map((material) => material.emissiveIntensity ?? 0),
            baseHeight,
            position: new THREE.Vector3(spawn.x, 0, spawn.z),
            health: config.health,
            radius: config.radius,
            attackCooldown: range(this.rng, 0.15, config.attackCooldown),
            knockback: new THREE.Vector3(),
            stunTimer: 0,
            hitTimer: 0,
            stridePhase: range(this.rng, 0, Math.PI * 2),
        };

        enemy.hitMeshes.forEach((mesh) => {
            mesh.userData.enemyRef = enemy;
        });

        this.dynamic.enemies.push(enemy);

        if (typeId === "brute") {
            this.ui.showBanner("Brute Incoming", "Hold the lane and focus fire", 2.8);
            this.audio.playBrute();
        }
    }

    pickSpawnPoint() {
        const choices = shuffle(this.rng, this.world.spawnPoints);
        const playerPos = this.player.position;
        for (const spawn of choices) {
            if (distanceXZ(spawn, playerPos) > 12) {
                return spawn;
            }
        }
        return choices[0];
    }

    updateEnemies(dt) {
        for (let i = this.dynamic.enemies.length - 1; i >= 0; i--) {
            const enemy = this.dynamic.enemies[i];
            enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
            enemy.stunTimer = Math.max(0, enemy.stunTimer - dt);
            enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);

            const toPlayer = this.tmpVecA.copy(this.player.position).sub(enemy.position);
            const distance = toPlayer.length();
            const direction = distance > 0.001 ? toPlayer.normalize() : this.tmpVecB.set(0, 0, 1);

            const avoidance = this.tmpVecC.set(0, 0, 0);
            for (const other of this.dynamic.enemies) {
                if (other === enemy) continue;
                const away = enemy.position.clone().sub(other.position);
                const awayDist = away.length();
                const minDist = enemy.radius + other.radius + 0.42;
                if (awayDist > 0 && awayDist < minDist) {
                    avoidance.add(away.normalize().multiplyScalar((minDist - awayDist) * 0.65));
                }
            }

            let move = direction.clone().add(avoidance).normalize();
            if (enemy.stunTimer > 0) {
                move.multiplyScalar(0.18);
            }
            move.multiplyScalar(enemy.config.speed * dt);

            enemy.knockback.lerp(this.tmpVecB.set(0, 0, 0), 1 - Math.exp(-4.8 * dt));
            move.add(enemy.knockback.clone().multiplyScalar(dt));

            if (distance > enemy.radius + GAME_CONFIG.playerRadius + 0.9) {
                moveAndCollide(enemy.position, move, enemy.radius, this.world.colliders);
            }

            if (distance <= enemy.radius + GAME_CONFIG.playerRadius + 0.85 && enemy.attackCooldown <= 0) {
                enemy.attackCooldown = enemy.config.attackCooldown;
                const push = enemy.position.clone().sub(this.player.position).normalize().multiplyScalar(enemy.typeId === "brute" ? 7.8 : 4.8);
                this.player.externalVelocity.add(push.multiplyScalar(-1));
                this.damagePlayer(enemy.config.damage, enemy.position);
            }

            const strideSpeed = enemy.typeId === "runner" ? 11 : enemy.typeId === "brute" ? 4.8 : 7.6;
            const stride = Math.sin(this.elapsed * strideSpeed + enemy.stridePhase);
            enemy.mesh.position.set(enemy.position.x, enemy.baseHeight + stride * 0.06, enemy.position.z);
            enemy.mesh.lookAt(this.player.position.x, enemy.baseHeight, this.player.position.z);

            enemy.animatedParts.forEach((part, index) => {
                part.rotation.x = stride * (index % 2 === 0 ? 0.58 : -0.58);
            });

            enemy.materials.forEach((material, index) => {
                material.emissiveIntensity = enemy.baseEmissive[index] + enemy.hitTimer * 2.3;
            });
        }
    }

    damageEnemy(enemy, amount, hitPoint, pushImpulse = null) {
        enemy.health -= amount;
        enemy.hitTimer = 0.12;
        if (pushImpulse) {
            enemy.knockback.add(pushImpulse);
        }
        this.spawnParticles(hitPoint, enemy.typeId === "brute" ? 0x8fdcff : 0xff4d4d, enemy.typeId === "brute" ? 9 : 6, enemy.typeId === "brute" ? 3.8 : 2.8);

        if (enemy.health > 0) {
            return;
        }

        this.killEnemy(enemy, hitPoint);
    }

    killEnemy(enemy, hitPoint) {
        const index = this.dynamic.enemies.indexOf(enemy);
        if (index !== -1) {
            this.dynamic.enemies.splice(index, 1);
        }
        this.scene.remove(enemy.mesh);
        this.audio.playKill();
        this.spawnParticles(hitPoint ?? enemy.position.clone().setY(1), enemy.typeId === "brute" ? 0x8fdcff : 0xff6a54, enemy.typeId === "brute" ? 18 : 10, enemy.typeId === "brute" ? 4.5 : 3.2);

        this.state.kills += 1;
        this.state.comboTimer = GAME_CONFIG.comboWindow;
        this.state.combo = clamp(this.state.combo + 0.22, 1, 4.5);
        this.state.score += Math.round(enemy.config.score * this.state.combo);

        if (enemy.typeId === "brute") {
            this.triggerSlowMo(0.52, 0.4);
            this.ui.showBanner("Brute Down", "Finish the remaining infected", 2.2);
        }

        if (this.rng() <= enemy.config.dropChance) {
            const pickupType = pickWeighted(this.rng, [
                { value: "ammo", weight: this.player.reserveAmmo < 90 ? 4 : 2 },
                { value: "medkit", weight: this.player.health < 55 ? 3 : 1 },
                { value: "charge", weight: this.player.stamina < 45 ? 2 : 1.4 },
            ]);
            this.spawnPickup(pickupType, enemy.position.x, enemy.position.z);
        }
    }

    damagePlayer(amount, sourcePosition) {
        if (this.state.mode !== "playing") {
            return;
        }
        this.player.health = Math.max(0, this.player.health - amount);
        this.screenShake = Math.max(this.screenShake, GAME_CONFIG.damageShake);
        this.ui.flashDamage();
        this.audio.playDamage();

        if (sourcePosition) {
            const away = this.player.position.clone().sub(sourcePosition).normalize().multiplyScalar(3.5);
            this.player.externalVelocity.add(away);
        }

        if (this.player.health <= 0) {
            this.handleGameOver();
        }
    }

    spawnPickup(type, x, z) {
        const visual = createPickupMesh(type);
        visual.group.position.set(x, 1.0, z);
        this.scene.add(visual.group);
        this.dynamic.pickups.push({
            type,
            group: visual.group,
            core: visual.core,
            ring: visual.ring,
            x,
            z,
            bob: range(this.rng, 0, Math.PI * 2),
        });
    }

    spawnSupportPickups() {
        const supportDrops = [];
        if (this.player.reserveAmmo < 120) supportDrops.push({ type: "ammo", x: -16, z: 16 });
        if (this.player.health < 85) supportDrops.push({ type: "medkit", x: 18, z: 16 });
        supportDrops.push({ type: "charge", x: 0, z: 20 });
        supportDrops.forEach((drop) => this.spawnPickup(drop.type, drop.x, drop.z));
    }

    updatePickups(dt) {
        for (let i = this.dynamic.pickups.length - 1; i >= 0; i--) {
            const pickup = this.dynamic.pickups[i];
            pickup.bob += dt * 2.4;
            pickup.group.position.y = 1.0 + Math.sin(pickup.bob) * 0.16;
            pickup.group.rotation.y += dt * 1.8;
            pickup.ring.rotation.z += dt * 1.1;

            if (distanceXZ(this.player.position, pickup) <= GAME_CONFIG.pickupRadius) {
                this.collectPickup(pickup);
                this.dynamic.pickups.splice(i, 1);
            }
        }
    }

    collectPickup(pickup) {
        const definition = PICKUP_TYPES[pickup.type];
        if (pickup.type === "ammo") {
            this.player.reserveAmmo = Math.min(GAME_CONFIG.maxReserveAmmo, this.player.reserveAmmo + definition.amount);
        } else if (pickup.type === "medkit") {
            this.player.health = Math.min(GAME_CONFIG.maxHealth, this.player.health + definition.amount);
        } else if (pickup.type === "charge") {
            this.player.stamina = Math.min(GAME_CONFIG.maxStamina, this.player.stamina + definition.amount);
        }

        this.scene.remove(pickup.group);
        this.audio.playPickup(pickup.type);
        this.ui.showBanner(definition.label, "Recovered on the move", 1.1);
    }

    explodeBarrel(barrel) {
        if (barrel.exploded || !barrel.armed) {
            return;
        }
        barrel.exploded = true;
        barrel.group.visible = false;
        barrel.collider.active = false;
        this.audio.playExplosion();
        this.triggerSlowMo(0.14, 0.62);
        this.screenShake = Math.max(this.screenShake, GAME_CONFIG.explosionShake);

        const origin = new THREE.Vector3(barrel.group.position.x, 0, barrel.group.position.z);
        this.spawnParticles(origin.clone().setY(1), 0xff8b4d, 28, 5.4);

        for (const enemy of [...this.dynamic.enemies]) {
            const dist = distanceXZ(enemy.position, origin);
            if (dist > 6.5) {
                continue;
            }
            const damage = enemy.typeId === "brute" ? 120 : 80;
            const falloff = 1 - dist / 6.5;
            const push = enemy.position.clone().sub(origin).normalize().multiplyScalar(8 * falloff);
            this.damageEnemy(enemy, damage * falloff, enemy.position.clone().setY(1.2), push);
        }

        const playerDist = distanceXZ(this.player.position, origin);
        if (playerDist < 6) {
            this.damagePlayer(Math.round((1 - playerDist / 6) * 24), origin);
        }
    }

    updateEffects(dt) {
        for (let i = this.dynamic.tracers.length - 1; i >= 0; i--) {
            const tracer = this.dynamic.tracers[i];
            tracer.life -= dt;
            tracer.line.material.opacity = Math.max(0, tracer.life / 0.08);
            if (tracer.life <= 0) {
                this.scene.remove(tracer.line);
                this.dynamic.tracers.splice(i, 1);
            }
        }

        for (let i = this.dynamic.particles.length - 1; i >= 0; i--) {
            const particle = this.dynamic.particles[i];
            particle.life -= dt;
            particle.velocity.y -= dt * 6.2;
            particle.mesh.position.addScaledVector(particle.velocity, dt);
            particle.mesh.material.opacity = Math.max(0, particle.life / particle.maxLife);
            if (particle.life <= 0) {
                this.scene.remove(particle.mesh);
                this.dynamic.particles.splice(i, 1);
            }
        }
    }

    spawnParticles(position, color, count, power) {
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.06, 6, 6),
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.9,
                }),
            );
            mesh.position.copy(position);
            this.scene.add(mesh);
            this.dynamic.particles.push({
                mesh,
                velocity: new THREE.Vector3(
                    range(this.rng, -1, 1) * power,
                    range(this.rng, 0.2, 1.2) * power,
                    range(this.rng, -1, 1) * power,
                ),
                life: range(this.rng, 0.18, 0.45),
                maxLife: 0.45,
            });
        }
    }

    triggerSlowMo(duration, scale) {
        this.slowMoTimer = duration;
        this.slowMoScale = scale;
    }

    refreshObjective() {
        if (this.state.mode === "gameover") {
            this.state.objective = "Run collapsed. Reset and secure the lane.";
            return;
        }
        if (this.state.mode === "victory") {
            this.state.objective = "Extraction secured. The quarantine yard holds.";
            return;
        }
        if (!this.state.runStarted) {
            this.state.objective = this.options.debug
                ? "Debug deployment armed. Step time and test the breach."
                : "Deploy and survive the breach.";
            return;
        }
        if (this.state.interWaveTimer > 0) {
            this.state.objective = `Reposition and reload. Wave ${this.state.wave + 1} in ${this.state.interWaveTimer.toFixed(1)}s.`;
            return;
        }

        const queueCount = this.state.spawnQueue.length;
        const alive = this.dynamic.enemies.length;
        if (this.state.wave === this.state.totalWaves && this.dynamic.enemies.some((enemy) => enemy.typeId === "brute")) {
            this.state.objective = `Focus the brute. ${alive} infected remain in the yard.`;
            return;
        }
        this.state.objective = `Hold Wave ${this.state.wave}. ${queueCount + alive} infected still in play.`;
    }

    handleGameOver() {
        this.state.mode = "gameover";
        this.audio.playGameOver();
        this.input.fire = false;
        if (!this.options.debug && this.pointerLocked) {
            document.exitPointerLock?.();
        }
        this.ui.showOverlay("gameover", {
            scoreText: `Final score ${this.state.score.toLocaleString()}  •  ${this.state.kills} kills`,
        });
    }

    handleVictory() {
        this.state.mode = "victory";
        this.audio.playVictory();
        this.input.fire = false;
        if (!this.options.debug && this.pointerLocked) {
            document.exitPointerLock?.();
        }
        this.ui.showOverlay("victory", {
            scoreText: `Final score ${this.state.score.toLocaleString()}  •  ${this.state.kills} kills`,
        });
    }

    getHudSnapshot() {
        return {
            wave: Math.max(1, this.state.wave || 1),
            totalWaves: this.state.totalWaves,
            score: this.state.score,
            combo: this.state.combo,
            objective: this.state.objective,
            enemiesAlive: this.dynamic.enemies.length,
            crosshairKick: this.crosshairKick,
            player: {
                health: this.player.health,
                stamina: this.player.stamina,
                ammo: this.player.ammo,
                reserveAmmo: this.player.reserveAmmo,
                maxAmmo: GAME_CONFIG.maxAmmo,
            },
        };
    }

    getTextSnapshot() {
        const facing = forwardFromAngles(this.player.yaw, this.player.pitch);
        return {
            mode: this.state.mode,
            wave: this.state.wave,
            score: this.state.score,
            combo: Number(this.state.combo.toFixed(2)),
            player: {
                x: Number(this.player.position.x.toFixed(2)),
                y: Number(GAME_CONFIG.playerHeight.toFixed(2)),
                z: Number(this.player.position.z.toFixed(2)),
                yaw: Number(this.player.yaw.toFixed(3)),
                pitch: Number(this.player.pitch.toFixed(3)),
                health: Number(this.player.health.toFixed(1)),
                stamina: Number(this.player.stamina.toFixed(1)),
                ammo: this.player.ammo,
                reserveAmmo: this.player.reserveAmmo,
                reloading: this.player.isReloading,
            },
            enemies: this.dynamic.enemies.map((enemy) => ({
                type: enemy.typeId,
                x: Number(enemy.position.x.toFixed(2)),
                z: Number(enemy.position.z.toFixed(2)),
                health: Number(enemy.health.toFixed(1)),
            })),
            pickups: this.dynamic.pickups.map((pickup) => ({
                type: pickup.type,
                x: Number(pickup.x.toFixed(2)),
                z: Number(pickup.z.toFixed(2)),
            })),
            objective: this.state.objective,
            cameraFacing: {
                x: Number(facing.x.toFixed(3)),
                y: Number(facing.y.toFixed(3)),
                z: Number(facing.z.toFixed(3)),
            },
            coordSystem: "Origin near extraction gate. +X east/right, -X west/left, -Z north/forward into the yard, +Z south/back toward extraction.",
        };
    }

    render() {
        this.cameraRig.position.set(this.player.position.x, GAME_CONFIG.playerHeight, this.player.position.z);
        this.cameraRig.rotation.y = this.player.yaw;
        this.pitchPivot.rotation.x = this.player.pitch;

        if (this.screenShake > 0) {
            this.screenShakeOffset.set(
                range(this.rng, -0.08, 0.08) * this.screenShake,
                range(this.rng, -0.06, 0.06) * this.screenShake,
                range(this.rng, -0.04, 0.04) * this.screenShake,
            );
        } else {
            this.screenShakeOffset.set(0, 0, 0);
        }
        this.camera.position.copy(this.screenShakeOffset);
        this.renderer.render(this.scene, this.camera);
    }
}

new FPSZombieMeraviglia();
