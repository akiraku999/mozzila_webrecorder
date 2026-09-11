(function () {
  'use strict';

  if (window.__AUDEO_TAB_RECORDER_CONTENT_INITIALIZED__) {
    return;
  }
  window.__AUDEO_TAB_RECORDER_CONTENT_INITIALIZED__ = true;

  function injectMainWorldHook() {
    try {
      const scriptTag = document.createElement('script');
      scriptTag.src = browser.runtime.getURL('hook.js');
      scriptTag.async = false;
      (document.head || document.documentElement).appendChild(scriptTag);
      scriptTag.onload = () => {
        scriptTag.remove();
      };
    } catch (e) {
      console.error('[AudeoRecorder] Ошибка внедрения hook.js:', e);
    }
  }

  injectMainWorldHook();

  let stopRecordingResolver = null;

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'AUDEO_HOOK_CORE') {
      return;
    }

    const payload = event.data;

    if (payload.event === 'RECORDING_COMPLETE') {
      if (stopRecordingResolver) {
        stopRecordingResolver({
          buffer: payload.buffer,
          mimeType: payload.mimeType
        });
        stopRecordingResolver = null;
      }
    }
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'POPUP_START_RECORD') {
      window.postMessage({
        source: 'AUDEO_CONTENT_BRIDGE',
        command: 'EXECUTE_START_RECORDING'
      }, '*');
      sendResponse({ status: 'INITIATED' });
      return false;
    }

    if (message.action === 'POPUP_STOP_RECORD') {
      const dataPromise = new Promise((resolve) => {
        stopRecordingResolver = resolve;
      });

      window.postMessage({
        source: 'AUDEO_CONTENT_BRIDGE',
        command: 'EXECUTE_STOP_RECORDING'
      }, '*');

      dataPromise.then((data) => {
        sendResponse({
          status: 'SUCCESS',
          audioBuffer: data.buffer,
          mimeType: data.mimeType
        });
      });

      return true;
    }

    if (message.action === 'POPUP_QUERY_STATE') {
      const statePromise = new Promise((resolve) => {
        const onStateMessage = (evt) => {
          if (evt.source === window && evt.data && evt.data.source === 'AUDEO_HOOK_CORE' && evt.data.event === 'RECORDER_STATE_RESPONSE') {
            window.removeEventListener('message', onStateMessage);
            resolve({
              isRecording: evt.data.isRecording,
              startTime: evt.data.startTime
            });
          }
        };
        window.addEventListener('message', onStateMessage);
        window.postMessage({
          source: 'AUDEO_CONTENT_BRIDGE',
          command: 'QUERY_RECORDER_STATE'
        }, '*');

        setTimeout(() => {
          window.removeEventListener('message', onStateMessage);
          resolve({ isRecording: false, startTime: 0 });
        }, 300);
      });

      statePromise.then((state) => {
        sendResponse(state);
      });

      return true;
    }
  });
})();