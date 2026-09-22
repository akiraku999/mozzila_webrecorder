(function () {
  'use strict';

  const recordingScreen = document.getElementById('recordingScreen');
  const editingScreen = document.getElementById('editingScreen');
  const masterButtonWrapper = document.getElementById('masterButtonWrapper');
  const masterRecordTrigger = document.getElementById('masterRecordTrigger');
  const statusInstruction = document.getElementById('statusInstruction');
  const activeTimerView = document.getElementById('activeTimerView');

  const playbackAudio = document.getElementById('playbackAudio');
  const startCutSlider = document.getElementById('startCutSlider');
  const endCutSlider = document.getElementById('endCutSlider');
  const startCutDisplay = document.getElementById('startCutDisplay');
  const endCutDisplay = document.getElementById('endCutDisplay');
  const downloadMp3Trigger = document.getElementById('downloadMp3Trigger');
  const resetSessionTrigger = document.getElementById('resetSessionTrigger');
  const conversionStatus = document.getElementById('conversionStatus');

  let currentRecordingStatus = false;
  let timerIntervalIdentifier = null;
  let targetTabIdentifier = null;
  let audioContextInstance = null;
  let cachedAudioBuffer = null;

  function renderStandardTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function renderHighPrecisionTime(secondsValue) {
    const minutes = Math.floor(secondsValue / 60);
    const seconds = Math.floor(secondsValue % 60);
    const fraction = Math.floor((secondsValue % 1) * 100);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
  }

  function activateTimer(initialElapsedSeconds = 0) {
    let elapsed = initialElapsedSeconds;
    activeTimerView.textContent = renderStandardTime(elapsed);
    activeTimerView.classList.remove('is-hidden');

    clearInterval(timerIntervalIdentifier);
    timerIntervalIdentifier = setInterval(() => {
      elapsed++;
      activeTimerView.textContent = renderStandardTime(elapsed);
    }, 1000);
  }

  function deactivateTimer() {
    if (timerIntervalIdentifier) {
      clearInterval(timerIntervalIdentifier);
      timerIntervalIdentifier = null;
    }
  }

  async function resolveActiveTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs.length > 0 ? tabs[0] : null;
  }

  async function synchronizeRecordingState() {
    const activeTab = await resolveActiveTab();
    if (!activeTab) {
      statusInstruction.textContent = 'Ошибка: Активная вкладка не определена';
      return;
    }
    targetTabIdentifier = activeTab.id;

    try {
      const response = await browser.tabs.sendMessage(targetTabIdentifier, {
        action: 'POPUP_QUERY_STATE'
      });
      if (response && response.isRecording) {
        const elapsed = Math.floor((Date.now() - response.startTime) / 1000);
        updateInterfaceToRecording(true, elapsed);
      }
    } catch (e) {
      // Исполняемый контекст страницы еще не инициализирован
    }
  }

  function updateInterfaceToRecording(isRecording, elapsedSeconds = 0) {
    currentRecordingStatus = isRecording;
    if (isRecording) {
      masterButtonWrapper.classList.add('recording');
      statusInstruction.textContent = 'Идет запись звука вкладки... Нажмите для завершения';
      activateTimer(elapsedSeconds);
    } else {
      masterButtonWrapper.classList.remove('recording');
      statusInstruction.textContent = 'Нажмите, чтобы начать запись звука вкладки';
      activeTimerView.classList.add('is-hidden');
      deactivateTimer();
    }
  }

  masterRecordTrigger.addEventListener('click', async () => {
    if (!targetTabIdentifier) {
      return;
    }

    if (!currentRecordingStatus) {
      try {
        await browser.tabs.sendMessage(targetTabIdentifier, {
          action: 'POPUP_START_RECORD'
        });
        updateInterfaceToRecording(true, 0);
      } catch (err) {
        statusInstruction.textContent = 'Обновите страницу для активации захвата';
      }
    } else {
      statusInstruction.textContent = 'Остановка и извлечение аудиопотока...';
      try {
        const result = await browser.tabs.sendMessage(targetTabIdentifier, {
          action: 'POPUP_STOP_RECORD'
        });
        updateInterfaceToRecording(false);

        if (result && result.audioBuffer) {
          await processRawBufferPayload(result.audioBuffer);
        } else {
          statusInstruction.textContent = 'Захваченный поток не содержит аудиоданных';
        }
      } catch (err) {
        updateInterfaceToRecording(false);
        statusInstruction.textContent = 'Ошибка передачи данных';
      }
    }
  });

  async function processRawBufferPayload(arrayBuffer) {
    if (!audioContextInstance || audioContextInstance.state === 'closed') {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      audioContextInstance = new AudioCtxClass();
    }

    try {
      cachedAudioBuffer = await audioContextInstance.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.error('[AudeoRecorder] Ошибка декодирования буфера:', err);
      statusInstruction.textContent = 'Ошибка декодирования аудиоданных';
      return;
    }

    if (!cachedAudioBuffer || cachedAudioBuffer.duration <= 0) {
      statusInstruction.textContent = 'Захваченный аудиопоток пуст';
      return;
    }

    const fullDuration = cachedAudioBuffer.duration;
    startCutSlider.min = '0';
    startCutSlider.max = fullDuration.toString();
    startCutSlider.value = '0';

    endCutSlider.min = '0';
    endCutSlider.max = fullDuration.toString();
    endCutSlider.value = fullDuration.toString();

    startCutDisplay.textContent = renderHighPrecisionTime(0);
    endCutDisplay.textContent = renderHighPrecisionTime(fullDuration);

    const temporaryWav = convertAudioBufferToWav(cachedAudioBuffer);
    const audioObjectUrl = URL.createObjectURL(temporaryWav);
    playbackAudio.src = audioObjectUrl;

    recordingScreen.classList.add('is-hidden');
    editingScreen.classList.remove('is-hidden');
  }

  startCutSlider.addEventListener('input', () => {
    let startVal = parseFloat(startCutSlider.value);
    let endVal = parseFloat(endCutSlider.value);

    if (startVal >= endVal) {
      startVal = Math.max(0, endVal - 0.05);
      startCutSlider.value = startVal.toString();
    }

    startCutDisplay.textContent = renderHighPrecisionTime(startVal);
    playbackAudio.currentTime = startVal;
  });

  endCutSlider.addEventListener('input', () => {
    let startVal = parseFloat(startCutSlider.value);
    let endVal = parseFloat(endCutSlider.value);

    if (endVal <= startVal) {
      endVal = Math.min(parseFloat(endCutSlider.max), startVal + 0.05);
      endCutSlider.value = endVal.toString();
    }

    endCutDisplay.textContent = renderHighPrecisionTime(endVal);
    playbackAudio.currentTime = endVal;
  });

  playbackAudio.addEventListener('timeupdate', () => {
    const endBoundary = parseFloat(endCutSlider.value);
    if (playbackAudio.currentTime >= endBoundary) {
      playbackAudio.pause();
      playbackAudio.currentTime = parseFloat(startCutSlider.value);
    }
  });

  playbackAudio.addEventListener('play', () => {
    const startBoundary = parseFloat(startCutSlider.value);
    const endBoundary = parseFloat(endCutSlider.value);
    if (playbackAudio.currentTime < startBoundary || playbackAudio.currentTime >= endBoundary) {
      playbackAudio.currentTime = startBoundary;
    }
  });

  resetSessionTrigger.addEventListener('click', () => {
    cachedAudioBuffer = null;
    playbackAudio.pause();
    playbackAudio.removeAttribute('src');
    editingScreen.classList.add('is-hidden');
    recordingScreen.classList.remove('is-hidden');
    updateInterfaceToRecording(false);
  });

  downloadMp3Trigger.addEventListener('click', () => {
    if (!cachedAudioBuffer) {
      return;
    }

    const startTimeSec = parseFloat(startCutSlider.value);
    const endTimeSec = parseFloat(endCutSlider.value);

    if (endTimeSec <= startTimeSec) {
      return;
    }

    downloadMp3Trigger.disabled = true;
    conversionStatus.classList.remove('is-hidden');

    setTimeout(() => {
      try {
        const mp3Blob = renderMp3StereoStream(cachedAudioBuffer, startTimeSec, endTimeSec);

        const timestamp = new Date();
        const formatDigits = (val) => String(val).padStart(2, '0');
        const formattedFileName = `record-${timestamp.getFullYear()}-${formatDigits(timestamp.getMonth() + 1)}-${formatDigits(timestamp.getDate())}-${formatDigits(timestamp.getHours())}-${formatDigits(timestamp.getMinutes())}.mp3`;

        const fileDownloadUrl = URL.createObjectURL(mp3Blob);

        // Используем прямое скачивание через виртуальный тег <a> вместо browser.downloads API
        const downloadAnchor = document.createElement('a');
        downloadAnchor.style.display = 'none';
        downloadAnchor.href = fileDownloadUrl;
        downloadAnchor.download = formattedFileName;
        document.body.appendChild(downloadAnchor);

        downloadAnchor.click();
        downloadAnchor.remove();

        // Даем браузеру время завершить передачу потока перед очисткой ссылки
        setTimeout(() => {
          URL.revokeObjectURL(fileDownloadUrl);
        }, 60000);
      } catch (err) {
        console.error('[AudeoRecorder] Ошибка кодирования MP3:', err);
      } finally {
        downloadMp3Trigger.disabled = false;
        conversionStatus.classList.add('is-hidden');
      }
    }, 40);
  });

  function convertFloatToSigned16Bit(floatArray) {
    const count = floatArray.length;
    const outputInt16 = new Int16Array(count);
    for (let i = 0; i < count; i++) {
      const sample = Math.max(-1, Math.min(1, floatArray[i]));
      outputInt16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    return outputInt16;
  }

  function renderMp3StereoStream(sourceAudioBuffer, startSec, endSec) {
    const samplingRate = sourceAudioBuffer.sampleRate;
    const totalChannels = 2;
    const targetBitrateKbps = 320;

    const startOffsetSample = Math.floor(startSec * samplingRate);
    const endOffsetSample = Math.floor(endSec * samplingRate);
    const totalFrameSamples = endOffsetSample - startOffsetSample;

    const leftChannelSegment = sourceAudioBuffer.getChannelData(0).subarray(startOffsetSample, endOffsetSample);
    let rightChannelSegment;

    if (sourceAudioBuffer.numberOfChannels > 1) {
      rightChannelSegment = sourceAudioBuffer.getChannelData(1).subarray(startOffsetSample, endOffsetSample);
    } else {
      rightChannelSegment = leftChannelSegment;
    }

    const leftChannelPcm16 = convertFloatToSigned16Bit(leftChannelSegment);
    const rightChannelPcm16 = convertFloatToSigned16Bit(rightChannelSegment);

    const encoder = new lamejs.Mp3Encoder(totalChannels, samplingRate, targetBitrateKbps);
    const encodedDataChunks = [];
    const blockSize = 1152;

    for (let i = 0; i < totalFrameSamples; i += blockSize) {
      const leftChunk = leftChannelPcm16.subarray(i, i + blockSize);
      const rightChunk = rightChannelPcm16.subarray(i, i + blockSize);

      const mp3Buffer = encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3Buffer.length > 0) {
        encodedDataChunks.push(new Int8Array(mp3Buffer));
      }
    }

    const trailingFlush = encoder.flush();
    if (trailingFlush.length > 0) {
      encodedDataChunks.push(new Int8Array(trailingFlush));
    }

    // MIME-тип изменен на корректный audio/mpeg
    return new Blob(encodedDataChunks, { type: 'audio/mpeg' });
  }

  function convertAudioBufferToWav(buffer) {
    const channelCount = buffer.numberOfChannels;
    const byteLength = buffer.length * channelCount * 2 + 44;
    const rawBuffer = new ArrayBuffer(byteLength);
    const dataView = new DataView(rawBuffer);
    let writeCursor = 0;

    function appendString(text) {
      for (let i = 0; i < text.length; i++) {
        dataView.setUint8(writeCursor++, text.charCodeAt(i));
      }
    }

    function appendUint16(val) {
      dataView.setUint16(writeCursor, val, true);
      writeCursor += 2;
    }

    function appendUint32(val) {
      dataView.setUint32(writeCursor, val, true);
      writeCursor += 4;
    }

    appendString('RIFF');
    appendUint32(byteLength - 8);
    appendString('WAVE');

    appendString('fmt ');
    appendUint32(16);
    appendUint16(1);
    appendUint16(channelCount);
    appendUint32(buffer.sampleRate);
    appendUint32(buffer.sampleRate * 2 * channelCount);
    appendUint16(channelCount * 2);
    appendUint16(16);

    appendString('data');
    appendUint32(byteLength - writeCursor - 4);

    const channelDataArrays = [];
    for (let i = 0; i < channelCount; i++) {
      channelDataArrays.push(buffer.getChannelData(i));
    }

    for (let s = 0; s < buffer.length; s++) {
      for (let c = 0; c < channelCount; c++) {
        let sample = Math.max(-1, Math.min(1, channelDataArrays[c][s]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        dataView.setInt16(writeCursor, sample, true);
        writeCursor += 2;
      }
    }

    return new Blob([rawBuffer], { type: 'audio/wav' });
  }

  synchronizeRecordingState();
})();