const BACKEND_TARGETS = [
    { api: "https://andromeda-pd14.onrender.com", ws: "wss://andromeda-pd14.onrender.com/ws" },
    { api: "http://127.0.0.1:8000", ws: "ws://127.0.0.1:8000/ws" },
];

let backendTarget = BACKEND_TARGETS[0];

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sendButton = document.getElementById("send");
const connectionIndicator = document.getElementById("connection-indicator");
const suggestedPrompts = document.querySelectorAll(".suggested-prompt");
const suggestedPromptsContainer = document.querySelector(".suggested-prompts");
const timeSelector = document.getElementById("time-selector");
const timeButtons = document.querySelectorAll(".time-button");
const responseTimer = document.getElementById("response-timer");
const editPromptButton = document.getElementById("edit-prompt");
const promptEditor = document.getElementById("prompt-editor");
const systemPromptInput = document.getElementById("system-prompt");
const promptEditorStatus = document.getElementById("prompt-editor-status");
const closePromptEditorButton = document.getElementById("close-prompt-editor");
const cancelPromptButton = document.getElementById("cancel-prompt");
const savePromptButton = document.getElementById("save-prompt");
const modelPicker = document.getElementById("model-picker");
const modelPickerButton = document.getElementById("model-picker-button");
const modelPickerLabel = document.getElementById("model-picker-label");
const modelProviderLogo = document.getElementById("model-provider-logo");
const modelOptions = document.getElementById("model-options");

let socket;
let activeToolRun = null;
let transientUserUpdates = [];
let userUpdateRunActive = false;
let showToolCalls = false;
let isSubmittingMessage = false;
let htmlResponseReceived = false;
let htmlLoadingMessage = null;
let threadId = null;
let reconnectTimer;
let selectedModel = "openai/gpt-5.6-luna";
let selectedTimeLimit = "3 mins";
let systemPrompt = "";
let promptEditorOriginal = "";
let responseTimerStartedAt = 0;
let responseTimerInterval = null;

function formatElapsedTime(elapsedSeconds) {
    if (elapsedSeconds < 60) return `${elapsedSeconds.toFixed(1)}s`;
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = Math.floor(elapsedSeconds % 60);
    return `${minutes}m ${seconds}s`;
}

function updateResponseTimer() {
    const elapsed = (performance.now() - responseTimerStartedAt) / 1000;
    responseTimer.textContent = formatElapsedTime(elapsed);
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

const models = [
    { name: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna", provider: "OpenAI", logo: "OpenAI.png" },
    { name: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "DeepSeek", logo: "Deepseek.png" },
    { name: "z-ai/glm-5.3-flash", label: "GLM-5.3 Flash", provider: "Z-AI", logo: "zai.png" },
    { name: "openai/gpt-oss-120b", label: "GPT-OSS 120B", provider: "OpenAI", logo: "OpenAI.png" },
    { name: "qwen/qwen3.5-flash-02-23", label: "Qwen 3.5 Flash 02-23", provider: "Qwen", logo: "Qwen.png" },
    { name: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B A12B", provider: "NVIDIA", logo: "Nvidia.png" },
    { name: "google/gemma-4-26b-a4b-it", label: "Gemma 4 26b (experimental)", provider: "Google", logo: "gemma(google).png" },
    { name: "inception/mercury-2", label: "Inception Mercury 2", provider: "Inception", logo: "inception.png" },
];

function renderModelOptions() {
    models.forEach((model) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "model-option";
        option.setAttribute("role", "option");
        option.dataset.model = model.name;
        option.innerHTML = `<img src="assets/${model.logo}" alt=""><span><strong>${model.label || model.name}</strong></span>`;
        option.addEventListener("click", () => selectModel(model));
        modelOptions.appendChild(option);
    });
}

function selectModel(model) {
    selectedModel = model.name;
    modelPickerLabel.textContent = model.label || model.name;
    modelProviderLogo.src = `assets/${model.logo}`;
    modelProviderLogo.alt = `${model.provider} logo`;
    modelOptions.hidden = true;
    modelPickerButton.setAttribute("aria-expanded", "false");
}

modelPickerButton.addEventListener("click", () => {
    modelOptions.hidden = !modelOptions.hidden;
    modelPickerButton.setAttribute("aria-expanded", String(!modelOptions.hidden));
});

document.addEventListener("click", (event) => {
    if (!modelPicker.contains(event.target)) {
        modelOptions.hidden = true;
        modelPickerButton.setAttribute("aria-expanded", "false");
    }
});

renderModelOptions();
selectModel(getCurrentModel());

// Extra instruction line appended to the user prompt based on the selected time limit.
const TIME_LIMITS = {
    ASAP: "first figure out if the user want to have a normal conversation. # if not then No web calls unless or until absolutely needed, just an update and then Make a Good looking short demo with 2D and 3D visuals and sliders buttons.",
    "3 mins": "first figure out if the user want to have a normal conversation. # if not then DO NOT USE THE WEB PAGE READER MORE THAN ONCE, DO NOT USE THE IMAGE SEARCH, Make it Good looking  2D and 3D visuals and sliders buttons. Following the HTML desing guide in the system prompt.",
    "5 mins": "first figure out if the user want to have a normal conversation. # if not then 2 WEB PAGE READS AND ONE IMAGE SEARCH, Make it Good looking with 2D and 3D visuals and sliders buttons. Following the HTML desing guide in the system prompt.",
};

async function loadSystemPrompt() {
    const response = await fetch("prompt.md", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load the system prompt.");
    systemPrompt = await response.text();
}

function closePromptEditor() {
    promptEditor.hidden = true;
    promptEditorStatus.textContent = "";
}

async function openPromptEditor() {
    promptEditor.hidden = false;
    promptEditorStatus.textContent = "Loading...";
    try {
        if (!systemPrompt) await loadSystemPrompt();
        promptEditorOriginal = systemPrompt;
        systemPromptInput.value = systemPrompt;
        promptEditorStatus.textContent = "";
        systemPromptInput.focus();
    } catch (error) {
        promptEditorStatus.textContent = error.message;
    }
}

editPromptButton.addEventListener("click", openPromptEditor);
closePromptEditorButton.addEventListener("click", closePromptEditor);
cancelPromptButton.addEventListener("click", () => {
    systemPrompt = promptEditorOriginal;
    closePromptEditor();
});
savePromptButton.addEventListener("click", () => {
    const prompt = systemPromptInput.value.trim();
    if (!prompt) {
        promptEditorStatus.textContent = "The system prompt cannot be empty.";
        return;
    }
    systemPrompt = systemPromptInput.value;
    closePromptEditor();
});

promptEditor.addEventListener("click", (event) => {
    if (event.target === promptEditor) closePromptEditor();
});

function setConnectionState(connected) {
    connectionIndicator.classList.toggle("connected", connected);
    connectionIndicator.setAttribute("aria-label", connected ? "Connected" : "Disconnected");
    connectionIndicator.title = connected ? "Connected" : "Disconnected";
}

function connectSocket() {
    if (!threadId || (socket && socket.readyState <= WebSocket.OPEN)) return;
    socket = new WebSocket(`${backendTarget.ws}/${threadId}`);

    socket.addEventListener("open", () => {
        setConnectionState(true);
        sendButton.disabled = false;
        input.focus();
    });

    socket.addEventListener("close", (event) => {
        setConnectionState(false);
        sendButton.disabled = true;
        stopResponseTimer();
        if (backendTarget === BACKEND_TARGETS[0]) {
            backendTarget = BACKEND_TARGETS[1];
            startAnonymousSession();
            return;
        }
        reconnectTimer = window.setTimeout(connectSocket, 1500);
    });

    socket.addEventListener("error", () => setConnectionState(false));

    socket.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "tool_update") return appendToolUpdate(data);
        if (data.type === "user_update") return appendUserUpdate(data);
        if (data.type === "html_response") {
            console.log("[HTML response] received height_guess:", data.height_guess);
            removeHTMLLoadingMessage();
            stopResponseTimer();
            userUpdateRunActive = false;
            htmlResponseReceived = true;
            addHTMLMessage(data.content, data.height_guess);
            finishToolRun();
            sendButton.disabled = false;
            input.focus();
            return;
        }
        if (data.type === "response") {
            removeHTMLLoadingMessage();
            stopResponseTimer();
            userUpdateRunActive = false;
            // send_html_response returns a short acknowledgement after it has
            // already delivered the actual HTML over the WebSocket.
            const isHTMLAcknowledgement = htmlResponseReceived &&
                data.content === "HTML response sent to user.";
            if (!isHTMLAcknowledgement) addMessage(data.content, "agent", true);
            htmlResponseReceived = false;
            finishToolRun();
            sendButton.disabled = false;
            input.focus();
        }
        if (data.type === "error") {
            removeHTMLLoadingMessage();
            stopResponseTimer();
            userUpdateRunActive = false;
            addMessage(data.content, "agent");
            sendButton.disabled = false;
        }
    });
}

function startToolRun() {
    const run = document.createElement("details");
    run.className = "tool-run";
    run.open = true;
    run.innerHTML = `<summary>Agent Actions Log:  <span class="tool-count">0</span></summary><div class="tool-log"><div class="tool-empty">Tool activity will appear here while Andromeda works.</div></div>`;
    chat.appendChild(run);
    chat.scrollTop = chat.scrollHeight;
    activeToolRun = run;
}

function appendToolUpdate(update) {
    if (!showToolCalls) return;
    if (!activeToolRun) startToolRun();
    const log = activeToolRun.querySelector(".tool-log");
    const count = activeToolRun.querySelector(".tool-count");
    log.querySelector(".tool-empty")?.remove();
    const entry = document.createElement("article");
    entry.className = "tool-entry";
    const meta = document.createElement("div");
    meta.className = "tool-entry-meta";
    meta.textContent = `${update.timestamp || "now"} · ${update.function || update.file || "tool"}`;
    const content = document.createElement("div");
    content.className = "tool-entry-content";
    content.textContent = update.content || "Tool completed.";
    entry.append(meta, content);
    log.appendChild(entry);
    count.textContent = log.children.length;
    log.scrollTop = log.scrollHeight;
    chat.scrollTop = chat.scrollHeight;
}

function finishToolRun() { activeToolRun = null; }

function appendUserUpdate(update) {
    if (!userUpdateRunActive) return;
    // Once research is complete, swap the loading label from
    // "Researching..." to "Generating html".
    if (update.Research_flag) {
        const label = htmlLoadingMessage?.querySelector(".html-loading-message > span:first-child");
        if (label) label.textContent = "Generating html";
    }
    const message = addMessage(update.content || "", "agent");
    message.classList.add("transient-user-update");
    transientUserUpdates.push(message);
}

function clearUserUpdates() {
    transientUserUpdates.forEach((message) => message.remove());
    transientUserUpdates = [];
}

function showHTMLLoadingMessage() {
    removeHTMLLoadingMessage();

    const row = document.createElement("div");
    row.className = "message-row agent loading-row";
    row.appendChild(createAvatar("agent"));

    const loading = document.createElement("div");
    loading.className = "message agent html-loading-message";
    loading.innerHTML = `
        <span>Researching...</span>
        <span class="loading-dots" aria-label="Loading">
            <span></span><span></span><span></span>
        </span>
    `;

    row.appendChild(loading);
    chat.appendChild(row);
    htmlLoadingMessage = row;
    chat.scrollTop = chat.scrollHeight;
}

function removeHTMLLoadingMessage() {
    htmlLoadingMessage?.remove();
    htmlLoadingMessage = null;
}

function getCurrentModel() {
    return models.find((model) => model.name === selectedModel) || models[0];
}

function createAvatar(type) {
    const avatar = document.createElement("img");
    avatar.className = `avatar ${type}-avatar`;
    avatar.src = type === "user" ? "assets/user.png" : `assets/${getCurrentModel().logo}`;
    avatar.alt = "";
    return avatar;
}

function addMessage(content, type, markdown = false, animateAfterEmptyState = false) {
    document.body.classList.add("has-messages");
    const row = document.createElement("div");
    row.className = `message-row ${type}`;
    const avatar = createAvatar(type);
    const message = document.createElement("div");
    message.classList.add("message", type);
    if (animateAfterEmptyState) message.classList.add("user-message-entering");
    if (markdown) message.innerHTML = marked.parse(content);
    else message.textContent = content;
    const timestamp = document.createElement("time");
    timestamp.className = "message-time";
    timestamp.dateTime = new Date().toISOString();
    timestamp.textContent = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date());
    message.appendChild(timestamp);
    row.append(avatar, message);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
    return message;
}

function getHTMLFrameHeight(heightGuess) {
    const numericHeight = Number(heightGuess);

    // Fallback if the model sends something invalid
    if (!Number.isFinite(numericHeight)) {
        return 720;
    }

    const MIN_HEIGHT = 500;
    const MAX_HEIGHT = 5000;

    return Math.min(
        Math.max(numericHeight, MIN_HEIGHT),
        MAX_HEIGHT
    );
}

function prepareHTMLDocument(htmlContent) {
    if (typeof htmlContent !== "string") return "";

    const scrollbarCSS = `
        <style id="andromeda-embed-scrollbar">
            html {
                scrollbar-width: thin;
                scrollbar-color: #424242 transparent;
            }

            ::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }

            ::-webkit-scrollbar-thumb {
                border: 1px solid transparent;
                border-radius: 999px;
                background: #424242;
                background-clip: content-box;
            }
        </style>
    `;

    if (/<\/head\s*>/i.test(htmlContent)) {
        return htmlContent.replace(/<\/head\s*>/i, `${scrollbarCSS}</head>`);
    }

    return `${scrollbarCSS}${htmlContent}`;
}


function addHTMLMessage(htmlContent, heightGuess) {
    document.body.classList.add("has-messages");

    const row = document.createElement("div");
    row.className = "message-row agent html-row";
    row.appendChild(createAvatar("agent"));

    const message = document.createElement("div");
    message.classList.add("message", "agent", "html-message");

    const frame = document.createElement("iframe");

    frame.className = "html-response-frame";
    frame.title = "Interactive HTML response";
    frame.setAttribute("scrolling", "auto");

    const iframeHeight = getHTMLFrameHeight(heightGuess);
    frame.height = iframeHeight;
    frame.style.height = `${iframeHeight}px`;
    frame.srcdoc = prepareHTMLDocument(htmlContent);

    const timestamp = document.createElement("time");

    timestamp.className = "message-time";
    timestamp.dateTime = new Date().toISOString();

    timestamp.textContent =
        new Intl.DateTimeFormat([], {
            hour: "numeric",
            minute: "2-digit"
        }).format(new Date());

    message.append(frame, timestamp);

    row.appendChild(message);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;

    return message;
}

function isChatNearBottom() {
    const distanceFromBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    return distanceFromBottom < 64;
}

async function sendMessage() {
    const userInput = input.value.trim();
    if (!userInput || !socket || socket.readyState !== WebSocket.OPEN) return;

    startResponseTimer();
    // Start the empty-state animation before sending the first message.
    const isFirstMessage = !document.body.classList.contains("has-messages");
    isSubmittingMessage = true;
    document.body.classList.add("has-messages");
    const userMessage = addMessage(userInput, "user", false, isFirstMessage);
    userMessage.appendChild(responseTimer);
    if (isFirstMessage) editPromptButton.hidden = true;
    input.value = "";
    sendButton.disabled = true;
    showToolCalls = true;
    htmlResponseReceived = false;
    userUpdateRunActive = true;
    showHTMLLoadingMessage();

    isSubmittingMessage = false;
    const instructionLine = TIME_LIMITS[selectedTimeLimit];
    socket.send(JSON.stringify({
        type: "message",
        content: instructionLine ? `${userInput}\n${instructionLine}` : userInput,
        model_name: selectedModel,
        system_prompt: systemPrompt,
    }));
}

sendButton.addEventListener("click", sendMessage);
suggestedPrompts.forEach((promptButton) => {
    promptButton.addEventListener("click", () => {
        input.value = promptButton.dataset.prompt || "";
        input.focus();
        // Filling the input via JS does not fire the "input" event, so sync the UI manually.
        updatePromptState();
    });
});

// While typing, completely hide the suggested prompts and show the time-limit selector instead.
function updatePromptState() {
    const isTyping = input.value.trim().length > 0;
    suggestedPromptsContainer.hidden = isTyping;
    timeSelector.hidden = !isTyping;
}

input.addEventListener("input", updatePromptState);

// Time-limit selection (ASAP by default).
timeButtons.forEach((button) => {
    button.addEventListener("click", () => {
        selectedTimeLimit = button.dataset.time;
        timeButtons.forEach((timeButton) => {
            const isSelected = timeButton === button;
            timeButton.classList.toggle("is-selected", isSelected);
            timeButton.setAttribute("aria-pressed", String(isSelected));
        });
    });
});

input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

async function startAnonymousSession() {
    if (!systemPrompt) await loadSystemPrompt();
    for (const target of BACKEND_TARGETS) {
        try {
            const response = await fetch(`${target.api}/generate_thread_id`, {
                cache: "no-store",
            });
            if (!response.ok) continue;
            backendTarget = target;
            ({ thread_id: threadId } = await response.json());
            connectSocket();
            return;
        } catch {
            // Try the local backend when the deployed backend is unavailable.
        }
    }
    throw new Error("Unable to connect to Andromeda. Start the backend on port 8000.");
}

startAnonymousSession().catch((error) => {
    addMessage(error.message, "agent");
    setConnectionState(false);
});