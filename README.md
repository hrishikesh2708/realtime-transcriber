# Transcribe AI – Real-Time Audio Transcription Chrome Extension

**Transcribe AI** is a Chrome extension that captures audio from the active browser tab and provides real-time transcription using Google Cloud Speech-to-Text. Designed for online meetings, lectures, or any tab with audio, it features a live transcript display, session timer, and export functionality.

---

## Features

### ✅ Implemented Features

- **Active Tab Audio Capture**  
  - Captures audio only from the currently active Chrome tab.  
  - Detects if tab has audible audio before enabling recording.  

- **Real-Time Transcription**  
  - Uses Google Cloud Speech-to-Text via WebSocket streaming.  
  - Live transcription updates with typewriter effect.  
  - Partial results displayed in real-time; final results locked into transcript.  

- **Recording Controls**  
  - Start / Stop recording buttons.  
  - Automatic stop if tab audio becomes silent.  
  - Session duration timer displayed in HH:MM:SS format.  

- **Transcript Export**  
  - Copy to clipboard.  
  - Download as `.TXT` or `.JSON`.  

- **UI / UX**  
  - Clean sidepanel layout.  
  - Status indicators for recording state, errors, and tab audio availability.  
  - Smooth typewriter animation for live transcript updates.  

- **Backend Integration**  
  - Node.js + Express server handling both REST and WebSocket streaming modes.  
  - Google Cloud Speech API integration for high-quality transcription.  

---

## Installation

### Backend

1. Clone the repository:
    ```bash
    git clone https://github.com/yourusername/transcribe-ai.git
    cd transcribe-ai
2. Install dependencies:
    ```bash 
    npm install


3. Set up .env file:
    ```bash
    GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
    PORT=7214


4. Start server:
    ```bash
    npm run dev

### Chrome Extension

1. Build the React app:
    ```bash
    npm run build


This will generate a  dist folder containing the production-ready files.

2. Open Chrome: chrome://extensions/

3. Enable Developer Mode.

4. Click Load unpacked and select the /dist folder.

5. Grant required permissions (tabCapture, activeTab, storage).

## Usage

1. Open a Chrome tab with audio (e.g., YouTube, Google Meet).

2. Open the extension sidepanel.

3. Click Start Recording.

4. Live transcription appears in the panel.

5. Click Stop Recording to end the session.

6. Export transcript via Copy, TXT, or JSON buttons.

## Technical Details

1. Frontend: React + TypeScript

2. Backend: Node.js + Express + WebSocket

3. Audio Capture: Chrome tabCapture API

3. Transcription: Google Cloud Speech-to-Text

4. Chunked streaming: Audio sent continuously via WebSocket to backend.

## Known Limitations

1. Only captures active tab audio (multi-tab and microphone support not implemented yet).

2. No chunk overlap; minor word loss possible at boundaries.

3. Offline buffering during connection loss not yet implemented.

## Future Improvements

1. Multi-tab and microphone audio capture.

2. 3-second overlap between audio chunks to prevent missing words.

3. Offline buffering when internet disconnects briefly.

4. Enhanced UI showing which tab is being transcribed.

5. Support for multiple transcription APIs as fallback.

## Demo

Live transcript updates with typewriter effect.

Session timer shows elapsed recording time in real-time.

Export options allow copying to clipboard or downloading as JSON/TXT.

(Insert screenshots or GIF demo here)