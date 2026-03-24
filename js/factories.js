import * as THREE from "three";

export function createWeaponMesh() {
    const weapon = new THREE.Group();

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x202831,
        roughness: 0.34,
        metalness: 0.78,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
        color: 0xff7a2b,
        emissive: 0xff5d00,
        emissiveIntensity: 0.46,
        roughness: 0.28,
        metalness: 0.44,
    });

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.7), frameMaterial);
    stock.position.set(0.06, -0.02, 0.28);
    stock.castShadow = true;
    weapon.add(stock);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 1.1), frameMaterial);
    body.position.set(0.02, 0.0, -0.05);
    body.castShadow = true;
    weapon.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 12), frameMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.02, 0.03, -0.88);
    barrel.castShadow = true;
    weapon.add(barrel);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.22), accentMaterial);
    sight.position.set(0.02, 0.16, -0.18);
    sight.castShadow = true;
    weapon.add(sight);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.2), frameMaterial);
    grip.position.set(0.04, -0.25, 0.08);
    grip.rotation.z = 0.16;
    grip.castShadow = true;
    weapon.add(grip);

    const muzzleFlash = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 10, 10),
        new THREE.MeshBasicMaterial({
            color: 0xffc46a,
            transparent: true,
            opacity: 0,
        }),
    );
    muzzleFlash.position.set(0.02, 0.02, -1.32);
    weapon.add(muzzleFlash);

    weapon.position.set(0.56, -0.46, -0.92);

    return { weapon, muzzleFlash };
}

function baseEnemyMaterial(color, emissive, emissiveIntensity = 0.32) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0.12,
        emissive,
        emissiveIntensity,
    });
}

export function createEnemyMesh(typeConfig) {
    const group = new THREE.Group();
    const hitMeshes = [];
    const animatedParts = [];
    const materials = [];

    const register = (mesh, animated = false) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.enemyHit = true;
        hitMeshes.push(mesh);
        materials.push(mesh.material);
        if (animated) {
            animatedParts.push(mesh);
        }
        group.add(mesh);
        return mesh;
    };

    const accentMaterial = new THREE.MeshBasicMaterial({ color: typeConfig.emissive });

    if (typeConfig.id === "shambler") {
        register(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.52), baseEnemyMaterial(typeConfig.color, 0x183000)));
        const head = register(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.46), baseEnemyMaterial(0x9cae83, 0x31480d)));
        head.position.y = 0.92;

        const leftArm = register(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.88, 0.22), baseEnemyMaterial(0x51623a, 0x122000)), true);
        const rightArm = register(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.88, 0.22), baseEnemyMaterial(0x51623a, 0x122000)), true);
        leftArm.position.set(-0.58, 0.06, 0.02);
        rightArm.position.set(0.58, 0.06, 0.02);

        const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), accentMaterial);
        const eyeR = eyeL.clone();
        eyeL.position.set(-0.12, 0.98, 0.24);
        eyeR.position.set(0.12, 0.98, 0.24);
        group.add(eyeL, eyeR);
    } else if (typeConfig.id === "runner") {
        const torso = register(new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.0, 0.36), baseEnemyMaterial(typeConfig.color, 0x45160d, 0.38)));
        torso.position.y = 0.04;
        const head = register(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), baseEnemyMaterial(0xcda49d, 0x5d2215, 0.24)));
        head.position.set(0, 0.84, 0.06);

        const legL = register(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.84, 0.18), baseEnemyMaterial(0x402323, 0x220d0a)), true);
        const legR = register(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.84, 0.18), baseEnemyMaterial(0x402323, 0x220d0a)), true);
        legL.position.set(-0.16, -0.88, 0.02);
        legR.position.set(0.16, -0.88, 0.02);

        const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.9, 0.1),
            new THREE.MeshStandardMaterial({
                color: 0xff8a5c,
                emissive: typeConfig.emissive,
                emissiveIntensity: 1.4,
                roughness: 0.2,
            }),
        );
        stripe.position.set(0, 0.08, 0.22);
        group.add(stripe);
    } else {
        const body = register(new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.0, 0.9), baseEnemyMaterial(typeConfig.color, 0x103040, 0.5)));
        body.position.y = 0.3;

        const head = register(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.72, 0.72), baseEnemyMaterial(0x92a8b4, 0x27485f, 0.46)));
        head.position.set(0, 1.6, 0.12);

        const shoulderL = register(new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.14, 0.44), baseEnemyMaterial(0x4d6b77, 0x163141)), true);
        const shoulderR = register(new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.14, 0.44), baseEnemyMaterial(0x4d6b77, 0x163141)), true);
        shoulderL.position.set(-1.0, 0.48, 0.02);
        shoulderR.position.set(1.0, 0.48, 0.02);

        const core = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.24, 1.4, 12),
            new THREE.MeshStandardMaterial({
                color: 0x8fdcff,
                emissive: typeConfig.emissive,
                emissiveIntensity: 1.8,
                transparent: true,
                opacity: 0.95,
            }),
        );
        core.rotation.z = Math.PI / 2;
        core.position.set(0, 0.34, 0.4);
        group.add(core);
    }

    group.position.y = typeConfig.id === "brute" ? 1.5 : 1.05;

    return { group, hitMeshes, animatedParts, materials };
}

export function createPickupMesh(type) {
    const group = new THREE.Group();
    let color = 0x7dd3ff;
    if (type === "medkit") color = 0xff6b6b;
    if (type === "charge") color = 0xc1ff72;

    const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.44, 0),
        new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.9,
            roughness: 0.24,
            metalness: 0.28,
        }),
    );
    core.castShadow = true;
    group.add(core);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.05, 8, 24),
        new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: color,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.86,
        }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    return { group, core, ring };
}

export function createTracer(start, end, color = 0xffd699) {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    return line;
}
