import { KokoroTTS, TextSplitterStream, detectWebGPU } from './dist/lib/kokoro-bundle.es.js';


const textInput = document.getElementById('textInput');
const generateButton = document.getElementById('generateButton');
const downloadButton = document.getElementById('downloadButton');
const voiceSelect = document.getElementById('voiceSelect');
const chunksDiv = document.getElementById('chunks');
const speedControl = document.getElementById('speedControl');
const speedValue = document.getElementById('speedValue');

let tts;
let selectedVoice;
let audioBlob;
let currentChunkIndex = -1;
let isPlaying = false;
let chunks = [];

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

    progressContainer.style.display = 'block';
    const device = (await detectWebGPU()) ? "webgpu" : "wasm";
    
    try {
        // Try to get cached model first
        let modelData = await getCachedModel();
        
        if (!modelData) {
            progressStatus.textContent = 'Downloading model...';
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
                progressBar.style.width = `${percentage}%`;
                progressStatus.textContent = `Downloading model: ${percentage.toFixed(2)}%`;
            }

            const modelBlob = new Blob(chunks);
            modelData = new Uint8Array(await modelBlob.arrayBuffer());
            
            progressStatus.textContent = 'Caching model...';
            await cacheModel(modelData);
        } else {
            progressStatus.textContent = 'Loading cached model...';
            progressBar.style.width = '100%';
        }

        // Custom load function to use the model data
        const customLoadFn = async () => modelData;

        tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
            dtype: device === "wasm" ? "q8" : "fp32",
            device,
            load_fn: customLoadFn
        });

        progressContainer.style.display = 'none';
        populateVoiceSelect(tts.voices);
        selectedVoice = Object.keys(tts.voices)[0];
        
    } catch (error) {
        console.error('Failed to load model:', error);
        progressStatus.textContent = 'Failed to load model. ' + error.message;
        
        // If loading from cache failed, clear it and try fresh download next time
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

	voiceSelect.addEventListener('change', (e) => {
		selectedVoice = e.target.value;
	});
}

async function generateAndPlay() {
	generateButton.disabled = true;
	downloadButton.disabled = true;
	chunksDiv.innerHTML = '';
	chunks = [];
	currentChunkIndex = 0;

	const text = textInput.value;
	const speed = parseFloat(speedControl.value);

	const streamer = new TextSplitterStream();
	streamer.push(text);
	streamer.close();

	const stream = tts.stream(streamer, { voice: selectedVoice, speed });

	for await (const { text, audio } of stream) {
		const chunkBlob = audio.toBlob();
		chunks.push({ text, audio: chunkBlob });
		displayChunk(text, chunkBlob, chunks.length - 1);
	}

	mergeAndDownload(chunks);
	playChunks();
	generateButton.disabled = false;
}

function displayChunk(text, audio, index) {
	const chunkDiv = document.createElement('div');
	chunkDiv.classList.add('audio-chunk');
	chunkDiv.innerHTML = `<p>${text}</p><audio src="${URL.createObjectURL(audio)}" controls data-index="${index}"></audio>`;
	chunksDiv.appendChild(chunkDiv);

	chunkDiv.querySelector('audio').addEventListener('ended', () => {
		if (currentChunkIndex < chunks.length - 1) {
			currentChunkIndex++;
			playChunks();
		} else {
			isPlaying = false;
		}
	});
}

function playChunks() {
	if (currentChunkIndex >= 0 && currentChunkIndex < chunks.length) {
		const audioElements = chunksDiv.querySelectorAll('audio');
		audioElements.forEach((audio, index) => {
			if (index === currentChunkIndex) {
				audio.play();
			}
		});
		isPlaying = true;
	} else {
		isPlaying = false;
	}
}

async function mergeAndDownload(chunks) {
    if (chunks.length === 0) return;

    const audioBuffers = await Promise.all(chunks.map(chunk => chunk.audio.arrayBuffer()));
    const audioContext = new AudioContext();
    const decodedBuffers = await Promise.all(audioBuffers.map(buffer => audioContext.decodeAudioData(buffer)));
    audioContext.close();

    const totalLength = decodedBuffers.reduce((acc, buffer) => acc + buffer.length, 0);
    const sampleRate = decodedBuffers[0].sampleRate;
    const offlineAudioContext = new OfflineAudioContext({
        numberOfChannels: 1,
        length: totalLength,
        sampleRate: sampleRate,
    });

    let offset = 0;
    decodedBuffers.forEach(buffer => {
        const source = offlineAudioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineAudioContext.destination);
        source.start(0);
        offset += buffer.length;
    });

    const renderedBuffer = await offlineAudioContext.startRendering();
    
    // Convert AudioBuffer to WAV
    const wavData = audioBufferToWav(renderedBuffer);
    audioBlob = new Blob([wavData], { type: 'audio/wav' });
    downloadButton.disabled = false;
}

function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const samples = buffer.getChannelData(0);
    const dataSize = samples.length * bytesPerSample;
    const headerSize = 44;
    const wavData = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(wavData);

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write audio data
    const offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset + i * 2, sample * 0x7FFF, true);
    }

    return wavData;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

downloadButton.addEventListener('click', () => {
	if (audioBlob) {
		const url = URL.createObjectURL(audioBlob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'merged_audio.wav';
		a.click();
		URL.revokeObjectURL(url);
	}
});

generateButton.addEventListener('click', generateAndPlay);

init();