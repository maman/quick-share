const supportedContexts = ["page", "selection", "link"] as const;
type SupportedContextType = (typeof supportedContexts)[number];

chrome.commands.onCommand.addListener((command) => {
  if (command === "share-current-page-url") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs: chrome.tabs.Tab[]) => {
      if (tabs[0]?.url) {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id || 0 },
          args: [{ pageUrl: tabs[0].url }],
          func: async ({ pageUrl }) => {
            function getSelectionText() {
              let text = "";
              if (window.getSelection) {
                text = window.getSelection()?.toString() || "";
              }
              return text;
            }
            function getUrl() {
              const url = pageUrl;
              const selectionText = getSelectionText();
              if (selectionText) {
                const urlBeforeHash = url.split('#')[0];
                const encodedSelectionText = encodeURIComponent(selectionText);
                const highlightUrl = urlBeforeHash + "#:~:text=" + encodedSelectionText;
                return highlightUrl;
              }
              return url;
            }
            const run = async () => {
              const url = getUrl();
              const urlBlob = new Blob([url], { type: 'text/plain', });
              const clipboardItem = new ClipboardItem({
                [urlBlob.type]: urlBlob,
              });
              await navigator.clipboard.write([clipboardItem]);
              return url;
            }

            const wrapError = (e: Error) => new Error("Failed to copy page url", { cause: e });

            try {
              return await run();
            } catch (e) {
              if (!(e instanceof DOMException)) {
                throw wrapError(e as Error);
              }
            }

            // Avoids `DOMException: Document is not focused` in case DevTools was focused
            return new Promise((resolve, reject) => {
              const _asyncCopyFn = (async () => {
                try {
                  const value = await run();
                  resolve(value);
                } catch (e) {
                  reject(wrapError(e as Error));
                }
                window.removeEventListener("focus", _asyncCopyFn);
              });

              window.addEventListener("focus", _asyncCopyFn);
              console.log("Hit <Tab> to give focus back to document and copy page details");
            });
          }
        });
        if (result && result[0] && result[0].result) {
          const copiedText = result[0].result as string;
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id || 0 },
            args: [copiedText],
            func: (text) => {
              const toast = document.createElement('div');
              toast.textContent = `URL copied to clipboard`;
              toast.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: ${window.matchMedia('(prefers-color-scheme: dark)').matches ? '#333' : '#f5f5f5'};
                color: ${window.matchMedia('(prefers-color-scheme: dark)').matches ? '#fff' : '#333'};
                border: 1px solid rgba(128, 128, 128, 0.3);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                padding: 12px 24px;
                border-radius: 4px;
                font-weight: bold;
                font-size: 12px;
                z-index: 10000;
              `;
              document.body.appendChild(toast);
              const timeout = setTimeout(() => toast.remove(), 3000);
              const handleEscape = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                  toast.remove();
                  document.removeEventListener('keydown', handleEscape);
                  clearTimeout(timeout);
                }
              };
              document.addEventListener('keydown', handleEscape);
            }
          });
        }
      }
    });
  }
});

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
