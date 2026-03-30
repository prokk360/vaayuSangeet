// --- DOM Elements ---
const videoElement = document.getElementById('webcam');
const audioElement = document.getElementById('audio-player');
const trackTitle = document.getElementById('track-title');
const playerState = document.getElementById('player-state');
const progress = document.getElementById('progress');
const playIcon = document.getElementById('play-icon');
const albumCard = document.getElementById('album-card');
const voiceIndicator = document.getElementById('voice-indicator');
const gestureStatus = document.getElementById('gesture-status');

let isPlaying = false;
let isListening = false;
let lastGestureTime = 0;
let mediaRecorder;
let audioChunks = [];

// --- 1. WebSocket Backend Connection ---
const ws = new WebSocket('ws://localhost:8000/ws/player');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.action === 'LOAD_TRACK') {
        trackTitle.innerText = data.track_name.toUpperCase();
        playerState.innerText = "NOW PLAYING";
        audioElement.src = data.url;
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
    minDetectionConfidence: 0.75,
    minTrackingConfidence: 0.75
});

hands.onResults(handleHandResults);

const camera = new Camera(videoElement, {
    onFrame: async () => { await hands.send({ image: videoElement }); },
    width: 640, height: 480
});
camera.start();

// --- 3. Gesture Engine ---
function handleHandResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        gestureStatus.innerText = "SYSTEM READY";
        return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const tipIds = [4, 8, 12, 16, 20];
    const fingers = [];

    // Thumb check
    fingers.push(landmarks[tipIds[0]].x > landmarks[tipIds[0] - 1].x ? 1 : 0);
    // 4 Finger check
    for (let i = 1; i < 5; i++) {
        fingers.push(landmarks[tipIds[i]].y < landmarks[tipIds[i] - 2].y ? 1 : 0);
    }

    executeCommand(fingers.join(''));
}

function executeCommand(code) {
    const now = Date.now();
    
    // ✌️ Voice Search (01100)
    if (code === '01100') {
        if (!isListening) startVoiceRecording();
        gestureStatus.innerText = "COMMAND: LISTEN";
        return;
    } else if (isListening) {
        stopVoiceRecording();
    }

    if (now - lastGestureTime < 2000) return;

    // 👍 Play (10000)
    if (code === '10000') {
        updatePlayState(true);
        gestureStatus.innerText = "COMMAND: PLAY";
        lastGestureTime = now;
    }
    // ✊ Pause (00000)
    else if (code === '00000') {
        updatePlayState(false);
        gestureStatus.innerText = "COMMAND: PAUSE";
        lastGestureTime = now;
    }
    // 🖐️ Next Track (01111)
    else if (code === '01111') {
        gestureStatus.innerText = "COMMAND: NEXT";
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'GESTURE', gesture: 'NEXT' }));
        lastGestureTime = now;
    }
}

// --- 4. Audio & UI Logic ---
function updatePlayState(play) {
    isPlaying = play;
    if (isPlaying) {
        audioElement.play().catch(() => {});
        playIcon.className = "fa-solid fa-pause";
        albumCard.style.transform = "scale(1.05)";
        document.getElementById('app-bg').style.background = "radial-gradient(circle at 20% 30%, #1d4ed8 0%, #1e1b4b 50%, #020617 100%)";
    } else {
        audioElement.pause();
        playIcon.className = "fa-solid fa-play";
        albumCard.style.transform = "scale(1)";
        document.getElementById('app-bg').style.background = "radial-gradient(circle at 20% 30%, #3b82f6 0%, #1e1b4b 50%, #020617 100%)";
    }
}

// --- 5. Voice Engine ---
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
                    ws.send(JSON.stringify({ action: 'VOICE_COMMAND', audio_blob: reader.result }));
                }
            };
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
    } catch (e) { console.error(e); }
}

function stopVoiceRecording() {
    isListening = false;
    voiceIndicator.style.display = 'none';
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
}

// Timeline Update
audioElement.addEventListener('timeupdate', () => {
    const pct = (audioElement.currentTime / audioElement.duration) * 100;
    progress.style.width = `${pct}%`;
    
    // Formatting current time
    let min = Math.floor(audioElement.currentTime / 60);
    let sec = Math.floor(audioElement.currentTime % 60);
    document.getElementById('current-time').innerText = `${min}:${sec < 10 ? '0'+sec : sec}`;
});