const DEFAULT_API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8000"
    : "https://andromeda-pd14.onrender.com";
const API_BASE = window.ANDROMEDA_API_BASE || DEFAULT_API_BASE;

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sendButton = document.getElementById("send");
const connectionIndicator = document.getElementById("connection-indicator");
const suggestedPrompts = document.querySelectorAll(".suggested-prompt");
const suggestedPromptsContainer = document.querySelector(".suggested-prompts");
const responseTimer = document.getElementById("response-timer");
const voiceCanvas = document.getElementById("input-waveform");
const inputLoading = document.getElementById("input-loading");

let isSubmittingMessage = false;
let responseTimerStartedAt = 0;
let responseTimerInterval = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let audioContext = null;
let analyser = null;
let animationFrame = null;

function formatElapsedTime(elapsedSeconds) {
    if (elapsedSeconds < 60) return `${elapsedSeconds.toFixed(1)}s`;
    return `${Math.floor(elapsedSeconds / 60)}m ${Math.floor(elapsedSeconds % 60)}s`;
}

function updateResponseTimer() {
    responseTimer.textContent = formatElapsedTime((performance.now() - responseTimerStartedAt) / 1000);
}

function startResponseTimer() {
    window.clearInterval(responseTimerInterval);
    responseTimerStartedAt = performance.now();
    responseTimer.hidden = false;
    updateResponseTimer();
    responseTimerInterval = window.setInterval(updateResponseTimer, 100);
}

function stopResponseTimer() {
    if (!responseTimerStartedAt) return;
    updateResponseTimer();
    window.clearInterval(responseTimerInterval);
    responseTimerInterval = null;
    responseTimerStartedAt = 0;
}

function setConnectionState(connected) {
    connectionIndicator.classList.toggle("connected", connected);
    connectionIndicator.setAttribute("aria-label", connected ? "Backend ready" : "Backend unavailable");
    connectionIndicator.title = connected ? "Backend ready" : "Backend unavailable";
}

async function checkBackend() {
    try {
        const response = await fetch(`${API_BASE}/openapi.json`, { cache: "no-store" });
        setConnectionState(response.ok);
        sendButton.disabled = !response.ok;
    } catch {
        setConnectionState(false);
        sendButton.disabled = true;
    }
}

function createAvatar(type) {
    const avatar = document.createElement("img");
    avatar.className = `avatar ${type}-avatar`;
    avatar.src = type === "user" ? "assets/user.png" : "assets/OpenAI.png";
    avatar.alt = "";
    return avatar;
}

function addMessage(content, type, animateAfterEmptyState = false) {
    document.body.classList.add("has-messages");
    const row = document.createElement("div");
    row.className = `message-row ${type}`;
    const message = document.createElement("div");
    message.classList.add("message", type);
    if (animateAfterEmptyState) message.classList.add("user-message-entering");
    message.textContent = content;
    const timestamp = document.createElement("time");
    timestamp.className = "message-time";
    timestamp.dateTime = new Date().toISOString();
    timestamp.textContent = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date());
    message.appendChild(timestamp);
    row.append(createAvatar(type), message);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
    return message;
}

function setBusy(busy) {
    isSubmittingMessage = busy;
    sendButton.disabled = busy;
    input.disabled = busy;
    if (!busy) input.focus();
}

async function requestAnswer(userText) {
    const params = new URLSearchParams({ text: userText });
    const response = await fetch(`${API_BASE}/answer?${params}`, { method: "GET" });
    if (!response.ok) throw new Error(await response.text() || `Answer request failed (${response.status}).`);
    const answer = await response.json();
    return typeof answer === "string" ? answer : answer.answer || answer.response || JSON.stringify(answer);
}

async function sendMessage(text = input.value.trim()) {
    if (!text || isSubmittingMessage) return;
    const isFirstMessage = !document.body.classList.contains("has-messages");
    startResponseTimer();
    const userMessage = addMessage(text, "user", isFirstMessage);
    userMessage.appendChild(responseTimer);
    if (text === input.value.trim()) input.value = "";
    updatePromptState();
    setBusy(true);
    try {
        const answer = await requestAnswer(text);
        addMessage(answer, "agent");
    } catch (error) {
        addMessage(`Unable to get a response: ${error.message}`, "agent");
    } finally {
        stopResponseTimer();
        setBusy(false);
    }
}

sendButton.addEventListener("click", () => sendMessage());
suggestedPrompts.forEach((promptButton) => {
    promptButton.addEventListener("click", () => {
        input.value = promptButton.dataset.prompt || "";
        input.focus();
        updatePromptState();
    });
});

function updatePromptState() {
    const isTyping = input.value.trim().length > 0;
    suggestedPromptsContainer.hidden = isTyping;
}
input.addEventListener("input", updatePromptState);

function preferredAudioType() {
    return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"]
        .find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function drawWaveform() {
    if (!voiceCanvas || !analyser) return;
    const context = voiceCanvas.getContext("2d");
    const width = voiceCanvas.clientWidth;
    const height = voiceCanvas.clientHeight;
    const pixelRatio = window.devicePixelRatio || 1;
    if (voiceCanvas.width !== width * pixelRatio || voiceCanvas.height !== height * pixelRatio) {
        voiceCanvas.width = width * pixelRatio;
        voiceCanvas.height = height * pixelRatio;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    context.clearRect(0, 0, width, height);
    context.lineWidth = 2;
    context.strokeStyle = "#bffafa";
    context.shadowColor = "rgba(120, 240, 255, .7)";
    context.shadowBlur = 8;
    context.beginPath();
    for (let i = 0; i < samples.length; i++) {
        const x = (i / (samples.length - 1)) * width;
        const y = (samples[i] / 255) * height;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
    }
    context.stroke();
    animationFrame = requestAnimationFrame(drawWaveform);
}

function stopWaveform() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    if (audioContext && audioContext.state !== "closed") audioContext.close();
    audioContext = null;
    analyser = null;
}

async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        addMessage("Audio recording is not supported in this browser.", "agent");
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        recordedChunks = [];
        const mimeType = preferredAudioType();
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorder.addEventListener("dataavailable", (event) => {
            if (event.data.size) recordedChunks.push(event.data);
        });
        mediaRecorder.addEventListener("stop", () => {
            stream.getTracks().forEach((track) => track.stop());
            const audioBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
            stopWaveform();
            if (audioBlob.size) {
                transcribeRecording(audioBlob);
            }
        }, { once: true });
        mediaRecorder.start();
        isRecording = true;
        input.disabled = true;
        input.placeholder = "Listening…";
        voiceCanvas.hidden = false;
        inputLoading.hidden = true;
        drawWaveform();
        connectionIndicator.classList.add("recording");
        connectionIndicator.title = "Recording audio — press Ctrl+D to stop";
        connectionIndicator.setAttribute("aria-label", "Recording audio");
    } catch (error) {
        stopWaveform();
        voiceCanvas.hidden = true;
        input.disabled = false;
        input.placeholder = "Ask Andromeda anything...";
        addMessage(`Unable to start recording: ${error.message}`, "agent");
    }
}

function stopRecording() {
    const wasRecording = mediaRecorder?.state === "recording";
    if (wasRecording) mediaRecorder.stop();
    isRecording = false;
    connectionIndicator.classList.remove("recording");
    setConnectionState(true);
    if (wasRecording) {
        voiceCanvas.hidden = true;
        inputLoading.hidden = false;
        input.disabled = false;
        input.placeholder = "Transcribing audio…";
    }
}

async function transcribeRecording(blob) {
    setBusy(true);
    startResponseTimer();
    voiceCanvas.hidden = true;
    inputLoading.hidden = false;
    try {
        const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
        const formData = new FormData();
        formData.append("file", blob, `recording.${extension}`);
        const response = await fetch(`${API_BASE}/transcribe`, { method: "POST", body: formData });
        if (!response.ok) throw new Error(await response.text() || `Transcription failed (${response.status}).`);
        const result = await response.json();
        const transcription = typeof result === "string" ? result : result.text || result.transcription || "";
        if (!transcription.trim()) throw new Error("No speech was detected.");
        input.value = transcription;
        input.placeholder = "Ask Andromeda anything...";
        updatePromptState();
        setBusy(false);
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    } catch (error) {
        input.placeholder = "Ask Andromeda anything...";
        addMessage(`Unable to transcribe audio: ${error.message}`, "agent");
    } finally {
        inputLoading.hidden = true;
        voiceCanvas.hidden = true;
        input.disabled = false;
        if (input.placeholder === "Transcribing audio…") input.placeholder = "Ask Andromeda anything...";
        stopResponseTimer();
        setBusy(false);
    }
}

document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        if (isRecording) stopRecording();
        else if (!isSubmittingMessage) {
            voicePanel.hidden = false;
            startRecording();
        }
    }
    if (event.key === "Escape" && isRecording) stopRecording();
});

input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

checkBackend();
