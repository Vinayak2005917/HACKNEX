import wave
from pathlib import Path
from urllib.request import urlretrieve

from piper import PiperVoice


MODEL_NAME = "en_US-lessac-medium"
MODEL_DIR = Path("models")

MODEL_PATH = MODEL_DIR / f"{MODEL_NAME}.onnx"
CONFIG_PATH = MODEL_DIR / f"{MODEL_NAME}.onnx.json"

MODEL_URL = (
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
    "en/en_US/lessac/medium/en_US-lessac-medium.onnx"
)

CONFIG_URL = (
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
    "en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
)


def get_voice() -> PiperVoice:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    if not MODEL_PATH.exists():
        print("Piper model not found. Downloading model...")
        urlretrieve(MODEL_URL, MODEL_PATH)
        print("Model downloaded.")

    if not CONFIG_PATH.exists():
        print("Piper model config not found. Downloading config...")
        urlretrieve(CONFIG_URL, CONFIG_PATH)
        print("Config downloaded.")

    return PiperVoice.load(str(MODEL_PATH))


voice = get_voice()


def tts(text: str, output_path: str = "output.wav") -> str:
    output_path = Path(output_path)

    with wave.open(str(output_path), "wb") as wav_file:
        voice.synthesize_wav(text, wav_file)

    return str(output_path)


if __name__ == "__main__":
    path = tts(
        "Hello Vinayak. This is Piper running completely locally.",
        "output.wav",
    )

    print(f"Generated: {path}")