export default chrome.runtime.onInstalled.addListener(() => {
  console.log("Background Service Worker working...");
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id !== undefined) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//   if (tabs[0]?.audible) {
//     console.log("Tab has audio!");
//   } else {
//     console.log("No audio in this tab");
//   }
// });