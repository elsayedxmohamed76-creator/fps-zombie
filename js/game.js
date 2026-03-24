import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Game Constants
const MOVEMENT_SPEED = 0.15;
const ZOMBIE_SPEED = 0.05;
const SPAWN_INTERVAL = 3000;
const MAX_HEALTH = 100;
const MAX_AMMO = 30;

// Game State
let health = MAX_HEALTH;
let ammo = MAX_AMMO;
let score = 0;
let isGameOver = false;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Three.js Objects
let scene, camera, renderer, controls, flashlight, gun, muzzleFlash;
let floor, walls = [];
let zombies = [];
let particles = [];
let raycaster = new THREE.Raycaster();

// UI Elements
const healthValue = document.getElementById('healthValue');
const ammoValue = document.getElementById('ammoValue');
const scoreValue = document.getElementById('scoreValue');
const healthBar = document.getElementById('healthBar');
const ammoBar = document.getElementById('ammoBar');
const gameOverScreen = document.getElementById('gameOver');
const instructions = document.getElementById('instructions');
const finalScore = document.getElementById('finalScore');
const restartButton = document.getElementById('restartButton');

function init() {
    // Scene & Camera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.FogExp2(0x050505, 0.15);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.6; // Eye level

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new PointerLockControls(camera, document.body);

    instructions.addEventListener('click', () => {
        controls.lock();
    });

    controls.addEventListener('lock', () => {
        instructions.style.display = 'none';
    });

    controls.addEventListener('unlock', () => {
        if (!isGameOver) {
            instructions.style.display = 'flex';
        }
    });

    scene.add(controls.getObject());

    // Event Listeners for controls
    const onKeyDown = (event) => {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': moveForward = true; break;
            case 'ArrowLeft':
            case 'KeyA': moveLeft = true; break;
            case 'ArrowDown':
            case 'KeyS': moveBackward = true; break;
            case 'ArrowRight':
            case 'KeyD': moveRight = true; break;
        }
    };

    const onKeyUp = (event) => {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': moveForward = false; break;
            case 'ArrowLeft':
            case 'KeyA': moveLeft = false; break;
            case 'ArrowDown':
            case 'KeyS': moveBackward = false; break;
            case 'ArrowRight':
            case 'KeyD': moveRight = false; break;
            case 'KeyR': reload(); break;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', shoot);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    flashlight = new THREE.SpotLight(0xffffff, 5);
    flashlight.angle = Math.PI / 6;
    flashlight.penumbra = 0.3;
    flashlight.decay = 2;
    flashlight.distance = 50;
    flashlight.castShadow = true;
    
    // Attach flashlight to camera
    scene.add(flashlight);
    flashlight.target = new THREE.Object3D();
    scene.add(flashlight.target);

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x222222, 
        roughness: 0.8,
        metalness: 0.2
    });
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Walls (Boundary)
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const createWall = (w, h, d, x, y, z) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, wallMaterial);
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;
        scene.add(mesh);
        walls.push(mesh);
    };

    createWall(100, 10, 1, 0, 5, -50); // North
    createWall(100, 10, 1, 0, 5, 50);  // South
    createWall(1, 10, 100, -50, 5, 0); // West
    createWall(1, 10, 100, 50, 5, 0);  // East

    // Gun Model
    createGun();

    // Start zombie spawning
    setInterval(spawnZombie, SPAWN_INTERVAL);

    animate();
}

function createGun() {
    gun = new THREE.Group();
    
    // Gun body
    const bodyGeo = new THREE.BoxGeometry(0.2, 0.3, 1);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    gun.add(body);
    
    // Handle
    const handleGeo = new THREE.BoxGeometry(0.18, 0.5, 0.2);
    const handle = new THREE.Mesh(handleGeo, bodyMat);
    handle.position.set(0, -0.3, 0.3);
    gun.add(handle);
    
    gun.position.set(0.4, -0.4, -0.5);
    camera.add(gun);
    
    // Muzzle flash
    const flashGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0 });
    muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    muzzleFlash.position.set(0, 0, -0.6);
    gun.add(muzzleFlash);
}

function spawnZombie() {
    if (isGameOver || !controls.isLocked) return;

    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 10;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;

    const geo = new THREE.BoxGeometry(0.8, 1.8, 0.8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x445500 }); // Sickly green
    const zombie = new THREE.Mesh(geo, mat);
    zombie.position.set(x, 0.9, z);
    zombie.castShadow = true;
    
    // Add "eyes"
    const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.2, 0.5, 0.4);
    eyeR.position.set(-0.2, 0.5, 0.4);
    zombie.add(eyeL, eyeR);

    scene.add(zombie);
    zombies.push({ 
        mesh: zombie, 
        health: 30,
        speed: ZOMBIE_SPEED + Math.random() * 0.02
    });
}

function shoot() {
    if (isGameOver || !controls.isLocked || ammo <= 0) return;

    ammo--;
    updateUI();

    // Flash effect
    muzzleFlash.material.opacity = 1;
    setTimeout(() => { muzzleFlash.material.opacity = 0; }, 50);

    // Gun recoil animation
    gun.position.z += 0.1;
    setTimeout(() => { gun.position.z -= 0.1; }, 100);

    // Raycast from camera center
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(zombies.map(z => z.mesh));

    if (intersects.length > 0) {
        const hitPoint = intersects[0].point;
        const hitMesh = intersects[0].object;
        const zombieIndex = zombies.findIndex(z => z.mesh === hitMesh);
        
        spawnBlood(hitPoint);

        if (zombieIndex !== -1) {
            zombies[zombieIndex].health -= 10;
            if (zombies[zombieIndex].health <= 0) {
                scene.remove(hitMesh);
                zombies.splice(zombieIndex, 1);
                score += 100;
                updateUI();
            }
        }
    }
}

function spawnBlood(position) {
    for (let i = 0; i < 10; i++) {
        const geo = new THREE.SphereGeometry(0.05, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(position);
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1
        );
        
        scene.add(p);
        particles.push({ mesh: p, velocity, life: 30 });
    }
}

function reload() {
    if (ammo < MAX_AMMO) {
        ammo = MAX_AMMO;
        updateUI();
    }
}

function updateUI() {
    healthValue.textContent = Math.ceil(health);
    ammoValue.textContent = ammo;
    scoreValue.textContent = score;
    healthBar.style.width = `${health}%`;
    ammoBar.style.width = `${(ammo / MAX_AMMO) * 100}%`;

    if (health < 30) healthBar.style.background = '#ff0000';
    else if (health < 60) healthBar.style.background = '#ffaa00';
    else healthBar.style.background = '#00ff00';
}

function animate() {
    requestAnimationFrame(animate);

    if (isGameOver) return;

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked) {
        // Movement
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // Flashlight follows camera
        flashlight.position.copy(camera.position);
        const targetOffset = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        flashlight.target.position.copy(camera.position).add(targetOffset);

        // Update Zombies
        const playerPos = camera.position;
        for (let i = zombies.length - 1; i >= 0; i--) {
            const z = zombies[i];
            const directionToPlayer = new THREE.Vector3().subVectors(playerPos, z.mesh.position).normalize();
            z.mesh.position.x += directionToPlayer.x * z.speed;
            z.mesh.position.z += directionToPlayer.z * z.speed;
            z.mesh.lookAt(playerPos.x, 0.9, playerPos.z);

            // Collision with player
            const dist = z.mesh.position.distanceTo(playerPos);
            if (dist < 1.5) {
                health -= 0.5; // Increased damage
                updateUI();
                if (health <= 0) endGame();
            }
        }

        // Update Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.mesh.position.add(p.velocity);
            p.life--;
            if (p.life <= 0) {
                scene.remove(p.mesh);
                particles.splice(i, 1);
            }
        }
    }

    prevTime = time;
    renderer.render(scene, camera);
}

function endGame() {
    isGameOver = true;
    controls.unlock();
    gameOverScreen.style.display = 'flex';
    finalScore.textContent = score;
}

function restartGame() {
    health = MAX_HEALTH;
    ammo = MAX_AMMO;
    score = 0;
    isGameOver = false;
    
    // Clear zombies
    zombies.forEach(z => scene.remove(z.mesh));
    zombies = [];
    
    // Reset player position
    camera.position.set(0, 1.6, 0);
    
    updateUI();
    gameOverScreen.style.display = 'none';
    instructions.style.display = 'flex';
}

restartButton.addEventListener('click', restartGame);

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();