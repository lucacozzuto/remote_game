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

    function sendKeyPress(keyCode) {
        if (conn && conn.open) {
            conn.send({ type: 'KEY_PRESS', keyCode });
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

    // Size toggle (3X vs 2X)
    const btnToggleSize = document.getElementById('btn-toggle-size');
    if (btnToggleSize) {
        let is2X = false;
        btnToggleSize.addEventListener('click', (e) => {
            e.preventDefault();
            is2X = !is2X;
            gameVideo.classList.toggle('size-2x', is2X);
            btnToggleSize.innerText = is2X ? '🔍 Dimensione: 2X' : '🔍 Dimensione: 3X';
        });
    }

    // Connect button click
    btnConnect.addEventListener('click', () => {
        connectToHost(roomInput.value);
    });

    roomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            connectToHost(roomInput.value);
        }
    });

    // Keyboard handlers
    window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        let changed = false;

        switch (e.code) {
            case 'ArrowUp':
            case 'KeyW':
                inputState.up = true; changed = true; break;
            case 'ArrowDown':
            case 'KeyS':
                inputState.down = true; changed = true; break;
            case 'ArrowLeft':
            case 'KeyA':
                inputState.left = true; changed = true; break;
            case 'ArrowRight':
            case 'KeyD':
                inputState.right = true; changed = true; break;
            case 'Space':
            case 'Enter':
                inputState.fire = true; changed = true; break;
            case 'F1':
                sendKeyPress(60); break;
            case 'F3':
                sendKeyPress(61); break;
            case 'F5':
                sendKeyPress(62); break;
            case 'F7':
                sendKeyPress(63); break;
        }

        if (changed) {
            e.preventDefault();
            updateAndSendInput();
        }
    });

    window.addEventListener('keyup', (e) => {
        let changed = false;

        switch (e.code) {
            case 'ArrowUp':
            case 'KeyW':
                inputState.up = false; changed = true; break;
            case 'ArrowDown':
            case 'KeyS':
                inputState.down = false; changed = true; break;
            case 'ArrowLeft':
            case 'KeyA':
                inputState.left = false; changed = true; break;
            case 'ArrowRight':
            case 'KeyD':
                inputState.right = false; changed = true; break;
            case 'Space':
            case 'Enter':
                inputState.fire = false; changed = true; break;
        }

        if (changed) {
            e.preventDefault();
            updateAndSendInput();
        }
    });

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
