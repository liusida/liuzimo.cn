import { ExponentialSmoother, clamp } from "../core/smoothing.js";
import { VehicleAudioState } from "../core/types.js";
import { AudioSampleLibrary } from "./AudioSampleLibrary.js";
import { EngineBusMixer } from "./EngineBusMixer.js";
import { EngineLayerMixer } from "./EngineLayerMixer.js";
import { EngineEventManager } from "./EngineEventManager.js";

export class EngineAudioController {
  constructor(audioContext, config) {
    this.audioContext = audioContext;
    this.config = config;
    this.sampleLibrary = new AudioSampleLibrary(audioContext);
    this.busMixer = new EngineBusMixer(audioContext, config.buses);
    this.layerMixers = new Map();
    this.eventManager = new EngineEventManager(
      audioContext,
      this.sampleLibrary,
      config.events,
      this.busMixer.output
    );

    this.state = new VehicleAudioState();
    this.smoothers = {
      rpm: new ExponentialSmoother(config.engine.minRPM, config.smoothing.rpmSeconds),
      throttle: new ExponentialSmoother(0, config.smoothing.throttleSeconds),
      load: new ExponentialSmoother(0, config.smoothing.loadSeconds),
      camera: new ExponentialSmoother(0, config.smoothing.cameraSeconds ?? 0.15),
      distance: new ExponentialSmoother(0, config.smoothing.distanceSeconds ?? 0.2),
    };
    this.runtimeDebug = {};
    this.elapsed = 0;
    this.initialized = false;
  }

  async initialize() {
    for (const layerConfig of this.config.layers) {
      const layerInput = this.busMixer.createLayerInput(layerConfig.name, layerConfig);
      const mixer = new EngineLayerMixer(
        this.audioContext,
        this.sampleLibrary,
        layerConfig,
        layerInput
      );
      await mixer.initialize();
      this.layerMixers.set(layerConfig.name, mixer);
    }
    await this.eventManager.initialize();

    this.busMixer.connect(this.audioContext.destination);
    this.initialized = true;
  }

  update(nextState, dtSeconds) {
    if (!this.initialized) {
      return;
    }

    this.elapsed += dtSeconds;
    this.state.copyFrom(nextState);

    const now = this.audioContext.currentTime;
    const smoothRPM = this.smoothers.rpm.update(nextState.rpm, dtSeconds);
    const smoothThrottle = this.smoothers.throttle.update(nextState.throttle, dtSeconds);
    const smoothLoad = this.smoothers.load.update(nextState.engineLoad, dtSeconds);
    const smoothCameraBlend = this.smoothers.camera.update(nextState.cameraBlend ?? 0, dtSeconds);
    const smoothDistance = this.smoothers.distance.update(nextState.distanceNormalized ?? 0, dtSeconds);
    const cylinderCount = Math.max(1, this.config.engine.cylinderCount ?? 4);
    // 4-stroke firing frequency: more cylinders -> denser, smoother overlapping pulses.
    const firingEventsPerSecond = (smoothRPM * cylinderCount) / 120;
    const density = clamp(cylinderCount / 16, 0.25, 1.5);
    const roughness = clamp(8 / cylinderCount, 0.2, 1.4);
    const smoothness = clamp(this.config.engine.smoothnessFactor ?? 0.5, 0, 1);

    // Load blend drives coast/power interpolation at the same RPM band.
    const loadBlend = clamp(0.55 * smoothLoad + 0.45 * smoothThrottle, 0, 1);
    const events = this.eventManager.update(
      {
        rpm: smoothRPM,
        throttle: smoothThrottle,
        engineRunning: nextState.engineRunning,
        limiterActive: nextState.limiterActive,
        gear: nextState.gear,
        clutch: nextState.clutch,
        isShifting: nextState.isShifting,
      },
      now
    );
    const torqueDip = this.eventManager.getTorqueDip(now);
    const limiterCut = this.eventManager.getLimiterCut(now, nextState.limiterActive);
    const totalTorque = torqueDip * limiterCut * (nextState.engineRunning ? 1 : 0);

    // Slight low-RPM flutter keeps idle from sounding static and robotic.
    const idleRegion =
      smoothRPM < this.config.engine.idleRPM + this.config.engine.idleJitterWindowRPM;
    const idleJitter =
      idleRegion && nextState.engineRunning
        ? 1 + Math.sin(this.elapsed * 26.0) * this.config.engine.idleJitterAmount * roughness
        : 1;
    const microNoisePhase = this.elapsed * (6 + smoothRPM / 2400 + density * 1.5);

    for (const [name, layerMixer] of this.layerMixers.entries()) {
      layerMixer.update({
        rpm: smoothRPM,
        loadBlend,
        torqueDip: totalTorque,
        idleJitter,
        noisePhase: microNoisePhase,
        firingHz: firingEventsPerSecond,
        cylinderCount,
        smoothness,
        roughness,
        nowSeconds: now,
      });
      this.runtimeDebug[name] = layerMixer.runtime;
    }

    this.busMixer.update(
      nextState.cameraMode,
      smoothCameraBlend,
      smoothThrottle,
      smoothLoad,
      smoothDistance,
      now
    );
    this.runtimeDebug.main = {
      rpm: smoothRPM,
      throttle: smoothThrottle,
      load: smoothLoad,
      loadBlend,
      cameraBlend: smoothCameraBlend,
      distance: smoothDistance,
      firingHz: firingEventsPerSecond,
      cylinderCount,
      engineType: this.config.engine.engineType ?? "unknown",
      smoothness,
      torqueScalar: totalTorque,
      limiterCut,
      events,
    };
  }

  getDebugData() {
    return this.runtimeDebug;
  }
}
