from ollama import chat

def ask_ollama(text: str, model: str) -> str:
    response = chat(
        model=model,
        messages=[{"role": "user", "content": text}],
    )
    return response.message.content