import { CameraMode } from "../core/types.js";

export class EngineBusMixer {
  constructor(audioContext, config) {
    this.audioContext = audioContext;
    this.config = config;
    this.layerInputs = new Map();

    this.interiorBus = audioContext.createGain();
    this.exteriorBus = audioContext.createGain();
    this.interiorGain = audioContext.createGain();
    this.exteriorGain = audioContext.createGain();
    this.output = audioContext.createGain();

    this.interiorLowPass = audioContext.createBiquadFilter();
    this.interiorLowPass.type = "lowpass";
    this.interiorLowPass.frequency.value = config.interior.lowPassHz;

    this.interiorPresence = audioContext.createBiquadFilter();
    this.interiorPresence.type = "peaking";
    this.interiorPresence.frequency.value = 1800;
    this.interiorPresence.Q.value = 0.7;
    this.interiorPresence.gain.value = config.interior.mechanicalPresenceDb;

    this.exteriorHighPass = audioContext.createBiquadFilter();
    this.exteriorHighPass.type = "highpass";
    this.exteriorHighPass.frequency.value = config.exterior.highPassHz;

    this.exteriorBrightness = audioContext.createBiquadFilter();
    this.exteriorBrightness.type = "highshelf";
    this.exteriorBrightness.frequency.value = 2400;
    this.exteriorBrightness.gain.value = config.exterior.brightnessDb;

    this.distanceGain = audioContext.createGain();
    this.distanceGain.gain.value = 1;

    this.interiorBus.connect(this.interiorLowPass);
    this.interiorLowPass.connect(this.interiorPresence);
    this.interiorPresence.connect(this.interiorGain);
    this.interiorGain.connect(this.distanceGain);

    this.exteriorBus.connect(this.exteriorHighPass);
    this.exteriorHighPass.connect(this.exteriorBrightness);
    this.exteriorBrightness.connect(this.exteriorGain);
    this.exteriorGain.connect(this.distanceGain);
    this.distanceGain.connect(this.output);
  }

  connect(destination) {
    this.output.connect(destination);
  }

  createLayerInput(layerName, layerConfig) {
    const input = this.audioContext.createGain();
    const toInterior = this.audioContext.createGain();
    const toExterior = this.audioContext.createGain();

    input.connect(toInterior);
    input.connect(toExterior);
    toInterior.connect(this.interiorBus);
    toExterior.connect(this.exteriorBus);

    toInterior.gain.value = layerConfig.interiorSend;
    toExterior.gain.value = layerConfig.exteriorSend;
    input.gain.value = 1;

    this.layerInputs.set(layerName, { input, toInterior, toExterior });
    return input;
  }

  update(cameraMode, cameraBlend, throttle, load, distanceNormalized, nowSeconds) {
    const blendedCamera =
      typeof cameraBlend === "number"
        ? cameraBlend
        : cameraMode === CameraMode.INTERIOR
          ? 1
          : 0;
    const interiorAmount = Math.min(1, Math.max(0, blendedCamera));
    const exteriorAmount = 1 - interiorAmount;
    const k = 0.02;
    const interiorLow =
      this.config.interior.lowPassHzAtLoad0 +
      (this.config.interior.lowPassHzAtLoad1 - this.config.interior.lowPassHzAtLoad0) * load;
    const exteriorBright =
      this.config.exterior.brightnessDbAtLoad0 +
      (this.config.exterior.brightnessDbAtLoad1 - this.config.exterior.brightnessDbAtLoad0) *
        ((load * 0.6) + (throttle * 0.4));
    const minDistanceAtten = this.config.distance?.minAttenuation ?? 0.45;
    const distanceGain =
      1 - Math.min(1, Math.max(0, distanceNormalized)) * (1 - minDistanceAtten);

    this.interiorGain.gain.setTargetAtTime(
      interiorAmount * this.config.interior.masterGain,
      nowSeconds,
      k
    );
    this.exteriorGain.gain.setTargetAtTime(
      exteriorAmount * this.config.exterior.masterGain,
      nowSeconds,
      k
    );
    this.interiorLowPass.frequency.setTargetAtTime(interiorLow, nowSeconds, 0.04);
    this.exteriorBrightness.gain.setTargetAtTime(exteriorBright, nowSeconds, 0.04);
    this.distanceGain.gain.setTargetAtTime(distanceGain, nowSeconds, 0.05);
  }
}
