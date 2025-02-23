# TTS Rocks (Free Text-to-Speech Web Application)
A browser-based text-to-speech application using `kokoro-js` that leverages WebGPU (with WebAssembly fallback) for high-quality speech synthesis. The model and processing runs entirely client-side.

[Live Demo](https://tts.rocks/)

## Installation & Setup
The library can be used in two ways:

### 1. Direct Import (Simplest)
```html
<script type="module">
  import { KokoroTTS, TextSplitterStream, detectWebGPU } from 'https://raw.githubusercontent.com/steveseguin/tts.rocks/refs/heads/main/dist/lib/kokoro-bundle.es.js';
  // Your code here
</script>
```

### 2. NPM Installation
```bash
npm install kokoro-js
```

## Minimal Usage Example
Here's a complete example showing basic TTS functionality:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Simple TTS</title>
</head>
<body>
    <textarea id="text">Hello, world!</textarea>
    <button id="speak">Speak</button>

    <script type="module">
        import { KokoroTTS, TextSplitterStream, detectWebGPU } from 'https://raw.githubusercontent.com/steveseguin/tts.rocks/refs/heads/main/dist/lib/kokoro-bundle.es.js';

        let tts;

        async function init() {
            const device = await detectWebGPU() ? "webgpu" : "wasm";
            tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
                dtype: device === "wasm" ? "q8" : "fp32",
                device
            });
        }

        async function speak() {
            const text = document.getElementById('text').value;
            const streamer = new TextSplitterStream();
            streamer.push(text);
            streamer.close();

            const stream = tts.stream(streamer, { 
                voice: Object.keys(tts.voices)[0],
                streamAudio: false
            });

            const audioElement = document.createElement('audio');
            audioElement.controls = true;

            for await (const { audio } of stream) {
                if (!audio) continue;
                audioElement.src = URL.createObjectURL(audio.toBlob());
                document.body.appendChild(audioElement);
                await audioElement.play();
            }
        }

        document.getElementById('speak').onclick = speak;
        init();
    </script>
</body>
</html>
```

## Development Build
For development with build tools:
```bash
npm install
npx vite # Starts dev server
```

## Production Build
```bash
npm run build
```
This generates optimized files in the `dist` directory.

## Features
- Runs entirely in the browser - no server required
- WebGPU acceleration with WebAssembly fallback
- Multiple voices and languages
- Adjustable speech speed
- Model caching for faster subsequent loads
- Streaming audio output option
- WAV file download support

## Technical Notes
- Requires a modern browser with WebGPU or WebAssembly support
- Model size is approximately 82MB (downloaded once and cached)
- Initial load may take a few seconds while the model initializes

## License
MIT License for this project  
Apache 2.0 license for kokoro-js
