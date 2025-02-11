const supportedContexts = ["page", "selection", "link"] as const;
type SupportedContextType = (typeof supportedContexts)[number];

async function showToast(text: string, tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [text],
    func: (text) => {
      const existingToast = document.querySelector('div[data-toast-id="url-copy-toast"]');
      if (existingToast) {
        return;
      }

      // Small delay before showing new toast to prevent visual overlap
      const showToast = () => {
        const toast = document.createElement('div');
        toast.dataset.toastId = 'toast';
        const shadowRoot = toast.attachShadow({ mode: 'closed' });

        const toastContent = document.createElement('div');
        toastContent.textContent = text;

        const style = document.createElement('style');
        style.textContent = `
                  @keyframes slideIn {
                    0% {
                      transform: translateY(-100%);
                      opacity: 0;
                    }
                    70% {
                      transform: translateY(3px);
                      opacity: 1;
                    }
                    100% {
                      transform: translateY(0);
                      opacity: 1;
                    }
                  }
                  
                  .toast {
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
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 
                               Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                    z-index: 10000;
                    animation: slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    transition: opacity 0.15s ease-out, transform 0.15s ease-out;
                  }
                  
                  .toast.hiding {
                    opacity: 0;
                    transform: translateY(-100%);
                  }
                `;

        toastContent.className = 'toast';
        shadowRoot.appendChild(style);
        shadowRoot.appendChild(toastContent);

        document.body.appendChild(toast);

        const remove = () => {
          toastContent.classList.add('hiding');
          setTimeout(() => toast.remove(), 150);
        };

        const timeout = setTimeout(remove, 3000);
        const handleEscape = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            remove();
            document.removeEventListener('keydown', handleEscape);
            clearTimeout(timeout);
          }
        };
        document.addEventListener('keydown', handleEscape);
      };

      showToast();
    }
  });
}

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
          await showToast("URL Copied to Clipboard", tabs[0].id || 0);
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
