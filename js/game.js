// Game constants
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const healthValue = document.getElementById('healthValue');
const ammoValue = document.getElementById('ammoValue');
const scoreValue = document.getElementById('scoreValue');
const gameOverScreen = document.getElementById('gameOver');
const finalScoreValue = document.getElementById('finalScore');
const restartButton = document.getElementById('restartButton');

// Set canvas size to window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Game state
const keys = {};
const mouse = { x: 0, y: 0, down: false };
const bullets = [];
const zombies = [];
const particles = [];

const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    size: 30,
    speed: 5,
    angle: 0,
    health: 100,
    maxHealth: 100,
    ammo: 30,
    maxAmmo: 30,
    reloadTime: 0,
    reloadDuration: 60 // frames
};

const zombieSpawnTimer = 0;
const zombieSpawnInterval = 180; // 3 seconds at 60fps
const zombieSpeed = 1.5;
const zombieSize = 40;
const zombieHealth = 30;

const bulletSpeed = 10;
const bulletSize = 5;
const bulletDamage = 10;

// Game state
let score = 0;
let gameOver = false;

// Input handling
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});
window.addEventListener('mousedown', e => { if (e.button === 0) mouse.down = true; });
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });

// Game functions
function spawnZombie() {
    const side = Math.floor(Math.random() * 4); // 0:top,1:right,2:bottom,3:left
    let x, y;
    if (side === 0) { x = Math.random() * canvas.width; y = -zombieSize; }
    else if (side === 1) { x = canvas.width + zombieSize; y = Math.random() * canvas.height; }
    else if (side === 2) { x = Math.random() * canvas.width; y = canvas.height + zombieSize; }
    else { x = -zombieSize; y = Math.random() * canvas.height; }
    zombies.push({ x, y, size: zombieSize, speed: zombieSpeed, health: zombieHealth });
}

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.dx;
        b.y += b.dy;
        // Remove if out of bounds
        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
            continue;
        }
        // Check collision with zombies
        for (let j = zombies.length - 1; j >= 0; j--) {
            const z = zombies[j];
            const dx = b.x - z.x;
            const dy = b.y - z.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < z.size/2 + b.size/2) {
                z.health -= bulletDamage;
                // Create hit particles
                for (let k = 0; k < 5; k++) {
                    particles.push({
                        x: b.x, y: b.y,
                        vx: (Math.random() - 0.5) * 5,
                        vy: (Math.random() - 0.5) * 5,
                        life: 20,
                        size: 2
                    });
                }
                bullets.splice(i, 1);
                if (z.health <= 0) {
                    zombies.splice(j, 1);
                    score += 10; // Increase score for killing zombie
                }
                break;
            }
        }
    }
}

function updateZombies() {
    for (let z of zombies) {
        // Move towards player
        const dx = player.x - z.x;
        const dy = player.y - z.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 0) {
            z.x += (dx/dist) * z.speed;
            z.y += (dy/dist) * z.speed;
        }
        // Collision with player
        const px = player.x - z.x;
        const py = player.y - z.y;
        const pDist = Math.sqrt(px*px + py*py);
        if (pDist < player.size/2 + z.size/2) {
            player.health -= 0.5; // damage per frame
            if (player.health <= 0) {
                player.health = 0;
                gameOver = true;
            }
        }
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function updatePlayer() {
    if (gameOver) return;
    
    // Movement
    if (keys['KeyW'] || keys['ArrowUp']) player.y -= player.speed;
    if (keys['KeyS'] || keys['ArrowDown']) player.y += player.speed;
    if (keys['KeyA'] || keys['ArrowLeft']) player.x -= player.speed;
    if (keys['KeyD'] || keys['ArrowRight']) player.x += player.speed;
    // Keep player in bounds
    player.x = Math.max(player.size/2, Math.min(canvas.width - player.size/2, player.x));
    player.y = Math.max(player.size/2, Math.min(canvas.height - player.size/2, player.y));
    // Shooting
    if (mouse.down && player.ammo > 0 && player.reloadTime <= 0) {
        const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
        bullets.push({
            x: player.x,
            y: player.y,
            size: bulletSize,
            dx: Math.cos(angle) * bulletSpeed,
            dy: Math.sin(angle) * bulletSpeed
        });
        player.ammo--;
        if (player.ammo === 0) player.reloadTime = player.reloadDuration;
    }
    // Reload
    if (player.reloadTime > 0) player.reloadTime--;
    if (player.reloadTime === 0 && player.ammo === 0) {
        player.ammo = player.maxAmmo;
    }
    // Health regen (optional)
    if (player.health < player.maxHealth) player.health += 0.05;
}

function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(Math.atan2(mouse.y - player.y, mouse.x - player.x));
    ctx.fillStyle = '#0f0';
    ctx.beginPath();
    ctx.moveTo(player.size/2, 0);
    ctx.lineTo(-player.size/2, -player.size/3);
    ctx.lineTo(-player.size/4, 0);
    ctx.lineTo(-player.size/2, player.size/3);
    ctx.lineTo(player.size/2, 0);
    ctx.fill();
    ctx.restore();
}

function drawZombies() {
    ctx.fillStyle = '#f00';
    for (const z of zombies) {
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.size/2, 0, Math.PI*2);
        ctx.fill();
    }
}

function drawBullets() {
    ctx.fillStyle = '#ff0';
    for (const b of bullets) {
        ctx.beginPath();
        ctx.rect(b.x - b.size/2, b.y - b.size/2, b.size, b.size);
        ctx.fill();
    }
}

function drawParticles() {
    for (const p of particles) {
        ctx.fillStyle = `rgba(255,165,0,${p.life/20})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fill();
    }
}

function drawUI() {
    healthValue.textContent = Math.floor(player.health);
    ammoValue.textContent = player.ammo;
    scoreValue.textContent = score;
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#fff';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 50);
    
    ctx.font = '24px Arial';
    ctx.fillText('Final Score: ' + score, canvas.width / 2, canvas.height / 2);
    
    ctx.font = '18px Arial';
    ctx.fillText('Click Restart to Play Again', canvas.width / 2, canvas.height / 2 + 40);
}

function clear() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function gameLoop() {
    clear();
    if (!gameOver) {
        updatePlayer();
        updateBullets();
        updateZombies();
        updateParticles();
        // Spawn zombies
        zombieSpawnTimer++;
        if (zombieSpawnTimer >= zombieSpawnInterval) {
            spawnZombie();
            zombieSpawnTimer = 0;
        }
    }
    drawPlayer();
    drawZombies();
    drawBullets();
    drawParticles();
    drawUI();
    if (gameOver) {
        drawGameOver();
    }
    requestAnimationFrame(gameLoop);
}

// Restart game function
function restartGame() {
    // Reset game state
    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    player.health = player.maxHealth;
    player.ammo = player.maxAmmo;
    player.reloadTime = 0;
    bullets.length = 0;
    zombies.length = 0;
    particles.length = 0;
    score = 0;
    gameOver = false;
    zombieSpawnTimer = 0;
    
    // Hide game over screen
    gameOverScreen.style.display = 'none';
}

// Event listeners
restartButton.addEventListener('click', restartGame);

// Start game
gameLoop();