import * as kokoro from 'kokoro-js';
import { detectWebGPU } from './utils.js';

const { KokoroTTS, TextSplitterStream } = kokoro;

export { KokoroTTS, TextSplitterStream, detectWebGPU };