import { KokoroTTS, TextSplitterStream } from './node_modules/kokoro-js/dist/kokoro.web.js';
import { detectWebGPU } from './utils.js';

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

async function init() {
	const device = (await detectWebGPU()) ? "webgpu" : "wasm";
	tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
		dtype: device === "wasm" ? "q8" : "fp32",
		device,
	});

	populateVoiceSelect(tts.voices);
	selectedVoice = Object.keys(tts.voices)[0];
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

	const totalLength = decodedBuffers.reduce((acc, buffer) => acc + buffer.length, 0);
	const mergedBuffer = audioContext.createBuffer(1, totalLength, decodedBuffers[0].sampleRate);

	let offset = 0;
	decodedBuffers.forEach(buffer => {
		mergedBuffer.copyToChannel(buffer.getChannelData(0), 0, offset);
		offset += buffer.length;
	});

	audioBlob = await audioContext.encodeAudioData(mergedBuffer).then(buffer => new Blob([buffer], { type: 'audio/wav' }));
	downloadButton.disabled = false;
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