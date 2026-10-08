import wave
from pathlib import Path

from piper import PiperVoice


MODEL_PATH = Path("models/en_US-lessac-medium.onnx")

voice = PiperVoice.load(MODEL_PATH)


def tts(text: str, output_path: str = "output.wav") -> str:
    output_path = Path(output_path)

    with wave.open(str(output_path), "wb") as wav_file:
        voice.synthesize_wav(text, wav_file)

    return str(output_path)


if __name__ == "__main__":
    path = tts("Hello Vinayak. This is Piper running completely locally.","output.wav",)

    print(f"Generated: {path}")