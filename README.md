# 🎙️ Mozilla WebRecorder (Tab Audio to MP3)

A lightweight **Mozilla Firefox (Manifest V3)** extension designed to capture clean audio streams directly from any browser tab, trim the recording inside a minimal popup interface, and export it as an **MP3 (320 kbps)** file completely client-side.

[![Install from Firefox Add-ons](https://img.shields.io/badge/Firefox_Add--ons-Install_Extension-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/allrecorder-by-akiraku/)/)
[![Donate via DonationAlerts](https://img.shields.io/badge/Support-DonationAlerts-f1a80a?style=for-the-badge&logo=kofi&logoColor=white)](https://www.donationalerts.com/r/akiraku))

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Firefox](https://img.shields.io/badge/Firefox-MV3-orange.svg)
![Audio](https://img.shields.io/badge/Output-MP3%20320kbps-green.svg)

---

## English

> 📦 **Official Extension Page:** [Get Mozilla WebRecorder on Firefox Add-ons](https://addons.mozilla.org/firefox/addon/mozzila-webrecorder/)

### ✨ Features

* **Universal Tab Audio Capture:** Captures live audio streams across YouTube, Yandex Music, SoundCloud, web radios, and dynamic JavaScript `new Audio()` instances.
* **Isolated Audio Path:** Zero echo or double playback in headphones during recording.
* **Built-in Trimming:** Dual-range sliders with live audio preview to set start and end points before saving.
* **Pure Client-Side Encoding:** Converts raw audio samples directly to MP3 at 320 kbps using the bundled `lamejs` engine. No external servers or API calls.
* **Clean UI:** Responsive popup design with record/stop state animations and a recording timer.

### 📁 Project Structure

```text
mozzila_webrecorder/
├── manifest.json       # Manifest V3 extension configuration
├── hook.js             # Page-level media capture hook
├── content.js          # Tab audio stream interception & recording
├── popup.html          # Popup interface layout and styling
├── popup.js            # Recorder logic, trimming controls, MP3 encoder
├── lame.min.js         # Bundled LAME MP3 encoder library
└── README.md
```

### 🚀 Manual Installation (Developer Mode)

If you are developing or building from source:

1. Clone the repository:
   ```bash
   git clone [https://github.com/akiraku999/mozzila_webrecorder.git](https://github.com/akiraku999/mozzila_webrecorder.git)
   cd mozzila_webrecorder
   ```
2. Open Firefox and navigate to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Click **"Load Temporary Add-on..."**.
4. Select the `manifest.json` file from the project folder.

### 🎧 How to Use

1. Navigate to any tab playing audio (refresh the tab with `F5` if it was already open before loading the extension).
2. Click the extension icon in the Firefox toolbar.
3. Click the center circular button to start recording (the button pulses red and a timer starts).
4. Click the button again to finish recording.
5. Use the **Start** and **End** sliders to trim the recorded sample.
6. Click **"Download MP3 (320 kbps)"** to save the file to your computer.

### 🛠️ Tech Stack

* **WebExtensions API** (Manifest V3)
* **Web Audio API** (`AudioContext`, `AudioBuffer`, `ScriptProcessorNode`)
* **LAMEjs** (Embedded JavaScript MP3 encoder)

### ☕ Support the Project

If you find this project useful, you can support further development:

* **DonationAlerts:** [donationalerts.com/r/akiraku999](https://www.donationalerts.com/r/akiraku999)

---
---

## Русский

> 📦 **Официальная страница расширения:** [Установить из Firefox Add-ons](https://addons.mozilla.org/firefox/addon/mozzila-webrecorder/)

Минималистичное расширение для **Mozilla Firefox (Manifest V3)**, позволяющее записывать чистый аудиопоток с любой открытой вкладки браузера, обрезать полученный трек во встроенном редакторе и сохранять его на компьютер в формате **MP3 (320 kbps)** без отправки данных на сторонние серверы.

### ✨ Возможности

* **Универсальный захват звука:** Перехватывает аудио с YouTube, Яндекс Музыки, SoundCloud, онлайн-радио и любых динамических инстансов `new Audio()` в коде сайтов.
* **Изолированный звук:** Никакого эха и дублирования дорожки в наушниках во время записи.
* **Встроенный редактор:** Интерактивные ползунки начала и конца отрезка с предпрослушиванием прямо в окне расширения.
* **Локальная конвертация в MP3:** Кодирование выполняется прямо в браузере с помощью встроенной библиотеки `lamejs` в максимальном качестве (320 kbps).
* **Минималистичный UI:** Удобное всплывающее окно в стиле audeo.ai с таймером и плавной анимацией статуса записи.

### 📁 Структура проекта

```text
mozzila_webrecorder/
├── manifest.json       # Конфигурация Manifest V3
├── hook.js             # Инъекция и перехват медиа-элементов страницы
├── content.js          # Захват аудиопотока вкладки и запись
├── popup.html          # Разметка и оформление окна расширения
├── popup.js            # Логика таймера, обрезки и кодирования в MP3
├── lame.min.js         # Встроенная библиотека MP3-энкодера LAME
└── README.md
```

### 🚀 Ручная установка (для разработчиков)

Если запускаешь проект напрямую из исходников:

1. Склонируйте репозиторий:
   ```bash
   git clone [https://github.com/akiraku999/mozzila_webrecorder.git](https://github.com/akiraku999/mozzila_webrecorder.git)
   cd mozzila_webrecorder
   ```
2. Откройте в браузере адресную строку и перейдите в:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Нажмите кнопку **«Загрузить временное дополнение...»** (Load Temporary Add-on).
4. Выберите файл `manifest.json` в корневой папке проекта.

### 🎧 Инструкция по использованию

1. Откройте страницу со звуком (если вкладка была открыта до установки дополнения — обновите её клавишей `F5`).
2. Нажмите на значок расширения в панели инструментов Firefox.
3. Нажмите на центральный круг — начнется запись, запустится таймер, а кнопка станет красной.
4. Нажмите кнопку повторно для остановки записи — откроется экран редактирования.
5. Выставьте границы нужного отрезка с помощью ползунков старта и конца.
6. Нажмите **«Скачать в MP3 (320 kbps)»** — итоговый трек сохранится в стандартную папку загрузок.

### 🛠️ Стек технологий

* **WebExtensions API** (Manifest V3)
* **Web Audio API** (`AudioContext`, `AudioBuffer`, `ScriptProcessorNode`)
* **LAMEjs** (клиентский JavaScript MP3-энкодер)

### ☕ Поддержать автора

Если плагин оказался полезным, можно закинуть на чай или поддержать развитие проекта:

* **DonationAlerts:** [donationalerts.com/r/akiraku999](https://www.donationalerts.com/r/akiraku999)

---

## 📄 License / Лицензия

Distributed under the [MIT License](LICENSE).
