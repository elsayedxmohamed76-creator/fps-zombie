import * as THREE from "three";
import { GAME_CONFIG } from "./config.js";
import { clamp, range } from "./utils.js";

// ─── Simple 2D Value Noise (deterministic) ────────────────────────
function makeNoise(seed = 42) {
    const perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed;
    for (let i = 255; i > 0; i--) {
        s = (s * 16807 + 0) % 2147483647;
        const j = s % (i + 1);
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + t * (b - a); }
    function grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

    return (x, y) => {
        if (x === undefined) {
            return Math.random();
        }
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        const xf = x - Math.floor(x), yf = y - Math.floor(y);
        const u = fade(xf), v = fade(yf);
        const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
        const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
        return lerp(
            lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
            lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
            v
        );
    };
}

function fbm(noise, x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
        sum += noise(x * freq, y * freq) * amp;
        max += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    return sum / max;
}

function getTerrainHeight(noise, x, z) {
    const scale = 0.008;
    const h = fbm(noise, x * scale, z * scale, 4, 2.0, 0.45);
    const flatness = 1.0 - Math.exp(-((x * x + z * z) / (60 * 60)));
    return h * 3.5 * flatness;
}

// ─── Canvas Texture Helpers ────────────────────────────────────────
function makeCanvasTexture(size, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    draw(ctx, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
}

function createGrassTexture() {
    return makeCanvasTexture(512, (ctx, size) => {
        ctx.fillStyle = "#1a2e0a";
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 4000; i++) {
            const g = Math.floor(30 + Math.random() * 60);
            const r = Math.floor(10 + Math.random() * 30);
            const b = Math.floor(5 + Math.random() * 15);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + Math.random() * 0.5})`;
            ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 3);
        }
    });
}

// ─── Collider Helpers ──────────────────────────────────────────────
function addBoxCollider(colliders, x, z, halfX, halfZ, active = true) {
    const collider = { x, z, halfX, halfZ, active };
    colliders.push(collider);
    return collider;
}

// ─── Terrain Mesh ──────────────────────────────────────────────────
function createTerrain(scene, noise, size, segments) {
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    const grassColor = new THREE.Color(0x1a3d0a);
    const dirtColor = new THREE.Color(0x3d2b1f);
    const rockColor = new THREE.Color(0x555555);

    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const h = getTerrainHeight(noise, x, z);
        positions.setY(i, h);

        const n = (fbm(noise, x * 0.02 + 100, z * 0.02 + 100, 2) + 1) * 0.5;
        const color = dirtColor.clone().lerp(grassColor, n);
        if (h > 1.8) {
            color.lerp(rockColor, clamp((h - 1.8) / 1.8, 0, 1));
        }
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.02,
    });

    const terrain = new THREE.Mesh(geometry, material);
    terrain.receiveShadow = true;
    scene.add(terrain);
    return terrain;
}

// ─── Sky Dome ──────────────────────────────────────────────────────
function createSkyDome(scene) {
    const skyGeo = new THREE.SphereGeometry(180, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
            topColor: { value: new THREE.Color(0x0a1a3a) },
            midColor: { value: new THREE.Color(0x1a0e05) },
            bottomColor: { value: new THREE.Color(0x05070a) },
            sunColor: { value: new THREE.Color(0xff7a2b) },
            sunDirection: { value: new THREE.Vector3(-0.5, 0.15, 0.3).normalize() },
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 midColor;
            uniform vec3 bottomColor;
            uniform vec3 sunColor;
            uniform vec3 sunDirection;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition).y;
                vec3 sky;
                if (h > 0.0) {
                    sky = mix(midColor, topColor, pow(h, 0.45));
                } else {
                    sky = mix(midColor, bottomColor, pow(-h, 0.6));
                }
                float sunDot = max(dot(normalize(vWorldPosition), sunDirection), 0.0);
                sky += sunColor * pow(sunDot, 64.0) * 0.8;
                sky += sunColor * pow(sunDot, 8.0) * 0.15;
                gl_FragColor = vec4(sky, 1.0);
            }
        `,
        depthWrite: false,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
    return sky;
}

// ─── Trees ─────────────────────────────────────────────────────────
function createPineTree(scene, x, z, height, noise, colliders) {
    const group = new THREE.Group();
    const trunkH = height * 0.35;
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.14, trunkH, 5),
        new THREE.MeshStandardMaterial({ color: 0x3d2517, roughness: 0.9 })
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    group.add(trunk);

    const layers = 3;
    for (let i = 0; i < layers; i++) {
        const layerH = height * 0.22 * (1 - i * 0.18);
        const radius = (1.2 - i * 0.25) * (height / 6);
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(radius, layerH, 6),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0.28 + noise() * 0.04, 0.55 + noise() * 0.2, 0.12 + noise() * 0.08),
                roughness: 0.85,
            })
        );
        cone.position.y = trunkH + i * layerH * 0.55;
        cone.castShadow = true;
        group.add(cone);
    }

    const ty = getTerrainHeight(noise, x, z);
    group.position.set(x, ty, z);
    scene.add(group);
    addBoxCollider(colliders, x, z, 0.25, 0.25);
}

function createOakTree(scene, x, z, size, noise, colliders) {
    const group = new THREE.Group();
    const trunkH = size * 0.5;
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.2, trunkH, 5),
        new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.88 })
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    group.add(trunk);

    const canopyR = size * 0.5;
    const canopy = new THREE.Mesh(
        new THREE.IcosahedronGeometry(canopyR, 0),
        new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.25 + noise() * 0.06, 0.5 + noise() * 0.25, 0.18 + noise() * 0.1),
            roughness: 0.82,
        })
    );
    canopy.position.y = trunkH + canopyR * 0.5;
    canopy.scale.y = 0.75;
    canopy.castShadow = true;
    group.add(canopy);

    const ty = getTerrainHeight(noise, x, z);
    group.position.set(x, ty, z);
    scene.add(group);
    addBoxCollider(colliders, x, z, 0.3, 0.3);
}

function createBush(scene, x, z, size, noise) {
    const group = new THREE.Group();
    const count = 2 + Math.floor(noise() * 2);
    for (let i = 0; i < count; i++) {
        const r = size * (0.3 + noise() * 0.3);
        const sphere = new THREE.Mesh(
            new THREE.IcosahedronGeometry(r, 0),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0.25 + noise() * 0.08, 0.4 + noise() * 0.3, 0.12 + noise() * 0.1),
                roughness: 0.88,
            })
        );
        sphere.position.set((noise() - 0.5) * size * 0.5, r * 0.6, (noise() - 0.5) * size * 0.5);
        sphere.castShadow = true;
        group.add(sphere);
    }
    const ty = getTerrainHeight(noise, x, z);
    group.position.set(x, ty, z);
    scene.add(group);
}

function createGrassPatches(scene, count, noise) {
    const positions = [];
    const colors = [];

    for (let i = 0; i < count; i++) {
        const x = range(noise, -100, 100);
        const z = range(noise, -100, 100);
        const h = getTerrainHeight(noise, x, z);
        if (h > 1.2) continue;

        positions.push(x, h + 0.1, z);
        const c = new THREE.Color().setHSL(0.25 + noise() * 0.08, 0.5 + noise() * 0.3, 0.15 + noise() * 0.12);
        colors.push(c.r, c.g, c.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.35,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        sizeAttenuation: true,
    });

    const grass = new THREE.Points(geometry, material);
    scene.add(grass);
    return grass;
}

// ─── Houses / Buildings ────────────────────────────────────────────
function createHouse(scene, x, z, rotationY, noise, colliders) {
    const group = new THREE.Group();
    const w = 3.5 + noise() * 2;
    const d = 3 + noise() * 1.5;
    const wallH = 2.5 + noise() * 0.8;

    // Walls
    const wallColor = new THREE.Color().setHSL(0.08 + noise() * 0.06, 0.15 + noise() * 0.1, 0.55 + noise() * 0.2);
    const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.88 });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    walls.position.y = wallH / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    // Roof
    const roofH = 1.2 + noise() * 0.5;
    const roofColor = new THREE.Color().setHSL(0.02 + noise() * 0.04, 0.4 + noise() * 0.2, 0.2 + noise() * 0.1);
    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.82 });
    const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.7, roofH, 4),
        roofMat
    );
    roof.position.y = wallH + roofH / 2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    // Door
    const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.6, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x3d2517, roughness: 0.85 })
    );
    door.position.set(0, 0.8, d / 2 + 0.03);
    group.add(door);

    const ty = getTerrainHeight(noise, x, z);
    group.position.set(x, ty, z);
    group.rotation.y = rotationY;
    scene.add(group);

    // Collider
    const cosR = Math.abs(Math.cos(rotationY));
    const sinR = Math.abs(Math.sin(rotationY));
    const halfX = (w / 2 + 0.3) * cosR + (d / 2 + 0.3) * sinR;
    const halfZ = (w / 2 + 0.3) * sinR + (d / 2 + 0.3) * cosR;
    addBoxCollider(colliders, x, z, halfX, halfZ);

    return { group, width: w, depth: d };
}

function createLargeBuilding(scene, x, z, rotationY, noise, colliders) {
    const group = new THREE.Group();
    const w = 7 + noise() * 3;
    const d = 5 + noise() * 2;
    const wallH = 3.5 + noise() * 1.5;

    const wallMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.55 + noise() * 0.05, 0.1 + noise() * 0.08, 0.35 + noise() * 0.15),
        roughness: 0.78,
        metalness: 0.15,
    });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    walls.position.y = wallH / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    // Flat roof
    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.2, 0.15, d + 0.2),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 })
    );
    roof.position.y = wallH + 0.08;
    roof.castShadow = true;
    group.add(roof);

    const ty = getTerrainHeight(noise, x, z);
    group.position.set(x, ty, z);
    group.rotation.y = rotationY;
    scene.add(group);

    const cosR = Math.abs(Math.cos(rotationY));
    const sinR = Math.abs(Math.sin(rotationY));
    const halfX = (w / 2 + 0.5) * cosR + (d / 2 + 0.5) * sinR;
    const halfZ = (w / 2 + 0.5) * sinR + (d / 2 + 0.5) * cosR;
    addBoxCollider(colliders, x, z, halfX, halfZ);
}

// ─── Street Lights ─────────────────────────────────────────────────
function createStreetLight(scene, x, z, flickerLights, noise) {
    const group = new THREE.Group();
    const poleH = 4.5 + noise() * 0.5;
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, poleH, 5),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7, metalness: 0.4 })
    );
    pole.position.y = poleH / 2;
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.05, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7, metalness: 0.4 })
    );
    arm.position.set(0.4, poleH, 0);
    group.add(arm);

    const lampColor = 0xffc87a;
    const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 5),
        new THREE.MeshStandardMaterial({
            color: lampColor,
            emissive: lampColor,
            emissiveIntensity: 1.5,
        })
    );
    lamp.position.set(0.8, poleH - 0.1, 0);
    group.add(lamp);

    const light = new THREE.PointLight(lampColor, 1.0, 12, 2);
    light.position.set(0.8, poleH - 0.2, 0);
    light.castShadow = false;
    group.add(light);

    const ty = getTerrainHeight(noise, x, z);
    group.position.set(x, ty, z);
    scene.add(group);
    flickerLights.push({ light, phase: Math.random() * Math.PI * 2, base: 0.8 + noise() * 0.3 });
}

// ─── Rocks ─────────────────────────────────────────────────────────
function createRock(scene, x, z, size, noise, colliders) {
    const geo = new THREE.IcosahedronGeometry(size, 0);
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const px = positions.getX(i);
        const py = positions.getY(i);
        const pz = positions.getZ(i);
        const n = 1 + (noise() - 0.5) * 0.3;
        positions.setXYZ(i, px * n, py * (0.5 + noise() * 0.4) * n, pz * n);
    }
    geo.computeVertexNormals();

    const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0, 0, 0.25 + noise() * 0.15),
        roughness: 0.92,
        metalness: 0.05,
    }));
    const ty = getTerrainHeight(noise, x, z);
    rock.position.set(x, ty + size * 0.3, z);
    rock.rotation.set(noise() * 0.5, noise() * Math.PI * 2, noise() * 0.3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);

    if (size > 0.5) {
        addBoxCollider(colliders, x, z, size * 0.6, size * 0.6);
    }
}

// ─── Fence Segments ────────────────────────────────────────────────
function createFenceSegment(scene, x, z, rotationY, noise) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 });

    for (const px of [-1.5, 1.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.2, 5), mat);
        post.position.set(px, 0.6, 0);
        post.castShadow = true;
        group.add(post);
    }

    for (const py of [0.3, 0.7, 1.0]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.04, 0.04), mat);
        rail.position.set(0, py, 0);
        group.add(rail);
    }

    const ty = getTerrainHeight(noise, x, z);
    group.position.set(x, ty, z);
    group.rotation.y = rotationY;
    scene.add(group);
}

// ─── Dust Particles ────────────────────────────────────────────────
function createDustCloud(scene) {
    const count = 250;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        positions[i * 3] = range(Math.random, -70, 70);
        positions[i * 3 + 1] = 0.5 + Math.random() * 10;
        positions[i * 3 + 2] = range(Math.random, -70, 70);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xc18a64,
        size: 0.12,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    return points;
}

// ─── Barrel ────────────────────────────────────────────────────────
function createBarrel(scene, x, z, noise, colliders) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.46, 1.2, 14),
        new THREE.MeshStandardMaterial({
            color: 0x812d18,
            emissive: 0x180300,
            roughness: 0.54,
            metalness: 0.22,
        })
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const stripe = new THREE.Mesh(
        new THREE.TorusGeometry(0.43, 0.05, 6, 14),
        new THREE.MeshStandardMaterial({
            color: 0xff8a3d,
            emissive: 0xff5d00,
            emissiveIntensity: 0.2,
            roughness: 0.28,
        })
    );
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = 0.05;
    group.add(stripe);

    const ty = getTerrainHeight(noise, x, z);
    group.position.set(x, ty + 0.62, z);
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

// ─── Vehicle ───────────────────────────────────────────────────────
function createVehicle(scene, options, noise, colliders) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(options.size.x, options.size.y, options.size.z),
        new THREE.MeshStandardMaterial({
            color: options.color,
            roughness: 0.62,
            metalness: 0.28,
            emissive: options.emissive ?? 0x000000,
        })
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
        })
    );
    cabin.position.set(0, options.size.y * 0.38, options.cabinOffsetZ ?? 0);
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    group.add(cabin);

    for (const wheel of options.wheels) {
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.46, 0.46, 0.34, 14),
            new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.86 })
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
            })
        );
        lightBar.position.set(0, options.size.y * 0.75, 0);
        group.add(lightBar);
    }

    const ty = getTerrainHeight(noise, options.position.x, options.position.z);
    group.position.set(options.position.x, ty + options.size.y * 0.5, options.position.z);
    group.rotation.y = options.rotationY ?? 0;
    scene.add(group);
    addBoxCollider(colliders, options.position.x, options.position.z, options.size.x * 0.62, options.size.z * 0.62);
    return group;
}

// ─── Watch Tower ───────────────────────────────────────────────────
function createTower(scene, x, z, rotationY, noise, flickerLights, colliders) {
    const tower = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x182430, roughness: 0.82, metalness: 0.2 });
    const legOffsets = [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]];
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
        new THREE.MeshStandardMaterial({ color: 0x243443, emissive: 0x36728d, emissiveIntensity: 1.1 })
    );
    lampHead.position.set(0, 7.6, 0);
    lampHead.castShadow = true;
    tower.add(lampHead);

    const spot = new THREE.SpotLight(0x7dd3ff, 2.0, 38, Math.PI / 5, 0.35, 1.6);
    spot.position.set(0, 7.3, 0);
    spot.target.position.set(0, 0, 8);
    spot.castShadow = false;
    tower.add(spot);
    tower.add(spot.target);

    const ty = getTerrainHeight(noise, x, z);
    tower.position.set(x, ty, z);
    tower.rotation.y = rotationY;
    scene.add(tower);
    flickerLights.push({ light: spot, phase: Math.random() * Math.PI * 2, base: 1.8 + Math.random() * 0.4 });
    addBoxCollider(colliders, x, z, 1.2, 1.2);
}

// ─── MAIN EXPORT ───────────────────────────────────────────────────

export function createWorld(scene, rng) {
    const colliders = [];
    const noise = makeNoise(Math.floor(rng() * 100000));
    const treeRng = makeNoise(Math.floor(rng() * 99999));

    // Detect mobile for optimization
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);

    scene.background = new THREE.Color(0x05070a);
    scene.fog = new THREE.FogExp2(0x070b10, isMobile ? 0.006 : 0.008);

    const barrels = [];
    const flickerLights = [];

    // ── Lighting ──
    const ambient = new THREE.HemisphereLight(0xffd2a8, 0x081018, 0.9);
    scene.add(ambient);

    const sunset = new THREE.DirectionalLight(0xff9354, 2.3);
    sunset.position.set(-24, 28, 10);
    sunset.castShadow = true;
    // Reduce shadow map on mobile
    const shadowSize = isMobile ? 1024 : 2048;
    sunset.shadow.mapSize.set(shadowSize, shadowSize);
    sunset.shadow.camera.left = -60;
    sunset.shadow.camera.right = 60;
    sunset.shadow.camera.top = 60;
    sunset.shadow.camera.bottom = -60;
    scene.add(sunset);

    const moonFill = new THREE.DirectionalLight(0x7dcfff, 0.45);
    moonFill.position.set(22, 18, -12);
    scene.add(moonFill);

    // ── Sky Dome ──
    createSkyDome(scene);

    // ── Terrain (reduced segments for mobile) ──
    const terrainSegments = isMobile ? 64 : 96;
    createTerrain(scene, noise, 220, terrainSegments);

    // ── Quarantine Yard (central area) ──
    const yardFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(76, 76),
        new THREE.MeshStandardMaterial({
            color: 0x76614f,
            roughness: 0.96,
            metalness: 0.02,
        })
    );
    const yardH = getTerrainHeight(noise, 0, 0);
    yardFloor.rotation.x = -Math.PI / 2;
    yardFloor.position.y = yardH + 0.06;
    yardFloor.receiveShadow = true;
    scene.add(yardFloor);

    // Yard walls (partial, not fully enclosed)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x131c24, roughness: 0.9 });
    const boundaries = [
        { size: [76, 5, 1.2], pos: [0, yardH + 2.5, -38.5] },
        { size: [76, 5, 1.2], pos: [0, yardH + 2.5, 38.5] },
        { size: [1.2, 5, 76], pos: [-38.5, yardH + 2.5, 0] },
        { size: [1.2, 5, 76], pos: [38.5, yardH + 2.5, 0] },
    ];
    for (const boundary of boundaries) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...boundary.size), wallMat);
        mesh.position.set(...boundary.pos);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    }

    createTower(scene, -30, -30, Math.PI / 4, noise, flickerLights, colliders);
    createTower(scene, 30, -28, -Math.PI / 5, noise, flickerLights, colliders);

    // ── Houses in the open world ──
    const housePositions = [
        { x: 25, z: 15, r: 0.2 },
        { x: -22, z: -18, r: 1.1 },
        { x: 45, z: -10, r: -0.3 },
        { x: -50, z: 20, r: 0.8 },
        { x: 60, z: 35, r: 0.5 },
        { x: -65, z: -30, r: -0.7 },
        { x: 35, z: -50, r: 1.3 },
        { x: -30, z: 55, r: 0.1 },
    ];
    for (const hp of housePositions) {
        createHouse(scene, hp.x, hp.z, hp.r, noise, colliders);
    }

    // Large buildings
    createLargeBuilding(scene, -40, -45, 0.3, noise, colliders);
    createLargeBuilding(scene, 55, 55, -0.5, noise, colliders);

    // ── Yard props ──
    const fenceTexture = makeCanvasTexture(256, (ctx, size) => {
        ctx.fillStyle = "#111820";
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = "rgba(125, 211, 255, 0.22)";
        ctx.lineWidth = 3;
        for (let i = -size; i <= size * 2; i += 46) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(i, size); ctx.lineTo(i + size, 0); ctx.stroke();
        }
    });
    fenceTexture.repeat.set(6, 1.4);
    const fenceMaterial = new THREE.MeshStandardMaterial({
        map: fenceTexture, color: 0x1a2530, transparent: true, opacity: 0.92, roughness: 0.82, metalness: 0.12,
    });
    const gate = new THREE.Mesh(new THREE.BoxGeometry(12, 4.2, 0.5), fenceMaterial);
    gate.position.set(0, yardH + 2.3, 37.8);
    scene.add(gate);

    // Barricades
    const barrierTexture = makeCanvasTexture(256, (ctx, size) => {
        ctx.fillStyle = "#2b2f34";
        ctx.fillRect(0, 0, size, size);
        for (let i = -size; i < size * 2; i += 60) {
            ctx.fillStyle = i % 120 === 0 ? "#ff7a2b" : "#111820";
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 50, 0);
            ctx.lineTo(i + size / 2 + 50, size); ctx.lineTo(i + size / 2, size);
            ctx.closePath(); ctx.fill();
        }
    });
    function createBarricade(x, z, rotationY) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(3.4, 1.1, 0.9),
            new THREE.MeshStandardMaterial({ map: barrierTexture, roughness: 0.88 })
        );
        body.castShadow = true; body.receiveShadow = true;
        group.add(body);
        for (const offset of [-1.25, 1.25]) {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.18), new THREE.MeshStandardMaterial({ color: 0x111820 }));
            beam.position.set(offset, 0.22, 0); beam.castShadow = true;
            group.add(beam);
        }
        group.position.set(x, yardH + 0.58, z);
        group.rotation.y = rotationY;
        scene.add(group);
        addBoxCollider(colliders, x, z, 1.85, 0.7);
    }
    createBarricade(-11, 7, 0.05);
    createBarricade(11, 7, -0.05);
    createBarricade(-6, -8, Math.PI / 2);
    createBarricade(8, -2, Math.PI / 2);

    // Container
    const container = new THREE.Mesh(
        new THREE.BoxGeometry(7.6, 3.3, 2.8),
        new THREE.MeshStandardMaterial({ color: 0x254054, emissive: 0x102638, emissiveIntensity: 0.3, roughness: 0.72, metalness: 0.18 })
    );
    container.position.set(0, yardH + 1.65, -19);
    container.castShadow = true; container.receiveShadow = true;
    scene.add(container);
    addBoxCollider(colliders, 0, -19, 3.95, 1.55);

    // Tent
    const tentGroup = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.8, 4), new THREE.MeshStandardMaterial({ color: 0xd7d9de, roughness: 0.9 }));
    roof.rotation.y = Math.PI / 4; roof.position.y = 3.2; roof.castShadow = true;
    tentGroup.add(roof);
    for (const [px, pz] of [[-2.4, -1.4], [2.4, -1.4], [-2.4, 1.4], [2.4, 1.4]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0xaeb6c1 }));
        pole.position.set(px, 1.6, pz); pole.castShadow = true;
        tentGroup.add(pole);
    }
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.24, 1.2), new THREE.MeshStandardMaterial({ color: 0x465361 }));
    table.position.set(0, 1.0, 0); table.castShadow = true; table.receiveShadow = true;
    tentGroup.add(table);
    tentGroup.position.set(18, yardH, 16);
    scene.add(tentGroup);
    addBoxCollider(colliders, 18, 16, 2.8, 2.2);

    // Vehicles
    createVehicle(scene, {
        position: { x: 19, z: -8 }, size: { x: 4.6, y: 2.0, z: 2.2 },
        cabin: { x: 3.2, y: 1.6, z: 2.0 }, cabinOffsetZ: -0.1,
        color: 0xdedede, cabinColor: 0xf5f8fb,
        wheels: [[-1.65, -0.9], [1.65, -0.9], [-1.65, 0.9], [1.65, 0.9]],
        lightBar: true, emissive: 0x0c1720, rotationY: -Math.PI / 8,
    }, noise, colliders);

    createVehicle(scene, {
        position: { x: -18, z: 10 }, size: { x: 5.8, y: 2.2, z: 2.5 },
        cabin: { x: 2.4, y: 1.7, z: 2.5 }, cabinOffsetZ: -0.7,
        color: 0x8f5d32, cabinColor: 0x4e2f1c,
        wheels: [[-2.1, -1.05], [2.1, -1.05], [-2.1, 1.05], [2.1, 1.05]],
        rotationY: Math.PI / 6,
    }, noise, colliders);

    // Crates
    for (const [x, z] of [[6, 15], [15, 6], [-15, -2], [-18, 20]]) {
        const crate = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 1.4, 2.4),
            new THREE.MeshStandardMaterial({ color: 0x2b3642, roughness: 0.84 })
        );
        crate.position.set(x, yardH + 0.72, z);
        crate.castShadow = true; crate.receiveShadow = true;
        scene.add(crate);
        addBoxCollider(colliders, x, z, 1.35, 1.35);
    }

    // Barrels
    for (const [x, z] of [[-12, 18], [12, 18], [18, -2], [-20, -14], [5, -12]]) {
        barrels.push(createBarrel(scene, x, z, noise, colliders));
    }

    // ── Vegetation (reduced counts for mobile) ──
    const pineCount = isMobile ? 40 : 60;
    const oakCount = isMobile ? 25 : 40;
    const bushCount = isMobile ? 15 : 30;
    const rockCount = isMobile ? 20 : 35;
    const grassCount = isMobile ? 800 : 1500;

    // Pine trees
    for (let i = 0; i < pineCount; i++) {
        const x = range(treeRng, -95, 95);
        const z = range(treeRng, -95, 95);
        if (Math.abs(x) < 40 && Math.abs(z) < 40) continue;
        const h = getTerrainHeight(noise, x, z);
        if (h > 2.0) continue;
        createPineTree(scene, x, z, 4 + treeRng() * 3, treeRng, colliders);
    }
    // Oak trees
    for (let i = 0; i < oakCount; i++) {
        const x = range(treeRng, -95, 95);
        const z = range(treeRng, -95, 95);
        if (Math.abs(x) < 40 && Math.abs(z) < 40) continue;
        const h = getTerrainHeight(noise, x, z);
        if (h > 1.8) continue;
        createOakTree(scene, x, z, 3.5 + treeRng() * 2.5, treeRng, colliders);
    }
    // Bushes
    for (let i = 0; i < bushCount; i++) {
        const x = range(treeRng, -90, 90);
        const z = range(treeRng, -90, 90);
        if (Math.abs(x) < 38 && Math.abs(z) < 38) continue;
        createBush(scene, x, z, 0.8 + treeRng() * 1.0, treeRng);
    }
    // Grass patches
    const grass = createGrassPatches(scene, grassCount, treeRng);

    // Rocks
    for (let i = 0; i < rockCount; i++) {
        const x = range(treeRng, -90, 90);
        const z = range(treeRng, -90, 90);
        createRock(scene, x, z, 0.3 + treeRng() * 0.8, treeRng, colliders);
    }

    // Fence segments near houses
    for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const radius = 8 + treeRng() * 3;
        const cx = 25 + Math.cos(angle) * radius;
        const cz = 15 + Math.sin(angle) * radius;
        createFenceSegment(scene, cx, cz, angle + Math.PI / 2, treeRng);
    }

    // ── Street Lights along yard perimeter ──
    const lightCount = isMobile ? 6 : 10;
    for (let i = 0; i < lightCount; i++) {
        const angle = (i / lightCount) * Math.PI * 2;
        const r = 42;
        createStreetLight(scene, Math.cos(angle) * r, Math.sin(angle) * r, flickerLights, treeRng);
    }

    // ── Spawn Points ──
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
        new THREE.Vector3(50, 0, 20),
        new THREE.Vector3(-50, 0, -20),
        new THREE.Vector3(30, 0, -50),
        new THREE.Vector3(-40, 0, 40),
        new THREE.Vector3(60, 0, -30),
        new THREE.Vector3(-60, 0, 10),
    ];

    // Emergency Beacons
    const emergencyBeacons = [];
    for (const [x, z, color] of [[17, -8, 0x7dd3ff], [19, -10, 0xff6a00], [18, 16, 0x8ad1ff]]) {
        const light = new THREE.PointLight(color, 1.4, 10, 2);
        light.position.set(x, yardH + 2.4, z);
        scene.add(light);
        emergencyBeacons.push(light);
    }

    // Dust
    const dust = createDustCloud(scene);

    return {
        colliders,
        barrels,
        spawnPoints,
        dust,
        getTerrainHeight: (x, z) => getTerrainHeight(noise, x, z),
        setBarrelsActive(active) {
            for (const barrel of barrels) {
                if (barrel.exploded) continue;
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
                if (barrel.exploded) return;
                barrel.group.rotation.y += dt * 0.35;
                barrel.stripe.material.emissiveIntensity = barrel.armed ? 1.2 + 0.8 * Math.sin(elapsedTime * 5 + index) : 0.2;
            });
            if (grass) {
                grass.rotation.y += dt * 0.003;
            }
        },
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
        if (collider.active === false) continue;
        const closestX = clamp(position.x, collider.x - collider.halfX, collider.x + collider.halfX);
        const closestZ = clamp(position.z, collider.z - collider.halfZ, collider.z + collider.halfZ);
        let dx = position.x - closestX;
        let dz = position.z - closestZ;
        let distSq = dx * dx + dz * dz;
        if (distSq >= radius * radius) continue;

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
