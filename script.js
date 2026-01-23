// Game state
let board = ['', '', '', '', '', '', '', '', ''];
let currentPlayer = 'X';
let gameActive = true;

// Firebase state
let currentUser = null;
let userStats = null;
let db = null;
let auth = null;

// Get elements
const cells = document.querySelectorAll('.cell');
const statusDisplay = document.getElementById('status');
const resetButton = document.getElementById('resetButton');
const boardElement = document.getElementById('board');

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

// Initialize Firebase
function initializeFirebase() {
    if (typeof firebase !== 'undefined') {
        auth = firebase.auth();
        db = firebase.firestore();

        // Listen for auth state changes
        auth.onAuthStateChanged(handleAuthStateChange);
    } else {
        console.warn('Firebase not loaded. Auth features disabled.');
    }
}

// Handle authentication state changes
async function handleAuthStateChange(user) {
    currentUser = user;

    if (user) {
        // User is signed in
        document.getElementById('signedOutView').style.display = 'none';
        document.getElementById('signedInView').style.display = 'block';
        document.getElementById('userEmail').textContent = user.email;

        // Load user stats
        await loadUserStats(user.uid);
    } else {
        // User is signed out
        document.getElementById('signedOutView').style.display = 'block';
        document.getElementById('signedInView').style.display = 'none';
        userStats = null;
    }
}

// Load user statistics from Firestore
async function loadUserStats(userId) {
    try {
        const docRef = db.collection('users').doc(userId);
        const doc = await docRef.get();

        if (doc.exists) {
            userStats = doc.data();
        } else {
            // Create initial stats document
            userStats = {
                winsAsX: 0,
                winsAsO: 0,
                losses: 0,
                ties: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await docRef.set(userStats);
        }

        updateStatsDisplay();
    } catch (error) {
        console.error('Error loading stats:', error);
        showAuthMessage('Failed to load stats', 'error');
    }
}

// Update stats display in UI
function updateStatsDisplay() {
    if (userStats) {
        document.getElementById('winsAsX').textContent = userStats.winsAsX || 0;
        document.getElementById('winsAsO').textContent = userStats.winsAsO || 0;
        document.getElementById('losses').textContent = userStats.losses || 0;
        document.getElementById('ties').textContent = userStats.ties || 0;
    }
}

// Save game result to Firestore
async function saveGameResult(result) {
    if (!currentUser || !userStats) {
        return; // Not signed in, skip saving
    }

    try {
        const updates = { ...userStats };

        if (result.type === 'win') {
            // Determine if user won as X or O
            const userSymbol = result.winner;
            if (userSymbol === 'X') {
                updates.winsAsX = (updates.winsAsX || 0) + 1;
            } else {
                updates.winsAsO = (updates.winsAsO || 0) + 1;
            }
        } else if (result.type === 'loss') {
            updates.losses = (updates.losses || 0) + 1;
        } else if (result.type === 'tie') {
            updates.ties = (updates.ties || 0) + 1;
        }

        updates.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();

        await db.collection('users').doc(currentUser.uid).update(updates);
        userStats = updates;
        updateStatsDisplay();
    } catch (error) {
        console.error('Error saving game result:', error);
    }
}

// Email/Password Sign In
async function signInWithEmail(email, password) {
    try {
        await auth.signInWithEmailAndPassword(email, password);
        closeAuthModal();
        showAuthMessage('Signed in successfully!', 'success');
    } catch (error) {
        showAuthMessage(getAuthErrorMessage(error.code), 'error');
    }
}

// Email/Password Sign Up
async function signUpWithEmail(email, password) {
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        closeAuthModal();
        showAuthMessage('Account created successfully!', 'success');
    } catch (error) {
        showAuthMessage(getAuthErrorMessage(error.code), 'error');
    }
}

// Google Sign In
async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
        closeAuthModal();
        showAuthMessage('Signed in with Google!', 'success');
    } catch (error) {
        console.error('Google Sign-In Error:', error);
        console.error('Error Code:', error.code);
        console.error('Error Message:', error.message);
        if (error.code !== 'auth/popup-closed-by-user') {
            showAuthMessage(getAuthErrorMessage(error.code), 'error');
        }
    }
}

// Sign Out
async function signOut() {
    try {
        await auth.signOut();
        showAuthMessage('Signed out successfully', 'success');
    } catch (error) {
        showAuthMessage('Failed to sign out', 'error');
    }
}

// Show auth messages
function showAuthMessage(message, type) {
    const messageEl = document.getElementById('authMessage');
    messageEl.textContent = message;
    messageEl.className = `auth-${type}`;
    messageEl.style.display = 'block';

    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}

// Get user-friendly error messages
function getAuthErrorMessage(errorCode) {
    const messages = {
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password',
        'auth/email-already-in-use': 'Email already in use',
        'auth/weak-password': 'Password should be at least 6 characters',
        'auth/invalid-email': 'Invalid email address',
        'auth/popup-blocked': 'Popup blocked. Please allow popups for this site.',
        'auth/popup-closed-by-user': 'Sign in cancelled',
        'auth/unauthorized-domain': 'This domain is not authorized. Add it in Firebase Console.',
        'auth/operation-not-allowed': 'Google sign-in not enabled in Firebase Console.',
        'auth/cancelled-popup-request': 'Sign in cancelled',
        'auth/network-request-failed': 'Network error. Check your internet connection.'
    };
    return messages[errorCode] || `Authentication error: ${errorCode}`;
}

// Open auth modal
function openAuthModal() {
    document.getElementById('authModal').style.display = 'flex';
}

// Close auth modal
function closeAuthModal() {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('authMessage').style.display = 'none';
}

// Switch between signin/signup tabs
function switchAuthTab(tabName) {
    const tabs = document.querySelectorAll('.tab-btn');
    const forms = document.querySelectorAll('.auth-form-container');

    tabs.forEach(tab => {
        if (tab.getAttribute('data-tab') === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    document.getElementById('signinTab').style.display = tabName === 'signin' ? 'block' : 'none';
    document.getElementById('signupTab').style.display = tabName === 'signup' ? 'block' : 'none';
}

// Setup authentication UI listeners
function setupAuthListeners() {
    // Show auth modal button
    const showModalBtn = document.getElementById('showAuthModalBtn');
    if (showModalBtn) {
        showModalBtn.addEventListener('click', openAuthModal);
    }

    // Modal close button
    const modalClose = document.getElementById('modalClose');
    if (modalClose) {
        modalClose.addEventListener('click', closeAuthModal);
    }

    // Close modal on outside click
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAuthModal();
            }
        });
    }

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchAuthTab(e.target.getAttribute('data-tab'));
        });
    });

    // Sign in form
    const signinForm = document.getElementById('signinForm');
    if (signinForm) {
        signinForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signinEmail').value;
            const password = document.getElementById('signinPassword').value;
            await signInWithEmail(email, password);
        });
    }

    // Sign up form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const confirmPassword = document.getElementById('signupConfirmPassword').value;

            if (password !== confirmPassword) {
                showAuthMessage('Passwords do not match', 'error');
                return;
            }

            await signUpWithEmail(email, password);
        });
    }

    // Google sign in buttons
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const googleSignUpBtn = document.getElementById('googleSignUpBtn');

    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', signInWithGoogle);
    }
    if (googleSignUpBtn) {
        googleSignUpBtn.addEventListener('click', signInWithGoogle);
    }

    // Sign out button
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', signOut);
    }
}

// Initialize game
function init() {
    cells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });
    resetButton.addEventListener('click', resetGame);

    // Initialize Firebase
    initializeFirebase();

    // Auth UI event listeners
    setupAuthListeners();
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

        // Save result for authenticated users
        saveGameResult({ type: 'win', winner: currentPlayer });
        return;
    }

    // Check for tie
    if (!board.includes('')) {
        statusDisplay.textContent = "It's a tie!";
        gameActive = false;

        // Save tie result
        saveGameResult({ type: 'tie' });
        return;
    }

    // Switch player
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    statusDisplay.textContent = `Player ${currentPlayer}'s turn`;
}

// Highlight winning cells
function highlightWinningCells(combo) {
    combo.forEach(index => {
        cells[index].classList.add('winner');
        createExplosion(cells[index]);
    });
}

// Create explosion effect with particles
function createExplosion(cell) {
    const rect = cell.getBoundingClientRect();
    const boardRect = boardElement.getBoundingClientRect();

    // Calculate center position relative to board
    const centerX = rect.left - boardRect.left + rect.width / 2;
    const centerY = rect.top - boardRect.top + rect.height / 2;

    // Create particles
    const particleCount = 20;
    const colors = ['#FFD700', '#FF6347', '#FF69B4', '#00CED1', '#9370DB', '#32CD32'];

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';

        // Random angle and distance for burst effect
        const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
        const distance = 80 + Math.random() * 80;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;

        particle.style.left = centerX + 'px';
        particle.style.top = centerY + 'px';
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.width = (6 + Math.random() * 8) + 'px';
        particle.style.height = particle.style.width;
        particle.style.setProperty('--tx', tx + 'px');
        particle.style.setProperty('--ty', ty + 'px');

        boardElement.appendChild(particle);

        // Remove particle after animation
        setTimeout(() => particle.remove(), 1000);
    }

    // Add exploding class for cell animation
    cell.classList.add('exploding');
    setTimeout(() => cell.classList.remove('exploding'), 800);
}

// Reset game
function resetGame() {
    board = ['', '', '', '', '', '', '', '', ''];
    currentPlayer = 'X';
    gameActive = true;
    statusDisplay.textContent = `Player ${currentPlayer}'s turn`;

    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('x', 'o', 'disabled', 'winner', 'exploding');
    });

    // Remove any remaining particles
    document.querySelectorAll('.particle').forEach(p => p.remove());
}

// Start the game
init();
