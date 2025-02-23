import * as kokoro from 'kokoro-js';
import { detectWebGPU } from './utils.js';
const { KokoroTTS: BaseKokoroTTS, TextSplitterStream } = kokoro;

class AudioStreamHandler {
    constructor() {
        this.chunks = [];
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    async appendChunk(audioData) {
        const blob = audioData.toBlob();
        this.chunks.push(await blob.arrayBuffer());
    }

    async mergeChunks() {
        if (this.chunks.length === 0) return null;
        
        const decodedBuffers = await Promise.all(
            this.chunks.map(buffer => this.audioContext.decodeAudioData(buffer))
        );
        
        // Add 50ms of silence padding at the start
        const sampleRate = decodedBuffers[0].sampleRate;
        const paddingSamples = Math.ceil(sampleRate * 0.2); // 200ms worth of samples
        
        const totalLength = paddingSamples + decodedBuffers.reduce((acc, buffer) => acc + buffer.length, 0);
        const offlineCtx = new OfflineAudioContext({
            numberOfChannels: 1,
            length: totalLength,
            sampleRate: sampleRate
        });

	    // Start after the padding silence
		let offset = 0.2; // 200ms padding
		decodedBuffers.forEach(buffer => {
			const source = offlineCtx.createBufferSource();
			source.buffer = buffer;
			source.connect(offlineCtx.destination);
			source.start(offset);
			offset += buffer.duration;
		});

        return offlineCtx.startRendering();
    }

    static audioBufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1;
        const bitDepth = 16;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const samples = buffer.getChannelData(0);
        const dataSize = samples.length * bytesPerSample;
        const headerSize = 44;
        const wavData = new ArrayBuffer(headerSize + dataSize);
        const view = new DataView(wavData);

        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        const offset = 44;
        for (let i = 0; i < samples.length; i++) {
            const sample = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset + i * 2, sample * 0x7FFF, true);
        }

        return wavData;
    }

    reset() {
        this.chunks = [];
    }
}

class KokoroTTS extends BaseKokoroTTS {
    constructor(...args) {
        super(...args);
        this.streamHandler = new AudioStreamHandler();
    }

    static async from_pretrained(...args) {
        const instance = await BaseKokoroTTS.from_pretrained(...args);
        return Object.assign(new KokoroTTS(), instance);
    }

    async *stream(streamer, options = {}) {
        const { streamAudio = false, ...streamOptions } = options;
        this.streamHandler.reset();
        
        for await (const chunk of super.stream(streamer, streamOptions)) {
            if (streamAudio) {
                yield chunk;
            } else {
                await this.streamHandler.appendChunk(chunk.audio);
            }
        }

        if (!streamAudio) {
            const mergedBuffer = await this.streamHandler.mergeChunks();
            if (mergedBuffer) {
                const wavData = AudioStreamHandler.audioBufferToWav(mergedBuffer);
                const audioBlob = new Blob([wavData], { type: 'audio/wav' });
                yield { audio: { toBlob: () => audioBlob } };
            }
        }
    }
}

export { KokoroTTS, TextSplitterStream, detectWebGPU };