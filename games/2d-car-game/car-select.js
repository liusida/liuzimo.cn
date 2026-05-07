const PLAYER_CAR_STORAGE_KEY = "carGamePlayerSprite";
const PLAYER_TRAILER_STORAGE_KEY = "carGamePlayerTrailerEnabled";
const ASSET_BASE = "./Assets/2D TOP DOWN PIXEL CARS";

const carOptions = [
  { name: "Compact Blue", path: `${ASSET_BASE}/Compact/compact_blue.png` },
  { name: "Compact Green", path: `${ASSET_BASE}/Compact/compact_green.png` },
  { name: "Compact Orange", path: `${ASSET_BASE}/Compact/compact_orange.png` },
  { name: "Compact Red", path: `${ASSET_BASE}/Compact/compact_red.png` },
  { name: "Coupe Blue", path: `${ASSET_BASE}/Coupe/coupe_blue.png` },
  { name: "Coupe Green", path: `${ASSET_BASE}/Coupe/coupe_green.png` },
  { name: "Coupe Midnight", path: `${ASSET_BASE}/Coupe/coupe_midnight.png` },
  { name: "Coupe Red", path: `${ASSET_BASE}/Coupe/coupe_red.png` },
  { name: "Sedan Blue", path: `${ASSET_BASE}/Sedan/sedan_blue.png` },
  { name: "Sedan Gray", path: `${ASSET_BASE}/Sedan/sedan_gray.png` },
  { name: "Sedan Green", path: `${ASSET_BASE}/Sedan/sedan_green.png` },
  { name: "Sedan Red", path: `${ASSET_BASE}/Sedan/sedan_red.png` },
  { name: "Sport Blue", path: `${ASSET_BASE}/Sport/sport_blue.png` },
  { name: "Sport Green", path: `${ASSET_BASE}/Sport/sport_green.png` },
  { name: "Sport Red", path: `${ASSET_BASE}/Sport/sport_red.png` },
  { name: "Sport Yellow", path: `${ASSET_BASE}/Sport/sport_yellow.png` },
  { name: "Truck Blue", path: `${ASSET_BASE}/Truck/truck_blue.png` },
  { name: "Truck Cream", path: `${ASSET_BASE}/Truck/truck_cream.png` },
  { name: "Truck Green", path: `${ASSET_BASE}/Truck/truck_green.png` },
  { name: "Truck Red", path: `${ASSET_BASE}/Truck/truck_red.png` },
];

const grid = document.getElementById("carGrid");
const trailerToggle = document.getElementById("trailerToggle");
let selectedPath = localStorage.getItem(PLAYER_CAR_STORAGE_KEY) || carOptions[0].path;
if (!carOptions.some((option) => option.path === selectedPath)) {
  selectedPath = carOptions[0].path;
}
const trailerStored = localStorage.getItem(PLAYER_TRAILER_STORAGE_KEY);
if (trailerStored === null) {
  localStorage.setItem(PLAYER_TRAILER_STORAGE_KEY, "true");
}
trailerToggle.checked = localStorage.getItem(PLAYER_TRAILER_STORAGE_KEY) !== "false";

trailerToggle.addEventListener("change", () => {
  localStorage.setItem(PLAYER_TRAILER_STORAGE_KEY, trailerToggle.checked ? "true" : "false");
});

function setSelected(path) {
  selectedPath = path;
  localStorage.setItem(PLAYER_CAR_STORAGE_KEY, path);
  render();
}

function render() {
  grid.innerHTML = "";

  for (const option of carOptions) {
    const card = document.createElement("article");
    card.className = `car-card${selectedPath === option.path ? " selected" : ""}`;

    const img = document.createElement("img");
    img.src = option.path;
    img.alt = option.name;

    const name = document.createElement("p");
    name.className = "car-name";
    name.textContent = option.name;

    const button = document.createElement("button");
    button.className = "pick-btn";
    button.type = "button";
    button.textContent = selectedPath === option.path ? "Selected" : "Select";
    button.addEventListener("click", () => setSelected(option.path));

    card.append(img, name, button);
    grid.append(card);
  }
}

render();
