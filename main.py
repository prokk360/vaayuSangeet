from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import List
import json
from music_service import search_and_get_stream
from voice_service import process_voice_command

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

manager = ConnectionManager()

# ... (Keep your imports and ConnectionManager) ...

@app.websocket("/ws/player")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            action = payload.get("action")
            
            if action == "GESTURE":
                gesture_type = payload.get("gesture")
                print(f"Executing: {gesture_type}")
                await manager.send_message({"status": "success", "command_executed": gesture_type}, websocket)
                
            elif action == "VOICE_COMMAND":
                audio_data = payload.get("audio_blob")
                print("Processing voice command...")
                
                # Transcribe the voice command
                transcript = await process_voice_command(audio_data)
                
                # Make sure the transcript actually captured words
                if transcript and "play" in transcript.lower():
                    song_name = transcript.lower().replace("play", "").strip()
                    print(f"Searching for: {song_name}")
                    
                    stream_url = await search_and_get_stream(song_name)
                    
                    if stream_url:
                        await manager.send_message({
                            "status": "success", 
                            "action": "LOAD_TRACK", 
                            "url": stream_url,
                            "track_name": song_name
                        }, websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"Server Error: {e}")