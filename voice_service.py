import base64
import tempfile
import os
import speech_recognition as sr
from pydub import AudioSegment

recognizer = sr.Recognizer()

async def process_voice_command(base64_audio: str) -> str:
    # 1. Strip the HTML header from the base64 string
    if "," in base64_audio:
        base64_data = base64_audio.split(",")[1]
    else:
        base64_data = base64_audio
        
    # 2. Add padding (Production safeguard: JavaScript base64 strings sometimes drop padding)
    base64_data += "=" * ((4 - len(base64_data) % 4) % 4)
    
    try:
        audio_bytes = base64.b64decode(base64_data)
    except Exception as e:
        print(f"Base64 decoding error: {e}")
        return ""
    
    # 3. Save the raw bytes to a generic temporary file (no extension forced)
    with tempfile.NamedTemporaryFile(delete=False) as temp_audio:
        temp_audio.write(audio_bytes)
        temp_audio_path = temp_audio.name

    try:
        # 4. Let FFmpeg auto-detect the format (Crucial for cross-browser support!)
        # By removing format="webm", pydub asks FFmpeg to inspect the actual bytes.
        audio = AudioSegment.from_file(temp_audio_path)
        
        # 5. Export to WAV for the Speech Recognition library
        wav_path = temp_audio_path + ".wav"
        audio.export(wav_path, format="wav")
        
        # 6. Transcribe using Google's free Speech Recognition
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)
            text = recognizer.recognize_google(audio_data)
            print(f"Recognized Command: {text}")
            return text
            
    except sr.UnknownValueError:
        print("Could not understand audio.")
        return ""
    except Exception as e:
        print(f"Transcription error: {e}")
        return ""
    finally:
        # 7. Clean up memory to prevent your server from crashing over time
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
        if 'wav_path' in locals() and os.path.exists(wav_path):
            os.remove(wav_path)