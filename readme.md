# TTS Web (Text-to-Speech Web Application)

This is a simple text-to-speech web application that utilizes `kokoro-js` and WebGPU (or WebAssembly fallback) to convert text into natural-sounding speech directly in the browser.

Free Online Demo: https://steveseguin.github.io/tts-web/

## Installation

To install the necessary dependencies, run:

```bash
npm install
```

## Development

To start the development server and run the application locally:

```bash
npx vite
```

This will launch a development server. Open your browser and navigate to the URL displayed in the terminal (usually `http://localhost:5173/`).

## Production Build

To create a production-ready build of the application:

```bash
npm run build
```

This will generate a `dist` folder containing the optimized build files.

## Deployment

To deploy the application, copy the contents of the `dist` folder to your web server.

### Local Testing (Temporary Web Server)

For quick local testing of the production build, you can use Python's built-in HTTP server. Navigate to the `dist` directory and run:

```bash
python -m http.server 8080
```

Then, open your browser and go to `http://localhost:8080/index.html`.

**Note:** Ensure you are running the `python -m http.server 8080` command from within the `dist` directory. This will make the dist directory the root of the server.

### GitHub Pages Deployment

1.  **Build the project:** `npm run build`
2.  **Create a `gh-pages` branch:** `git checkout --orphan gh-pages`
3.  **Copy `dist` contents to the root of the `gh-pages` branch:**
    * `git rm -rf .`
    * `cp -r dist/. .`
4.  **Add, commit, and push:**
    * `git add .`
    * `git commit -m "Deploy to GitHub Pages"`
    * `git push origin gh-pages`
5.  **GitHub Pages Settings:**
    * In your repository's settings, go to "Pages."
    * Set "Source" to "Deploy from a branch."
    * Set "Branch" to "gh-pages" and the folder to root.
    * Click "Save."

Your site should be live at `https://<your-username>.github.io/<your-repo-name>/`.

## License

This project is licensed under the MIT License.

`kokoro-js` is distributed under the Apache 2.0 license.
