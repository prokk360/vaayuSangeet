// --- DOM Elements ---
const videoElement = document.getElementById('webcam');
const audioElement = document.getElementById('audio-player');
const voiceIndicator = document.getElementById('voice-indicator');
const trackTitle = document.getElementById('track-title');
const playerState = document.getElementById('player-state');
const albumArt = document.getElementById('album-art');
const progressFill = document.getElementById('progress-fill');

// --- State & Connection Variables ---
let isPlaying = false;
let isListening = false;
let lastGestureTime = 0;
let mediaRecorder;
let audioChunks = [];

// --- 1. Connect to Python Backend via WebSocket ---
const ws = new WebSocket('ws://localhost:8000/ws/player');

ws.onopen = () => {
    console.log("Connected to Python Backend!");
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.action === 'LOAD_TRACK') {
        trackTitle.innerText = data.track_name; // Kept normal case for better typography
        audioElement.src = data.url;
        audioElement.play();
        updatePlayState(true);
    }
};

// --- 2. Initialize MediaPipe Hands ---
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

hands.onResults(handleHandResults);

// --- 3. Initialize the Webcam ---
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

camera.start()
    .then(() => trackTitle.innerText = "Ready. Show a gesture!")
    .catch((err) => console.error("Camera error:", err));

// --- 4. Gesture Math ---
function handleHandResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;

    const landmarks = results.multiHandLandmarks[0];
    const tipIds = [4, 8, 12, 16, 20];
    const fingers = [];

    // Thumb (X-axis check)
    fingers.push(landmarks[tipIds[0]].x > landmarks[tipIds[0] - 1].x ? 1 : 0);

    // Other 4 Fingers (Y-axis check)
    for (let i = 1; i < 5; i++) {
        fingers.push(landmarks[tipIds[i]].y < landmarks[tipIds[i] - 2].y ? 1 : 0);
    }

    executeCommand(fingers.join(''));
}

// --- 5. Voice Recording Engine ---
async function startVoiceRecording() {
    isListening = true;
    voiceIndicator.classList.add('active');
    playerState.innerText = "Status: LISTENING...";
    playerState.style.color = '#fca5a5'; // Soft Red

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        action: 'VOICE_COMMAND',
                        audio_blob: reader.result
                    }));
                    playerState.innerText = "Status: FETCHING SONG...";
                    playerState.style.color = '#fde047'; // Soft Yellow
                }
            };
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
    } catch (err) {
        console.error("Mic error:", err);
    }
}

function stopVoiceRecording() {
    if (!isListening) return; 
    
    isListening = false;
    voiceIndicator.classList.remove('active');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
}

function executeCommand(gestureCode) {
    const now = Date.now();

    if (gestureCode === '01100') {
        if (!isListening) startVoiceRecording();
        return; 
    } else if (isListening) {
        stopVoiceRecording(); 
    }

    if (now - lastGestureTime < 2000) return;

    if (gestureCode === '10000') {
        audioElement.play().catch(e => console.error("Playback blocked:", e));
        updatePlayState(true);
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'GESTURE', gesture: 'PLAY' }));
        lastGestureTime = now;
    }
    else if (gestureCode === '00000') {
        audioElement.pause();
        updatePlayState(false);
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'GESTURE', gesture: 'PAUSE' }));
        lastGestureTime = now;
    }
    else if (gestureCode === '01111') {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'GESTURE', gesture: 'NEXT' }));
        lastGestureTime = now;
    }
    else if (gestureCode === '11100') {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'GESTURE', gesture: 'PREVIOUS' }));
        lastGestureTime = now;
    }
}

// Helper to update UI & Animations
function updatePlayState(play) {
    isPlaying = play;
    if (isPlaying) {
        playerState.innerText = "Status: PLAYING";
        playerState.style.color = '#4ade80'; // Soft Green
        albumArt.classList.add('is-playing');
        progressFill.classList.add('is-playing-progress');
    } else {
        playerState.innerText = "Status: PAUSED";
        playerState.style.color = '#94a3b8'; // Slate Gray
        albumArt.classList.remove('is-playing');
        progressFill.classList.remove('is-playing-progress');
    }
}

// Auto-stop UI animation when audio naturally ends
audioElement.addEventListener('ended', () => {
    updatePlayState(false);
});