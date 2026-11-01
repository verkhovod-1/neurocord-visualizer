
(() => {
"use strict";

// ==========================================
// NEUROCORD VISUALIZER
// Responsive Audio Visualizer
// ==========================================

const $ = id => document.getElementById(id);

const canvas = $("visual");
const ctx = canvas.getContext("2d", { alpha: false });
const audio = $("audio");

let audioURL = null;
let cover = null;
let coverURL = null;
let coverBgCache = null;

let audioCtx = null;
let analyser = null;
let source = null;
let data = null;
let waveform = null;

let raf = 0;
let style = "spectrum";
let accent = "blue";
let size = "normal";

let exportBusy = false;
let deferredInstall = null;
let showingEnd = false;

const colors = {
  blue: ["#4fa8ff", "#9c62ff"],
  violet: ["#a96bff", "#5a7cff"],
  cyan: ["#5af0ff", "#4f8bff"],
  pink: ["#ff65cb", "#8b68ff"]
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const formats = {
  landscape: {
    w: 1920,
    h: 1080,
    label: "1920 × 1080",
    ratio: "16:9"
  },
  portrait: {
    w: 1080,
    h: 1920,
    label: "1080 × 1920",
    ratio: "9:16"
  },
  square: {
    w: 1080,
    h: 1080,
    label: "1080 × 1080",
    ratio: "1:1"
  }
};

// ==========================================
// HELPERS
// ==========================================

function roundedRect(c, x, y, w, h, r) {
  c.beginPath();

  if (c.roundRect) {
    c.roundRect(x, y, w, h, r);
  } else {
    c.rect(x, y, w, h);
  }
}

function glowText(c, text, x, y, font, color, blur = 18) {
  c.save();

  c.font = font;
  c.textAlign = "center";
  c.textBaseline = "middle";

  c.shadowColor = color;
  c.shadowBlur = blur;

  c.fillStyle = color;
  c.fillText(text, x, y);

  c.restore();
}

function fmt(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function setStatus(text) {
  $("status").textContent = text;
}

function safeTitle() {
  return ($("trackTitle").value.trim() || "NeuroCord")
    .replace(/[\\/:*?"<>|]/g, "-");
}

// ==========================================
// AUDIO ANALYSIS
// ==========================================

function setupAudioGraph() {
  if (audioCtx) return;

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Web Audio API не поддерживается браузером.");
  }

  audioCtx = new AudioContextClass();

  source = audioCtx.createMediaElementSource(audio);

  analyser = audioCtx.createAnalyser();

  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;

  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  data = new Uint8Array(analyser.frequencyBinCount);
  waveform = new Uint8Array(analyser.fftSize);
}

function updateAudioData() {
  if (!analyser) return;

  analyser.getByteFrequencyData(data);
  analyser.getByteTimeDomainData(waveform);
}

// ==========================================
// BACKGROUND
// ==========================================

function drawBackground(c, w, h) {
  if (!cover) {
    const gradient = c.createLinearGradient(0, 0, w, h);

    gradient.addColorStop(0, "#111c3d");
    gradient.addColorStop(0.5, "#211443");
    gradient.addColorStop(1, "#050713");

    c.fillStyle = gradient;
    c.fillRect(0, 0, w, h);

    return;
  }

  if (
    !coverBgCache ||
    coverBgCache.width !== w ||
    coverBgCache.height !== h
  ) {
    const background = document.createElement("canvas");

    background.width = w;
    background.height = h;

    const bgCtx = background.getContext("2d");

    const iw = cover.naturalWidth || cover.width;
    const ih = cover.naturalHeight || cover.height;

    const scale = Math.max(w / iw, h / ih);

    const dw = iw * scale;
    const dh = ih * scale;

    bgCtx.filter = "blur(24px)";

    bgCtx.drawImage(
      cover,
      (w - dw) / 2,
      (h - dh) / 2,
      dw,
      dh
    );

    bgCtx.filter = "none";

    coverBgCache = background;
  }

  c.save();

  c.globalAlpha = 0.55;
  c.drawImage(coverBgCache, 0, 0, w, h);

  c.restore();

  const shade = c.createLinearGradient(0, 0, 0, h);

  shade.addColorStop(0, "#05081755");
  shade.addColorStop(0.55, "#09051d55");
  shade.addColorStop(1, "#03061199");

  c.fillStyle = shade;
  c.fillRect(0, 0, w, h);
}

// ==========================================
// COVER CARD
// ==========================================

function drawCoverCard(c, w, h) {
  if (!cover) return;

  const portrait = h > w * 1.15;
  const square = Math.abs(w - h) < 10;

  let boxSize;

  if (portrait) {
    boxSize = Math.min(w * 0.49, h * 0.27);
  } else if (square) {
    boxSize = Math.min(w * 0.38, h * 0.38);
  } else {
    boxSize = Math.min(w * 0.25, h * 0.34);
  }

  const x = (w - boxSize) / 2;

  const y = h * (
    portrait ? 0.34 :
    square ? 0.34 :
    0.31
  );

  const radius = boxSize * 0.035;

  c.save();

  // Soft outer glow
  c.shadowColor = colors[accent][0];
  c.shadowBlur = boxSize * 0.09;

  c.fillStyle = "#10162b";

  roundedRect(
    c,
    x - 7,
    y - 7,
    boxSize + 14,
    boxSize + 14,
    radius + 7
  );

  c.fill();

  c.shadowBlur = 0;

  // Border
  c.strokeStyle = colors[accent][0];
  c.lineWidth = Math.max(3, boxSize * 0.006);

  roundedRect(
    c,
    x - 4,
    y - 4,
    boxSize + 8,
    boxSize + 8,
    radius + 4
  );

  c.stroke();

  // Cover image
  c.save();

  roundedRect(c, x, y, boxSize, boxSize, radius);
  c.clip();

  const iw = cover.naturalWidth || cover.width;
  const ih = cover.naturalHeight || cover.height;

  const scale = Math.max(boxSize / iw, boxSize / ih);

  const dw = iw * scale;
  const dh = ih * scale;

  c.globalAlpha = 1;

  c.drawImage(
    cover,
    x + (boxSize - dw) / 2,
    y + (boxSize - dh) / 2,
    dw,
    dh
  );

  c.restore();

  c.restore();
}

// ==========================================
// SPECTRUM
// ==========================================

function drawSpectrum(c, w, h, t) {
  const cols = colors[accent] || colors.blue;

  const portrait = h > w * 1.15;
  const square = Math.abs(w - h) < 10;

  const scale =
    size === "large" ? 1.25 :
    size === "subtle" ? 0.65 :
    1;

  const n = 100;

  const gap = w * 0.003;
  const total = w * 0.76;

  const bw = total / n - gap;
  const left = (w - total) / 2;

  const base = h * (
    portrait ? 0.79 :
    square ? 0.82 :
    0.83
  );

  const maxHeight = h * (
    portrait || square ? 0.16 : 0.22
  );

  for (let i = 0; i < n; i++) {
    let value;

    if (data) {
      const index = Math.floor(i / n * data.length);
      value = data[index] / 255;
    } else {
      value =
        0.12 +
        0.12 * Math.abs(Math.sin(i * 0.27 + t * 1.5));
    }

    const envelope = 0.2 +
      0.8 * Math.pow(Math.sin(i / n * Math.PI), 0.5);

    const height = Math.max(
      5,
      (value * 0.9 + 0.025) * maxHeight * envelope * scale
    );

    const gradient = c.createLinearGradient(
      0,
      base - height,
      0,
      base
    );

    gradient.addColorStop(0, cols[1]);
    gradient.addColorStop(1, cols[0]);

    c.shadowColor = cols[0];
    c.shadowBlur = 10;

    c.fillStyle = gradient;

    roundedRect(
      c,
      left + i * (bw + gap),
      base - height,
      bw,
      height,
      Math.max(2, bw * 0.3)
    );

    c.fill();

    c.shadowBlur = 0;
  }
}

// ==========================================
// WAVEFORM
// ==========================================

function drawWave(c, w, h, t) {
  const cols = colors[accent] || colors.blue;

  const portrait = h > w * 1.15;

  const mid = h * (portrait ? 0.78 : 0.76);

  const amp = h * (
    size === "large" ? 0.16 :
    size === "subtle" ? 0.07 :
    0.11
  );

  for (let layer = 0; layer < 3; layer++) {
    c.beginPath();

    for (let x = 0; x <= w; x += 3) {
      let value;

      if (waveform) {
        const index = Math.min(
          waveform.length - 1,
          Math.floor(x / w * waveform.length)
        );

        value = (waveform[index] - 128) / 128;
      } else {
        value =
          Math.sin(x * 0.018 + t * 2) * 0.35 +
          Math.sin(x * 0.047 - t) * 0.2;
      }

      const y =
        mid +
        value * amp * (1 - layer * 0.22) +
        Math.sin(x * 0.006 + t + layer) * amp * 0.15;

      if (x === 0) {
        c.moveTo(x, y);
      } else {
        c.lineTo(x, y);
      }
    }

    c.strokeStyle = cols[layer % 2];
    c.lineWidth = layer === 0 ? 4 : 2;

    c.globalAlpha = 1 - layer * 0.22;

    c.shadowColor = cols[layer % 2];
    c.shadowBlur = 18 - layer * 4;

    c.stroke();

    c.shadowBlur = 0;
  }

  c.globalAlpha = 1;
}

// ==========================================
// NEURAL SPACE
// ==========================================

function drawSpace(c, w, h, t) {
  const cols = colors[accent] || colors.blue;

  const cx = w / 2;

  const portrait = h > w * 1.15;

  const cy = h * (portrait ? 0.72 : 0.68);

  const minDimension = Math.min(w, h);

  for (let i = 0; i < 125; i++) {
    const angle =
      i * 2.399 +
      t * (0.08 + (i % 4) * 0.012);

    const radius =
      (0.05 + (i % 17) / 17 * 0.46) *
      minDimension;

    const pulse =
      1 +
      (
        data
          ? data[(i * 13) % data.length] / 255
          : Math.sin(t + i) * 0.1
      ) * 0.15;

    const x = cx + Math.cos(angle) * radius * pulse;
    const y = cy + Math.sin(angle) * radius * 0.55 * pulse;

    c.fillStyle = cols[i % 2];
    c.globalAlpha = 0.3 + (i % 7) / 10;

    c.beginPath();
    c.arc(x, y, 1 + (i % 3), 0, Math.PI * 2);
    c.fill();

    if (i % 5 === 0) {
      c.strokeStyle = cols[i % 2];
      c.globalAlpha = 0.12;

      c.beginPath();
      c.moveTo(x, y);

      const next = (i + 7) % 125;

      const a2 = next * 2.399 + t * 0.1;

      const r2 =
        (0.05 + (next % 17) / 17 * 0.46) *
        minDimension;

      c.lineTo(
        cx + Math.cos(a2) * r2,
        cy + Math.sin(a2) * r2 * 0.55
      );

      c.stroke();
    }
  }

  c.globalAlpha = 1;
}

// ==========================================
// END CARD
// ==========================================

function drawEndCard(c, w, h, t) {
  const cols = colors[accent] || colors.blue;

  for (let i = 0; i < 70; i++) {
    const x =
      (Math.sin(i * 93.1 + t * 0.13) * 0.5 + 0.5) * w;

    const y =
      (Math.cos(i * 17.7 + t * 0.11) * 0.5 + 0.5) * h;

    c.fillStyle = cols[i % 2] + "99";

    c.beginPath();
    c.arc(x, y, 1 + (i % 3), 0, Math.PI * 2);
    c.fill();
  }

  glowText(
    c,
    "NeuroCord",
    w / 2,
    h * 0.48,
    `800 ${Math.round(w * 0.075)}px system-ui`,
    "#dce8ff",
    38
  );

  glowText(
    c,
    "SOUND MADE VISIBLE",
    w / 2,
    h * 0.57,
    `500 ${Math.round(w * 0.018)}px system-ui`,
    cols[0],
    16
  );
}

// ==========================================
// MAIN DRAW
// ==========================================

function drawFrame(c, w, h, phase = 0, end = false) {
  const t = performance.now() / 1000;

  c.save();

  c.clearRect(0, 0, w, h);

  drawBackground(c, w, h);

  if (end) {
    drawEndCard(c, w, h, t);
    c.restore();
    return;
  }

  // Main title
  const title =
    $("trackTitle").value.trim() || "Название трека";

  const artist =
    $("artist").value.trim() || "NeuroCord";

  const unit = Math.min(w, h);

  const portrait = h > w * 1.15;
  const square = Math.abs(w - h) < 10;

  const titleY = h * (
    portrait ? 0.105 :
    square ? 0.12 :
    0.15
  );

  glowText(
    c,
    title,
    w / 2,
    titleY,
    `700 ${Math.round(unit * 0.052)}px system-ui`,
    "#ffffff",
    14
  );

  glowText(
    c,
    artist,
    w / 2,
    titleY + unit * 0.065,
    `500 ${Math.round(unit * 0.027)}px system-ui`,
    colors[accent][0],
    10
  );

  // Cover
  drawCoverCard(c, w, h);

  // Visualizer
  if (style === "spectrum") {
    drawSpectrum(c, w, h, t);
  } else if (style === "wave") {
    drawWave(c, w, h, t);
  } else {
    drawSpace(c, w, h, t);
  }

  // Logo
  if ($("showLogo").checked) {
    c.save();

    c.textAlign = "right";
    c.textBaseline = "middle";

    c.font = `800 ${Math.round(unit * 0.025)}px system-ui`;

    c.fillStyle = "#d9e4ff";
    c.shadowColor = colors[accent][0];
    c.shadowBlur = 10;

    c.fillText("NeuroCord", w * 0.96, h * 0.94);

    c.restore();
  }

  c.restore();
}

// ==========================================
// RENDER LOOP
// ==========================================

function renderLoop() {
  updateAudioData();

  drawFrame(
    ctx,
    canvas.width,
    canvas.height,
    0,
    showingEnd
  );

  raf = requestAnimationFrame(renderLoop);
}

// ==========================================
// FORMAT
// ==========================================

function setFormat(key) {
  const format = formats[key] || formats.landscape;

  canvas.width = format.w;
  canvas.height = format.h;

  $("stage").style.aspectRatio =
    `${format.w} / ${format.h}`;

  $("stage").dataset.format = key;

  $("exportDimensions").textContent = format.label;
  $("exportRatio").textContent = format.ratio;

  coverBgCache = null;

  drawFrame(
    ctx,
    canvas.width,
    canvas.height,
    0,
    showingEnd
  );
}

$("format").addEventListener("change", e => {
  setFormat(e.target.value);
});

// Initial format
setFormat($("format").value || "landscape");

// ==========================================
// AUDIO EVENTS
// ==========================================

audio.addEventListener("play", async () => {
  try {
    setupAudioGraph();

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
  } catch (error) {
    console.warn("Audio graph:", error);
  }
});

audio.addEventListener("timeupdate", () => {
  $("timeLabel").textContent =
    `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
});

audio.addEventListener("ended", () => {
  setStatus("ТРЕК ЗАВЕРШЁН");
});

// ==========================================
// AUDIO FILE
// ==========================================

$("audioFile").addEventListener("change", e => {
  const file = e.target.files[0];

  if (!file) return;

  if (audioURL) {
    URL.revokeObjectURL(audioURL);
  }

  audioURL = URL.createObjectURL(file);

  audio.src = audioURL;

  $("stageHint").hidden = true;

  setStatus("АУДИО ЗАГРУЖЕНО");

  audio.load();
});

// ==========================================
// COVER FILE
// ==========================================

$("coverFile").addEventListener("change", e => {
  const file = e.target.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Выбери изображение JPG или PNG.");
    return;
  }

  if (coverURL) {
    URL.revokeObjectURL(coverURL);
  }

  coverURL = URL.createObjectURL(file);

  const image = new Image();

  image.onload = () => {
    cover = image;
    coverBgCache = null;

    $("stageHint").hidden = true;

    setStatus("ОБЛОЖКА ЗАГРУЖЕНА");

    drawFrame(ctx, canvas.width, canvas.height);
  };

  image.onerror = () => {
    alert("Не удалось загрузить обложку.");
  };

  image.src = coverURL;
});

// ==========================================
// VISUAL STYLES
// ==========================================

document.querySelectorAll(".style").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".style").forEach(item => {
      item.classList.remove("active");
    });

    button.classList.add("active");

    style = button.dataset.style;

    drawFrame(ctx, canvas.width, canvas.height);
  });
});

// ==========================================
// SETTINGS
// ==========================================

$("accent").addEventListener("change", e => {
  accent = e.target.value;
  drawFrame(ctx, canvas.width, canvas.height);
});

$("visualSize").addEventListener("change", e => {
  size = e.target.value;
  drawFrame(ctx, canvas.width, canvas.height);
});

$("trackTitle").addEventListener("input", () => {
  drawFrame(ctx, canvas.width, canvas.height);
});

$("artist").addEventListener("input", () => {
  drawFrame(ctx, canvas.width, canvas.height);
});

$("showLogo").addEventListener("change", () => {
  drawFrame(ctx, canvas.width, canvas.height);
});

// ==========================================
// EXPORT HELPERS
// ==========================================

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function bestMime() {
  if (!window.MediaRecorder) return "";

  const types = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];

  return types.find(type =>
    MediaRecorder.isTypeSupported(type)
  ) || "";
}

function blobToUrl(blob) {
  return URL.createObjectURL(blob);
}

function showDownload(blob, name, mime) {
  const link = $("downloadLink");

  if (link.dataset.url) {
    URL.revokeObjectURL(link.dataset.url);
  }

  const url = blobToUrl(blob);

  link.dataset.url = url;
  link.href = url;
  link.download = name;

  link.textContent =
    `⬇ Скачать видео (${(blob.size / 1024 / 1024).toFixed(1)} МБ)`;

  link.hidden = false;
}

// ==========================================
// VIDEO EXPORT
// ==========================================

$("exportBtn").addEventListener("click", async () => {
  if (exportBusy) return;

  if (!audio.src) {
    alert("Сначала загрузи аудиофайл.");
    return;
  }

  if (!window.MediaRecorder || !canvas.captureStream) {
    alert(
      "Этот браузер не поддерживает запись видео. " +
      "Попробуй Chrome на Android или актуальный Chrome/Edge."
    );
    return;
  }

  if (audio.readyState < 2) {
    alert("Подожди, пока аудиофайл загрузится.");
    return;
  }

  exportBusy = true;

  const exportButton = $("exportBtn");

  exportButton.disabled = true;

  $("downloadLink").hidden = true;
  $("mp4Btn").hidden = true;

  $("progressBox").hidden = false;
  $("progressBar").style.width = "0%";

  let stream = null;
  let recorder = null;
  let chunks = [];
  let audioStream = null;
  let dest = null;

  try {
    setupAudioGraph();

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    audio.pause();

    audio.currentTime = 0;

    await wait(150);

    // Canvas video
    const canvasStream = canvas.captureStream(30);

    // Audio recording destination
    dest = audioCtx.createMediaStreamDestination();

    source.connect(dest);

    audioStream = dest.stream;

    stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks()
    ]);

    const mime = bestMime();

    if (!mime) {
      throw new Error(
        "В браузере нет доступного формата записи видео."
      );
    }

    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 8000000,
      audioBitsPerSecond: 192000
    });

    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    const recordingFinished = new Promise((resolve, reject) => {
      recorder.onstop = resolve;

      recorder.onerror = event => {
        reject(
          event.error || new Error("Ошибка записи видео.")
        );
      };
    });

    recorder.start(1000);

    setStatus("ЗАПИСЬ ВИДЕО");

    await audio.play();

    const duration = audio.duration;

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(
        "Не удалось определить длительность аудио."
      );
    }

    while (
      audio.currentTime < duration &&
      !audio.ended
    ) {
      const progress = clamp(
        audio.currentTime / duration * 100,
        0,
        100
      );

      $("progressBar").style.width =
        progress + "%";

      $("progressText").textContent =
        `Запись: ${Math.floor(progress)}% · ` +
        `${fmt(audio.currentTime)} / ${fmt(duration)}`;

      await wait(250);
    }

    audio.pause();

    // Final card
    if ($("endCard").checked) {
      showingEnd = true;

      const start = performance.now();

      while (performance.now() - start < 5000) {
        $("progressText").textContent =
          "Записываем финальную заставку…";

        await wait(33);
      }

      showingEnd = false;
    }

    recorder.stop();

    await recordingFinished;

    const type = mime.split(";")[0];

    const blob = new Blob(chunks, {
      type
    });

    if (!blob.size) {
      throw new Error("Получен пустой видеофайл.");
    }

    const isMp4 = type === "video/mp4";

    const extension = isMp4 ? "mp4" : "webm";

    showDownload(
      blob,
      `${safeTitle()}-NeuroCord.${extension}`,
      type
    );

    $("progressBar").style.width = "100%";

    $("progressText").textContent = isMp4
      ? "Готово: MP4 создан."
      : "Готово: создан WebM. Для MP4 используй конвертацию ниже.";

    if (!isMp4) {
      $("mp4Btn").hidden = false;
    }

    setStatus("ГОТОВО");

  } catch (error) {
    console.error("Export error:", error);

    showingEnd = false;

    alert(
      "Не удалось экспортировать видео: " +
      (error.message || error)
    );

    setStatus("ОШИБКА");

  } finally {
    showingEnd = false;

    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (error) {
        console.warn(error);
      }
    }

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
    }

    if (dest) {
      try {
        source.disconnect(dest);
      } catch (error) {
        // Connection may already be closed.
      }
    }

    audio.pause();

    exportBusy = false;
    exportButton.disabled = false;

    drawFrame(ctx, canvas.width, canvas.height);
  }
});

// ==========================================
// WEBM TO MP4
// ==========================================

$("mp4Btn").addEventListener("click", async () => {
  const link = $("downloadLink");

  if (!link.dataset.url) {
    alert("Сначала создай видео.");
    return;
  }

  const button = $("mp4Btn");
  const oldText = button.textContent;

  button.disabled = true;
  button.textContent = "Загружаем конвертер…";

  $("progressBox").hidden = false;

  $("progressText").textContent =
    "Загрузка FFmpeg.wasm — может потребоваться время и память.";

  let ffmpeg = null;

  try {
    const { FFmpeg } = await import(
      "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js"
    );

    const { toBlobURL } = await import(
      "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js"
    );

    ffmpeg = new FFmpeg();

    ffmpeg.on("progress", ({ progress }) => {
      const percent = Math.round(progress * 100);

      $("progressBar").style.width =
        percent + "%";

      $("progressText").textContent =
        `Конвертация в MP4: ${percent}%`;
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
        "text/javascript"
      ),

      wasmURL: await toBlobURL(
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm",
        "application/wasm"
      )
    });

    const sourceBlob = await (
      await fetch(link.dataset.url)
    ).blob();

    const inputName = sourceBlob.type.includes("mp4")
      ? "input.mp4"
      : "input.webm";

    await ffmpeg.writeFile(
      inputName,
      new Uint8Array(
        await sourceBlob.arrayBuffer()
      )
    );

    await ffmpeg.exec([
      "-i", inputName,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "output.mp4"
    ]);

    const output = await ffmpeg.readFile("output.mp4");

    const blob = new Blob(
      [output.buffer],
      { type: "video/mp4" }
    );

    showDownload(
      blob,
      `${safeTitle()}-NeuroCord.mp4`,
      "video/mp4"
    );

    $("progressBar").style.width = "100%";

    $("progressText").textContent =
      "Готово: MP4 создан.";

    setStatus("MP4 ГОТОВ");

  } catch (error) {
    console.error("FFmpeg error:", error);

    alert(
      "Конвертация не удалась. " +
      "На телефоне может не хватить памяти или CDN недоступен. " +
      "WebM-файл всё ещё можно скачать."
    );

    $("progressText").textContent =
      "Конвертация не удалась; WebM доступен для скачивания.";

  } finally {
    if (ffmpeg) {
      try {
        await ffmpeg.terminate();
      } catch (error) {
        console.warn(error);
      }
    }

    button.disabled = false;
    button.textContent = oldText;
  }
});

// ==========================================
// PWA INSTALL
// ==========================================

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();

  deferredInstall = event;

  $("installBtn").hidden = false;
});

$("installBtn").addEventListener("click", async () => {
  if (!deferredInstall) {
    alert(
      "Открой меню Chrome (⋮) и выбери " +
      "«Установить приложение» или «Добавить на главный экран»."
    );

    return;
  }

  deferredInstall.prompt();

  await deferredInstall.userChoice;

  deferredInstall = null;

  $("installBtn").hidden = true;
});

// ==========================================
// SERVICE WORKER
// ==========================================

if (
  "serviceWorker" in navigator &&
  location.protocol.startsWith("http")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch(console.warn);
  });
}

// ==========================================
// START
// ==========================================

cancelAnimationFrame(raf);
renderLoop();

})();
