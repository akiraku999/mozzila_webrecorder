(function () {
  'use strict';

  if (window.__AUDEO_TAB_RECORDER_HOOK_INITIALIZED__) {
    return;
  }
  window.__AUDEO_TAB_RECORDER_HOOK_INITIALIZED__ = true;

  const capturedMediaElements = new Set();
  let audioContext = null;
  let destinationNode = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecordingActive = false;
  let recordingStartTimestamp = 0;

  function ensureAudioContext() {
    if (!audioContext || audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass();
      destinationNode = audioContext.createMediaStreamDestination();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }

  // Активация аудиоконтекста при любых кликах на странице
  ['click', 'keydown', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, () => {
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
      }
    }, { capture: true, passive: true });
  });

  function connectElementToDestination(element) {
    if (!element || element.__audeoCaptured) {
      return;
    }

    try {
      ensureAudioContext();

      let stream = null;
      if (typeof element.mozCaptureStream === 'function') {
        stream = element.mozCaptureStream();
      } else if (typeof element.captureStream === 'function') {
        stream = element.captureStream();
      }

      if (stream && stream.getAudioTracks().length > 0) {
        element.__audeoCaptured = true;

        // Если элемент уже перепривязывался ранее, очищаем старый узел
        if (element.__audeoSourceNode) {
          try {
            element.__audeoSourceNode.disconnect();
          } catch (e) {}
        }

        const sourceNode = audioContext.createMediaStreamSource(stream);
        element.__audeoSourceNode = sourceNode;

        // 1. Поток на запись в файл (всегда 100% громкость, не зависит от ползунка на сайте)
        sourceNode.connect(destinationNode);

        // 2. Мониторинг в наушники: ровно одна копия, синхронизированная с громкостью плеера
        const monitorGain = audioContext.createGain();
        monitorGain.gain.value = element.muted ? 0 : (element.volume ?? 1);

        sourceNode.connect(monitorGain);
        monitorGain.connect(audioContext.destination);

        element.addEventListener('volumechange', () => {
          monitorGain.gain.value = element.muted ? 0 : (element.volume ?? 1);
        });

        // Сброс флага при смене трека внутри того же плеера
        element.addEventListener('emptied', () => {
          element.__audeoCaptured = false;
        }, { once: true });
      }
    } catch (err) {
      console.warn('[Audeo Recorder] Ошибка захвата аудиопотока элемента:', err);
    }
  }

  function registerMediaElement(element) {
    if (!element || capturedMediaElements.has(element)) {
      return;
    }
    capturedMediaElements.add(element);

    const readyEvents = ['play', 'playing', 'canplay', 'loadedmetadata'];
    const onElementReady = () => {
      ensureAudioContext();
      connectElementToDestination(element);
    };

    for (let i = 0; i < readyEvents.length; i++) {
      element.addEventListener(readyEvents[i], onElementReady, { passive: true });
    }

    // Пробуем подключить сразу, если элемент уже готов к воспроизведению
    if (element.readyState >= 1) {
      connectElementToDestination(element);
    }
  }

  // Перехват нативного play
  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    registerMediaElement(this);
    ensureAudioContext();
    return nativePlay.apply(this, args);
  };

  // Перехват конструктора new Audio()
  const NativeAudio = window.Audio;
  window.Audio = function (...args) {
    const audioInstance = new NativeAudio(...args);
    registerMediaElement(audioInstance);
    return audioInstance;
  };
  window.Audio.prototype = NativeAudio.prototype;

  // Перехват создания элементов через createElement
  const nativeCreateElement = Document.prototype.createElement;
  Document.prototype.createElement = function (tagName, ...args) {
    const element = nativeCreateElement.call(this, tagName, ...args);
    if (typeof tagName === 'string') {
      const lowerTag = tagName.toLowerCase();
      if (lowerTag === 'audio' || lowerTag === 'video') {
        registerMediaElement(element);
      }
    }
    return element;
  };

  function scanDomMediaElements() {
    const elements = document.querySelectorAll('audio, video');
    for (let i = 0; i < elements.length; i++) {
      registerMediaElement(elements[i]);
    }
  }
  scanDomMediaElements();

  const mutationObserver = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        const node = added[j];
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
            registerMediaElement(node);
          } else if (node.querySelectorAll) {
            const nested = node.querySelectorAll('audio, video');
            for (let k = 0; k < nested.length; k++) {
              registerMediaElement(nested[k]);
            }
          }
        }
      }
    }
  });

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'AUDEO_CONTENT_BRIDGE') {
      return;
    }

    const command = event.data.command;

    if (command === 'EXECUTE_START_RECORDING') {
      if (isRecordingActive) {
        return;
      }
      ensureAudioContext();
      recordedChunks = [];
      isRecordingActive = true;
      recordingStartTimestamp = Date.now();

      scanDomMediaElements();
      capturedMediaElements.forEach((element) => {
        connectElementToDestination(element);
      });

      let chosenMimeType = 'audio/webm; codecs=opus';
      if (!MediaRecorder.isTypeSupported(chosenMimeType)) {
        chosenMimeType = 'audio/ogg; codecs=opus';
        if (!MediaRecorder.isTypeSupported(chosenMimeType)) {
          chosenMimeType = '';
        }
      }

      const recorderOptions = chosenMimeType ? { mimeType: chosenMimeType } : {};
      mediaRecorder = new MediaRecorder(destinationNode.stream, recorderOptions);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const combinedBlob = new Blob(recordedChunks, {
          type: mediaRecorder.mimeType || 'audio/webm'
        });
        const arrayBuffer = await combinedBlob.arrayBuffer();
        window.postMessage({
          source: 'AUDEO_HOOK_CORE',
          event: 'RECORDING_COMPLETE',
          buffer: arrayBuffer,
          mimeType: combinedBlob.type
        }, '*');
        recordedChunks = [];
      };

      mediaRecorder.start(250);
      window.postMessage({
        source: 'AUDEO_HOOK_CORE',
        event: 'RECORDING_STARTED_ACK',
        startTime: recordingStartTimestamp
      }, '*');

    } else if (command === 'EXECUTE_STOP_RECORDING') {
      if (!isRecordingActive || !mediaRecorder) {
        return;
      }
      isRecordingActive = false;
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }

    } else if (command === 'QUERY_RECORDER_STATE') {
      window.postMessage({
        source: 'AUDEO_HOOK_CORE',
        event: 'RECORDER_STATE_RESPONSE',
        isRecording: isRecordingActive,
        startTime: recordingStartTimestamp
      }, '*');
    }
  });
})();