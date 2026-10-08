import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from transcribe import transcribe_audio
from LLM import ask_ollama
from speak import tts

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "recording.webm")[1] or ".webm"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = temp_file.name
            while chunk := await file.read(1024 * 1024):
                temp_file.write(chunk)
        text = transcribe_audio(temp_path)
        return {"text": text}
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Audio transcription failed: {error}") from error
    finally:
        await file.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

@app.get("/answer")
def answer(text):
    return ask_ollama(text,"gemma3:4b")

@app.get("/speak")
def speak(text):
    return tts(text)
