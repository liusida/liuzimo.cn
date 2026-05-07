import { clamp, lerp } from "../core/smoothing.js";

function findNearestBands(bands, rpm) {
  if (bands.length === 1) {
    return { lowIndex: 0, highIndex: 0, blend: 0 };
  }

  if (rpm <= bands[0].recordedRPM) {
    return { lowIndex: 0, highIndex: 1, blend: 0 };
  }

  for (let i = 0; i < bands.length - 1; i += 1) {
    const a = bands[i];
    const b = bands[i + 1];
    if (rpm >= a.recordedRPM && rpm <= b.recordedRPM) {
      const blend = clamp((rpm - a.recordedRPM) / (b.recordedRPM - a.recordedRPM), 0, 1);
      return { lowIndex: i, highIndex: i + 1, blend };
    }
  }

  const last = bands.length - 1;
  return { lowIndex: last - 1, highIndex: last, blend: 1 };
}

export class EngineLayerMixer {
  constructor(audioContext, sampleLibrary, layerConfig, outputNode) {
    this.audioContext = audioContext;
    this.sampleLibrary = sampleLibrary;
    this.layerConfig = layerConfig;
    this.outputNode = outputNode;
    this.players = [];
    this.layerGain = audioContext.createGain();
    this.brightnessFilter = audioContext.createBiquadFilter();
    this.brightnessFilter.type = "highshelf";
    this.brightnessFilter.frequency.value = 2200;

    this.layerGain.connect(this.brightnessFilter);
    this.brightnessFilter.connect(this.outputNode);

    this.runtime = {
      selectedBands: ["", ""],
      weights: [0, 0],
      pitch: [1, 1],
      gain: 0,
      brightnessDb: 0,
      pulseDepth: 0,
      pulseRateHz: 0,
    };
  }

  async initialize() {
    const bands = [...this.layerConfig.bands].sort((a, b) => a.recordedRPM - b.recordedRPM);
    this.layerConfig.bands = bands;

    for (const band of bands) {
      const player = await this.createBandPlayer(band);
      this.players.push(player);
    }
  }

  async createBandPlayer(band) {
    const baseRef = band.clip ?? band.powerClip ?? band.coastClip ?? null;
    const powerRef = band.powerClip ?? baseRef;
    const coastRef = band.coastClip ?? baseRef;

    const [powerBuffer, coastBuffer] = await Promise.all([
      this.sampleLibrary.getLoopBuffer(powerRef, {
        layerName: this.layerConfig.name,
        bandName: band.name,
        recordedRPM: band.recordedRPM,
        variant: "power",
      }),
      this.sampleLibrary.getLoopBuffer(coastRef, {
        layerName: this.layerConfig.name,
        bandName: band.name,
        recordedRPM: band.recordedRPM,
        variant: "coast",
      }),
    ]);

    const powerSource = this.audioContext.createBufferSource();
    powerSource.buffer = powerBuffer;
    powerSource.loop = true;

    const coastSource = this.audioContext.createBufferSource();
    coastSource.buffer = coastBuffer;
    coastSource.loop = true;

    const powerGain = this.audioContext.createGain();
    const coastGain = this.audioContext.createGain();
    const bandGain = this.audioContext.createGain();

    powerGain.gain.value = 0;
    coastGain.gain.value = 0;
    bandGain.gain.value = 0;

    powerSource.connect(powerGain);
    coastSource.connect(coastGain);
    powerGain.connect(bandGain);
    coastGain.connect(bandGain);
    bandGain.connect(this.layerGain);

    powerSource.start();
    coastSource.start();

    return {
      band,
      powerSource,
      coastSource,
      powerGain,
      coastGain,
      bandGain,
    };
  }

  update({
    rpm,
    loadBlend,
    torqueDip,
    idleJitter,
    noisePhase,
    firingHz,
    cylinderCount,
    smoothness,
    roughness,
    nowSeconds,
  }) {
    // Blend only the two nearest recorded RPM loops to avoid single-loop artifacts.
    const nearest = findNearestBands(this.layerConfig.bands, rpm);
    const lowWeight = 1 - nearest.blend;
    const highWeight = nearest.blend;
    const transitionK = this.layerConfig.transitionSeconds;
    const powerPresence = this.layerConfig.powerPresence ?? 1;
    const coastPresence = this.layerConfig.coastPresence ?? 1;
    const lowLoadGain = this.layerConfig.lowLoadGain ?? 0.8;
    const highLoadGain = this.layerConfig.highLoadGain ?? 1.1;
    const layerLoadGain = lowLoadGain + (highLoadGain - lowLoadGain) * loadBlend;
    const basePitchFlutter = this.layerConfig.microPitchFlutter ?? 0;
    const baseGainFlutter = this.layerConfig.microGainFlutter ?? 0;
    const flutterScale = lerp(1, 0.45, smoothness) * roughness;
    const pitchFlutter =
      Math.sin(noisePhase * 17.0 + this.players.length) * basePitchFlutter * flutterScale;
    const gainFlutter =
      1 + Math.sin(noisePhase * 11.0 + 1.7) * baseGainFlutter * flutterScale;
    const brightnessDb =
      (this.layerConfig.brightnessDbAtLoad0 ?? -2) +
      ((this.layerConfig.brightnessDbAtLoad1 ?? 4) - (this.layerConfig.brightnessDbAtLoad0 ?? -2)) *
        loadBlend;
    const pulseRateDivisor = this.layerConfig.pulseRateDivisor ?? 4;
    const pulseRateHz = clamp(firingHz / pulseRateDivisor, 10, 180);
    const cylinderPulseScale = Math.pow(4 / Math.max(1, cylinderCount), 0.6);
    const pulseDepth =
      (this.layerConfig.pulseDepth ?? 0.035) *
      cylinderPulseScale *
      lerp(1, 0.38, smoothness);
    // High-cylinder engines produce denser, lower-amplitude pulses that overlap into a smooth tone.
    const pulseHarmonicMix = this.layerConfig.pulseHarmonicMix ?? 0.35;
    const p1 = Math.sin(noisePhase * pulseRateHz);
    const p2 = Math.sin(noisePhase * pulseRateHz * 2 + 0.7);
    const pulseMod = 1 + pulseDepth * (p1 * (1 - pulseHarmonicMix) + p2 * pulseHarmonicMix);
    const rpmNormalized = clamp(rpm / 8000, 0, 1);
    const highEndHarmonicGain = (this.layerConfig.highEndHarmonicGain ?? 1.2) * smoothness;
    const harmonicLift = 1 + rpmNormalized * highEndHarmonicGain * 0.08;

    for (let i = 0; i < this.players.length; i += 1) {
      const player = this.players[i];
      const isLow = i === nearest.lowIndex;
      const isHigh = i === nearest.highIndex;
      const rpmWeight = isLow ? lowWeight : isHigh ? highWeight : 0;
      const bandGain =
        (player.band.gain ?? 1) *
        rpmWeight *
        this.layerConfig.baseGain *
        layerLoadGain *
        gainFlutter *
        pulseMod *
        harmonicLift;
      const powerGain = bandGain * loadBlend * powerPresence;
      const coastGain = bandGain * (1 - loadBlend) * coastPresence;
      const pitchBase = clamp(rpm / player.band.recordedRPM, 0.5, 3);
      const idleFactor = player.band.name === "idle" ? idleJitter : 1;
      const pitch = pitchBase * idleFactor * (1 + pitchFlutter);

      player.powerGain.gain.setTargetAtTime(powerGain, nowSeconds, transitionK);
      player.coastGain.gain.setTargetAtTime(coastGain, nowSeconds, transitionK);
      player.bandGain.gain.setTargetAtTime(bandGain, nowSeconds, transitionK);
      player.powerSource.playbackRate.setTargetAtTime(pitch, nowSeconds, transitionK);
      player.coastSource.playbackRate.setTargetAtTime(pitch, nowSeconds, transitionK);
    }

    const smoothTorqueDip = lerp(torqueDip, 1, smoothness * 0.25);
    this.layerGain.gain.setTargetAtTime(smoothTorqueDip, nowSeconds, transitionK * (1 + smoothness * 0.5));
    this.brightnessFilter.gain.setTargetAtTime(brightnessDb, nowSeconds, transitionK);

    const lowBand = this.layerConfig.bands[nearest.lowIndex];
    const highBand = this.layerConfig.bands[nearest.highIndex];
    this.runtime.selectedBands = [lowBand.name, highBand.name];
    this.runtime.weights = [lowWeight, highWeight];
    this.runtime.pitch = [
      clamp(rpm / lowBand.recordedRPM, 0.5, 3),
      clamp(rpm / highBand.recordedRPM, 0.5, 3),
    ];
    this.runtime.gain = layerLoadGain * gainFlutter;
    this.runtime.brightnessDb = brightnessDb;
    this.runtime.pulseDepth = pulseDepth;
    this.runtime.pulseRateHz = pulseRateHz;
  }
}
