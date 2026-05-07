import { clamp, damp } from "../core/smoothing.js";
import { CameraMode, VehicleAudioState } from "../core/types.js";

export class VehicleSimulator {
  constructor(engineConfig) {
    this.engine = engineConfig.engine;
    this.state = new VehicleAudioState();
    this.state.rpm = this.engine.idleRPM;
    this.state.engineRunning = false;
    this.state.cameraMode = CameraMode.EXTERIOR;
    this.state.cameraBlend = 0;
    this.state.distanceNormalized = 0;

    this.finalDrive = 4.1;
    this.gearRatios = [0, 3.1, 2.0, 1.48, 1.22, 1.0, 0.83];
    this.speed = 0;
    this.shiftTimer = 0;
    this.shiftDuration = 0.22;
    this.cameraTargetBlend = 0;
    this.limiterHoldTimer = 0;
    this.limiterLatched = false;

    const limiterConfig = this.engine.limiter ?? {};
    this.limiterControl = {
      enterRPM: this.engine.maxRPM - (limiterConfig.enterRPMOffset ?? 120),
      exitRPM: this.engine.maxRPM - (limiterConfig.exitRPMOffset ?? 260),
      holdSeconds: limiterConfig.holdSeconds ?? 0.1,
      clampRPM: this.engine.maxRPM - (limiterConfig.clampRPMOffset ?? 80),
    };
  }

  update(input, dtSeconds) {
    if (!this.state.engineRunning) {
      this.state.rpm = damp(this.state.rpm, 0, 0.15, dtSeconds);
      this.state.throttle = 0;
      this.state.engineLoad = 0;
      this.state.cameraBlend = damp(this.state.cameraBlend, this.cameraTargetBlend, 0.2, dtSeconds);
      this.state.distanceNormalized = clamp(
        this.state.distanceNormalized + (input.distanceDelta ?? 0) * dtSeconds * 0.8,
        0,
        1
      );
      this.state.limiterActive = false;
      this.limiterLatched = false;
      this.limiterHoldTimer = 0;
      return this.state;
    }

    if (input.shiftUp) {
      this.tryShift(+1);
    } else if (input.shiftDown) {
      this.tryShift(-1);
    }

    this.shiftTimer = Math.max(0, this.shiftTimer - dtSeconds);
    this.state.isShifting = this.shiftTimer > 0;
    this.state.clutch = input.clutch ? 0 : 1;

    const throttleTarget = input.throttle ? 1 : 0;
    const brakeLoad = input.brake ? 0.7 : 0.2;
    const throttleRate = input.throttle ? 5.0 : 4.2;
    this.state.throttle = damp(this.state.throttle, throttleTarget, 1 / throttleRate, dtSeconds);

    const ratio = this.gearRatios[this.state.gear] * this.finalDrive;
    const torqueFactor = this.state.throttle * this.state.clutch * (this.state.isShifting ? 0.5 : 1);
    const accel = torqueFactor * 16 / ratio;
    const drag = 4.2 + brakeLoad * 8.5;
    this.speed = Math.max(0, this.speed + (accel - drag * 0.09) * dtSeconds);

    const wheelRPM = this.speed * 140;
    const drivetrainRPM = wheelRPM * ratio;
    const freeRevRPM = this.engine.idleRPM + this.state.throttle * (this.engine.maxRPM - this.engine.idleRPM);
    const clutchBlend = this.state.clutch;
    const targetRPM = clamp(
      drivetrainRPM * clutchBlend + freeRevRPM * (1 - clutchBlend),
      this.engine.minRPM,
      this.engine.maxRPM
    );
    this.state.rpm = damp(this.state.rpm, targetRPM, 0.06, dtSeconds);

    const loadFromGear = clamp((ratio - 2.5) / 2.5, 0.2, 1);
    const resistanceLoad = clamp(brakeLoad * 0.7 + (this.speed / 38) * 0.25, 0, 1);
    this.state.engineLoad = clamp(
      0.18 +
        this.state.throttle * 0.52 +
        loadFromGear * 0.2 +
        resistanceLoad * 0.25 +
        (this.state.isShifting ? -0.2 : 0),
      0,
      1
    );

    if (input.limiter) {
      this.limiterLatched = true;
      this.limiterHoldTimer = this.limiterControl.holdSeconds;
    } else {
      if (!this.limiterLatched && this.state.rpm >= this.limiterControl.enterRPM) {
        this.limiterLatched = true;
        this.limiterHoldTimer = this.limiterControl.holdSeconds;
      }
      if (this.limiterLatched) {
        this.limiterHoldTimer = Math.max(0, this.limiterHoldTimer - dtSeconds);
        if (this.limiterHoldTimer <= 0 && this.state.rpm <= this.limiterControl.exitRPM) {
          this.limiterLatched = false;
        }
      }
    }

    this.state.limiterActive = this.limiterLatched;
    if (this.state.limiterActive) {
      this.state.rpm = Math.min(this.state.rpm, this.limiterControl.clampRPM);
    }
    this.state.cameraBlend = damp(this.state.cameraBlend, this.cameraTargetBlend, 0.2, dtSeconds);
    this.state.distanceNormalized = clamp(
      this.state.distanceNormalized + (input.distanceDelta ?? 0) * dtSeconds * 0.8,
      0,
      1
    );

    return this.state;
  }

  toggleEngine() {
    this.state.engineRunning = !this.state.engineRunning;
    if (this.state.engineRunning) {
      this.state.rpm = this.engine.idleRPM;
    }
  }

  toggleCamera() {
    this.state.cameraMode =
      this.state.cameraMode === CameraMode.EXTERIOR ? CameraMode.INTERIOR : CameraMode.EXTERIOR;
    this.cameraTargetBlend = this.state.cameraMode === CameraMode.INTERIOR ? 1 : 0;
  }

  tryShift(direction) {
    const next = clamp(this.state.gear + direction, 1, this.gearRatios.length - 1);
    if (next !== this.state.gear) {
      this.state.gear = next;
      this.shiftTimer = this.shiftDuration;
    }
  }
}
