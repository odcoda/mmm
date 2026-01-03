// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
const gameState = {
    lastTime: 0,
    fps: 0,
    frameCount: 0,
    fpsTime: 0
};

// Input handling
const input = {
    keys: {},
    mouse: { x: 0, y: 0, down: false }
};

// Event listeners for input
window.addEventListener('keydown', (e) => {
    input.keys[e.key] = true;
});

window.addEventListener('keyup', (e) => {
    input.keys[e.key] = false;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = e.clientX - rect.left;
    input.mouse.y = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', (e) => {
    input.mouse.down = true;
});

canvas.addEventListener('mouseup', (e) => {
    input.mouse.down = false;
});

// Initialize game
function init() {
    console.log('Game initialized');
    // Add initialization code here
}

// Update game state
function update(deltaTime) {
    // Update FPS counter
    gameState.frameCount++;
    gameState.fpsTime += deltaTime;

    if (gameState.fpsTime >= 1000) {
        gameState.fps = gameState.frameCount;
        gameState.frameCount = 0;
        gameState.fpsTime = 0;
        document.getElementById('fps').textContent = gameState.fps;
    }

    // Add game update logic here
}

// Render game
function render() {
    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw example
    ctx.fillStyle = '#0f0';
    ctx.fillRect(10, 10, 50, 50);

    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.fillText('Ready to build your game!', 20, 100);

    // Add render logic here
}

// Main game loop
function gameLoop(currentTime) {
    // Calculate delta time in milliseconds
    const deltaTime = currentTime - gameState.lastTime;
    gameState.lastTime = currentTime;

    // Update and render
    update(deltaTime);
    render();

    // Request next frame
    requestAnimationFrame(gameLoop);
}

// Start the game
init();
requestAnimationFrame(gameLoop);
