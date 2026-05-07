export const CameraMode = Object.freeze({
  INTERIOR: "interior",
  EXTERIOR: "exterior",
});

export class VehicleAudioState {
  constructor() {
    this.rpm = 0;
    this.throttle = 0;
    this.engineLoad = 0;
    this.gear = 1;
    this.clutch = 1;
    this.isShifting = false;
    this.limiterActive = false;
    this.cameraMode = CameraMode.EXTERIOR;
    this.cameraBlend = 0;
    this.distanceNormalized = 0;
    this.engineRunning = false;
  }

  copyFrom(next) {
    this.rpm = next.rpm;
    this.throttle = next.throttle;
    this.engineLoad = next.engineLoad;
    this.gear = next.gear;
    this.clutch = next.clutch;
    this.isShifting = next.isShifting;
    this.limiterActive = next.limiterActive;
    this.cameraMode = next.cameraMode;
    this.cameraBlend = next.cameraBlend ?? 0;
    this.distanceNormalized = next.distanceNormalized ?? 0;
    this.engineRunning = next.engineRunning;
  }

  clone() {
    const copy = new VehicleAudioState();
    copy.copyFrom(this);
    return copy;
  }
}
