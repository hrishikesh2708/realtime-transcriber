import { useState, useRef, useEffect } from "react";
import "./App.css";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("Idle");
  const [canRecord, setCanRecord] = useState(false);
  const [transcript, setTranscript] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const transcriptionBoxRef = useRef<HTMLDivElement | null>(null);
  const activeTabIdRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // --- Helpers ---
  const getTabStream = (): Promise<MediaStream | null> =>
    new Promise((resolve) => {
      chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
        resolve(stream ?? null);
      });
    });

  const getActiveTab = async (): Promise<chrome.tabs.Tab | null> =>
    new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0] ?? null);
      });
    });

  const checkTabAudio = async () => {
    const tab = await getActiveTab();
    setCanRecord(!!tab?.audible);
  };

  useEffect(() => {
    checkTabAudio();
    chrome.tabs.onUpdated.addListener(checkTabAudio);
    chrome.tabs.onActivated.addListener(checkTabAudio);
    return () => {
      chrome.tabs.onUpdated.removeListener(checkTabAudio);
      chrome.tabs.onActivated.removeListener(checkTabAudio);
    };
  }, []);

  // --- Stop Recording and cleanup ---
  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecordingStatus("Stopped");
    activeTabIdRef.current = null;
  };

  // --- Start Recording ---
  const startRecording = async () => {
    try {
      setRecordingStatus("Requesting audio...");
      stopRecording();
      await new Promise((r) => setTimeout(r, 200));

      const tab = await getActiveTab();
      if (!tab) {
        setRecordingStatus("❌ No active tab found");
        return;
      }
      activeTabIdRef.current = tab.id ?? null;

      const stream = await getTabStream();
      if (!stream) {
        setRecordingStatus("❌ Failed to capture audio");
        return;
      }
      streamRef.current = stream;

      // Play audio while recording
      const audioContext = new AudioContext();
      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNode.connect(audioContext.destination);
      audioContextRef.current = audioContext;
      sourceNodeRef.current = sourceNode;

      // --- Setup WebSocket ---
      const ws = new WebSocket("ws://localhost:7214");
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => setRecordingStatus("🎙️ Recording (WebSocket)...");
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.transcript && data.isFinal) {
          setTranscript((prev) => prev + data.transcript + "\n");
          if (transcriptionBoxRef.current) {
            transcriptionBoxRef.current.scrollTop =
              transcriptionBoxRef.current.scrollHeight;
          }
        }
      };

      ws.onerror = (err) => console.error("WebSocket error:", err);
      ws.onclose = () => console.log("WebSocket closed");

      // --- Setup MediaRecorder ---
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (
          event.data.size > 0 &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          wsRef.current.send(event.data);
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => setIsRecording(true);

      // Stop listener if tab goes silent
      const stopOnTabSilent = (
        _tabId: number,
        changeInfo: Partial<chrome.tabs.Tab>
      ) => {
        if (_tabId === activeTabIdRef.current && changeInfo.audible === false)
          stopRecording();
      };
      chrome.tabs.onUpdated.addListener(stopOnTabSilent);

      mediaRecorder.onstop = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (sourceNodeRef.current) {
          sourceNodeRef.current.disconnect();
          sourceNodeRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        chrome.tabs.onUpdated.removeListener(stopOnTabSilent);

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "tab-audio.webm";
        a.click();

        setRecordingStatus("🛑 Stopped");
        setIsRecording(false);
        activeTabIdRef.current = null;
      };

      // Emit chunks every 10 seconds
      mediaRecorder.start(1000);
    } catch (err) {
      console.error("Error starting recording:", err);
      setRecordingStatus("Error: " + (err as Error).message);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center min-h-screen p-2 gap-2">
        <h1>Transcribe AI</h1>

        <div className="flex items-center justify-center flex-row gap-6">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={!canRecord}
              className={`${
                canRecord
                  ? "bg-sky-500 hover:bg-sky-700"
                  : "bg-gray-400 cursor-not-allowed"
              } text-white font-bold py-2 px-4 rounded`}
            >
              Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              Stop
            </button>
          )}
        </div>
        <div className="flex-grow w-full max-w-2xl p-4 bg-black rounded-lg shadow-md overflow-auto text-white">
          <div className="">
            <div className="flex flex-row items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                className="size-6"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
              <p className="text-xl font-semibold"> Live Transcript</p>
            </div>
          </div>
          <div
            ref={transcriptionBoxRef}
          >
            <p>{transcript || "Transcription will appear here..."}</p>
          </div>
        </div>

        <div className="flex items-center justify-center flex-row gap-6">
          <div className="mt-4 p-4 bg-gray-800 rounded-lg shadow-md text-white">
            <p>Status: {recordingStatus}</p>
            {!canRecord && (
              <p className="text-red-400">No audio in active tab</p>
            )}
          </div>
          <button className="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded">
            Session Duration
          </button>
        </div>

        <div className="flex items-center justify-center flex-row gap-6">
          <button className="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded">
            Copy transcript to clipboard
          </button>
          <button className="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded">
            Download as text/JSON
          </button>
        </div>
      </div>
    </>
  );
}

export default App;
