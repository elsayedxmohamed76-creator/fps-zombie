import * as THREE from "three";
import { GAME_CONFIG } from "./config.js";
import { clamp, range } from "./utils.js";

function makeCanvasTexture(size, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    draw(ctx, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
}

function createAsphaltTexture() {
    return makeCanvasTexture(1024, (ctx, size) => {
        ctx.fillStyle = "#121518";
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 6000; i++) {
            const shade = Math.floor(16 + Math.random() * 32);
            ctx.fillStyle = `rgba(${shade}, ${shade + 8}, ${shade + 10}, ${0.18 + Math.random() * 0.14})`;
            ctx.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 3, 2 + Math.random() * 3);
        }
        ctx.strokeStyle = "rgba(255, 162, 84, 0.18)";
        ctx.lineWidth = 10;
        ctx.strokeRect(80, 80, size - 160, size - 160);
        ctx.strokeStyle = "rgba(125, 211, 255, 0.15)";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(size * 0.2, size * 0.76);
        ctx.lineTo(size * 0.8, size * 0.76);
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 212, 120, 0.1)";
        for (let i = 0; i < 22; i++) {
            ctx.fillRect(140 + i * 34, size * 0.52, 18, 160);
        }
    });
}

function createFenceTexture() {
    return makeCanvasTexture(512, (ctx, size) => {
        ctx.fillStyle = "#111820";
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = "rgba(125, 211, 255, 0.22)";
        ctx.lineWidth = 4;
        for (let i = -size; i <= size * 2; i += 46) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + size, size);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(i, size);
            ctx.lineTo(i + size, 0);
            ctx.stroke();
        }
    });
}

function createBarrierTexture() {
    return makeCanvasTexture(512, (ctx, size) => {
        ctx.fillStyle = "#2b2f34";
        ctx.fillRect(0, 0, size, size);
        for (let i = -size; i < size * 2; i += 60) {
            ctx.fillStyle = i % 120 === 0 ? "#ff7a2b" : "#111820";
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + 50, 0);
            ctx.lineTo(i + size / 2 + 50, size);
            ctx.lineTo(i + size / 2, size);
            ctx.closePath();
            ctx.fill();
        }
    });
}

function createDustCloud(scene) {
    const count = 380;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        positions[i * 3] = range(Math.random, -42, 42);
        positions[i * 3 + 1] = 0.5 + Math.random() * 10;
        positions[i * 3 + 2] = range(Math.random, -42, 42);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xc18a64,
        size: 0.2,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    return points;
}

function addBoxCollider(colliders, x, z, halfX, halfZ, active = true) {
    const collider = { x, z, halfX, halfZ, active };
    colliders.push(collider);
    return collider;
}

function createVehicle(scene, options, colliders) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(options.size.x, options.size.y, options.size.z),
        new THREE.MeshStandardMaterial({
            color: options.color,
            roughness: 0.62,
            metalness: 0.28,
            emissive: options.emissive ?? 0x000000,
        }),
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(options.cabin.x, options.cabin.y, options.cabin.z),
        new THREE.MeshStandardMaterial({
            color: options.cabinColor ?? 0xe7edf5,
            roughness: 0.55,
            metalness: 0.12,
        }),
    );
    cabin.position.set(0, options.size.y * 0.38, options.cabinOffsetZ ?? 0);
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    group.add(cabin);

    for (const wheel of options.wheels) {
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.46, 0.46, 0.34, 18),
            new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.86 }),
        );
        mesh.rotation.z = Math.PI / 2;
        mesh.position.set(wheel[0], -options.size.y * 0.3, wheel[1]);
        mesh.castShadow = true;
        group.add(mesh);
    }

    if (options.lightBar) {
        const lightBar = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 0.18, 0.42),
            new THREE.MeshStandardMaterial({
                color: 0x111820,
                emissive: 0x365e7d,
                emissiveIntensity: 1.4,
            }),
        );
        lightBar.position.set(0, options.size.y * 0.75, 0);
        group.add(lightBar);
    }

    group.position.set(options.position.x, options.size.y * 0.5, options.position.z);
    group.rotation.y = options.rotationY ?? 0;
    scene.add(group);
    addBoxCollider(colliders, options.position.x, options.position.z, options.size.x * 0.62, options.size.z * 0.62);
    return group;
}

function createTower(scene, x, z, rotationY, flickerLights) {
    const tower = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x182430, roughness: 0.82, metalness: 0.2 });
    const legOffsets = [
        [-0.55, -0.55],
        [0.55, -0.55],
        [-0.55, 0.55],
        [0.55, 0.55],
    ];
    for (const [lx, lz] of legOffsets) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 7.2, 0.16), material);
        leg.position.set(lx, 3.6, lz);
        leg.castShadow = true;
        tower.add(leg);
    }
    const platform = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 1.7), material);
    platform.position.y = 7.1;
    platform.castShadow = true;
    platform.receiveShadow = true;
    tower.add(platform);

    const lampHead = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.36, 0.7),
        new THREE.MeshStandardMaterial({ color: 0x243443, emissive: 0x36728d, emissiveIntensity: 1.1 }),
    );
    lampHead.position.set(0, 7.6, 0);
    lampHead.castShadow = true;
    tower.add(lampHead);

    const spot = new THREE.SpotLight(0x7dd3ff, 2.4, 42, Math.PI / 5, 0.35, 1.6);
    spot.position.set(0, 7.3, 0);
    spot.target.position.set(0, 0, 8);
    spot.castShadow = true;
    tower.add(spot);
    tower.add(spot.target);

    tower.position.set(x, 0, z);
    tower.rotation.y = rotationY;
    scene.add(tower);
    flickerLights.push({ light: spot, phase: Math.random() * Math.PI * 2, base: 2.1 + Math.random() * 0.4 });
}

function createBarricade(scene, position, rotationY, colliders, barrierTexture) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 1.1, 0.9),
        new THREE.MeshStandardMaterial({ map: barrierTexture, roughness: 0.88 }),
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    for (const offset of [-1.25, 1.25]) {
        const beam = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 1.3, 0.18),
            new THREE.MeshStandardMaterial({ color: 0x111820 }),
        );
        beam.position.set(offset, 0.22, 0);
        beam.castShadow = true;
        group.add(beam);
    }

    group.position.set(position.x, 0.58, position.z);
    group.rotation.y = rotationY;
    scene.add(group);
    addBoxCollider(colliders, position.x, position.z, 1.85, 0.7);
}

function createContainer(scene, position, colliders) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(7.6, 3.3, 2.8),
        new THREE.MeshStandardMaterial({
            color: 0x254054,
            emissive: 0x102638,
            emissiveIntensity: 0.3,
            roughness: 0.72,
            metalness: 0.18,
        }),
    );
    mesh.position.set(position.x, 1.65, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    addBoxCollider(colliders, position.x, position.z, 3.95, 1.55);
}

function createTent(scene, position, colliders) {
    const group = new THREE.Group();
    const roof = new THREE.Mesh(
        new THREE.ConeGeometry(3.3, 1.8, 4),
        new THREE.MeshStandardMaterial({ color: 0xd7d9de, roughness: 0.9 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 3.2;
    roof.castShadow = true;
    group.add(roof);

    for (const [x, z] of [[-2.4, -1.4], [2.4, -1.4], [-2.4, 1.4], [2.4, 1.4]]) {
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8),
            new THREE.MeshStandardMaterial({ color: 0xaeb6c1 }),
        );
        pole.position.set(x, 1.6, z);
        pole.castShadow = true;
        group.add(pole);
    }

    const table = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 0.24, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x465361 }),
    );
    table.position.set(0, 1.0, 0);
    table.castShadow = true;
    table.receiveShadow = true;
    group.add(table);

    group.position.set(position.x, 0, position.z);
    scene.add(group);
    addBoxCollider(colliders, position.x, position.z, 2.8, 2.2);
}

function createBarrel(scene, x, z, colliders) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.46, 1.2, 18),
        new THREE.MeshStandardMaterial({
            color: 0x812d18,
            emissive: 0x180300,
            roughness: 0.54,
            metalness: 0.22,
        }),
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const stripe = new THREE.Mesh(
        new THREE.TorusGeometry(0.43, 0.05, 8, 18),
        new THREE.MeshStandardMaterial({
            color: 0xff8a3d,
            emissive: 0xff5d00,
            emissiveIntensity: 0.2,
            roughness: 0.28,
        }),
    );
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = 0.05;
    group.add(stripe);

    group.position.set(x, 0.62, z);
    scene.add(group);
    const collider = addBoxCollider(colliders, x, z, 0.54, 0.54);
    return {
        group,
        body,
        stripe,
        collider,
        armed: false,
        exploded: false,
        radius: 0.55,
    };
}

export function moveAndCollide(position, delta, radius, colliders) {
    position.x += delta.x;
    resolveCollisions(position, radius, colliders);
    position.z += delta.z;
    resolveCollisions(position, radius, colliders);
}

export function resolveCollisions(position, radius, colliders) {
    const limit = GAME_CONFIG.arenaHalfSize - radius;
    position.x = clamp(position.x, -limit, limit);
    position.z = clamp(position.z, -limit, limit);

    for (const collider of colliders) {
        if (collider.active === false) {
            continue;
        }
        const closestX = clamp(position.x, collider.x - collider.halfX, collider.x + collider.halfX);
        const closestZ = clamp(position.z, collider.z - collider.halfZ, collider.z + collider.halfZ);
        let dx = position.x - closestX;
        let dz = position.z - closestZ;
        let distSq = dx * dx + dz * dz;
        if (distSq >= radius * radius) {
            continue;
        }

        if (distSq < 0.00001) {
            const left = Math.abs(position.x - (collider.x - collider.halfX));
            const right = Math.abs(position.x - (collider.x + collider.halfX));
            const top = Math.abs(position.z - (collider.z - collider.halfZ));
            const bottom = Math.abs(position.z - (collider.z + collider.halfZ));
            const minAxis = Math.min(left, right, top, bottom);
            if (minAxis === left) position.x = collider.x - collider.halfX - radius;
            else if (minAxis === right) position.x = collider.x + collider.halfX + radius;
            else if (minAxis === top) position.z = collider.z - collider.halfZ - radius;
            else position.z = collider.z + collider.halfZ + radius;
            continue;
        }

        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        position.x += (dx / dist) * push;
        position.z += (dz / dist) * push;
    }
}

export function createWorld(scene, rng) {
    scene.background = new THREE.Color(0x05070a);
    scene.fog = new THREE.FogExp2(0x070b10, 0.02);

    const colliders = [];
    const barrels = [];
    const flickerLights = [];

    const ambient = new THREE.HemisphereLight(0xffd2a8, 0x081018, 0.9);
    scene.add(ambient);

    const sunset = new THREE.DirectionalLight(0xff9354, 2.3);
    sunset.position.set(-24, 28, 10);
    sunset.castShadow = true;
    sunset.shadow.mapSize.set(2048, 2048);
    scene.add(sunset);

    const moonFill = new THREE.DirectionalLight(0x7dcfff, 0.45);
    moonFill.position.set(22, 18, -12);
    scene.add(moonFill);

    const floorTexture = createAsphaltTexture();
    floorTexture.repeat.set(3.2, 3.2);
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({
            map: floorTexture,
            color: 0x76614f,
            roughness: 0.96,
            metalness: 0.02,
        }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const fenceTexture = createFenceTexture();
    fenceTexture.repeat.set(6, 1.4);
    const fenceMaterial = new THREE.MeshStandardMaterial({
        map: fenceTexture,
        color: 0x1a2530,
        transparent: true,
        opacity: 0.92,
        roughness: 0.82,
        metalness: 0.12,
    });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x131c24, roughness: 0.9 });

    const boundaries = [
        { size: [76, 5, 1.2], pos: [0, 2.5, -38.5] },
        { size: [76, 5, 1.2], pos: [0, 2.5, 38.5] },
        { size: [1.2, 5, 76], pos: [-38.5, 2.5, 0] },
        { size: [1.2, 5, 76], pos: [38.5, 2.5, 0] },
    ];
    for (const boundary of boundaries) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...boundary.size), wallMaterial);
        mesh.position.set(...boundary.pos);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    }

    const gate = new THREE.Mesh(new THREE.BoxGeometry(12, 4.2, 0.5), fenceMaterial);
    gate.position.set(0, 2.3, 37.8);
    scene.add(gate);

    createTower(scene, -30, -30, Math.PI / 4, flickerLights);
    createTower(scene, 30, -28, -Math.PI / 5, flickerLights);
    createTower(scene, -28, 30, Math.PI / 2.7, flickerLights);
    createTower(scene, 30, 30, -Math.PI / 1.7, flickerLights);

    const barrierTexture = createBarrierTexture();
    createBarricade(scene, { x: -11, z: 7 }, 0.05, colliders, barrierTexture);
    createBarricade(scene, { x: 11, z: 7 }, -0.05, colliders, barrierTexture);
    createBarricade(scene, { x: -6, z: -8 }, Math.PI / 2, colliders, barrierTexture);
    createBarricade(scene, { x: 8, z: -2 }, Math.PI / 2, colliders, barrierTexture);

    createContainer(scene, { x: 0, z: -19 }, colliders);
    createTent(scene, { x: 18, z: 16 }, colliders);

    createVehicle(scene, {
        position: { x: 19, z: -8 },
        size: { x: 4.6, y: 2.0, z: 2.2 },
        cabin: { x: 3.2, y: 1.6, z: 2.0 },
        cabinOffsetZ: -0.1,
        color: 0xdedede,
        cabinColor: 0xf5f8fb,
        wheels: [[-1.65, -0.9], [1.65, -0.9], [-1.65, 0.9], [1.65, 0.9]],
        lightBar: true,
        emissive: 0x0c1720,
        rotationY: -Math.PI / 8,
    }, colliders);

    createVehicle(scene, {
        position: { x: -18, z: 10 },
        size: { x: 5.8, y: 2.2, z: 2.5 },
        cabin: { x: 2.4, y: 1.7, z: 2.5 },
        cabinOffsetZ: -0.7,
        color: 0x8f5d32,
        cabinColor: 0x4e2f1c,
        wheels: [[-2.1, -1.05], [2.1, -1.05], [-2.1, 1.05], [2.1, 1.05]],
        rotationY: Math.PI / 6,
    }, colliders);

    for (const [x, z] of [[6, 15], [15, 6], [-15, -2], [-18, 20]]) {
        const crate = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 1.4, 2.4),
            new THREE.MeshStandardMaterial({ color: 0x2b3642, roughness: 0.84 }),
        );
        crate.position.set(x, 0.72, z);
        crate.castShadow = true;
        crate.receiveShadow = true;
        scene.add(crate);
        addBoxCollider(colliders, x, z, 1.35, 1.35);
    }

    for (const [x, z] of [[-12, 18], [12, 18], [18, -2], [-20, -14], [5, -12]]) {
        barrels.push(createBarrel(scene, x, z, colliders));
    }

    const spawnPoints = [
        new THREE.Vector3(-28, 0, -30),
        new THREE.Vector3(-10, 0, -30),
        new THREE.Vector3(12, 0, -30),
        new THREE.Vector3(30, 0, -24),
        new THREE.Vector3(30, 0, 10),
        new THREE.Vector3(24, 0, 28),
        new THREE.Vector3(0, 0, 30),
        new THREE.Vector3(-24, 0, 28),
        new THREE.Vector3(-30, 0, 4),
        new THREE.Vector3(-30, 0, -18),
    ];

    const emergencyBeacons = [];
    for (const [x, z, color] of [[17, -8, 0x7dd3ff], [19, -10, 0xff6a00], [18, 16, 0x8ad1ff]]) {
        const light = new THREE.PointLight(color, 1.4, 10, 2);
        light.position.set(x, 2.4, z);
        scene.add(light);
        emergencyBeacons.push(light);
    }

    const dust = createDustCloud(scene);

    return {
        colliders,
        barrels,
        spawnPoints,
        dust,
        setBarrelsActive(active) {
            for (const barrel of barrels) {
                if (barrel.exploded) {
                    continue;
                }
                barrel.armed = active;
                barrel.stripe.material.emissiveIntensity = active ? 1.8 : 0.2;
                barrel.body.material.emissive.setHex(active ? 0x2e0900 : 0x180300);
            }
        },
        update(dt, elapsedTime) {
            dust.rotation.y += dt * 0.012;
            for (const entry of flickerLights) {
                entry.light.intensity = entry.base * (0.78 + 0.18 * Math.sin(elapsedTime * 3.2 + entry.phase) + 0.04 * Math.sin(elapsedTime * 11.7 + entry.phase * 2));
            }
            emergencyBeacons.forEach((light, index) => {
                light.intensity = 1.2 + 0.4 * Math.sin(elapsedTime * (2.4 + index) + index);
            });
            barrels.forEach((barrel, index) => {
                if (barrel.exploded) {
                    return;
                }
                barrel.group.rotation.y += dt * 0.35;
                barrel.stripe.material.emissiveIntensity = barrel.armed ? 1.2 + 0.8 * Math.sin(elapsedTime * 5 + index) : 0.2;
            });
        },
    };
}
