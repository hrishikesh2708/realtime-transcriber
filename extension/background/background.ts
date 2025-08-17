chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_CAPTURE") {
    chrome.tabCapture.capture({ audio: true }, (stream) => {
      if (!stream) {
        console.error("Failed to capture tab audio");
        return;
      }
      console.log("Audio stream captured", stream);
      // TODO: send to backend
    });
  }
});