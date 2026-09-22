(function () {
  'use strict';

  if (window.__AUDEO_TAB_RECORDER_HOOK_INITIALIZED__) {
    return;
  }
  window.__AUDEO_TAB_RECORDER_HOOK_INITIALIZED__ = true;

  // Хранилище отслеживаемых медиа-элементов
  const activeMediaElements = new Set();

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
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    if (!destinationNode || destinationNode.context !== audioContext) {
      destinationNode = audioContext.createMediaStreamDestination();
    }
  }

  function cleanupElementBridge(element) {
    if (!element || !element.__audeoBridge) {
      return;
    }
    const bridge = element.__audeoBridge;
    try {
      bridge.sourceNode.disconnect();
    } catch (e) {}
    try {
      bridge.monitorGain.disconnect();
    } catch (e) {}
    if (bridge.onVolumeChange) {
      element.removeEventListener('volumechange', bridge.onVolumeChange);
    }
    delete element.__audeoBridge;
    activeMediaElements.delete(element);
  }

  function connectMediaElement(element) {
    if (!element) {
      return false;
    }

    try {
      ensureAudioContext();

      // Если для элемента уже существует рабочий мост (например, при повторной записи того же видео)
      if (element.__audeoBridge) {
        const bridge = element.__audeoBridge;
        if (isRecordingActive && destinationNode) {
          try {
            bridge.sourceNode.connect(destinationNode);
          } catch (e) {}
        }
        return true;
      }

      let stream = null;
      if (typeof element.mozCaptureStream === 'function') {
        stream = element.mozCaptureStream();
      } else if (typeof element.captureStream === 'function') {
        stream = element.captureStream();
      }

      if (!stream) {
        return false;
      }

      // Если аудиодорожки еще не инициализировались, ждем события addtrack
      if (stream.getAudioTracks().length === 0) {
        const onAddTrack = () => {
          stream.removeEventListener('addtrack', onAddTrack);
          if (!element.__audeoBridge) {
            connectMediaElement(element);
          }
        };
        stream.addEventListener('addtrack', onAddTrack);
        return false;
      }

      const sourceNode = audioContext.createMediaStreamSource(stream);

      // В Firefox вызов mozCaptureStream() отключает нативный вывод медиа-элемента в системные динамики.
      // Поэтому направляем поток в audioContext.destination через управляемый GainNode,
      // синхронизированный с громкостью плеера.
      const monitorGain = audioContext.createGain();
      monitorGain.gain.value = element.muted ? 0 : (element.volume ?? 1);

      sourceNode.connect(monitorGain);
      monitorGain.connect(audioContext.destination);

      const onVolumeChange = () => {
        monitorGain.gain.value = element.muted ? 0 : (element.volume ?? 1);
      };
      element.addEventListener('volumechange', onVolumeChange);

      // Подключаем к записи в файл
      if (isRecordingActive && destinationNode) {
        sourceNode.connect(destinationNode);
      }

      element.__audeoBridge = {
        stream,
        sourceNode,
        monitorGain,
        onVolumeChange
      };
      activeMediaElements.add(element);

      // Очистка при смене трека внутри того же плеера
      element.addEventListener('emptied', () => {
        cleanupElementBridge(element);
      }, { once: true });

      return true;
    } catch (err) {
      console.warn('[AudeoRecorder] Не удалось захватить аудиопоток элемента:', err);
      return false;
    }
  }

  function stopRecordingSession() {
    isRecordingActive = false;
    document.removeEventListener('play', onDocumentPlayCapture, true);

    // Отключаем захват от файла записи (destinationNode),
    // но СОХРАНЯЕМ мост monitorGain -> audioContext.destination для уже захваченного видео,
    // чтобы после остановки записи звук на странице НЕ пропадал до перезагрузки F5!
    activeMediaElements.forEach((element) => {
      if (element && element.__audeoBridge && destinationNode) {
        try {
          element.__audeoBridge.sourceNode.disconnect(destinationNode);
        } catch (e) {
          try {
            element.__audeoBridge.sourceNode.disconnect();
            element.__audeoBridge.sourceNode.connect(element.__audeoBridge.monitorGain);
          } catch (err) {}
        }
      }
    });

    destinationNode = null;
    mediaRecorder = null;
  }

  // Перехват новых элементов, начавших воспроизведение во время записи
  function onDocumentPlayCapture(event) {
    if (!isRecordingActive) return;
    const target = event.target;
    if (target && (target.tagName === 'AUDIO' || target.tagName === 'VIDEO')) {
      activeMediaElements.add(target);
      connectMediaElement(target);
    }
  }

  // Прозрачный перехват HTMLMediaElement.prototype.play:
  // В обычном режиме использования (когда запись не идет) НЕ трогает звук и НЕ создает аудиоконтекст!
  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (isRecordingActive) {
      activeMediaElements.add(this);
      connectMediaElement(this);
    }
    return nativePlay.apply(this, args);
  };

  const nativePause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function (...args) {
    return nativePause.apply(this, args);
  };

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

      // Слушаем события запуска новых медиа во время записи
      document.addEventListener('play', onDocumentPlayCapture, true);

      // Если AudioContext был suspended, будим его
      if (audioContext.state === 'suspended') {
        const resumeInteraction = () => {
          if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
          }
        };
        window.addEventListener('click', resumeInteraction, { once: true, capture: true });
        window.addEventListener('keydown', resumeInteraction, { once: true, capture: true });
      }

      // Захватываем все уже играющие или готовые элементы на странице
      const domElements = document.querySelectorAll('audio, video');
      domElements.forEach((el) => {
        if (!el.paused || el.readyState >= 1) {
          connectMediaElement(el);
        }
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
        try {
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
        } catch (err) {
          console.error('[AudeoRecorder] Ошибка сборки записи:', err);
          window.postMessage({
            source: 'AUDEO_HOOK_CORE',
            event: 'RECORDING_COMPLETE',
            buffer: null,
            mimeType: ''
          }, '*');
        } finally {
          recordedChunks = [];
          stopRecordingSession();
        }
      };

      mediaRecorder.start(250);
      window.postMessage({
        source: 'AUDEO_HOOK_CORE',
        event: 'RECORDING_STARTED_ACK',
        startTime: recordingStartTimestamp
      }, '*');

    } else if (command === 'EXECUTE_STOP_RECORDING') {
      if (!isRecordingActive || !mediaRecorder) {
        window.postMessage({
          source: 'AUDEO_HOOK_CORE',
          event: 'RECORDING_COMPLETE',
          buffer: null,
          mimeType: ''
        }, '*');
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