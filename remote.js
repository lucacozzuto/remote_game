/**
 * C64 Remote Controller - WebRTC P2P Receiver & Input Controller (Landscape)
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
    const btnUnmuteHeader = document.getElementById('btn-unmute-header');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    const btnForceLandscape = document.getElementById('btn-force-landscape');
    const gameBanner = document.getElementById('game-banner');
    const connBadge = document.getElementById('conn-badge');
    const roomBadge = document.getElementById('room-badge');
    const roomCodeLabel = document.getElementById('room-code-label');

    function showBanner(text, ms = 3500) {
        if (!gameBanner) return;
        gameBanner.innerText = text;
        gameBanner.classList.remove('hidden');
        setTimeout(() => gameBanner.classList.add('hidden'), ms);
    }

    // Force / request landscape orientation
    function tryLockLandscape() {
        try {
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {});
            } else if (screen.lockOrientation) {
                screen.lockOrientation('landscape');
            } else if (screen.webkitLockOrientation) {
                screen.webkitLockOrientation('landscape');
            } else if (screen.mozLockOrientation) {
                screen.mozLockOrientation('landscape');
            }
        } catch (e) {}
    }

    function toggleFullscreen() {
        const el = document.documentElement;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
            if (req) {
                req.call(el).then(() => {
                    tryLockLandscape();
                }).catch(() => {});
            }
        } else {
            const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            if (exit) exit.call(document).catch(() => {});
        }
        tryLockLandscape();
    }

    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', toggleFullscreen);
    }
    if (btnForceLandscape) {
        btnForceLandscape.addEventListener('click', () => {
            toggleFullscreen();
            tryLockLandscape();
        });
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
        'KeyA': 31, 'KeyB': 50, 'KeyC': 48, 'KeyD': 33, 'KeyE': 19,
        'KeyF': 34, 'KeyG': 35, 'KeyH': 36, 'KeyI': 24, 'KeyJ': 37,
        'KeyK': 38, 'KeyL': 39, 'KeyM': 52, 'KeyN': 51, 'KeyO': 25,
        'KeyP': 26, 'KeyQ': 17, 'KeyR': 20, 'KeyS': 32, 'KeyT': 21,
        'KeyU': 23, 'KeyV': 49, 'KeyW': 18, 'KeyX': 47, 'KeyY': 22, 'KeyZ': 46,
        'Digit0': 10, 'Digit1': 1, 'Digit2': 2, 'Digit3': 3, 'Digit4': 4,
        'Digit5': 5, 'Digit6': 6, 'Digit7': 7, 'Digit8': 8, 'Digit9': 9,
        'Enter': 43, 'NumpadEnter': 43, 'Space': 59,
        'Backspace': 15, 'Delete': 15, 'Escape': 30,
        'F1': 60, 'F2': 60, 'F3': 61, 'F4': 61, 'F5': 62, 'F6': 62, 'F7': 63, 'F8': 63
    };

    const C64_CHAR_FALLBACK = {
        'A': 31, 'B': 50, 'C': 48, 'D': 33, 'E': 19,
        'F': 34, 'G': 35, 'H': 36, 'I': 24, 'J': 37,
        'K': 38, 'L': 39, 'M': 52, 'N': 51, 'O': 25,
        'P': 26, 'Q': 17, 'R': 20, 'S': 32, 'T': 21,
        'U': 23, 'V': 49, 'W': 18, 'X': 47, 'Y': 22, 'Z': 46,
        '0': 10, '1': 1, '2': 2, '3': 3, '4': 4,
        '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
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

    function sendC64Key(matrixIndex, action) {
        if (conn && conn.open) {
            conn.send({ type: 'C64_KEY', action, matrixIndex });
        }
    }

    function pulseC64Key(matrixIndex, durationMs = 120) {
        sendC64Key(matrixIndex, 'down');
        setTimeout(() => sendC64Key(matrixIndex, 'up'), durationMs);
    }

    function connectToHost(roomId) {
        roomId = (roomId || '').trim();
        if (!roomId) {
            alert("Inserisci un ID Stanza valido!");
            return;
        }

        tryLockLandscape();

        if (joinForm) joinForm.classList.add('hidden');
        if (loader) loader.classList.remove('hidden');
        if (statusMessage) statusMessage.innerText = `Connessione alla stanza ${roomId}...`;
        if (connBadge) {
            connBadge.className = 'badge connecting';
            connBadge.innerText = 'CONNESSIONE...';
        }

        if (peer) {
            try { peer.destroy(); } catch (e) {}
        }

        peer = new Peer();

        peer.on('open', (id) => {
            console.log("Client Peer open with ID:", id);
            if (statusMessage) statusMessage.innerText = `Contatto il server C64...`;

            conn = peer.connect(roomId, { reliable: true });

            conn.on('open', () => {
                console.log("DataChannel open with Host!");
                // Sblocca subito il controller e nascondi overlay
                if (statusOverlay) statusOverlay.classList.add('hidden');
                if (loader) loader.classList.add('hidden');
                if (connBadge) {
                    connBadge.className = 'badge connected';
                    connBadge.innerText = 'CONNESSO';
                }
                if (roomBadge && roomCodeLabel) {
                    roomCodeLabel.innerText = roomId;
                    roomBadge.classList.remove('hidden');
                }
                showBanner("🎮 Telecomando connesso! Frecce a sinistra, Fuoco a destra");
            });

            conn.on('data', (data) => {
                if (data && data.type === 'BANNER') {
                    showBanner(data.text);
                }
            });

            conn.on('close', () => {
                if (statusOverlay) statusOverlay.classList.remove('hidden');
                if (joinForm) joinForm.classList.remove('hidden');
                if (loader) loader.classList.add('hidden');
                if (statusMessage) statusMessage.innerText = "La partita è terminata o il server si è disconnesso.";
                if (connBadge) {
                    connBadge.className = 'badge disconnected';
                    connBadge.innerText = 'DISCONNESSO';
                }
            });

            conn.on('error', (err) => {
                console.error("Connection error:", err);
                if (statusMessage) statusMessage.innerText = "Errore di connessione: " + err;
                if (joinForm) joinForm.classList.remove('hidden');
                if (loader) loader.classList.add('hidden');
                if (connBadge) {
                    connBadge.className = 'badge disconnected';
                    connBadge.innerText = 'ERRORE';
                }
            });
        });

        // Listen for incoming call from Host with game audio/video stream
        peer.on('call', (call) => {
            console.log("Incoming media call from Host!");
            call.answer(); // Answer without local mic/camera

            call.on('stream', (remoteStream) => {
                console.log("Received remote MediaStream from Host!");
                if (gameVideo) {
                    gameVideo.srcObject = remoteStream;
                    gameVideo.muted = true; // Necessario per garantire autoplay su iOS Safari e Chrome Android
                    gameVideo.play().then(() => {
                        if (statusOverlay) statusOverlay.classList.add('hidden');
                    }).catch((err) => {
                        console.warn("Autoplay muted failed:", err);
                        if (statusOverlay) statusOverlay.classList.add('hidden');
                    });
                }
            });

            call.on('close', () => {
                console.log("Stream closed");
            });
        });

        peer.on('error', (err) => {
            console.error("PeerJS error:", err);
            if (statusOverlay) statusOverlay.classList.remove('hidden');
            if (joinForm) joinForm.classList.remove('hidden');
            if (loader) loader.classList.add('hidden');
            if (connBadge) {
                connBadge.className = 'badge disconnected';
                connBadge.innerText = 'NON TROVATO';
            }
            if (err.type === 'peer-unavailable') {
                if (statusMessage) statusMessage.innerText = "Stanza non trovata! Verifica che il server C64 sia attivo.";
            } else {
                if (statusMessage) statusMessage.innerText = "Errore: " + err.type;
            }
        });
    }

    // Audio unmute toggle button in top bar
    if (btnUnmuteHeader && gameVideo) {
        btnUnmuteHeader.addEventListener('click', () => {
            if (gameVideo.muted) {
                gameVideo.muted = false;
                btnUnmuteHeader.innerText = '🔊';
                btnUnmuteHeader.title = 'Disattiva Audio';
                showBanner('🔊 Audio attivo!', 2000);
            } else {
                gameVideo.muted = true;
                btnUnmuteHeader.innerText = '🔇';
                btnUnmuteHeader.title = 'Attiva Audio';
                showBanner('🔇 Audio mutato', 2000);
            }
        });
    }

    // Connect button click
    if (btnConnect && roomInput) {
        btnConnect.addEventListener('click', () => {
            connectToHost(roomInput.value);
        });

        roomInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                connectToHost(roomInput.value);
            }
        });
    }

    // Hardware Keyboard event handlers
    window.addEventListener('keydown', (e) => {
        if (document.activeElement === roomInput) return;

        if (e.key.startsWith('Arrow') || e.key === ' ' || e.key.startsWith('F') || e.key === 'Enter' || e.key === 'Backspace') {
            e.preventDefault();
        }

        const matrixIndex = getC64MatrixIndex(e);
        if (matrixIndex !== undefined) {
            sendC64Key(matrixIndex, 'down');
        }

        let changed = false;
        if (e.code === 'ArrowUp') {
            if (!inputState.up) { inputState.up = true; changed = true; }
        } else if (e.code === 'ArrowDown') {
            if (!inputState.down) { inputState.down = true; changed = true; }
        } else if (e.code === 'ArrowLeft') {
            if (!inputState.left) { inputState.left = true; changed = true; }
        } else if (e.code === 'ArrowRight') {
            if (!inputState.right) { inputState.right = true; changed = true; }
        } else if (e.code === 'Space' || e.code === 'Enter') {
            if (!inputState.fire) { inputState.fire = true; changed = true; }
        }

        if (changed) updateAndSendInput();
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
        } else if (e.code === 'Space' || e.code === 'Enter') {
            if (inputState.fire) { inputState.fire = false; changed = true; }
        }

        if (changed) updateAndSendInput();
    });

    // Mobile / On-Screen Keyboard toggle for pilot names
    const btnKeyboard = document.getElementById('btn-keyboard');
    const mobileKeyboardInput = document.getElementById('mobile-keyboard-input');
    if (btnKeyboard && mobileKeyboardInput) {
        btnKeyboard.addEventListener('click', (e) => {
            e.preventDefault();
            mobileKeyboardInput.focus();
            showBanner("⌨️ Tastiera attiva: digita il nome!", 3000);
        });

        mobileKeyboardInput.addEventListener('input', () => {
            const val = mobileKeyboardInput.value;
            if (val) {
                const lastChar = val.slice(-1).toUpperCase();
                const matrixIndex = C64_CHAR_FALLBACK[lastChar];
                if (matrixIndex !== undefined) {
                    pulseC64Key(matrixIndex, 100);
                }
            }
            mobileKeyboardInput.value = '';
        });

        mobileKeyboardInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                pulseC64Key(43, 120); // Return
            } else if (e.key === 'Backspace') {
                pulseC64Key(15, 120); // Delete
            }
        });
    }

    // Touch & Pointer virtual buttons handler
    const bindTouchButton = (id, stateKey) => {
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

    bindTouchButton('btn-up', 'up');
    bindTouchButton('btn-down', 'down');
    bindTouchButton('btn-left', 'left');
    bindTouchButton('btn-right', 'right');
    bindTouchButton('btn-fire', 'fire');

    // Sub-action buttons (INVIO / F5)
    const btnEnter = document.getElementById('btn-enter');
    if (btnEnter) {
        const handleEnter = (e) => {
            e.preventDefault();
            btnEnter.classList.add('active');
            pulseC64Key(43, 150); // Return key
            setTimeout(() => btnEnter.classList.remove('active'), 150);
        };
        btnEnter.addEventListener('touchstart', handleEnter, { passive: false });
        btnEnter.addEventListener('mousedown', handleEnter);
    }

    const btnF5 = document.getElementById('btn-f5');
    if (btnF5) {
        const handleF5 = (e) => {
            e.preventDefault();
            btnF5.classList.add('active');
            pulseC64Key(62, 150); // F5
            setTimeout(() => btnF5.classList.remove('active'), 150);
        };
        btnF5.addEventListener('touchstart', handleF5, { passive: false });
        btnF5.addEventListener('mousedown', handleF5);
    }

    // Screen Size Selector (1X, 2X, 3X, Fit) - Default 3X
    if (gameVideo) {
        gameVideo.className = 'size-3x';
    }
    const sizeBtns = document.querySelectorAll('.btn-size-opt');
    sizeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            sizeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const size = btn.dataset.size;
            if (gameVideo) {
                gameVideo.className = 'size-' + size;
            }
        });
    });

    // Auto-connect if ?room= or ?id= is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room') || urlParams.get('id');
    if (roomParam) {
        if (roomInput) roomInput.value = roomParam;
        connectToHost(roomParam);
    }
})();
