from fastapi import FastAPI
from transcribe import transcribe_audio
from LLM import ask_ollama
from speak import tts

app = FastAPI()

@app.get("/transcribe")
def read_root(text):
    return transcribe_audio(text)

@app.get("/answer")
def answer(text):
    return ask_ollama(text,"gemma3:4b")

@app.get("/speak")
def speak(text):
    return tts(text)