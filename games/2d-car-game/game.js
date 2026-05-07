const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const speedKmhEl = document.getElementById("speedKmh");
const radioStatusEl = document.getElementById("radioStatus");
const radioChannelEl = document.getElementById("radioChannel");
const overlayEl = document.getElementById("overlay");
const statusEl = document.getElementById("statusText");
const startBtn = document.getElementById("startBtn");

const ROAD = {
  x: 60,
  width: 280,
  laneCount: 3,
};

const PLAYER_SIZE = { w: 38, h: 64 };
const ENEMY_SIZE = { w: 36, h: 60 };
const LANE_TURN_DURATION = 0.08;
const LANE_DIAGONAL_DURATION = 0.18;
const LANE_STRAIGHTEN_DURATION = 0.09;
const PLAYER_TURN_ANGLE_MAX = 0.24;
const PLAYER_DIAGONAL_LIFT = 12;
/** How fast the car eases between top/bottom rail when switching forward ↔ reverse (higher = snappier). */
const PLAYER_RAIL_SMOOTH_RATE = 7;
const TRAILER_SWING_MAX = 0.32;
const TRAILER_FOLLOW_RATE = 7.5;
const TRAILER_TURN_INERTIA = 0.95;
const PLAYER_SPEED_MAX_KMH = 400;
const PLAYER_ACCEL_KMH_PER_SEC = 118;
/** Pace scales with |speedKmh| / this value (200 ≈ baseline “full” pace; cap 400 km/h). */
const DT_SPEED_REF_KMH = 200;
const DT_SPEED_FLOOR = 0.22;
const NPC_ACCELERATION = 120;
const NPC_BRAKE_DECELERATION = 260;
const NPC_MIN_GAP = 52;
const NPC_TIME_HEADWAY = 0.62;
const NPC_TOP_SPAWN_GAP = 185;
// ~1 in 20 NPCs may attempt discretionary lane changes; blocked traffic still merges.
const NPC_RANDOM_LANE_ELIGIBLE_FRACTION = 1 / 20;
const NPC_RANDOM_LANE_ATTEMPT_PER_SEC = 0.06;
const NPC_LANE_CHANGE_MIN_GAP = 130;
const NPC_PLAYER_LANE_CHANGE_CLEARANCE = 130;
const NPC_LANE_CHANGE_X_SPEED = 220;
const ASSET_BASE = "./Assets/2D TOP DOWN PIXEL CARS";
const PLAYER_CAR_STORAGE_KEY = "carGamePlayerSprite";
const PLAYER_TRAILER_STORAGE_KEY = "carGamePlayerTrailerEnabled";
const RADIO_STATIONS = [
  {
    name: "CNA938",
    url: "https://28393.live.streamtheworld.com/938NOW_PREM.aac",
  },
  {
    name: "Kiss92",
    url: "https://playerservices.streamtheworld.com/api/livestream-redirect/KISS_92AAC.aac",
  },
  {
    name: "Symphony 924",
    url: "https://playerservices.streamtheworld.com/api/livestream-redirect/SYMPHONY924AAC.aac",
  },
  {
    name: "Capital 958",
    url: "https://playerservices.streamtheworld.com/api/livestream-redirect/CAPITAL958FMAAC.aac",
  },
  {
    name: "UFM 100.3",
    url: "https://playerservices.streamtheworld.com/api/livestream-redirect/UFM_1003AAC.aac",
  },
  {
    name: "883JIA",
    url: "https://playerservices.streamtheworld.com/api/livestream-redirect/883JIAAAC.aac",
  },
  {
    name: "Smooth Jazz",
    url: "https://playerservices.streamtheworld.com/api/livestream-redirect/SMOOTHJAZZ_S01.mp3?dist=onlineradiobox",
  },
  {
    name: "RelaxingJazz",
    url: "https://443-1.autopo.st/171/stream/3/",
  },
];
let currentStationIndex = 0;

function makeSprite(path) {
  const img = new Image();
  img.src = path;
  return img;
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function normalizeAngle(angle) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function shortestAngleDelta(fromAngle, toAngle) {
  return normalizeAngle(toAngle - fromAngle);
}

function updateTrailerAngle(currentAngle, truckAngle, previousTruckAngle, dt) {
  // Trailer lags behind sudden steering changes, then eases back toward truck direction.
  const turnDelta = shortestAngleDelta(previousTruckAngle, truckAngle);
  let nextAngle = currentAngle - turnDelta * TRAILER_TURN_INERTIA;
  nextAngle += shortestAngleDelta(nextAngle, truckAngle) * TRAILER_FOLLOW_RATE * dt;

  const relative = shortestAngleDelta(truckAngle, nextAngle);
  const clamped = Math.max(-TRAILER_SWING_MAX, Math.min(TRAILER_SWING_MAX, relative));
  return normalizeAngle(truckAngle + clamped);
}

const radioAudio = new Audio(RADIO_STATIONS[currentStationIndex].url);
radioAudio.preload = "none";

function setRadioStatus(text) {
  if (radioStatusEl) {
    radioStatusEl.textContent = text;
  }
}

function setRadioChannelName(name) {
  if (radioChannelEl) {
    radioChannelEl.textContent = name;
  }
}

async function startRadioPlayback() {
  setRadioStatus("Loading...");
  try {
    await radioAudio.play();
    setRadioStatus("On");
  } catch (_error) {
    setRadioStatus("Blocked");
  }
}

function selectRadioStation(index) {
  if (index < 0 || index >= RADIO_STATIONS.length || index === currentStationIndex) {
    return;
  }

  const wasPlaying = !radioAudio.paused;
  currentStationIndex = index;
  const station = RADIO_STATIONS[currentStationIndex];

  radioAudio.pause();
  radioAudio.src = station.url;
  setRadioChannelName(station.name);

  if (wasPlaying) {
    startRadioPlayback();
  } else {
    setRadioStatus("Off");
  }
}

async function toggleRadio() {
  if (!radioAudio.paused) {
    radioAudio.pause();
    setRadioStatus("Off");
    return;
  }
  await startRadioPlayback();
}

const playerCarOptions = [
  `${ASSET_BASE}/Compact/compact_blue.png`,
  `${ASSET_BASE}/Compact/compact_green.png`,
  `${ASSET_BASE}/Compact/compact_orange.png`,
  `${ASSET_BASE}/Compact/compact_red.png`,
  `${ASSET_BASE}/Coupe/coupe_blue.png`,
  `${ASSET_BASE}/Coupe/coupe_green.png`,
  `${ASSET_BASE}/Coupe/coupe_midnight.png`,
  `${ASSET_BASE}/Coupe/coupe_red.png`,
  `${ASSET_BASE}/Sedan/sedan_blue.png`,
  `${ASSET_BASE}/Sedan/sedan_gray.png`,
  `${ASSET_BASE}/Sedan/sedan_green.png`,
  `${ASSET_BASE}/Sedan/sedan_red.png`,
  `${ASSET_BASE}/Sport/sport_blue.png`,
  `${ASSET_BASE}/Sport/sport_green.png`,
  `${ASSET_BASE}/Sport/sport_red.png`,
  `${ASSET_BASE}/Sport/sport_yellow.png`,
  `${ASSET_BASE}/Truck/truck_blue.png`,
  `${ASSET_BASE}/Truck/truck_cream.png`,
  `${ASSET_BASE}/Truck/truck_green.png`,
  `${ASSET_BASE}/Truck/truck_red.png`,
];
const playerSprite = makeSprite(playerCarOptions[12]);
const trailerSprite = makeSprite(`${ASSET_BASE}/Truck/trailer.png`);

function getPlayerSpritePath() {
  const storedPath = localStorage.getItem(PLAYER_CAR_STORAGE_KEY);
  if (storedPath && playerCarOptions.includes(storedPath)) {
    return storedPath;
  }
  return playerCarOptions[12];
}

const selectedPlayerSpritePath = getPlayerSpritePath();
playerSprite.src = selectedPlayerSpritePath;
const isPlayerTruck = selectedPlayerSpritePath.includes("/Truck/");
const isPlayerTrailerEnabled = localStorage.getItem(PLAYER_TRAILER_STORAGE_KEY) !== "false";
const enemyCarOptions = playerCarOptions.filter((path) => path !== selectedPlayerSpritePath);

const enemySpriteGroups = {
  compact: enemyCarOptions
    .filter((path) => path.includes("/Compact/"))
    .map((path) => makeSprite(path)),
  coupe: enemyCarOptions
    .filter((path) => path.includes("/Coupe/"))
    .map((path) => makeSprite(path)),
  sedan: enemyCarOptions
    .filter((path) => path.includes("/Sedan/"))
    .map((path) => makeSprite(path)),
  sport: enemyCarOptions
    .filter((path) => path.includes("/Sport/"))
    .map((path) => makeSprite(path)),
  truck: enemyCarOptions
    .filter((path) => path.includes("/Truck/"))
    .map((path) => makeSprite(path)),
};

// Approximate highway mix: more sedans/compacts, fewer sports/coupes, some trucks.
const enemyTrafficMix = [
  { type: "sedan", weight: 34 },
  { type: "compact", weight: 27 },
  { type: "truck", weight: 19 },
  { type: "coupe", weight: 12 },
  { type: "sport", weight: 8 },
];

function pickEnemySpriteByTrafficMix() {
  const totalWeight = enemyTrafficMix.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of enemyTrafficMix) {
    roll -= entry.weight;
    if (roll <= 0) {
      const bucket = enemySpriteGroups[entry.type];
      return {
        sprite: bucket[Math.floor(Math.random() * bucket.length)],
        type: entry.type,
      };
    }
  }

  return {
    sprite: enemySpriteGroups.sedan[0],
    type: "sedan",
  };
}

const game = {
  running: false,
  score: 0,
  best: Number(localStorage.getItem("carGameBest") || 0),
  speed: 230,
  speedKmh: 88,
  spawnTimer: 0,
  spawnInterval: 0.75,
  laneOffset: 0,
  keys: {
    accelHeld: false,
    decelHeld: false,
  },
  player: {
    lane: 1,
    targetLane: 1,
    x: laneCenter(1) - PLAYER_SIZE.w / 2,
    baseY: canvas.height - 110,
    y: canvas.height - 110,
    turnAngle: 0,
    trailerAngle: 0,
    queuedDirection: 0,
    laneChange: {
      active: false,
      phase: "idle",
      timer: 0,
      direction: 0,
      fromX: 0,
      toX: 0,
      startBaseY: 0,
      diagonalY: 0,
      backing: false,
    },
  },
  enemies: [],
  lastFrame: 0,
};

function getPlayerBaseY() {
  const margin = isPlayerTruck && isPlayerTrailerEnabled ? 130 : 110;
  return game.speedKmh >= 0 ? canvas.height - margin : margin;
}

game.player.baseY = getPlayerBaseY();
game.player.y = game.player.baseY;

bestEl.textContent = String(game.best);
updateHud();
setRadioChannelName(RADIO_STATIONS[currentStationIndex].name);

function resetGame() {
  game.score = 0;
  game.speed = 230;
  game.speedKmh = 88;
  game.spawnTimer = 0;
  game.spawnInterval = 0.75;
  game.laneOffset = 0;
  game.player.lane = 1;
  game.player.targetLane = 1;
  game.player.x = laneCenter(game.player.lane) - PLAYER_SIZE.w / 2;
  game.player.baseY = getPlayerBaseY();
  game.player.y = game.player.baseY;
  game.player.turnAngle = 0;
  game.player.trailerAngle = 0;
  game.player.queuedDirection = 0;
  game.player.laneChange.active = false;
  game.player.laneChange.phase = "idle";
  game.player.laneChange.timer = 0;
  game.player.laneChange.direction = 0;
  game.enemies = [];
  updateHud();
}

function startGame() {
  resetGame();
  game.running = true;
  overlayEl.classList.add("hidden");
  game.lastFrame = performance.now();
  requestAnimationFrame(loop);
}

function endGame() {
  game.running = false;
  if (game.score > game.best) {
    game.best = Math.floor(game.score);
    localStorage.setItem("carGameBest", String(game.best));
  }
  updateHud();
  statusEl.textContent = `Crash! Final score: ${Math.floor(game.score)}`;
  startBtn.textContent = "Restart";
  overlayEl.classList.remove("hidden");
}

function updateHud() {
  const currentScore = Math.floor(game.score);
  scoreEl.textContent = String(currentScore);

  if (currentScore > game.best) {
    game.best = currentScore;
    localStorage.setItem("carGameBest", String(game.best));
  }

  bestEl.textContent = String(game.best);
  if (speedKmhEl) {
    speedKmhEl.textContent = `${Math.round(game.speedKmh)} km/h`;
  }
}

function laneCenter(laneIndex) {
  const laneWidth = ROAD.width / ROAD.laneCount;
  return ROAD.x + laneWidth * laneIndex + laneWidth / 2;
}

function spawnEnemy() {
  const forward = game.speedKmh >= 0;
  const lane = Math.floor(Math.random() * ROAD.laneCount);
  const laneEnemies = game.enemies.filter((enemy) => enemy.lane === lane);
  const edgeEnemy = laneEnemies.sort((a, b) => (forward ? a.y - b.y : b.y - a.y))[0];
  if (forward) {
    if (edgeEnemy && edgeEnemy.y < NPC_TOP_SPAWN_GAP) return;
  } else if (edgeEnemy && edgeEnemy.y > canvas.height - NPC_TOP_SPAWN_GAP) {
    return;
  }
  const x = laneCenter(lane) - ENEMY_SIZE.w / 2;
  const y = forward ? -ENEMY_SIZE.h - 8 : canvas.height + ENEMY_SIZE.h + 8;
  const speed = game.speed + 60 + Math.random() * 70;
  const picked = pickEnemySpriteByTrafficMix();
  game.enemies.push({
    x,
    y,
    speed,
    currentSpeed: speed,
    scored: false,
    sprite: picked.sprite,
    isTruck: picked.type === "truck",
    lane,
    targetLane: lane,
    changingLane: false,
    allowRandomLaneChange: Math.random() < NPC_RANDOM_LANE_ELIGIBLE_FRACTION,
    angle: 0,
    trailerAngle: 0,
  });
}

function beginLaneChange(nextLane) {
  const p = game.player;
  const direction = Math.sign(nextLane - p.lane);
  if (direction === 0) return;

  p.targetLane = nextLane;
  p.queuedDirection = 0;
  p.laneChange.active = true;
  p.laneChange.phase = "turn";
  p.laneChange.timer = 0;
  p.laneChange.direction = direction;
  p.laneChange.fromX = p.x;
  p.laneChange.toX = laneCenter(nextLane) - PLAYER_SIZE.w / 2;
  p.laneChange.startBaseY = p.y;
  const backing = game.speedKmh < 0;
  p.laneChange.backing = backing;
  p.laneChange.diagonalY =
    p.laneChange.startBaseY + (backing ? PLAYER_DIAGONAL_LIFT : -PLAYER_DIAGONAL_LIFT);
}

function requestLaneChange(direction) {
  const p = game.player;
  const referenceLane = p.laneChange.active ? p.targetLane : p.lane;
  const nextLane = Math.max(0, Math.min(ROAD.laneCount - 1, referenceLane + direction));
  if (nextLane === referenceLane) return;

  if (p.laneChange.active) {
    p.queuedDirection = direction;
    return;
  }
  beginLaneChange(nextLane);
}

function canNpcUseLane(enemy, lane, laneGroups) {
  const targetGroup = laneGroups[lane];
  for (const other of targetGroup) {
    if (other === enemy) continue;
    if (Math.abs(other.y - enemy.y) < NPC_LANE_CHANGE_MIN_GAP) {
      return false;
    }
  }
  return true;
}

function isNpcTooCloseToPlayerForLaneChange(enemy) {
  const p = game.player;
  const refLane = p.laneChange.active ? p.targetLane : p.lane;
  if (Math.abs(enemy.lane - refLane) > 1) return false;

  const pTop = p.y;
  const pBot = p.y + PLAYER_SIZE.h;
  const eTop = enemy.y;
  const eBot = enemy.y + ENEMY_SIZE.h;
  let verticalSep;
  if (pBot <= eTop) verticalSep = eTop - pBot;
  else if (eBot <= pTop) verticalSep = pTop - eBot;
  else verticalSep = 0;

  return verticalSep < NPC_PLAYER_LANE_CHANGE_CLEARANCE;
}

function maybeStartNpcLaneChange(enemy, laneGroups, blockedAhead, dtBoosted) {
  if (enemy.changingLane) return;
  if (isNpcTooCloseToPlayerForLaneChange(enemy)) return;

  const randomAttempt =
    enemy.allowRandomLaneChange && Math.random() < NPC_RANDOM_LANE_ATTEMPT_PER_SEC * dtBoosted;
  const shouldAttempt = blockedAhead || randomAttempt;
  if (!shouldAttempt) return;

  const candidates = [];
  if (enemy.lane > 0) candidates.push(enemy.lane - 1);
  if (enemy.lane < ROAD.laneCount - 1) candidates.push(enemy.lane + 1);

  for (const lane of candidates.sort(() => Math.random() - 0.5)) {
    if (canNpcUseLane(enemy, lane, laneGroups)) {
      enemy.targetLane = lane;
      enemy.changingLane = true;
      return;
    }
  }
}

function update(dt) {
  const p = game.player;
  if (game.keys.accelHeld) {
    game.speedKmh = Math.min(PLAYER_SPEED_MAX_KMH, game.speedKmh + PLAYER_ACCEL_KMH_PER_SEC * dt);
  }
  if (game.keys.decelHeld) {
    game.speedKmh -= PLAYER_ACCEL_KMH_PER_SEC * dt;
  }
  const absKmh = Math.abs(game.speedKmh);
  const dtBoosted =
    dt * Math.max(DT_SPEED_FLOOR, absKmh / DT_SPEED_REF_KMH);
  const travelSign = game.speedKmh >= 0 ? 1 : -1;
  const dtSteer = dt;
  const previousTurnAngle = p.turnAngle;

  if (!p.laneChange.active) {
    const targetY = getPlayerBaseY();
    p.baseY = targetY;
    p.y += (targetY - p.y) * Math.min(1, PLAYER_RAIL_SMOOTH_RATE * dt);
    if (Math.abs(targetY - p.y) < 0.4) {
      p.y = targetY;
    }
  }

  if (p.laneChange.active) {
    const change = p.laneChange;
    change.timer += dtSteer;

    const steerSign = change.backing ? -1 : 1;

    if (change.phase === "turn") {
      const t = Math.min(change.timer / LANE_TURN_DURATION, 1);
      p.turnAngle = change.direction * PLAYER_TURN_ANGLE_MAX * t * steerSign;
      p.x = change.fromX;
      p.y = change.startBaseY;
      if (t >= 1) {
        change.phase = "diagonal";
        change.timer = 0;
      }
    } else if (change.phase === "diagonal") {
      const t = Math.min(change.timer / LANE_DIAGONAL_DURATION, 1);
      p.turnAngle = change.direction * PLAYER_TURN_ANGLE_MAX * steerSign;
      p.x = lerp(change.fromX, change.toX, t);
      p.y = lerp(change.startBaseY, change.diagonalY, t);
      if (t >= 1) {
        change.phase = "straighten";
        change.timer = 0;
      }
    } else if (change.phase === "straighten") {
      const t = Math.min(change.timer / LANE_STRAIGHTEN_DURATION, 1);
      const endBaseY = getPlayerBaseY();
      p.turnAngle = change.direction * PLAYER_TURN_ANGLE_MAX * (1 - t) * steerSign;
      p.x = change.toX;
      p.y = lerp(change.diagonalY, endBaseY, t);
      if (t >= 1) {
        p.lane = p.targetLane;
        p.x = change.toX;
        p.baseY = endBaseY;
        p.y = endBaseY;
        p.turnAngle = 0;
        change.active = false;
        change.phase = "idle";
        change.timer = 0;

        if (p.queuedDirection !== 0) {
          const queuedDir = p.queuedDirection;
          p.queuedDirection = 0;
          requestLaneChange(queuedDir);
        }
      }
    }
  }

  if (isPlayerTruck && isPlayerTrailerEnabled) {
    p.trailerAngle = updateTrailerAngle(p.trailerAngle, p.turnAngle, previousTurnAngle, dt);
  } else {
    p.trailerAngle = p.turnAngle;
  }

  game.spawnTimer += dtBoosted;
  if (game.spawnTimer >= game.spawnInterval) {
    game.spawnTimer = 0;
    spawnEnemy();
  }

  game.speed += dtBoosted * 3.5;
  game.spawnInterval = Math.max(0.35, game.spawnInterval - dtBoosted * 0.008);
  game.score += dtBoosted * 12;

  const playerRect = {
    x: p.x,
    y: p.y,
    w: PLAYER_SIZE.w,
    h: PLAYER_SIZE.h,
  };
  const playerTrailerRect =
    isPlayerTruck && isPlayerTrailerEnabled
      ? getTrailerHitbox(p.x, p.y, PLAYER_SIZE.w, PLAYER_SIZE.h, p.turnAngle, p.trailerAngle)
      : null;

  const forward = travelSign === 1;
  const laneGroups = Array.from({ length: ROAD.laneCount }, () => []);
  for (const enemy of game.enemies) {
    laneGroups[enemy.lane].push(enemy);
  }
  for (const group of laneGroups) {
    group.sort((a, b) => (forward ? a.y - b.y : b.y - a.y));
    for (let i = 0; i < group.length; i += 1) {
      const enemy = group[i];
      const ahead = group[i + 1];
      let targetSpeed = enemy.speed;
      let blockedAhead = false;
      if (ahead) {
        const gap = forward
          ? ahead.y - enemy.y - ENEMY_SIZE.h
          : enemy.y - ahead.y - ENEMY_SIZE.h;
        const safeGap = NPC_MIN_GAP + enemy.currentSpeed * NPC_TIME_HEADWAY;
        if (gap < safeGap) {
          blockedAhead = true;
          const ratio = Math.max(0.2, gap / safeGap);
          targetSpeed = Math.min(targetSpeed, ahead.currentSpeed * ratio);
        }
      }
      maybeStartNpcLaneChange(enemy, laneGroups, blockedAhead, dtBoosted);
      if (enemy.currentSpeed < targetSpeed) {
        enemy.currentSpeed = Math.min(targetSpeed, enemy.currentSpeed + NPC_ACCELERATION * dtBoosted);
      } else {
        enemy.currentSpeed = Math.max(targetSpeed, enemy.currentSpeed - NPC_BRAKE_DECELERATION * dtBoosted);
      }
      enemy.y += enemy.currentSpeed * dtBoosted * travelSign;
      if (enemy.changingLane) {
        const targetX = laneCenter(enemy.targetLane) - ENEMY_SIZE.w / 2;
        const deltaX = targetX - enemy.x;
        const stepX = NPC_LANE_CHANGE_X_SPEED * dtBoosted;
        if (Math.abs(deltaX) <= stepX) {
          enemy.x = targetX;
          enemy.lane = enemy.targetLane;
          enemy.changingLane = false;
        } else {
          enemy.x += Math.sign(deltaX) * stepX;
        }
      }
    }
  }

  for (const enemy of game.enemies) {
    if (enemy.isTruck) {
      enemy.trailerAngle = updateTrailerAngle(enemy.trailerAngle, enemy.angle, enemy.angle, dt);
    }

    const passedForward = forward && enemy.y > p.y + PLAYER_SIZE.h;
    const passedReverse = !forward && enemy.y + ENEMY_SIZE.h < p.y;
    if (!enemy.scored && (passedForward || passedReverse)) {
      enemy.scored = true;
      game.score += 18;
    }

    const enemyRect = {
      x: enemy.x,
      y: enemy.y,
      w: ENEMY_SIZE.w,
      h: ENEMY_SIZE.h,
    };
    const enemyTrailerRect = enemy.isTruck
      ? getTrailerHitbox(enemy.x, enemy.y, ENEMY_SIZE.w, ENEMY_SIZE.h, enemy.angle, enemy.trailerAngle)
      : null;

    const bodyCollision = isRectColliding(playerRect, enemyRect);
    const enemyTrailerHitsPlayerBody =
      enemyTrailerRect !== null && isRectColliding(playerRect, enemyTrailerRect);
    const enemyBodyHitsPlayerTrailer =
      playerTrailerRect !== null && isRectColliding(playerTrailerRect, enemyRect);
    const trailerToTrailerCollision =
      playerTrailerRect !== null &&
      enemyTrailerRect !== null &&
      isRectColliding(playerTrailerRect, enemyTrailerRect);

    if (
      bodyCollision ||
      enemyTrailerHitsPlayerBody ||
      enemyBodyHitsPlayerTrailer ||
      trailerToTrailerCollision
    ) {
      endGame();
      return;
    }
  }

  game.enemies = game.enemies.filter((enemy) =>
    forward ? enemy.y < canvas.height + ENEMY_SIZE.h : enemy.y > -ENEMY_SIZE.h
  );
  const roadScrollSign = game.speedKmh >= 0 ? 1 : -1;
  const laneScroll =
    (game.speed * 0.7 + Math.abs(game.speedKmh) * 0.8) * dtBoosted * roadScrollSign;
  game.laneOffset = ((game.laneOffset + laneScroll) % 50 + 50) % 50;
  updateHud();
}

function isColliding(aPos, aSize, bPos, bSize) {
  return (
    aPos.x < bPos.x + bSize.w &&
    aPos.x + aSize.w > bPos.x &&
    aPos.y < bPos.y + bSize.h &&
    aPos.y + aSize.h > bPos.y
  );
}

function isRectColliding(rectA, rectB) {
  return (
    rectA.x < rectB.x + rectB.w &&
    rectA.x + rectA.w > rectB.x &&
    rectA.y < rectB.y + rectB.h &&
    rectA.y + rectA.h > rectB.y
  );
}

function getTrailerHitbox(truckX, truckY, truckWidth, truckHeight, truckAngle, trailerAngle) {
  const centerX = truckX + truckWidth / 2;
  const centerY = truckY + truckHeight / 2;
  const trailerWidth = truckWidth * 0.9;
  const trailerHeight = truckHeight * 1.02;
  const hitchY = truckHeight * 0.24;
  const hitchGap = 1;

  const hitchXWorld = centerX + Math.sin(truckAngle) * hitchY;
  const hitchYWorld = centerY + Math.cos(truckAngle) * hitchY;
  const trailerCenterOffset = hitchGap + trailerHeight / 2;
  const trailerCenterX = hitchXWorld + Math.sin(trailerAngle) * trailerCenterOffset;
  const trailerCenterY = hitchYWorld + Math.cos(trailerAngle) * trailerCenterOffset;

  const halfW = trailerWidth / 2;
  const halfH = trailerHeight / 2;
  const absCos = Math.abs(Math.cos(trailerAngle));
  const absSin = Math.abs(Math.sin(trailerAngle));
  const aabbHalfW = absCos * halfW + absSin * halfH;
  const aabbHalfH = absSin * halfW + absCos * halfH;

  return {
    x: trailerCenterX - aabbHalfW,
    y: trailerCenterY - aabbHalfH,
    w: aabbHalfW * 2,
    h: aabbHalfH * 2,
  };
}

function drawRoad() {
  ctx.fillStyle = "#2c2c2c";
  ctx.fillRect(ROAD.x, 0, ROAD.width, canvas.height);

  ctx.fillStyle = "#b8b8b8";
  ctx.fillRect(ROAD.x, 0, 4, canvas.height);
  ctx.fillRect(ROAD.x + ROAD.width - 4, 0, 4, canvas.height);

  const laneWidth = ROAD.width / ROAD.laneCount;
  ctx.fillStyle = "#f4f4f4";
  for (let i = 1; i < ROAD.laneCount; i += 1) {
    const laneX = ROAD.x + laneWidth * i;
    for (let y = -50; y < canvas.height + 50; y += 50) {
      ctx.fillRect(laneX - 2, y + game.laneOffset, 4, 28);
    }
  }
}

function drawCar(x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = "#111";
  ctx.fillRect(x + 4, y + 10, 6, 14);
  ctx.fillRect(x + width - 10, y + 10, 6, 14);
  ctx.fillRect(x + 4, y + height - 24, 6, 14);
  ctx.fillRect(x + width - 10, y + height - 24, 6, 14);

  ctx.fillStyle = "#86c9ff";
  ctx.fillRect(x + 9, y + 8, width - 18, 12);
}

function drawFallbackCarLocal(width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(-width / 2, -height / 2, width, height);

  ctx.fillStyle = "#111";
  ctx.fillRect(-width / 2 + 4, -height / 2 + 10, 6, 14);
  ctx.fillRect(width / 2 - 10, -height / 2 + 10, 6, 14);
  ctx.fillRect(-width / 2 + 4, height / 2 - 24, 6, 14);
  ctx.fillRect(width / 2 - 10, height / 2 - 24, 6, 14);

  ctx.fillStyle = "#86c9ff";
  ctx.fillRect(-width / 2 + 9, -height / 2 + 8, width - 18, 12);
}

function drawSpriteCar(sprite, x, y, width, height, fallbackColor, rotateRadians = 0) {
  if (sprite?.complete && sprite.naturalWidth > 0) {
    if (rotateRadians !== 0) {
      ctx.save();
      ctx.translate(x + width / 2, y + height / 2);
      ctx.rotate(rotateRadians);
      ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
      ctx.restore();
      return;
    }
    ctx.drawImage(sprite, x, y, width, height);
    return;
  }
  drawCar(x, y, width, height, fallbackColor);
}

function drawTruckWithTrailer(
  sprite,
  x,
  y,
  width,
  height,
  rotateRadians,
  showTrailer,
  fallbackColor,
  trailerAngleRadians
) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const trailerWidth = width * 0.9;
  const trailerHeight = height * 1.02;
  const hitchY = height * 0.24;
  const hitchGap = 1;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotateRadians);

  if (sprite?.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
  } else {
    drawFallbackCarLocal(width, height, fallbackColor);
  }

  if (showTrailer) {
    const relativeTrailerAngle = shortestAngleDelta(rotateRadians, trailerAngleRadians);
    ctx.save();
    ctx.translate(0, hitchY);
    ctx.rotate(relativeTrailerAngle);
    const trailerTopY = hitchGap;
    if (trailerSprite?.complete && trailerSprite.naturalWidth > 0) {
      ctx.drawImage(trailerSprite, -trailerWidth / 2, trailerTopY, trailerWidth, trailerHeight);
    } else {
      ctx.fillStyle = "#9a9a9a";
      ctx.fillRect(-trailerWidth / 2, trailerTopY, trailerWidth, trailerHeight);
    }
    ctx.fillStyle = "#6f6f6f";
    ctx.fillRect(-2, -1, 4, hitchGap + 2);
    ctx.restore();
  }

  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  drawRoad();

  for (const enemy of game.enemies) {
    if (enemy.isTruck) {
      drawTruckWithTrailer(
        enemy.sprite,
        enemy.x,
        enemy.y,
        ENEMY_SIZE.w,
        ENEMY_SIZE.h,
        0,
        true,
        "#ff4d4d",
        enemy.trailerAngle
      );
      continue;
    }
    drawSpriteCar(enemy.sprite, enemy.x, enemy.y, ENEMY_SIZE.w, ENEMY_SIZE.h, "#ff4d4d", 0);
  }

  if (isPlayerTruck) {
    drawTruckWithTrailer(
      playerSprite,
      game.player.x,
      game.player.y,
      PLAYER_SIZE.w,
      PLAYER_SIZE.h,
      game.player.turnAngle,
      isPlayerTrailerEnabled,
      "#4f7dff",
      game.player.trailerAngle
    );
    return;
  }
  drawSpriteCar(
    playerSprite,
    game.player.x,
    game.player.y,
    PLAYER_SIZE.w,
    PLAYER_SIZE.h,
    "#4f7dff",
    game.player.turnAngle
  );
}

function loop(timestamp) {
  if (!game.running) return;
  const dt = Math.min((timestamp - game.lastFrame) / 1000, 0.04);
  game.lastFrame = timestamp;

  update(dt);
  draw();

  if (game.running) requestAnimationFrame(loop);
}

function setKeyState(event, isDown) {
  switch (event.key.toLowerCase()) {
    case "arrowleft":
    case "a":
      if (!isDown) return;
      requestLaneChange(game.speedKmh < 0 ? 1 : -1);
      break;
    case "arrowright":
    case "d":
      if (!isDown) return;
      requestLaneChange(game.speedKmh < 0 ? -1 : 1);
      break;
    case "arrowup":
    case "w":
      game.keys.accelHeld = isDown;
      break;
    case "arrowdown":
    case "s":
      game.keys.decelHeld = isDown;
      break;
    case "r":
      if (!isDown) return;
      toggleRadio();
      break;
    case "1":
      if (!isDown) return;
      selectRadioStation(0);
      break;
    case "2":
      if (!isDown) return;
      selectRadioStation(1);
      break;
    case "3":
      if (!isDown) return;
      selectRadioStation(2);
      break;
    case "4":
      if (!isDown) return;
      selectRadioStation(3);
      break;
    case "5":
      if (!isDown) return;
      selectRadioStation(4);
      break;
    case "6":
      if (!isDown) return;
      selectRadioStation(5);
      break;
    case "7":
      if (!isDown) return;
      selectRadioStation(6);
      break;
    case "8":
      if (!isDown) return;
      selectRadioStation(7);
      break;
    default:
      return;
  }
  event.preventDefault();
}

window.addEventListener("keydown", (event) => setKeyState(event, true));
window.addEventListener("keyup", (event) => setKeyState(event, false));

startBtn.addEventListener("click", startGame);

draw();
