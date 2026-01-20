// Game state
let board = ['', '', '', '', '', '', '', '', ''];
let currentPlayer = 'Y';
let gameActive = true;

// Get elements
const cells = document.querySelectorAll('.cell');
const statusDisplay = document.getElementById('status');
const resetButton = document.getElementById('resetButton');
const board_element = document.getElementById('board');

// Winning combinations
const winningCombinations = [
    [0, 1, 2], // Top row
    [3, 4, 5], // Middle row
    [6, 7, 8], // Bottom row
    [0, 3, 6], // Left column
    [1, 4, 7], // Middle column
    [2, 5, 8], // Right column
    [0, 4, 8], // Diagonal top-left to bottom-right
    [2, 4, 6]  // Diagonal top-right to bottom-left
];

// Initialize game
function init() {
    cells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });
    resetButton.addEventListener('click', resetGame);
}

// Handle cell click
function handleCellClick(event) {
    const cell = event.target;
    const index = parseInt(cell.getAttribute('data-index'));

    // Check if cell is already filled or game is over
    if (board[index] !== '' || !gameActive) {
        return;
    }

    // Update board and UI
    board[index] = currentPlayer;
    cell.textContent = currentPlayer;
    cell.classList.add(currentPlayer.toLowerCase());
    cell.classList.add('disabled');
    cell.classList.add('placed');

    // Create explosion effect
    createExplosion(cell);

    // Check for winner or tie
    checkResult();
}

// Check game result
function checkResult() {
    let roundWon = false;
    let winningCombo = null;

    // Check all winning combinations
    for (let i = 0; i < winningCombinations.length; i++) {
        const [a, b, c] = winningCombinations[i];
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            roundWon = true;
            winningCombo = [a, b, c];
            break;
        }
    }

    if (roundWon) {
        statusDisplay.textContent = `Player ${currentPlayer} wins!`;
        gameActive = false;
        highlightWinningCells(winningCombo);
        return;
    }

    // Check for tie
    if (!board.includes('')) {
        statusDisplay.textContent = "It's a tie!";
        gameActive = false;
        return;
    }

    // Switch player
    currentPlayer = currentPlayer === 'Y' ? 'Z' : 'Y';
    statusDisplay.textContent = `Player ${currentPlayer}'s turn`;
}

// Highlight winning cells
function highlightWinningCells(combo) {
    combo.forEach(index => {
        cells[index].classList.add('winner');
    });
}

// Create explosion effect with particles
function createExplosion(cell) {
    const rect = cell.getBoundingClientRect();
    const boardRect = board_element.getBoundingClientRect();
    const centerX = rect.left - boardRect.left + rect.width / 2;
    const centerY = rect.top - boardRect.top + rect.height / 2;

    // Create particles
    const particleCount = 12;
    const colors = ['#667eea', '#764ba2', '#f093fb', '#ff6b6b', '#ffd93d'];

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';

        // Random angle and distance
        const angle = (Math.PI * 2 * i) / particleCount;
        const distance = 50 + Math.random() * 50;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;

        particle.style.left = centerX + 'px';
        particle.style.top = centerY + 'px';
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.setProperty('--tx', tx + 'px');
        particle.style.setProperty('--ty', ty + 'px');

        board_element.appendChild(particle);

        // Remove particle after animation
        setTimeout(() => particle.remove(), 800);
    }

    // Add exploding class temporarily
    cell.classList.add('exploding');
    setTimeout(() => cell.classList.remove('exploding'), 600);
}

// Reset game
function resetGame() {
    board = ['', '', '', '', '', '', '', '', ''];
    currentPlayer = 'Y';
    gameActive = true;
    statusDisplay.textContent = `Player ${currentPlayer}'s turn`;

    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('y', 'z', 'disabled', 'winner', 'placed', 'exploding');
    });
}

// Start the game
init();
