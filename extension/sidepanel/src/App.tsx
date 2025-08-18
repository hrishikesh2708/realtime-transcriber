import { useState, useRef, useEffect } from "react";
import "./App.css";

function App() {
  // const [count, setCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("Idle");
  const [canRecord, setCanRecord] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

    // --- Check if active tab has audio ---
  const checkTabAudio = async () => {
    const tab = await getActiveTab();
    setCanRecord(!!tab?.audible);
  };

  useEffect(() => {
    checkTabAudio();

    // 🔹 Listen when active tab changes or updates
    chrome.tabs.onUpdated.addListener(() => checkTabAudio());
    chrome.tabs.onActivated.addListener(() => checkTabAudio());

    return () => {
      chrome.tabs.onUpdated.removeListener(() => checkTabAudio());
      chrome.tabs.onActivated.removeListener(() => checkTabAudio());
    };
  }, []);

  // 🔹 Start Recording
  const startRecording = async () => {
    try {
      setRecordingStatus("Requesting audio...");
      const stream = await getTabStream();

      if (!stream) {
        setRecordingStatus("Failed to capture audio");
        return;
      }
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setRecordingStatus("Recording...");
        setIsRecording(true);
      };

      mediaRecorder.onstop = () => {
        setRecordingStatus("Stopped");
        setIsRecording(false);
      };

      mediaRecorder.start();
    } catch (err) {
      console.error("Error starting recording:", err);
      setRecordingStatus("Error: " + (err as Error).message);
    }
  };

  // --- Stop Recording ---
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecordingStatus("Stopped");
    setIsRecording(false);
  };

  return (
    <>
      <div className="flex flex-col items-center min-h-screen p-2 gap-2 ">
        <div>
          <h1 className="">Real-Time Audio Transcription</h1>
        </div>
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
        <div className="flex-grow w-full max-w-2xl p-4 bg-gray-800 rounded-lg shadow-md">
          <p>Transcription box</p>
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
