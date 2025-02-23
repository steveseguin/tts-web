import { KokoroTTS, TextSplitterStream, detectWebGPU } from './dist/lib/kokoro-bundle.es.js';

const textInput = document.getElementById('textInput');
const generateButton = document.getElementById('generateButton');
const downloadButton = document.getElementById('downloadButton');
const voiceSelect = document.getElementById('voiceSelect');
const speedControl = document.getElementById('speedControl');
const speedValue = document.getElementById('speedValue');

let tts;
let selectedVoice;
let audioBlob;

speedControl.addEventListener('input', () => {
    speedValue.textContent = speedControl.value;
});

const DB_NAME = 'kokoroTTS';
const STORE_NAME = 'models';
const MODEL_KEY = 'kokoro-82M-v1.0';

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function getCachedModel() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(MODEL_KEY);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function cacheModel(modelData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(modelData, MODEL_KEY);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

async function init() {
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressStatus = document.getElementById('progressStatus');

    progressContainer.style.visibility = 'visible';
    progressContainer.style.opacity = '1';
    progressBar.style.width = '0%';
    progressStatus.textContent = 'Initializing...';
    
    const device = (await detectWebGPU()) ? "webgpu" : "wasm";
    
    try {
        progressStatus.textContent = 'Checking cache...';
        progressBar.style.width = '10%';
        let modelData = await getCachedModel();
        
        if (!modelData) {
            progressStatus.textContent = 'Downloading model...';
            progressBar.style.width = '20%';
            
            const modelUrl = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx';
            const response = await fetch(modelUrl);
            const total = +response.headers.get('Content-Length');
            let loaded = 0;

            const reader = response.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                loaded += value.length;

                const percentage = (loaded / total) * 100;
                progressBar.style.width = `${20 + (percentage * 0.5)}%`;
                progressStatus.textContent = `Downloading model: ${percentage.toFixed(1)}%`;
            }

            const modelBlob = new Blob(chunks);
            modelData = new Uint8Array(await modelBlob.arrayBuffer());
            
            progressStatus.textContent = 'Caching model...';
            progressBar.style.width = '80%';
            await cacheModel(modelData);
            
        } else {
            progressStatus.textContent = 'Loading from cache...';
            progressBar.style.width = '50%';
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        progressStatus.textContent = 'Initializing model...';
        progressBar.style.width = '90%';
        
        const customLoadFn = async () => modelData;
        tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
            dtype: device === "wasm" ? "q8" : "fp32",
            device,
            load_fn: customLoadFn
        });

        progressBar.style.width = '100%';
        progressStatus.textContent = 'Ready!';
        await new Promise(resolve => setTimeout(resolve, 500));

        progressContainer.style.visibility = 'hidden';
        progressContainer.style.opacity = '0';
        
        populateVoiceSelect(tts.voices);
        
    } catch (error) {
        console.error('Failed to load model:', error);
        progressStatus.textContent = 'Failed to load model: ' + error.message;
        progressBar.style.width = '100%';
        progressBar.style.backgroundColor = '#ff4444';
        
        if (await getCachedModel()) {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            await store.delete(MODEL_KEY);
        }
    }
}

function populateVoiceSelect(voices) {
    for (const key in voices) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `${voices[key].name} (${voices[key].language === 'en-us' ? 'American' : 'British'} ${voices[key].gender})`;
        voiceSelect.appendChild(option);
    }

    // Set default voice to af_aoede
    voiceSelect.value = 'af_aoede';
    selectedVoice = 'af_aoede';

    voiceSelect.addEventListener('change', (e) => {
        selectedVoice = e.target.value;
    });
}

async function generateAndPlay() {
    generateButton.disabled = true;
    downloadButton.disabled = true;

    const text = textInput.value;
    const speed = parseFloat(speedControl.value);

    const streamer = new TextSplitterStream();
    streamer.push(text);
    streamer.close();

    try {
        const audioElement = document.createElement('audio');
        audioElement.controls = true;
        
        const stream = tts.stream(streamer, { 
            voice: selectedVoice, 
            speed,
            streamAudio: false // Set to true for chunk-by-chunk playback
        });

        for await (const { audio } of stream) {
            if (!audio) continue;
            
            audioBlob = audio.toBlob();
            audioElement.src = URL.createObjectURL(audioBlob);
            document.body.appendChild(audioElement);
            await audioElement.play();
            downloadButton.disabled = false;
        }
    } catch (error) {
        console.error('Generation failed:', error);
    } finally {
        generateButton.disabled = false;
    }
}

downloadButton.addEventListener('click', () => {
    if (audioBlob) {
        const url = URL.createObjectURL(audioBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'generated_audio.wav';
        a.click();
        URL.revokeObjectURL(url);
    }
});

generateButton.addEventListener('click', generateAndPlay);

init();