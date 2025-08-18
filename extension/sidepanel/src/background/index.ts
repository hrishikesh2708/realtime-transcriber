export default chrome.runtime.onInstalled.addListener(() => {
  console.log("Background Service Worker working...");
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id !== undefined) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.tabCapture.capture(
  { audio: true, video: false },
  (stream) => {
    if (!stream) {
      console.error("Failed:", chrome.runtime.lastError);
      return;
    }
    const audio = new Audio();
    audio.srcObject = stream;
    audio.play();
  }
);