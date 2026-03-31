/**
 * MAESTRO AI | CLOUD EDITION - CORE CONTROL SCRIPT
 * Functionality: Gesture Recognition, Voice Command Deciphering, & Fluid UI Sync
 */

// --- 1. DOM ELEMENTS ---
const videoElement = document.getElementById('webcam');
const audioElement = document.getElementById('audio-player');
const trackTitle = document.getElementById('track-title');
const playerState = document.getElementById('player-state');
const progress = document.getElementById('progress');
const playIcon = document.getElementById('play-icon');
const albumCard = document.getElementById('album-card');
const voiceIndicator = document.getElementById('voice-indicator');
const gestureStatus = document.getElementById('gesture-status');
const gestureGlow = document.getElementById('gesture-glow');
const currentTimeDisplay = document.getElementById('current-time');

// --- 2. GLOBAL STATE ---
let isPlaying = false;
let isListening = false;
let lastGestureTime = 0;
let mediaRecorder;
let audioChunks = [];

// --- 3. WEBSOCKET UPLINK ---
// Connects to your Python FastAPI backend (default port 8000)
const ws = new WebSocket('ws://localhost:8000/ws/player');

ws.onopen = () => {
    console.log("Maestro AI: Cloud Uplink Secure.");
    gestureStatus.innerText = "SYSTEM ONLINE";
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    // When backend finds the song via Voice Command
    if (data.action === 'LOAD_TRACK') {
        trackTitle.innerText = data.track_name.toUpperCase();
        playerState.innerText = "CRYSTAL AUDIO READY";
        audioElement.src = data.url;
        
        // Auto-play the fetched track
        updatePlayState(true);
    }
};

ws.onerror = (err) => {
    gestureStatus.innerText = "UPLINK ERROR";
    console.error("WS Error:", err);
};

// --- 4. MEDIAPIPE HAND TRACKING ---
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.8,
    minTrackingConfidence: 0.7
});

hands.onResults(handleHandResults);

// --- 5. CAMERA INITIALIZATION ---
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

camera.start()
    .then(() => {
        trackTitle.innerText = "READY FOR COMMAND";
        console.log("Maestro AI: Visual Sensors Active.");
    })
    .catch((err) => {
        trackTitle.innerText = "SENSOR ERROR";
        console.error("Camera Error:", err);
    });

// --- 6. GESTURE PROCESSING ENGINE ---
function handleHandResults(results) {
    // If no hand is visible, keep status neutral
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const tipIds = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky
    const fingers = [];

    // Thumb Check (Horizontal orientation logic)
    fingers.push(landmarks[tipIds[0]].x > landmarks[tipIds[0] - 1].x ? 1 : 0);

    // Other 4 Fingers Check (Vertical orientation logic)
    for (let i = 1; i < 5; i++) {
        fingers.push(landmarks[tipIds[i]].y < landmarks[tipIds[i] - 2].y ? 1 : 0);
    }

    // Convert finger array to string (e.g., "10000") and execute
    executeCommand(fingers.join(''));
}

// --- 7. COMMAND EXECUTION ---
function executeCommand(code) {
    const now = Date.now();
    
    // Trigger "Aesthetic Glow" on the UI frame whenever a hand is detected
    gestureGlow.classList.add('glow-active');
    setTimeout(() => gestureGlow.classList.remove('glow-active'), 400);

    // --- Voice Command Protocol (Peace Sign: 01100) ---
    if (code === '01100') {
        if (!isListening) startVoiceRecording();
        gestureStatus.innerText = "COMMAND: LISTEN";
        return;
    } else if (isListening) {
        // If hand changes from Peace sign, stop recording and send to AI
        stopVoiceRecording();
    }

    // Cooldown logic to prevent accidental double-triggers
    if (now - lastGestureTime < 2000) return;

    // --- Play Protocol (Thumbs Up: 10000) ---
    if (code === '10000') {
        updatePlayState(true);
        gestureStatus.innerText = "COMMAND: PLAY";
        lastGestureTime = now;
    }
    // --- Pause Protocol (Fist: 00000) ---
    else if (code === '00000') {
        updatePlayState(false);
        gestureStatus.innerText = "COMMAND: PAUSE";
        lastGestureTime = now;
    }
    // --- Skip Protocol (Open Hand: 01111) ---
    else if (code === '01111') {
        gestureStatus.innerText = "COMMAND: NEXT";
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'GESTURE', gesture: 'NEXT' }));
        }
        lastGestureTime = now;
    }
}

// --- 8. UI & AUDIO SYNC ---
function updatePlayState(play) {
    isPlaying = play;
    
    if (isPlaying) {
        audioElement.play().catch(e => console.warn("Interference detected:", e));
        playIcon.className = "fa-solid fa-pause";
        albumCard.classList.add('playing'); // Triggers Vinyl Rotation
        gestureStatus.style.background = "rgba(0, 229, 255, 0.2)";
        playerState.innerText = "PERFORMANCE IN PROGRESS";
    } else {
        audioElement.pause();
        playIcon.className = "fa-solid fa-play";
        albumCard.classList.remove('playing'); // Stops Vinyl Rotation
        gestureStatus.style.background = "rgba(0, 0, 0, 0.05)";
        playerState.innerText = "AWAITING COMMAND";
    }
}

// --- 9. VOICE ENGINE (J.A.R.V.I.S. Mode) ---
async function startVoiceRecording() {
    isListening = true;
    voiceIndicator.style.display = 'flex';
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ 
                        action: 'VOICE_COMMAND', 
                        audio_blob: reader.result 
                    }));
                    playerState.innerText = "AI DECODING SIGNAL...";
                }
            };
            // Kill mic stream to save battery/privacy
            stream.getTracks().forEach(t => t.stop());
        };
        
        mediaRecorder.start();
    } catch (e) {
        console.error("Mic Access Denied:", e);
        isListening = false;
        voiceIndicator.style.display = 'none';
    }
}

function stopVoiceRecording() {
    if (!isListening) return;
    isListening = false;
    voiceIndicator.style.display = 'none';
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
}

// --- 10. TIMELINE TRACKER ---
audioElement.addEventListener('timeupdate', () => {
    // Update the Cyan Progress Bar
    const pct = (audioElement.currentTime / audioElement.duration) * 100;
    progress.style.width = `${pct}%`;
    
    // Format and Update Time Display (MM:SS)
    let min = Math.floor(audioElement.currentTime / 60);
    let sec = Math.floor(audioElement.currentTime % 60);
    currentTimeDisplay.innerText = `${min}:${sec < 10 ? '0' + sec : sec}`;
});

// Reset UI if song ends naturally
audioElement.addEventListener('ended', () => {
    updatePlayState(false);
});