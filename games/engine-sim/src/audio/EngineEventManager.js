import { clamp } from "../core/smoothing.js";

export class EngineEventManager {
  constructor(audioContext, sampleLibrary, config, destination) {
    this.audioContext = audioContext;
    this.sampleLibrary = sampleLibrary;
    this.config = config;
    this.destination = destination;
    this.buffers = new Map();

    this.prev = null;
    this.activeEvents = [];
    this.lastLimiterPulseAt = -999;
    this.lastBackfireAt = -999;
    this.lastBlipAt = -999;
    this.shiftDipUntil = 0;
  }

  async initialize() {
    const entries = Object.entries(this.config);
    await Promise.all(
      entries.map(async ([type, eventConfig]) => {
        const buffer = await this.sampleLibrary.getEventBuffer(eventConfig.clip, { type });
        this.buffers.set(type, buffer);
      })
    );
  }

  update(state, nowSeconds) {
    const events = [];
    if (!this.prev) {
      this.prev = { ...state };
      return events;
    }

    if (!this.prev.engineRunning && state.engineRunning) {
      events.push("engineStart");
      this.playEvent("engineStart", nowSeconds);
    }
    if (this.prev.engineRunning && !state.engineRunning) {
      events.push("engineStop");
      this.playEvent("engineStop", nowSeconds);
    }
    if (state.engineRunning && this.prev.gear !== state.gear) {
      events.push("shiftThunk");
      this.playEvent("shiftThunk", nowSeconds);
      this.shiftDipUntil = nowSeconds + this.config.shiftThunk.torqueDipSeconds;
    }

    if (!this.prev.limiterActive && state.limiterActive) {
      events.push("limiterStutter");
      this.playEvent("limiterStutter", nowSeconds);
      this.lastLimiterPulseAt = nowSeconds;
    }
    if (state.limiterActive) {
      const pulseInterval = this.config.limiterStutter.repeatSeconds;
      if (nowSeconds - this.lastLimiterPulseAt >= pulseInterval) {
        events.push("limiterStutter");
        this.playEvent("limiterStutter", nowSeconds);
        this.lastLimiterPulseAt = nowSeconds;
      }
    }

    const throttleDelta = state.throttle - this.prev.throttle;
    const mayBackfire =
      this.prev.throttle > 0.65 &&
      throttleDelta < -0.38 &&
      state.rpm > this.config.backfire.minRPM &&
      nowSeconds - this.lastBackfireAt > this.config.backfire.minGapSeconds;
    if (state.engineRunning && mayBackfire) {
      events.push("backfire");
      this.playEvent("backfire", nowSeconds);
      this.lastBackfireAt = nowSeconds;
    }

    const blipCfg = this.config.throttleBlip;
    const mayBlip =
      blipCfg &&
      state.engineRunning &&
      state.rpm >= blipCfg.minRPM &&
      state.rpm <= blipCfg.maxRPM &&
      throttleDelta > blipCfg.minThrottleJump &&
      (state.clutch < 0.3 || state.isShifting) &&
      nowSeconds - this.lastBlipAt > blipCfg.minGapSeconds;
    if (mayBlip) {
      events.push("throttleBlip");
      this.playEvent("throttleBlip", nowSeconds);
      this.lastBlipAt = nowSeconds;
    }

    this.prev = { ...state };
    this.activeEvents = events;
    return events;
  }

  getTorqueDip(nowSeconds) {
    if (nowSeconds <= this.shiftDipUntil) {
      return this.config.shiftThunk.torqueDip;
    }
    return 1;
  }

  getLimiterCut(nowSeconds, limiterActive) {
    if (!limiterActive) {
      return 1;
    }
    const phase = (nowSeconds * this.config.limiterStutter.cutRateHz) % 1;
    const minGain = this.config.limiterStutter.cutMinGain ?? 0.25;
    const cut = phase < this.config.limiterStutter.cutDutyCycle ? minGain : 1;
    return clamp(cut, minGain, 1);
  }

  playEvent(type, nowSeconds) {
    const buffer = this.buffers.get(type);
    if (!buffer) {
      return;
    }
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = this.config[type].gain;

    source.connect(gainNode);
    gainNode.connect(this.destination);
    source.start(nowSeconds);
  }
}
