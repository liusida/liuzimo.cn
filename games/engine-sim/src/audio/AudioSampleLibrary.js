const DEFAULT_SECONDS = 2.0;

function createNoiseBuffer(audioContext, seconds, toneHz = 200) {
  const frameCount = Math.floor(audioContext.sampleRate * seconds);
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i += 1) {
    const t = i / audioContext.sampleRate;
    const saw = 2 * ((t * toneHz) % 1) - 1;
    const noise = (Math.random() * 2 - 1) * 0.25;
    channel[i] = saw * 0.45 + noise * 0.35;
  }
  return buffer;
}

function createSineTextureBuffer(audioContext, seconds, baseHz, harmonics) {
  const frameCount = Math.floor(audioContext.sampleRate * seconds);
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i += 1) {
    const t = i / audioContext.sampleRate;
    let sample = 0;
    for (const [multiplier, gain] of harmonics) {
      sample += Math.sin(2 * Math.PI * baseHz * multiplier * t) * gain;
    }
    channel[i] = sample;
  }
  return buffer;
}

export class AudioSampleLibrary {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.cache = new Map();
  }

  async getLoopBuffer(reference, fallbackDescriptor) {
    if (reference) {
      const fromFile = await this.loadClip(reference);
      if (fromFile) {
        return fromFile;
      }
    }
    return this.createFallbackLoop(fallbackDescriptor);
  }

  async getEventBuffer(reference, fallbackDescriptor) {
    if (reference) {
      const fromFile = await this.loadClip(reference);
      if (fromFile) {
        return fromFile;
      }
    }
    return this.createFallbackEvent(fallbackDescriptor);
  }

  async loadClip(path) {
    if (!path) {
      return null;
    }
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }

    try {
      const response = await fetch(path);
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.cache.set(path, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    }
  }

  createFallbackLoop({ layerName, bandName, recordedRPM, variant = "base" }) {
    const toneByLayer = {
      exhaust: 90,
      intake: 170,
      mechanical: 250,
    };
    const baseHz = (recordedRPM / 60) * 2;
    const layerTone = toneByLayer[layerName] ?? 120;

    if (layerName === "mechanical") {
      const hz = baseHz * 1.5 + layerTone * 0.35;
      return createNoiseBuffer(this.audioContext, DEFAULT_SECONDS, hz);
    }

    const harmonics =
      variant === "coast"
        ? [
            [1, 0.34],
            [2, 0.22],
            [3, 0.1],
          ]
        : [
            [1, 0.52],
            [2, 0.34],
            [3, 0.21],
            [4, 0.09],
          ];
    const seedHz = baseHz + layerTone * 0.25 + (bandName === "idle" ? 3 : 0);
    return createSineTextureBuffer(this.audioContext, DEFAULT_SECONDS, seedHz, harmonics);
  }

  createFallbackEvent({ type }) {
    const eventSecondsByType = {
      engineStart: 0.7,
      engineStop: 0.5,
      shiftThunk: 0.22,
      limiterStutter: 0.07,
      throttleBlip: 0.11,
      backfire: 0.12,
    };
    const seconds = eventSecondsByType[type] ?? 0.2;
    const frameCount = Math.floor(this.audioContext.sampleRate * seconds);
    const buffer = this.audioContext.createBuffer(1, frameCount, this.audioContext.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i += 1) {
      const t = i / this.audioContext.sampleRate;
      const envelope = Math.exp(-8 * t);
      const rand = (Math.random() * 2 - 1) * 0.7;
      const tone =
        type === "shiftThunk"
          ? Math.sin(2 * Math.PI * 110 * t) * 0.5
          : type === "throttleBlip"
            ? Math.sin(2 * Math.PI * 260 * t) * 0.42
          : Math.sin(2 * Math.PI * 220 * t) * 0.3;
      channel[i] = (rand + tone) * envelope;
    }
    return buffer;
  }
}
