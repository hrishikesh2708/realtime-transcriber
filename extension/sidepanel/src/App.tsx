import { useState, useRef, useEffect } from "react";
import "./App.css";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("Idle");
  const [canRecord, setCanRecord] = useState(false);
  const [transcript, setTranscript] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const transcriptionBoxRef = useRef<HTMLDivElement | null>(null);
  const activeTabIdRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // --- Format seconds to HH:MM:SS ---
  const formatTime = (seconds: number): string => {
    const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
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

  useEffect(() => {
  if (transcriptionBoxRef.current) {
    transcriptionBoxRef.current.scrollTop =
      transcriptionBoxRef.current.scrollHeight;
  }
}, [transcript]);

  // --- Stop Recording and cleanup ---
  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
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

      mediaRecorder.ondataavailable = (event) => {
        if (
          event.data.size > 0 &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          wsRef.current.send(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setIsRecording(true);
        setElapsedTime(0);

        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setElapsedTime((prev) => prev + 1);
        }, 1000);
      };
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
    <div className="flex flex-col h-screen px-4 items-center">
      <div className="h-auto p-2 pt-4  min-w-xs w-full max-w-lg">
        <div className="mb-2 flex flex-col items-center justify-center text-center">
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-whitel">
            <span className="text-transparent bg-clip-text bg-gradient-to-r to-emerald-600 from-sky-400">
              Transcribe AI{" "}
            </span>
          </h2>
          <p className="text-sm font-norma dark:text-gray-400">
            Real-Time Audio Transcription
          </p>
        </div>
      </div>

      {/* Middle takes remaining space */}
      <div className="mb-6 flex-1 min-w-xs w-full max-w-lg p-4 bg-black-800 outline outline-solid outline-offset-2 outline-zinc-500/70 shadow-lg shadow-zinc-500/80 rounded-lg overflow-hidden text-white">
        <div className="flex flex-col h-full">
          <div className="h-auto flex flex-row items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="size-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
              />
            </svg>
            <p className="text-sm font-semibold"> Live Transcript</p>
          </div>

          <div
            ref={transcriptionBoxRef}
            className="flex-1 border-t border-gray-500 my-2 py-2 overflow-y-auto max-h-570 whitespace-pre-wrap break-words"
          >
            {transcript.length > 0 ? (
              <p className="text-sm leading-relaxed pr-4">{transcript}</p>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-16 h-16 rounded-full bg-gray-600/50 flex items-center justify-center mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="size-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
                    />
                  </svg>
                </div>
                <p className="text-slate-400 font-medium text-lg">
                  "Start recording to see transcript.."
                </p>
                <p className="text-slate-500 text-sm mt-2">
                  Audio will be transcribed in real-time
                </p>
              </div>
            )}
          </div>
          <div className="h-auto px-4 py-2 bg-transparent border-x-1 shadow-md/70 shadow-zinc-500/50 border-zinc-500 rounded-full text-white flex flex-row items-center justify-between w-full max-w-md gap-2">
            <p>Status: {recordingStatus}</p>
            {!canRecord && (
              <p className="text-red-400">No audio in active tab</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom fixed height (content-based) */}
      <div className="h-auto pb-8 px-2 min-w-xs w-full max-w-lg">
        <div className="flex items-center justify-between w-full max-w-lg">
          <div className="flex items-center justify-center flex-row gap-6">
            {!isRecording ? (
              <div className="flex items-center justify-center">
                <div className="relative group">
                  <button
                    onClick={startRecording}
                    disabled={!canRecord}
                    className={`relative inline-block p-px font-semibold leading-6 text-white bg-gray-700 shadow-xl/50 rounded-xl shadow-zinc-600 transition-transform duration-300 ease-in-out 
    ${
      canRecord
        ? "cursor-pointer hover:scale-105 active:scale-95 group"
        : "cursor-not-allowed opacity-50"
    }`}
                  >
                    {/* Gradient border */}
                    <span
                      className={`absolute inset-0 rounded-xl bg-gradient-to-r from-teal-400 via-blue-500 to-purple-500 p-[2px] transition-opacity duration-500 
      ${canRecord ? "opacity-0 group-hover:opacity-100" : "opacity-20"}`}
                    ></span>

                    {/* Inner content */}
                    <span className="relative z-10 block px-6 py-3 rounded-xl bg-gray-950">
                      <div className="relative z-10 flex items-center space-x-2">
                        <span
                          className={`transition-all duration-500 ${
                            canRecord ? "group-hover:translate-x-1" : ""
                          }`}
                        >
                          Start Recording
                        </span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.7"
                          stroke="currentColor"
                          className={`size-4 transition-transform duration-500 ${
                            canRecord ? "group-hover:translate-x-1" : ""
                          }`}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
                          />
                        </svg>
                      </div>
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <div className="relative group">
                  <button
                    onClick={stopRecording}
                    className="relative inline-block p-px font-semibold leading-6 text-white bg-gray-800 shadow-2xl cursor-pointer rounded-xl shadow-zinc-900 transition-transform duration-300 ease-in-out hover:scale-105 active:scale-95"
                  >
                    <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-400 via-yellow-500 to-red-500 p-[2px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"></span>

                    <span className="relative z-10 block px-6 py-3 rounded-xl bg-gray-950">
                      <div className="relative z-10 flex items-center space-x-2">
                        <span className="transition-all duration-500 group-hover:translate-x-1">
                          Stop Recording
                        </span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke-width="1.7"
                          stroke="currentColor"
                          className="size-4 transition-transform duration-500 group-hover:translate-x-1"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z"
                          />
                        </svg>
                      </div>
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="m-1 hs-dropdown [--trigger:hover] relative inline-flex">
            <button
              id="hs-dropdown-hover-event"
              type="button"
              aria-haspopup="menu"
              aria-expanded="false"
              aria-label="Dropdown"
              className="relative inline-block p-px font-semibold leading-6 text-white bg-gray-700 shadow-xl/50 cursor-pointer rounded-xl shadow-zinc-600 transition-transform duration-300 ease-in-out hover:scale-105 active:scale-95 group"
            >
              <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-teal-400 via-blue-500 to-purple-500 p-[2px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"></span>

              <span className="relative z-10 block px-6 py-3 rounded-xl bg-gray-950">
                <div className="relative z-10 flex items-center space-x-2">
                  <span className="transition-all duration-500 group-hover:translate-x-1">
                    Export
                  </span>
                  <svg
                    className="size-4 transition-transform duration-500 group-hover:translate-x-1"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.7"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m6 9 6 6 6-6"
                    />
                  </svg>
                </div>
              </span>
            </button>

            <div
              className="hs-dropdown-menu transition-[opacity,margin] duration hs-dropdown-open:opacity-100 opacity-0 hidden min-w-60 bg-white shadow-md rounded-lg mt-2 dark:bg-neutral-800 dark:border dark:border-neutral-700 dark:divide-neutral-700 after:h-4 after:absolute after:-bottom-4 after:start-0 after:w-full before:h-4 before:absolute before:-top-4 before:start-0 before:w-full"
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="hs-dropdown-hover-event"
            >
              <div className="p-1 space-y-0.5">
                <a
                  className="flex items-center gap-x-3.5 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:outline-hidden focus:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 dark:focus:bg-neutral-700"
                  href="#"
                >
                  Newsletter
                </a>
                <a
                  className="flex items-center gap-x-3.5 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:outline-hidden focus:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 dark:focus:bg-neutral-700"
                  href="#"
                >
                  Purchases
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-center">
          <div className="max-w-md flex flex-col items-center bg-transparent border-x-1 shadow-md/70 shadow-zinc-500/50 border-zinc-500 mt-4 px-8 py-2 rounded-full shadow-md text-white">
            <p className="text-base font-bold">{formatTime(elapsedTime)}</p>
            <p>Session Duration</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
