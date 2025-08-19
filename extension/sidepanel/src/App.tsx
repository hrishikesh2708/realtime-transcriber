import { useState, useRef, useEffect } from "react";
import "./App.css";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("Idle");
  const [canRecord, setCanRecord] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const transcriptionBoxRef = useRef<HTMLDivElement | null>(null);
  const activeTabIdRef = useRef<number | null>(null);

  // --- Helpers ---
  const getTabStream = (): Promise<MediaStream | null> => {
    return new Promise((resolve) => {
      chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
        resolve(stream ?? null);
      });
    });
  };

  const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0] ?? null);
      });
    });
  };

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

  // --- Mock transcription API ---
const transcribeChunk = async (blob: Blob) => {
  try {
    const formData = new FormData();
    formData.append("file", blob, "chunk.webm"); // Match backend field name

    const response = await fetch("http://localhost:7214/transcribe", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("API request failed");

    const data = await response.json();
    const text = data.text || ""; // Your backend returns { text: ... }

    // Append to transcript
    setTranscript((prev) => prev + text + "\n");

    // Auto-scroll transcription box
    if (transcriptionBoxRef.current) {
      transcriptionBoxRef.current.scrollTop = transcriptionBoxRef.current.scrollHeight;
    }
  } catch (err) {
    console.error("Transcription error:", err);
  }
};

  // --- Stop Recording and cleanup ---
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
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

    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecordingStatus("Stopped");
    activeTabIdRef.current = null;
  };

  // --- Start Recording ---
  const startRecording = async () => {
    try {
      setRecordingStatus("Requesting audio...");

      // Cleanup previous recording
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

      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          await transcribeChunk(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setRecordingStatus("🎙️ Recording...");
        setIsRecording(true);
      };

      // Stop listener if tab goes silent
      const stopOnTabSilent = (_tabId: number, changeInfo: Partial<chrome.tabs.Tab>) => {
        if (_tabId === activeTabIdRef.current && changeInfo.audible === false) {
          stopRecording();
        }
      };
      chrome.tabs.onUpdated.addListener(stopOnTabSilent);

      mediaRecorder.onstop = () => {
        // Stop all tracks and cleanup
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

        // Remove listener
        chrome.tabs.onUpdated.removeListener(stopOnTabSilent);

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        const a = document.createElement("a");
        a.href = url;
        a.download = "tab-audio.webm";
        a.click();

        setRecordingStatus("🛑 Stopped");
        setIsRecording(false);
        activeTabIdRef.current = null;
      };

      // Emit chunks every 10 seconds
      mediaRecorder.start(20000);
    } catch (err) {
      console.error("Error starting recording:", err);
      setRecordingStatus("Error: " + (err as Error).message);
    }
  };


  return (
    <>
      <div className="flex flex-col items-center min-h-screen p-2 gap-2">
        <h1 className="">Real-Time Audio Transcription</h1>

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
      <div className="flex-grow w-full max-w-2xl p-4 bg-gray-800 rounded-lg shadow-md overflow-auto text-white">
        <p>{transcript || "Transcription will appear here..."}</p>
      </div>
        <div className="flex items-center justify-center flex-row gap-6">
          <button className="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded">
            Recording state
          </button>
          <button className="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded">
            Display current session duration
          </button>
          <button className="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded">
            connection status
          </button>
        </div>
        <div className="mt-4 p-4 bg-gray-800 rounded-lg shadow-md text-white">
          <p>Status: {recordingStatus}</p>
          {!canRecord && <p className="text-red-400">No audio in active tab</p>}
        </div>

        {audioUrl && (
          <div className="mt-4">
            <p className="text-white">Last recording:</p>
            <audio controls src={audioUrl} className="mt-2 w-full" />
          </div>
        )}
        <div className="flex items-center justify-center flex-row gap-6">
          <button className="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded">
            Copy transcript to clipboard
          </button>
          <button className="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded">
            download as text/JSON
          </button>
        </div>
      </div>
    </>
  );
}

export default App;
