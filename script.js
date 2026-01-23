// Game state
let board = ['', '', '', '', '', '', '', '', ''];
let currentPlayer = 'X';
let gameActive = true;

// Firebase state
let currentUser = null;
let userStats = null;
let db = null;
let auth = null;

// Multiplayer state
let gameMode = 'local';  // 'local' | 'online'
let currentGameId = null;
let playerRole = null;  // 'host' | 'guest'
let playerSymbol = null;  // 'X' | 'O'
let opponentSymbol = null;
let gameListener = null;
let isMyTurn = false;
let opponentDisplayName = '';
let heartbeatInterval = null;

// Get elements
const cells = document.querySelectorAll('.cell');
const statusDisplay = document.getElementById('status');
const resetButton = document.getElementById('resetButton');
const menuButton = document.getElementById('menuButton');
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

        // Check for anonymous stats migration
        checkAndOfferStatsMigration();
    } else {
        // User is signed out
        document.getElementById('signedOutView').style.display = 'block';
        document.getElementById('signedInView').style.display = 'none';
        userStats = null;

        // Show anonymous stats if available
        updateAnonymousStatsDisplay();
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
        document.getElementById('ties').textContent = userStats.ties || 0;
    }
}

// Save game result to Firestore
async function saveGameResult(result) {
    if (!currentUser || !userStats) {
        // Not signed in, save to localStorage instead
        saveAnonymousStatsToLocal(result);
        return;
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

// ===== ANONYMOUS STATS SYSTEM =====

// Initialize anonymous stats
function initAnonymousStats() {
    const stats = getAnonymousStats();
    if (!stats) {
        const newStats = {
            winsAsX: 0,
            winsAsO: 0,
            ties: 0,
            gamesPlayed: 0,
            createdAt: Date.now()
        };
        localStorage.setItem('atictack_anonymous_stats', JSON.stringify(newStats));
    }
}

// Get anonymous stats from localStorage
function getAnonymousStats() {
    const data = localStorage.getItem('atictack_anonymous_stats');
    return data ? JSON.parse(data) : null;
}

// Save anonymous stats to localStorage
function saveAnonymousStatsToLocal(result) {
    const stats = getAnonymousStats() || {
        winsAsX: 0,
        winsAsO: 0,
        ties: 0,
        gamesPlayed: 0,
        createdAt: Date.now()
    };

    if (result.type === 'win') {
        if (result.winner === 'X') {
            stats.winsAsX++;
        } else {
            stats.winsAsO++;
        }
    } else if (result.type === 'tie') {
        stats.ties++;
    }

    stats.gamesPlayed++;
    localStorage.setItem('atictack_anonymous_stats', JSON.stringify(stats));
    updateAnonymousStatsDisplay();
}

// Update anonymous stats display
function updateAnonymousStatsDisplay() {
    if (!currentUser) {
        const stats = getAnonymousStats();
        if (stats) {
            document.getElementById('winsAsX').textContent = stats.winsAsX || 0;
            document.getElementById('winsAsO').textContent = stats.winsAsO || 0;
            document.getElementById('ties').textContent = stats.ties || 0;
        }
    }
}

// Check and offer stats migration
function checkAndOfferStatsMigration() {
    const anonymousStats = getAnonymousStats();

    if (!anonymousStats || anonymousStats.gamesPlayed === 0) {
        return;
    }

    // Show migration modal
    document.getElementById('migrationWinsX').textContent = anonymousStats.winsAsX;
    document.getElementById('migrationWinsO').textContent = anonymousStats.winsAsO;
    document.getElementById('migrationTies').textContent = anonymousStats.ties;
    document.getElementById('migrationModal').style.display = 'flex';
}

// Migrate anonymous stats to Firebase
async function migrateAnonymousStatsToFirebase() {
    const anonymousStats = getAnonymousStats();

    if (!currentUser || !anonymousStats) return;

    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        const userDoc = await userRef.get();

        const currentStats = userDoc.exists ? userDoc.data() : {
            winsAsX: 0,
            winsAsO: 0,
            ties: 0
        };

        await userRef.update({
            winsAsX: currentStats.winsAsX + anonymousStats.winsAsX,
            winsAsO: currentStats.winsAsO + anonymousStats.winsAsO,
            ties: currentStats.ties + anonymousStats.ties,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Clear anonymous stats
        localStorage.removeItem('atictack_anonymous_stats');

        // Reload user stats
        await loadUserStats(currentUser.uid);

        // Close modal
        document.getElementById('migrationModal').style.display = 'none';
        showAuthMessage('Stats successfully claimed!', 'success');

    } catch (error) {
        console.error('Migration error:', error);
        showAuthMessage('Failed to claim stats', 'error');
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

    // Stats migration buttons
    const claimStatsBtn = document.getElementById('claimStatsBtn');
    const skipStatsBtn = document.getElementById('skipStatsBtn');
    if (claimStatsBtn) {
        claimStatsBtn.addEventListener('click', migrateAnonymousStatsToFirebase);
    }
    if (skipStatsBtn) {
        skipStatsBtn.addEventListener('click', () => {
            document.getElementById('migrationModal').style.display = 'none';
            localStorage.removeItem('atictack_anonymous_stats');
        });
    }
}

// ===== ROOM CODE SYSTEM =====

// Generate unique 6-character room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // Exclude ambiguous chars like 0, O, 1, I
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Validate room code and check game availability
async function validateRoomCode(code) {
    if (!/^[A-Z0-9]{6}$/.test(code)) {
        return { valid: false, error: 'Invalid code format' };
    }

    try {
        const gameDoc = await db.collection('games').doc(code).get();
        if (!gameDoc.exists) {
            return { valid: false, error: 'Game not found' };
        }

        const game = gameDoc.data();
        if (game.status === 'completed' || game.status === 'abandoned') {
            return { valid: false, error: 'Game already ended' };
        }

        if (game.status === 'active' && game.guestId) {
            return { valid: false, error: 'Game is full' };
        }

        return { valid: true, game };
    } catch (error) {
        console.error('Error validating room code:', error);
        return { valid: false, error: 'Failed to validate code' };
    }
}

// ===== FIRESTORE GAME MANAGEMENT =====

// Create multiplayer game
async function createMultiplayerGame() {
    try {
        // Generate unique room code
        let roomCode;
        let attempts = 0;
        do {
            roomCode = generateRoomCode();
            const exists = await db.collection('games').doc(roomCode).get();
            if (!exists.exists) break;
            attempts++;
        } while (attempts < 5);

        if (attempts >= 5) throw new Error('Failed to generate unique code');

        // Determine player identity
        const userId = currentUser ? currentUser.uid : null;
        const displayName = currentUser
            ? (currentUser.email.split('@')[0] || 'Player 1')
            : 'Anonymous Player';

        // Host always plays as X
        const gameData = {
            gameId: roomCode,
            hostId: userId,
            hostDisplayName: displayName,
            guestId: null,
            guestDisplayName: null,
            status: 'waiting',
            board: ['', '', '', '', '', '', '', '', ''],
            currentTurn: 'host',
            hostSymbol: 'X',
            guestSymbol: 'O',
            winner: null,
            winningCombo: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastActivityAt: firebase.firestore.FieldValue.serverTimestamp(),
            hostLastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            guestLastSeen: null
        };

        await db.collection('games').doc(roomCode).set(gameData);

        // Update local state
        gameMode = 'online';
        currentGameId = roomCode;
        playerRole = 'host';
        playerSymbol = 'X';
        opponentSymbol = 'O';
        isMyTurn = true;

        // Update user's active game
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid).update({
                currentGameId: roomCode,
                lastGameAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // Setup listener
        setupGameListener(roomCode);

        // Show waiting UI
        showCreateGameUI(roomCode);

    } catch (error) {
        console.error('Error creating game:', error);
        showErrorMessage('Failed to create game. Please try again.');
    }
}

// Join multiplayer game
async function joinMultiplayerGame(roomCode) {
    try {
        // Validate room code
        const validation = await validateRoomCode(roomCode);
        if (!validation.valid) {
            showErrorMessage(validation.error);
            return;
        }

        // Determine player identity
        const userId = currentUser ? currentUser.uid : null;
        const displayName = currentUser
            ? (currentUser.email.split('@')[0] || 'Player 2')
            : 'Anonymous Player';

        // Join game
        await db.collection('games').doc(roomCode).update({
            guestId: userId,
            guestDisplayName: displayName,
            status: 'active',
            guestLastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastActivityAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        gameMode = 'online';
        currentGameId = roomCode;
        playerRole = 'guest';
        playerSymbol = 'O';
        opponentSymbol = 'X';
        isMyTurn = false;
        opponentDisplayName = validation.game.hostDisplayName;

        // Update user's active game
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid).update({
                currentGameId: roomCode,
                lastGameAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // Setup listener
        setupGameListener(roomCode);

        // Show game UI
        showActiveGameUI();

    } catch (error) {
        console.error('Error joining game:', error);
        showErrorMessage('Failed to join game. Please try again.');
    }
}

// Leave game
async function leaveGame() {
    if (!currentGameId) return;

    try {
        const gameRef = db.collection('games').doc(currentGameId);
        const gameDoc = await gameRef.get();

        if (gameDoc.exists) {
            const gameData = gameDoc.data();

            // If game not started yet, delete it
            if (gameData.status === 'waiting') {
                await gameRef.delete();
            } else {
                // Mark as abandoned and declare opponent winner
                await gameRef.update({
                    status: 'abandoned',
                    winner: playerRole === 'host' ? 'guest' : 'host',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        cleanupGame();
        showGameModeSelection();

    } catch (error) {
        console.error('Error leaving game:', error);
    }
}

// Cleanup game state
function cleanupGame() {
    // Cleanup listener
    if (gameListener) {
        gameListener();
        gameListener = null;
    }

    // Cleanup heartbeat
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    // Reset state
    gameMode = 'local';
    currentGameId = null;
    playerRole = null;
    playerSymbol = null;
    opponentSymbol = null;
    isMyTurn = false;
    opponentDisplayName = '';

    // Reset board
    board = ['', '', '', '', '', '', '', '', ''];
    currentPlayer = 'X';
    gameActive = true;

    // Clear UI
    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('x', 'o', 'disabled', 'winner');
    });

    // Hide post-game options
    document.getElementById('postGameOptions').style.display = 'none';

    statusDisplay.textContent = `Player ${currentPlayer}'s turn`;
}

// Cleanup old games (run periodically)
async function cleanupOldGames() {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const snapshot = await db.collection('games')
            .where('lastActivityAt', '<', oneHourAgo)
            .where('status', 'in', ['waiting', 'active'])
            .limit(10)
            .get();

        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
    } catch (error) {
        console.error('Error cleaning up old games:', error);
    }
}

// ===== REAL-TIME SYNCHRONIZATION =====

// Setup game listener
function setupGameListener(gameId) {
    // Cleanup existing listener
    if (gameListener) {
        gameListener();
        gameListener = null;
    }

    // Setup new listener
    gameListener = db.collection('games').doc(gameId)
        .onSnapshot((doc) => {
            if (!doc.exists) {
                handleGameDeleted();
                return;
            }

            handleGameUpdate(doc.data());
        }, (error) => {
            console.error('Game listener error:', error);
            showErrorMessage('Connection lost. Please refresh the page.');
        });

    // Start heartbeat
    startHeartbeat(gameId);
}

// Start heartbeat to track connection
function startHeartbeat(gameId) {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    heartbeatInterval = setInterval(() => {
        if (gameMode !== 'online' || currentGameId !== gameId) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
            return;
        }

        const field = playerRole === 'host' ? 'hostLastSeen' : 'guestLastSeen';
        db.collection('games').doc(gameId).update({
            [field]: firebase.firestore.FieldValue.serverTimestamp(),
            lastActivityAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.error('Heartbeat failed:', err));
    }, 10000);  // Every 10 seconds
}

// Handle game updates
function handleGameUpdate(gameData) {
    // Update opponent info
    if (playerRole === 'host') {
        if (gameData.guestId && !opponentDisplayName) {
            opponentDisplayName = gameData.guestDisplayName;
            showGameStartNotification();
        }
    } else {
        opponentDisplayName = gameData.hostDisplayName;
    }

    // Update turn
    isMyTurn = gameData.currentTurn === playerRole;

    // Sync board state
    updateLocalGameState(gameData);

    // Handle game completion
    if (gameData.status === 'completed') {
        handleGameCompleted(gameData);
    } else if (gameData.status === 'active') {
        // Game is active (could be a rematch that just started)
        // Hide post-game options if they're showing
        if (document.getElementById('postGameOptions').style.display === 'block') {
            document.getElementById('postGameOptions').style.display = 'none';
            document.getElementById('leaveGameBtn').style.display = 'block';
        }
    }

    // Check for opponent disconnect
    checkOpponentConnection(gameData);

    // Update UI
    updateMultiplayerUI(gameData);
}

// Update local game state from Firestore
function updateLocalGameState(gameData) {
    board = [...gameData.board];

    // Update cell display
    cells.forEach((cell, index) => {
        const value = board[index];
        cell.textContent = value;
        if (value) {
            cell.classList.add(value.toLowerCase());
            cell.classList.add('disabled');
        }
    });

    // Update game active state
    gameActive = gameData.status === 'active' || gameData.status === 'waiting';
}

// Handle game completion
function handleGameCompleted(gameData) {
    gameActive = false;

    if (gameData.winner === 'tie') {
        statusDisplay.textContent = "It's a tie!";
    } else {
        const winnerName = gameData.winner === playerRole ? 'You' : opponentDisplayName;
        statusDisplay.textContent = `${winnerName} win!`;

        // Highlight winning cells
        if (gameData.winningCombo) {
            highlightWinningCells(gameData.winningCombo);
        }
    }

    // Show post-game options for online multiplayer
    showPostGameOptions(gameData);
}

// Show post-game options
function showPostGameOptions(gameData) {
    document.getElementById('postGameOptions').style.display = 'block';
    document.getElementById('leaveGameBtn').style.display = 'none';

    // Check rematch status
    const hostWantsRematch = gameData.hostWantsRematch || false;
    const guestWantsRematch = gameData.guestWantsRematch || false;

    const myRematch = playerRole === 'host' ? hostWantsRematch : guestWantsRematch;
    const opponentRematch = playerRole === 'host' ? guestWantsRematch : hostWantsRematch;

    const waitingMsg = document.getElementById('waitingForOpponentMsg');
    const postGameMsg = document.getElementById('postGameMessage');

    if (myRematch && opponentRematch) {
        // Both want rematch - start new game
        postGameMsg.textContent = 'Starting new game...';
        setTimeout(() => startRematch(), 1000);
    } else if (myRematch) {
        // I want rematch, waiting for opponent
        waitingMsg.style.display = 'block';
        postGameMsg.textContent = 'You want to play again!';
    } else if (opponentRematch) {
        // Opponent wants rematch
        postGameMsg.textContent = `${opponentDisplayName} wants to play again!`;
        waitingMsg.style.display = 'none';
    } else {
        // No one has decided yet
        postGameMsg.textContent = 'What would you like to do?';
        waitingMsg.style.display = 'none';
    }
}

// Request rematch
async function requestRematch() {
    if (!currentGameId) return;

    try {
        const field = playerRole === 'host' ? 'hostWantsRematch' : 'guestWantsRematch';
        await db.collection('games').doc(currentGameId).update({
            [field]: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        document.getElementById('waitingForOpponentMsg').style.display = 'block';
        document.getElementById('postGameMessage').textContent = 'You want to play again!';
    } catch (error) {
        console.error('Error requesting rematch:', error);
        showErrorMessage('Failed to request rematch');
    }
}

// Start rematch
async function startRematch() {
    if (!currentGameId) return;

    try {
        // Reset the game board and state
        await db.collection('games').doc(currentGameId).update({
            board: ['', '', '', '', '', '', '', '', ''],
            currentTurn: 'host',
            status: 'active',
            winner: null,
            winningCombo: null,
            hostWantsRematch: false,
            guestWantsRematch: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastActivityAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Reset local state
        board = ['', '', '', '', '', '', '', '', ''];
        gameActive = true;
        isMyTurn = playerRole === 'host';

        // Clear UI
        cells.forEach(cell => {
            cell.textContent = '';
            cell.classList.remove('x', 'o', 'disabled', 'winner', 'exploding');
        });

        // Remove particles
        document.querySelectorAll('.particle').forEach(p => p.remove());

        // Hide post-game options
        document.getElementById('postGameOptions').style.display = 'none';
        document.getElementById('leaveGameBtn').style.display = 'block';

        // Update status
        if (isMyTurn) {
            statusDisplay.textContent = "Your turn";
            statusDisplay.className = 'my-turn';
        } else {
            statusDisplay.textContent = `${opponentDisplayName}'s turn`;
            statusDisplay.className = 'their-turn';
        }
    } catch (error) {
        console.error('Error starting rematch:', error);
        showErrorMessage('Failed to start rematch');
    }
}

// Return to menu from online game
async function returnToMenuFromOnline() {
    if (!currentGameId) return;

    try {
        // Mark that player is leaving
        const field = playerRole === 'host' ? 'hostWantsRematch' : 'guestWantsRematch';
        await db.collection('games').doc(currentGameId).update({
            [field]: false,
            status: 'abandoned',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        cleanupGame();
        showGameModeSelection();
    } catch (error) {
        console.error('Error returning to menu:', error);
        cleanupGame();
        showGameModeSelection();
    }
}

// Handle game deleted
function handleGameDeleted() {
    showErrorMessage('Game has been deleted');
    cleanupGame();
    showGameModeSelection();
}

// Show game start notification
function showGameStartNotification() {
    statusDisplay.textContent = `${opponentDisplayName} joined! Game starting...`;
    setTimeout(() => {
        showActiveGameUI();
    }, 1000);
}

// Make move in online game
async function makeMove(index) {
    const gameRef = db.collection('games').doc(currentGameId);

    // Get current game state
    const gameDoc = await gameRef.get();
    if (!gameDoc.exists) throw new Error('Game not found');

    const gameData = gameDoc.data();

    // Validate it's still our turn (prevent race conditions)
    if (gameData.currentTurn !== playerRole) {
        throw new Error('Not your turn');
    }

    // Validate cell is empty
    if (gameData.board[index] !== '') {
        throw new Error('Cell already occupied');
    }

    // Update board
    const newBoard = [...gameData.board];
    newBoard[index] = playerSymbol;

    // Check for winner
    const result = checkWinner(newBoard);

    const updates = {
        board: newBoard,
        currentTurn: playerRole === 'host' ? 'guest' : 'host',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActivityAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Handle game end
    if (result.gameOver) {
        updates.status = 'completed';
        updates.winner = result.winner;
        updates.winningCombo = result.winningCombo;

        // Update player stats
        await updateMultiplayerStats(result);
    }

    await gameRef.update(updates);
}

// Check for winner
function checkWinner(board) {
    // Check all winning combinations
    for (let combo of winningCombinations) {
        const [a, b, c] = combo;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return {
                gameOver: true,
                winner: board[a] === playerSymbol ? playerRole : (playerRole === 'host' ? 'guest' : 'host'),
                winningCombo: combo
            };
        }
    }

    // Check for tie
    if (!board.includes('')) {
        return { gameOver: true, winner: 'tie', winningCombo: null };
    }

    return { gameOver: false, winner: null, winningCombo: null };
}

// Update multiplayer stats
async function updateMultiplayerStats(result) {
    if (!currentUser) {
        // Save to localStorage for anonymous users
        if (result.winner === playerRole) {
            saveAnonymousStatsToLocal({ type: 'win', winner: playerSymbol });
        } else if (result.winner === 'tie') {
            saveAnonymousStatsToLocal({ type: 'tie' });
        }
        return;
    }

    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        const updates = {};

        if (result.winner === playerRole) {
            // Won
            updates.multiplayerWins = firebase.firestore.FieldValue.increment(1);
            if (playerSymbol === 'X') {
                updates.winsAsX = firebase.firestore.FieldValue.increment(1);
            } else {
                updates.winsAsO = firebase.firestore.FieldValue.increment(1);
            }
        } else if (result.winner === 'tie') {
            // Tie
            updates.multiplayerTies = firebase.firestore.FieldValue.increment(1);
            updates.ties = firebase.firestore.FieldValue.increment(1);
        } else {
            // Lost
            updates.multiplayerLosses = firebase.firestore.FieldValue.increment(1);
        }

        updates.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();

        await userRef.update(updates);
        await loadUserStats(currentUser.uid);
    } catch (error) {
        console.error('Error updating multiplayer stats:', error);
    }
}

// ===== UI MANAGEMENT =====

// Show error message
function showErrorMessage(message) {
    statusDisplay.textContent = message;
    statusDisplay.style.color = '#f44336';

    setTimeout(() => {
        statusDisplay.style.color = '';
        if (gameMode === 'online') {
            updateMultiplayerUI({ currentTurn: isMyTurn ? playerRole : (playerRole === 'host' ? 'guest' : 'host') });
        }
    }, 3000);
}

// Show game mode selection
function showGameModeSelection() {
    document.getElementById('gameModeSelection').style.display = 'block';
    document.getElementById('onlineGameOptions').style.display = 'none';
    document.getElementById('createGameUI').style.display = 'none';
    document.getElementById('joinGameUI').style.display = 'none';
    document.getElementById('multiplayerInfo').style.display = 'none';
    document.getElementById('board').style.display = 'none';
    document.getElementById('resetButton').style.display = 'none';
    menuButton.style.display = 'none';
}

// Show online options
function showOnlineOptions() {
    document.getElementById('gameModeSelection').style.display = 'none';
    document.getElementById('onlineGameOptions').style.display = 'block';
}

// Show create game UI
function showCreateGameUI(roomCode) {
    document.getElementById('onlineGameOptions').style.display = 'none';
    document.getElementById('createGameUI').style.display = 'block';
    document.getElementById('roomCodeDisplay').textContent = roomCode;
    document.getElementById('board').style.display = 'grid';
    statusDisplay.textContent = 'Waiting for opponent...';
}

// Show join game UI
function showJoinGameUI() {
    document.getElementById('onlineGameOptions').style.display = 'none';
    document.getElementById('joinGameUI').style.display = 'block';
}

// Show active game UI
function showActiveGameUI() {
    document.getElementById('gameModeSelection').style.display = 'none';
    document.getElementById('createGameUI').style.display = 'none';
    document.getElementById('joinGameUI').style.display = 'none';
    document.getElementById('onlineGameOptions').style.display = 'none';
    document.getElementById('multiplayerInfo').style.display = 'block';
    document.getElementById('board').style.display = 'grid';
    document.getElementById('resetButton').style.display = 'none';
}

// Show local game UI
function showLocalGameUI() {
    document.getElementById('gameModeSelection').style.display = 'none';
    document.getElementById('multiplayerInfo').style.display = 'none';
    document.getElementById('board').style.display = 'grid';
    document.getElementById('resetButton').style.display = 'block';
    menuButton.style.display = 'none';
    statusDisplay.textContent = `Player ${currentPlayer}'s turn`;
}

// Update multiplayer UI
function updateMultiplayerUI(gameData) {
    // Update opponent name
    if (opponentDisplayName) {
        document.getElementById('opponentName').textContent = opponentDisplayName;
    }

    // Update your symbol
    document.getElementById('yourSymbol').textContent = playerSymbol;

    // Update turn indicator
    if (isMyTurn) {
        statusDisplay.textContent = "Your turn";
        statusDisplay.className = 'my-turn';
    } else {
        statusDisplay.textContent = `${opponentDisplayName}'s turn`;
        statusDisplay.className = 'their-turn';
    }
}

// Check opponent connection
function checkOpponentConnection(gameData) {
    const now = Date.now();
    const opponentField = playerRole === 'host' ? 'guestLastSeen' : 'hostLastSeen';
    const lastSeen = gameData[opponentField]?.toMillis();

    if (!lastSeen) return;

    const timeSince = now - lastSeen;
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');

    if (timeSince > 30000) {  // 30 seconds
        statusDot.classList.add('disconnected');
        statusText.textContent = 'Opponent disconnected';
    } else {
        statusDot.classList.remove('disconnected');
        statusText.textContent = 'Connected';
    }
}

// Setup multiplayer event listeners
function setupMultiplayerListeners() {
    // Local game button
    const localGameBtn = document.getElementById('localGameBtn');
    if (localGameBtn) {
        localGameBtn.addEventListener('click', () => {
            gameMode = 'local';
            resetGame();
            showLocalGameUI();
        });
    }

    // Online game button
    const onlineGameBtn = document.getElementById('onlineGameBtn');
    if (onlineGameBtn) {
        onlineGameBtn.addEventListener('click', showOnlineOptions);
    }

    // Create game button
    const createGameBtn = document.getElementById('createGameBtn');
    if (createGameBtn) {
        createGameBtn.addEventListener('click', createMultiplayerGame);
    }

    // Join game button
    const joinGameBtn = document.getElementById('joinGameBtn');
    if (joinGameBtn) {
        joinGameBtn.addEventListener('click', showJoinGameUI);
    }

    // Submit join button
    const submitJoinBtn = document.getElementById('submitJoinBtn');
    if (submitJoinBtn) {
        submitJoinBtn.addEventListener('click', () => {
            const roomCode = document.getElementById('roomCodeInput').value.toUpperCase().trim();
            if (roomCode.length === 6) {
                joinMultiplayerGame(roomCode);
            } else {
                showErrorMessage('Please enter a valid 6-character code');
            }
        });
    }

    // Room code input enter key
    const roomCodeInput = document.getElementById('roomCodeInput');
    if (roomCodeInput) {
        roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitJoinBtn.click();
            }
        });
        // Auto-uppercase input
        roomCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    // Copy code button
    const copyCodeBtn = document.getElementById('copyCodeBtn');
    if (copyCodeBtn) {
        copyCodeBtn.addEventListener('click', () => {
            const roomCode = document.getElementById('roomCodeDisplay').textContent;
            navigator.clipboard.writeText(roomCode).then(() => {
                copyCodeBtn.textContent = '✓ Copied!';
                setTimeout(() => {
                    copyCodeBtn.textContent = '📋 Copy Code';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy:', err);
                showErrorMessage('Failed to copy code');
            });
        });
    }

    // Leave game button
    const leaveGameBtn = document.getElementById('leaveGameBtn');
    if (leaveGameBtn) {
        leaveGameBtn.addEventListener('click', leaveGame);
    }

    // Cancel game button
    const cancelGameBtn = document.getElementById('cancelGameBtn');
    if (cancelGameBtn) {
        cancelGameBtn.addEventListener('click', leaveGame);
    }

    // Back buttons
    const backToModesBtn = document.getElementById('backToModesBtn');
    if (backToModesBtn) {
        backToModesBtn.addEventListener('click', showGameModeSelection);
    }

    const backToOnlineBtn = document.getElementById('backToOnlineBtn');
    if (backToOnlineBtn) {
        backToOnlineBtn.addEventListener('click', showOnlineOptions);
    }

    // Post-game buttons
    const playAgainBtn = document.getElementById('playAgainBtn');
    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', requestRematch);
    }

    const returnToMenuBtn = document.getElementById('returnToMenuBtn');
    if (returnToMenuBtn) {
        returnToMenuBtn.addEventListener('click', returnToMenuFromOnline);
    }
}

// Initialize game
function init() {
    cells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });
    resetButton.addEventListener('click', resetGame);
    menuButton.addEventListener('click', returnToMenu);

    // Initialize Firebase
    initializeFirebase();

    // Initialize anonymous stats
    initAnonymousStats();

    // Auth UI event listeners
    setupAuthListeners();

    // Multiplayer event listeners
    setupMultiplayerListeners();

    // Show game mode selection
    showGameModeSelection();

    // Cleanup old games periodically (every 5 minutes)
    setInterval(cleanupOldGames, 5 * 60 * 1000);
}

// Handle cell click
async function handleCellClick(event) {
    const cell = event.target;
    const index = parseInt(cell.getAttribute('data-index'));

    // LOCAL GAME MODE
    if (gameMode === 'local') {
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
        return;
    }

    // ONLINE GAME MODE
    if (gameMode === 'online') {
        // Validate move
        if (board[index] !== '') return;
        if (!gameActive) return;
        if (!isMyTurn) {
            showErrorMessage("It's not your turn!");
            return;
        }

        try {
            // Optimistic update
            board[index] = playerSymbol;
            cell.textContent = playerSymbol;
            cell.classList.add(playerSymbol.toLowerCase());
            cell.classList.add('disabled');

            // Update Firestore
            await makeMove(index);

        } catch (error) {
            // Rollback on error
            board[index] = '';
            cell.textContent = '';
            cell.classList.remove(playerSymbol.toLowerCase(), 'disabled');
            showErrorMessage('Failed to make move. Please try again.');
            console.error('Move error:', error);
        }
    }
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

        // Show menu button after game ends
        menuButton.style.display = 'block';
        return;
    }

    // Check for tie
    if (!board.includes('')) {
        statusDisplay.textContent = "It's a tie!";
        gameActive = false;

        // Save tie result
        saveGameResult({ type: 'tie' });

        // Show menu button after game ends
        menuButton.style.display = 'block';
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
    // Prevent reset in online mode
    if (gameMode === 'online') {
        showErrorMessage('Use "Leave Game" to exit online game');
        return;
    }

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

    // Hide menu button when resetting
    menuButton.style.display = 'none';
}

// Return to menu
function returnToMenu() {
    board = ['', '', '', '', '', '', '', '', ''];
    currentPlayer = 'X';
    gameActive = true;

    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('x', 'o', 'disabled', 'winner', 'exploding');
    });

    // Remove any remaining particles
    document.querySelectorAll('.particle').forEach(p => p.remove());

    // Hide menu button
    menuButton.style.display = 'none';

    // Go back to game mode selection
    showGameModeSelection();
}

// Start the game
init();
