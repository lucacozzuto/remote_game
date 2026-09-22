/**
 * C64 Remote Controller - WebRTC P2P Receiver & Input Controller
 */
(function() {
    let peer = null;
    let conn = null;
    let activeMask = 0;
    const inputState = {
        up: false,
        down: false,
        left: false,
        right: false,
        fire: false
    };

    const statusOverlay = document.getElementById('status-overlay');
    const statusMessage = document.getElementById('status-message');
    const roomInput = document.getElementById('room-input');
    const btnConnect = document.getElementById('btn-connect');
    const loader = document.getElementById('loader');
    const joinForm = document.getElementById('join-form');
    const gameVideo = document.getElementById('gameVideo');
    const audioPrompt = document.getElementById('audio-prompt');
    const btnUnmute = document.getElementById('btn-unmute');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    const gameBanner = document.getElementById('game-banner');

    function showBanner(text, ms = 4000) {
        if (!gameBanner) return;
        gameBanner.innerText = text;
        gameBanner.classList.remove('hidden');
        setTimeout(() => gameBanner.classList.add('hidden'), ms);
    }

    function calculateBitmask() {
        let mask = 0;
        if (inputState.up) mask |= 1;
        if (inputState.down) mask |= 2;
        if (inputState.left) mask |= 4;
        if (inputState.right) mask |= 8;
        if (inputState.fire) mask |= 16;
        return mask;
    }

    function updateAndSendInput() {
        const newMask = calculateBitmask();
        if (newMask !== activeMask) {
            activeMask = newMask;
            if (conn && conn.open) {
                conn.send({ type: 'INPUT_MASK', mask: activeMask });
            }
        }
    }

    // Mapping from DOM event.code to Commodore 64 8x8 CIA1 Keyboard Matrix indices (0-63)
    const C64_KEY_MATRIX_MAP = {
        // Letters (A-Z)
        'KeyA': 31, 'KeyB': 50, 'KeyC': 48, 'KeyD': 33, 'KeyE': 19,
        'KeyF': 34, 'KeyG': 35, 'KeyH': 36, 'KeyI': 24, 'KeyJ': 37,
        'KeyK': 38, 'KeyL': 39, 'KeyM': 52, 'KeyN': 51, 'KeyO': 25,
        'KeyP': 26, 'KeyQ': 17, 'KeyR': 20, 'KeyS': 32, 'KeyT': 21,
        'KeyU': 23, 'KeyV': 49, 'KeyW': 18, 'KeyX': 47, 'KeyY': 22, 'KeyZ': 46,

        // Digits (0-9)
        'Digit0': 1, 'Digit1': 2, 'Digit2': 3, 'Digit3': 4, 'Digit4': 5,
        'Digit5': 6, 'Digit6': 7, 'Digit7': 8, 'Digit8': 9, 'Digit9': 10,
        'Numpad0': 1, 'Numpad1': 2, 'Numpad2': 3, 'Numpad3': 4, 'Numpad4': 5,
        'Numpad5': 6, 'Numpad6': 7, 'Numpad7': 8, 'Numpad8': 9, 'Numpad9': 10,

        // Controls & Editing
        'Enter': 43,
        'NumpadEnter': 43,
        'Space': 59,
        'Backspace': 15,
        'Delete': 15,
        'Escape': 30,

        // Function keys
        'F1': 60, 'F2': 60,
        'F3': 61, 'F4': 61,
        'F5': 62, 'F6': 62,
        'F7': 63, 'F8': 63,

        // Modifiers & Punctuation
        'ShiftLeft': 45, 'ShiftRight': 56,
        'Period': 54, 'Comma': 53, 'Slash': 55, 'Equal': 42, 'Minus': 12, 'Semicolon': 41
    };

    const C64_CHAR_FALLBACK = {
        'A': 31, 'B': 50, 'C': 48, 'D': 33, 'E': 19,
        'F': 34, 'G': 35, 'H': 36, 'I': 24, 'J': 37,
        'K': 38, 'L': 39, 'M': 52, 'N': 51, 'O': 25,
        'P': 26, 'Q': 17, 'R': 20, 'S': 32, 'T': 21,
        'U': 23, 'V': 49, 'W': 18, 'X': 47, 'Y': 22, 'Z': 46,
        '0': 1, '1': 2, '2': 3, '3': 4, '4': 5,
        '5': 6, '6': 7, '7': 8, '8': 9, '9': 10,
        ' ': 59, 'ENTER': 43, 'BACKSPACE': 15
    };

    function getC64MatrixIndex(e) {
        if (C64_KEY_MATRIX_MAP[e.code] !== undefined) {
            return C64_KEY_MATRIX_MAP[e.code];
        }
        const upperKey = (e.key || '').toUpperCase();
        if (C64_CHAR_FALLBACK[upperKey] !== undefined) {
            return C64_CHAR_FALLBACK[upperKey];
        }
        return undefined;
    }

    function sendKeyPress(keyCode) {
        if (conn && conn.open) {
            conn.send({ type: 'KEY_PRESS', keyCode });
        }
    }

    function sendC64Key(matrixIndex, action) {
        if (conn && conn.open) {
            conn.send({ type: 'C64_KEY', action, matrixIndex });
        }
    }

    function connectToHost(roomId) {
        roomId = roomId.trim();
        if (!roomId) {
            alert("Inserisci un ID Stanza valido!");
            return;
        }

        joinForm.classList.add('hidden');
        loader.classList.remove('hidden');
        statusMessage.innerText = `Connessione alla stanza ${roomId}...`;

        if (peer) {
            try { peer.destroy(); } catch (e) {}
        }

        peer = new Peer();

        peer.on('open', (id) => {
            console.log("Client Peer open with ID:", id);
            statusMessage.innerText = `Contatto il Giocatore 1...`;

            conn = peer.connect(roomId, { reliable: true });

            conn.on('open', () => {
                console.log("DataChannel open with Host!");
                statusMessage.innerText = "Connesso! Ricezione video in corso...";
                showBanner("Connesso al Giocatore 1! In attesa dello streaming...");
            });

            conn.on('data', (data) => {
                if (data.type === 'BANNER') {
                    showBanner(data.text);
                }
            });

            conn.on('close', () => {
                statusOverlay.classList.remove('hidden');
                joinForm.classList.remove('hidden');
                loader.classList.add('hidden');
                statusMessage.innerText = "La partita è terminata o l'Host si è disconnesso.";
            });

            conn.on('error', (err) => {
                console.error("Connection error:", err);
                statusMessage.innerText = "Errore di connessione: " + err;
                joinForm.classList.remove('hidden');
                loader.classList.add('hidden');
            });
        });

        // Listen for incoming call from Host with game audio/video stream
        peer.on('call', (call) => {
            console.log("Incoming media call from Host!");
            call.answer(); // Answer without local media stream

            call.on('stream', (remoteStream) => {
                console.log("Received remote MediaStream from Host!");
                gameVideo.srcObject = remoteStream;

                gameVideo.play().then(() => {
                    statusOverlay.classList.add('hidden');
                    showBanner("🎮 Sei la Squadra Rossa (Giocatore 2)! Frecce per muoverti, Spazio per tirare");
                }).catch((err) => {
                    console.warn("Autoplay with sound blocked:", err);
                    statusOverlay.classList.add('hidden');
                    audioPrompt.classList.remove('hidden');
                });
            });

            call.on('close', () => {
                statusOverlay.classList.remove('hidden');
                statusMessage.innerText = "Streaming interrotto.";
            });
        });

        peer.on('error', (err) => {
            console.error("PeerJS error:", err);
            statusOverlay.classList.remove('hidden');
            joinForm.classList.remove('hidden');
            loader.classList.add('hidden');
            if (err.type === 'peer-unavailable') {
                statusMessage.innerText = "Stanza non trovata! Verifica l'ID e che l'Host sia attivo.";
            } else {
                statusMessage.innerText = "Errore: " + err.type;
            }
        });
    }

    // Audio unmute button handler
    btnUnmute.addEventListener('click', () => {
        gameVideo.muted = false;
        gameVideo.play().then(() => {
            audioPrompt.classList.add('hidden');
        }).catch(() => {});
    });

    // Fullscreen button
    btnFullscreen.addEventListener('click', () => {
        const wrapper = document.getElementById('video-wrapper');
        if (!document.fullscreenElement) {
            wrapper.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    });

    // Size Selector (1X, 2X, 3X, Fit)
    const sizeButtons = document.querySelectorAll('.btn-size');
    sizeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            sizeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const size = btn.dataset.size;
            gameVideo.className = 'size-' + size;
        });
    });

    // Connect button click
    btnConnect.addEventListener('click', () => {
        connectToHost(roomInput.value);
    });

    roomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            connectToHost(roomInput.value);
        }
    });

    // Keyboard handlers (Real-time C64 Matrix key dispatch + Joystick)
    window.addEventListener('keydown', (e) => {
        // Do not intercept if typing into the connect form input
        if (document.activeElement === roomInput) return;

        if (e.key.startsWith('Arrow') || e.key === ' ' || e.key.startsWith('F') || e.key === 'Enter' || e.key === 'Backspace') {
            e.preventDefault();
        }

        // 1. Dispatch C64 Matrix key event to Host
        const matrixIndex = getC64MatrixIndex(e);
        if (matrixIndex !== undefined) {
            sendC64Key(matrixIndex, 'down');
        }

        // 2. Joystick directional state for Player 2
        let changed = false;
        if (e.code === 'ArrowUp') {
            if (!inputState.up) { inputState.up = true; changed = true; }
        } else if (e.code === 'ArrowDown') {
            if (!inputState.down) { inputState.down = true; changed = true; }
        } else if (e.code === 'ArrowLeft') {
            if (!inputState.left) { inputState.left = true; changed = true; }
        } else if (e.code === 'ArrowRight') {
            if (!inputState.right) { inputState.right = true; changed = true; }
        } else if (e.code === 'Space') {
            if (!inputState.fire) { inputState.fire = true; changed = true; }
        }

        if (changed) {
            updateAndSendInput();
        }
    });

    window.addEventListener('keyup', (e) => {
        if (document.activeElement === roomInput) return;

        if (e.key.startsWith('Arrow') || e.key === ' ' || e.key.startsWith('F') || e.key === 'Enter' || e.key === 'Backspace') {
            e.preventDefault();
        }

        const matrixIndex = getC64MatrixIndex(e);
        if (matrixIndex !== undefined) {
            sendC64Key(matrixIndex, 'up');
        }

        let changed = false;
        if (e.code === 'ArrowUp') {
            if (inputState.up) { inputState.up = false; changed = true; }
        } else if (e.code === 'ArrowDown') {
            if (inputState.down) { inputState.down = false; changed = true; }
        } else if (e.code === 'ArrowLeft') {
            if (inputState.left) { inputState.left = false; changed = true; }
        } else if (e.code === 'ArrowRight') {
            if (inputState.right) { inputState.right = false; changed = true; }
        } else if (e.code === 'Space') {
            if (inputState.fire) { inputState.fire = false; changed = true; }
        }

        if (changed) {
            updateAndSendInput();
        }
    });

    // Mobile / On-Screen Keyboard toggle
    const btnKeyboard = document.getElementById('btn-keyboard');
    const mobileKeyboardInput = document.getElementById('mobile-keyboard-input');
    if (btnKeyboard && mobileKeyboardInput) {
        btnKeyboard.addEventListener('click', (e) => {
            e.preventDefault();
            mobileKeyboardInput.focus();
            showBanner("⌨️ Tastiera mobile attiva: digita i nomi!", 3000);
        });

        mobileKeyboardInput.addEventListener('keydown', (e) => {
            const matrixIndex = getC64MatrixIndex(e);
            if (matrixIndex !== undefined) {
                sendC64Key(matrixIndex, 'down');
            }
        });

        mobileKeyboardInput.addEventListener('input', (e) => {
            const val = mobileKeyboardInput.value;
            if (val) {
                const lastChar = val.slice(-1).toUpperCase();
                const matrixIndex = C64_CHAR_FALLBACK[lastChar];
                if (matrixIndex !== undefined) {
                    sendC64Key(matrixIndex, 'down');
                    setTimeout(() => sendC64Key(matrixIndex, 'up'), 100);
                }
            }
            mobileKeyboardInput.value = '';
        });
    }

    // Touch virtual buttons
    const bindTouchBtn = (id, stateKey) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        const start = (e) => {
            e.preventDefault();
            btn.classList.add('active');
            inputState[stateKey] = true;
            updateAndSendInput();
        };

        const end = (e) => {
            e.preventDefault();
            btn.classList.remove('active');
            inputState[stateKey] = false;
            updateAndSendInput();
        };

        btn.addEventListener('touchstart', start, { passive: false });
        btn.addEventListener('touchend', end, { passive: false });
        btn.addEventListener('touchcancel', end, { passive: false });
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', end);
        btn.addEventListener('mouseleave', end);
    };

    bindTouchBtn('btn-up', 'up');
    bindTouchBtn('btn-down', 'down');
    bindTouchBtn('btn-left', 'left');
    bindTouchBtn('btn-right', 'right');
    bindTouchBtn('btn-fire', 'fire');

    // Auto-connect if ?room= or ?id= is present in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room') || urlParams.get('id');
    if (roomParam) {
        roomInput.value = roomParam;
        connectToHost(roomParam);
    }
})();
