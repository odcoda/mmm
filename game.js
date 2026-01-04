// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
const gameState = {
    lastTime: 0,
    fps: 0,
    frameCount: 0,
    fpsTime: 0,
    highlightedReg: null,
    highlightedAddr: null
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

// Handle Enter key in inspector input
document.getElementById('inspectInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        inspect();
    }
});

// Initialize
function init() {
    console.log('MMIX Emulator initialized');
    updateDisplay();
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
}

// Render MMIX state on canvas
function render() {
    // Clear canvas
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw register visualization
    drawRegisterVisualization();

    // Draw memory map
    drawMemoryMap();

    // Draw title and info
    ctx.fillStyle = '#00ff88';
    ctx.font = '14px monospace';
    ctx.fillText('MMIX Machine State', 10, 25);
}

// Draw register bars visualization
function drawRegisterVisualization() {
    const startX = 20;
    const startY = 50;
    const barWidth = 8;
    const barMaxHeight = 150;
    const gap = 2;

    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText('General Registers ($0-$255) - Height = log2(value+1)', startX, startY - 10);

    // Draw all 256 registers as bars
    for (let i = 0; i < 256; i++) {
        const value = mmix.reg[i];
        // Use log scale for visualization (0-64 bits)
        let height = 0;
        if (value > 0n) {
            height = Math.min(barMaxHeight, Math.log2(Number(value) + 1) * (barMaxHeight / 64));
        }

        const x = startX + i * (barWidth + gap);
        const y = startY + barMaxHeight - height;

        // Color based on value
        if (value === 0n) {
            ctx.fillStyle = '#1a1a2e';
        } else if (i === gameState.highlightedReg) {
            ctx.fillStyle = '#00ff88';
        } else {
            // Gradient from blue to red based on register index
            const hue = (i / 256) * 240;
            ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
        }

        ctx.fillRect(x, y, barWidth, height || 2);

        // Draw register number every 16 registers
        if (i % 32 === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '9px monospace';
            ctx.fillText(`$${i}`, x, startY + barMaxHeight + 12);
        }
    }

    // Draw axis
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(startX - 5, startY + barMaxHeight);
    ctx.lineTo(startX + 256 * (barWidth + gap), startY + barMaxHeight);
    ctx.stroke();
}

// Draw memory map visualization
function drawMemoryMap() {
    const startX = 20;
    const startY = 250;
    const cellSize = 8;
    const cols = 64;
    const rows = 28;

    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText('Memory Map (8 bytes per cell, darker = more data)', startX, startY - 10);

    // Get used addresses
    const usedAddrs = mmix.mem.getUsedAddresses();

    // Create a density map
    const density = new Map();
    for (const addr of usedAddrs) {
        const cell = addr / 8n;
        density.set(cell, (density.get(cell) || 0) + 1);
    }

    // Draw grid
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const cellIndex = BigInt(row * cols + col);
            const x = startX + col * cellSize;
            const y = startY + row * cellSize;

            const count = density.get(cellIndex) || 0;

            if (count > 0) {
                // Color based on density (1-8 bytes used)
                const intensity = Math.min(255, count * 32);
                ctx.fillStyle = `rgb(${intensity}, ${intensity / 2}, ${intensity / 4})`;
            } else {
                ctx.fillStyle = '#111';
            }

            ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
        }
    }

    // Draw address labels
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    ctx.fillText('#0000', startX, startY + rows * cellSize + 12);
    ctx.fillText(`#${(cols * rows * 8).toString(16).toUpperCase()}`, startX + (cols - 8) * cellSize, startY + rows * cellSize + 12);
}

// Update HTML display elements
function updateDisplay() {
    // Update PC
    document.getElementById('pcValue').textContent = formatHex(mmix.pc, 16);

    // Update general registers (show first 16)
    const regContainer = document.getElementById('registers');
    regContainer.innerHTML = '';
    for (let i = 0; i < 16; i++) {
        const div = document.createElement('div');
        div.className = 'register-item' + (i === gameState.highlightedReg ? ' highlight' : '');
        div.innerHTML = `<span class="register-name">$${i}</span><span class="register-value">${mmix.getRegHex(i)}</span>`;
        regContainer.appendChild(div);
    }

    // Update special registers
    const specialContainer = document.getElementById('specialRegisters');
    specialContainer.innerHTML = '';
    const specialNames = ['rA', 'rB', 'rC', 'rD', 'rE', 'rG', 'rH', 'rJ', 'rL', 'rR'];
    for (const name of specialNames) {
        const index = SpecialReg[name];
        const div = document.createElement('div');
        div.className = 'register-item';
        div.innerHTML = `<span class="register-name">${name}</span><span class="register-value">${mmix.getSpecialRegHex(index)}</span>`;
        specialContainer.appendChild(div);
    }

    // Update memory view
    const memContainer = document.getElementById('memoryView');
    memContainer.innerHTML = '';
    const usedAddrs = mmix.mem.getUsedAddresses();

    // Group by octabyte
    const octaAddrs = new Set();
    for (const addr of usedAddrs) {
        octaAddrs.add(addr & ~7n);
    }

    // Show up to 20 octabytes
    const sortedOctas = Array.from(octaAddrs).sort((a, b) => a < b ? -1 : 1).slice(0, 20);
    for (const addr of sortedOctas) {
        const value = mmix.mem.read(addr, Width.OCTA);
        const hexValue = formatHex(value, 16);

        // ASCII representation
        let ascii = '';
        for (let i = 0; i < 8; i++) {
            const byte = Number((value >> BigInt((7 - i) * 8)) & 0xFFn);
            ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
        }

        const div = document.createElement('div');
        div.className = 'memory-row';
        div.innerHTML = `<span class="memory-addr">#${formatHex(addr, 16)}</span><span class="memory-hex">${hexValue}</span><span class="memory-ascii">${ascii}</span>`;
        memContainer.appendChild(div);
    }

    if (sortedOctas.length === 0) {
        memContainer.innerHTML = '<div class="memory-row"><span class="memory-addr">No memory used</span></div>';
    }
}

// Inspect a register or memory location
function inspect() {
    const input = document.getElementById('inspectInput').value.trim();
    const resultDiv = document.getElementById('inspectResult');

    if (!input) {
        resultDiv.innerHTML = '<div class="result-label">Enter a register ($0-$255, rA-rZZ) or memory address (#addr)</div>';
        return;
    }

    try {
        let result = '';

        if (input.startsWith('$')) {
            // General register
            const regNum = parseInt(input.slice(1), 10);
            if (regNum < 0 || regNum > 255) {
                throw new Error('Register must be $0-$255');
            }
            const value = mmix.getReg(regNum);
            gameState.highlightedReg = regNum;
            result = `
                <div class="result-label">Register ${input}</div>
                <div class="result-value">Hex: #${formatHex(value, 16)}</div>
                <div class="result-value">Dec: ${formatSigned(value)}</div>
            `;
        } else if (input.startsWith('#')) {
            // Memory address
            const addr = BigInt('0x' + input.slice(1));
            const byte = mmix.mem.read(addr, Width.BYTE);
            const wyde = mmix.mem.read(addr, Width.WYDE);
            const tetra = mmix.mem.read(addr, Width.TETRA);
            const octa = mmix.mem.read(addr, Width.OCTA);
            gameState.highlightedAddr = addr;
            result = `
                <div class="result-label">Memory at ${input}</div>
                <div class="result-value">Byte: #${formatHex(byte, 2)}</div>
                <div class="result-value">Wyde: #${formatHex(wyde, 4)}</div>
                <div class="result-value">Tetra: #${formatHex(tetra, 8)}</div>
                <div class="result-value">Octa: #${formatHex(octa, 16)}</div>
            `;
        } else if (input.startsWith('r')) {
            // Special register
            if (!(input in SpecialReg)) {
                throw new Error(`Unknown special register: ${input}`);
            }
            const index = SpecialReg[input];
            const value = mmix.getSpecialReg(index);
            result = `
                <div class="result-label">Special Register ${input}</div>
                <div class="result-value">Hex: #${formatHex(value, 16)}</div>
                <div class="result-value">Dec: ${formatSigned(value)}</div>
            `;
        } else {
            throw new Error('Unknown format. Use $N for registers, #addr for memory, or rX for special registers');
        }

        resultDiv.innerHTML = result;
        updateDisplay();
    } catch (e) {
        resultDiv.innerHTML = `<div class="result-label" style="color: #ff6b6b;">Error: ${e.message}</div>`;
    }
}

// Load example data into MMIX
function loadExample() {
    mmix.reset();

    // Example from MMIX spec: M8[1000] = #0123456789abcdef
    mmix.mem.write(1000n, Width.OCTA, 0x0123456789abcdefn);

    // Set some registers
    mmix.setReg(0, 0x0123456789ABCDEFn);
    mmix.setReg(1, 1000n);
    mmix.setReg(2, 1000n);
    mmix.setReg(3, 2n);

    // Store "HELLO MMIX" at address 2000
    const message = "HELLO MMIX!";
    for (let i = 0; i < message.length; i++) {
        mmix.mem.write(2000n + BigInt(i), Width.BYTE, BigInt(message.charCodeAt(i)));
    }

    // Set some special registers
    mmix.setSpecialReg(SpecialReg.rA, 0n);  // arithmetic status
    mmix.setSpecialReg(SpecialReg.rG, 32n); // global threshold

    mmix.pc = 0x100n;

    updateDisplay();
    console.log('Example data loaded');
}

// Randomize some registers for demo
function randomizeRegisters() {
    for (let i = 0; i < 256; i++) {
        if (Math.random() > 0.7) {
            // Random 64-bit value
            const high = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
            const low = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
            mmix.setReg(i, (high << 32n) | low);
        } else if (Math.random() > 0.5) {
            // Small value
            mmix.setReg(i, BigInt(Math.floor(Math.random() * 1000)));
        } else {
            mmix.setReg(i, 0n);
        }
    }
    updateDisplay();
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

// Start the emulator
init();
requestAnimationFrame(gameLoop);
