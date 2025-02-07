const supportedContexts = ["page", "selection", "link"] as const;
type SupportedContextType = typeof supportedContexts[number];

chrome.contextMenus.onClicked.addListener((_info, tab) => {
  const infoArg = {
    ..._info,
    menuItemId: _info.menuItemId as SupportedContextType
  }
  if (!supportedContexts.includes(infoArg.menuItemId as SupportedContextType)) {
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tab?.id || 0 },
    args: [infoArg],
    func: (info) => {
      try {
        if (info.menuItemId === "link" || info.menuItemId === "page") {
          navigator.share({
            url: (info.linkUrl || info.pageUrl).trim(),
          });
        } else if (info.menuItemId === "selection") {
          navigator.share({
            text: info.selectionText
          });
        }
      } catch (error) {
        console.error('Error sharing:', error);
      }
    }
  })
});

chrome.runtime.onInstalled.addListener(() => {
  for (const ctx of supportedContexts) {
    chrome.contextMenus.create({
      id: ctx,
      title: `Share ${ctx}`,
      contexts: [ctx],
    })
  }
})
