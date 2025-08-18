// import { useState } from "react";
// import reactLogo from "./assets/react.svg";
// import viteLogo from "/vite.svg";
import "./App.css";

function App() {
  // const [count, setCount] = useState(0);

  return (
    <>
      <div className="flex flex-col items-center min-h-screen p-2 gap-2 ">
        <div>
          <h1 className="">Real-Time Audio Transcription</h1>
        </div>
        <div className="flex items-center justify-center flex-row gap-6">
          <button className="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded">
            generate Transcript
          </button>
          <button className="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded">
            Stop
          </button>
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
        <p>error notifications</p>
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
