// Some browsers deny storage to embedded pages (e.g. a cross-site iframe with
// third-party storage blocked) by throwing on any `window.localStorage` access.
// Fall back to an in-memory store so the game still boots; nothing persists then.
(() => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.getItem("frtd.storageProbe");
    return;
  } catch (_) {
    // fall through to the in-memory shim
  }
  const memory = new Map();
  const shim = {
    getItem: (key) => (memory.has(String(key)) ? memory.get(String(key)) : null),
    setItem: (key, value) => { memory.set(String(key), String(value)); },
    removeItem: (key) => { memory.delete(String(key)); },
    clear: () => { memory.clear(); },
    key: (index) => Array.from(memory.keys())[index] ?? null,
    get length() { return memory.size; },
  };
  try {
    Object.defineProperty(window, "localStorage", { configurable: true, value: shim });
  } catch (_) {
    // nothing else to try
  }
})();

const RESOURCE_KEYS = ["chits", "food", "water", "gas", "wood", "components"];
const LARGE_SETTLEMENT_RESOURCE_KEYS = ["gas", "components", "wood"];
const LARGE_SETTLEMENT_SHOP_POOL = ["wood", "components", "food", "water", "gas"];
const LARGE_SETTLEMENT_SHOP_COUNT = 2;
const LARGE_SETTLEMENT_SHOP_RATE = 1;

const EMOJI_RENDER = (() => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  canvas.width = 32;
  canvas.height = 32;
  ctx.textBaseline = "top";
  ctx.font = "28px \"Apple Color Emoji\", \"Segoe UI Emoji\", \"Noto Color Emoji\", sans-serif";
  return { canvas, ctx };
})();

function emojiSignature(char) {
  if (!EMOJI_RENDER) return null;
  const { ctx, canvas } = EMOJI_RENDER;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillText(char, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  let sumSq = 0;
  let nonZero = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    nonZero += 1;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sum += r + g + b + a;
    sumSq += r * r + g * g + b * b + a * a;
  }
  return { sum, sumSq, nonZero };
}

function signaturesMatch(a, b) {
  if (!a || !b) return false;
  return a.sum === b.sum && a.sumSq === b.sumSq && a.nonZero === b.nonZero;
}

function resolveEmojiIcon(primary, fallback, rejectList = []) {
  if (!EMOJI_RENDER) return primary;
  const primarySig = emojiSignature(primary);
  if (!primarySig) return primary;
  const missingSig = emojiSignature("\uFFFD");
  if (signaturesMatch(primarySig, missingSig)) return fallback;
  for (const reject of rejectList) {
    const rejectSig = emojiSignature(reject);
    if (signaturesMatch(primarySig, rejectSig)) return fallback;
  }
  return primary;
}

const RESOURCE_ICONS = {
  chits: "\uD83D\uDCB5",
  wood: resolveEmojiIcon("\uD83E\uDEB5", "\uD83C\uDF32", ["\u2764\uFE0F", "\u2665\uFE0F", "\u2665"]),
  gas: "\u26FD",
  components: "\u2699\uFE0F",
  water: "\uD83D\uDCA7",
  food: "\uD83C\uDF3F",
  ap: "\u26A1",
};

// ---------------------------------------------------------------------------
// Balancing
// ---------------------------------------------------------------------------
const INITIAL_RESOURCES = {
  chits: 100,
  wood: 8,
  gas: 8,
  components: 1,
  water: 60,
  food: 60,
};
function resolveDifficultyPreset(key) {
  if (!key) return DIFFICULTY_PRESETS[TITLE_SCREEN_DEFAULT_DIFFICULTY];
  return DIFFICULTY_PRESETS[key] || DIFFICULTY_PRESETS[TITLE_SCREEN_DEFAULT_DIFFICULTY];
}

function resolveInitialResources(multiplier = 1) {
  const safeMultiplier = Number.isFinite(multiplier) ? multiplier : 1;
  const next = {};
  for (const [key, value] of Object.entries(INITIAL_RESOURCES)) {
    next[key] = Math.max(0, Math.round(value * safeMultiplier));
  }
  return next;
}
const ENCOUNTER_TIMER_CONFIG = {
  meanSeconds: 16,
  stddevSeconds: 9,
  minSeconds: 8,
  maxSeconds: 27,
};
const sceneSelectionWeights = {
  camp: 0.5, //.4
  poi: 0.3, //.2
  random: 0.7,
  battle: 1, //1
};
const DEFAULT_ROLL_DIFFICULTY = -2;
const DIFFICULTY_TURN_STEP = 8;
const DIFFICULTY_STEP_DELTA = -2;
// The per-turn escalation never pushes the roll handicap below this.
const MAX_DIFFICULTY_HANDICAP = -10;
const DIFFICULTY_PRESETS = {
  low: { resourceMultiplier: 1.5, baseRollDifficulty: 0 },
  medium: { resourceMultiplier: 1, baseRollDifficulty: DEFAULT_ROLL_DIFFICULTY },
  high: { resourceMultiplier: 0.5, baseRollDifficulty: -5 },
};
const ADVANCED_DIFFICULTY_STORAGE_KEY = "frtd.advancedDifficulty.v1";
const TITLE_DIFFICULTY_STORAGE_KEY = "frtd.titleDifficulty.v1";

function readStoredTitleDifficulty() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(TITLE_DIFFICULTY_STORAGE_KEY);
    if (!raw) return null;
    return DIFFICULTY_PRESETS[raw] ? raw : null;
  } catch (_) {
    return null;
  }
}

function persistTitleDifficulty(key) {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (!DIFFICULTY_PRESETS[key]) return;
  try {
    window.localStorage.setItem(TITLE_DIFFICULTY_STORAGE_KEY, key);
  } catch (_) { /* storage full or blocked */ }
}

const ADVANCED_SETTLEMENT_MIN = 12;
const ADVANCED_SETTLEMENT_MAX = 30;
const ADVANCED_SETTLEMENT_DEFAULT = 20;
const ADVANCED_SPEED_SLIDER_MIN = 0;
const ADVANCED_SPEED_SLIDER_MAX = 100;
const ADVANCED_SPEED_SLIDER_DEFAULT = 50;
const ADVANCED_SOLDIER_SPEED_MIN = 170;
const ADVANCED_SOLDIER_SPEED_DEFAULT = 250;
const ADVANCED_SOLDIER_SPEED_MAX = 310;
const ADVANCED_VEHICLE_SPEED_MIN = 450;
const ADVANCED_VEHICLE_SPEED_DEFAULT = 550;
const ADVANCED_VEHICLE_SPEED_MAX = 700;
let runtimeSmallSettlementCount = ADVANCED_SETTLEMENT_DEFAULT;
const TITLE_SCREEN_DEFAULT_DIFFICULTY = "medium";
const DEMO_MAX_TURNS = 9;
const DEMO_LOCK_DIFFICULTY = true;
const DEMO_DISABLE_DEV_PANEL = true;
const DEMO_LIMIT_TURNS = true;
const DEMO_DISABLE_SAVES = true;
const DEMO_DISABLE_HIGH_SCORES = false;
const DEMO_FORCE_HARDCORE = true;
const DEFAULT_MAX_UNITS = 2;
// Unit cap by home base level: 2 / 3 / 4.
function maxUnitsForBaseLevel(level) {
  const safeLevel = Number.isFinite(Number(level)) ? Math.trunc(Number(level)) : 1;
  return Math.min(4, Math.max(DEFAULT_MAX_UNITS, safeLevel + 1));
}
// Fallen rangers stay in state.rangerUnits (their marker and pack remain on the map)
// but no longer count against the unit cap.
function countLivingRangerUnits(state) {
  return (state?.rangerUnits || []).filter((unit) => unit && !unit.isDead).length;
}
const TOUR_SKIP_KEY = "onboardingTourDisabled";
let globalGameState = null;

function getGameMode() {
  return typeof window !== "undefined" ? window.GAME_MODE : null;
}

function isReleaseMode() {
  // Release mode no longer exists as a distinct build flavor — the dev and win
  // builds were merged. Kept as a vestigial helper so existing callsites that
  // gated "release-only" behavior become inert.
  return false;
}

function isDemoMode() {
  return getGameMode() === "demo";
}

function isDemoDifficultyLocked() {
  return isDemoMode() && DEMO_LOCK_DIFFICULTY;
}

function isDemoDevPanelDisabled() {
  return isDemoMode() && DEMO_DISABLE_DEV_PANEL;
}

function isDemoTurnLimitEnabled() {
  return isDemoMode() && DEMO_LIMIT_TURNS;
}

function isDemoSaveDisabled() {
  return isDemoMode() && DEMO_DISABLE_SAVES;
}

function isDemoHighScoresDisabled() {
  return isDemoMode() && DEMO_DISABLE_HIGH_SCORES;
}

function isDemoHardcoreLocked() {
  return isDemoMode() && DEMO_FORCE_HARDCORE;
}

function isElectronApp() {
  if (typeof navigator === "undefined") return false;
  return /Electron\//i.test(navigator.userAgent || "");
}

function relabelQuitButtonsForBrowserBuild() {
  if (typeof document === "undefined" || isElectronApp()) return;
  // Inside an iframe (itch.io embed), there is no programmatic way to exit
  // the parent-owned fullscreen — Escape is the only path. Hide every quit
  // button so we don't advertise behavior we cannot deliver.
  const inIframe = typeof window !== "undefined" && window.top !== window.self;
  const ids = ["quitToOsBtn", "gameOverQuitOsBtn", "missionQuitOsBtn", "titleQuitBtn"];
  ids.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (inIframe) {
      btn.hidden = true;
      btn.style.display = "none";
      btn.setAttribute("aria-hidden", "true");
    } else {
      btn.textContent = "Quit Game";
    }
  });
}

function exitFullscreenSafely() {
  // Intentionally does NOT precheck `isFullscreenActive()`: when itch.io
  // fullscreens our iframe element from the parent context, the iframe's own
  // `document.fullscreenElement` stays null even though the page is visually
  // fullscreen. Calling `document.exitFullscreen` walks the parent chain and
  // is a safe no-op (rejected promise) when nothing is fullscreen.
  if (typeof document === "undefined") return false;
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.mozCancelFullScreen ||
    document.msExitFullscreen;
  if (!exit) return false;
  try {
    const result = exit.call(document);
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch (err) {
    return false;
  }
  return true;
}

function isFullscreenActive() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

function isItchEmbed() {
  if (typeof window === "undefined") return false;
  if (window.top === window.self) return false;
  let isItch = false;
  try {
    const ancestors = window.location.ancestorOrigins;
    if (ancestors && ancestors.length) {
      isItch = Array.from(ancestors).some((origin) => /itch\.io/i.test(origin));
    }
  } catch (err) {
    // Ignore ancestor origin checks that fail in some browsers.
  }
  if (!isItch) {
    const referrer = document.referrer || "";
    if (/itch\.io/i.test(referrer)) isItch = true;
  }
  return isItch;
}

// A build is "packaged" (shipped to players) when it runs inside the packaged Electron
// app, or in a browser from anywhere other than the local dev server. Running the
// Electron wrapper unpackaged (`npm run dev` in scripts/electron) adds ?frtdDev=1.
function isPackagedBuild() {
  if (typeof window === "undefined") return false;
  if (isElectronApp()) {
    return !/[?&]frtdDev=1(?:&|$)/.test(window.location?.search || "");
  }
  const host = window.location?.hostname || "";
  return !(host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "");
}

function isDevPanelAllowed() {
  if (isReleaseMode()) return false;
  if (isPackagedBuild()) return false;
  if (isDemoMode()) return !isDemoDevPanelDisabled();
  return true;
}

function getGlobalGameState() {
  return globalGameState;
}

function setGlobalGameState(state) {
  globalGameState = state || null;
  if (!isReleaseMode() && typeof window !== "undefined") {
    window.gameStateRef = state || null;
  }
}
const BALANCING = {
  // Movement speed for the active Ranger marker (pixels per second across the basemap).
  soldierSpeed: 280,
  // Movement speed for vehicle units (pixels per second across the basemap).
  vehicleSpeed: 550,
  // Scales how strongly DEM speeds apply; effective speed = soldierSpeed * demSpeedMultiplier * (demValue/100).
  demSpeedMultiplier: 1,
  // Scales how strongly NDVI speeds apply; effective speed = soldierSpeed * ndviSpeedMultiplier * (ndviValue/100).
  ndviSpeedMultiplier: 1,
  // Vehicle-specific scaling applied on top of the base terrain multipliers.
  vehicleDemMultiplier: 0.3,
  vehicleNdviMultiplier: 1.5,
  // Weighting between DEM and NDVI factors (normalized at runtime).
  terrainSpeedWeights: { dem: 0.5, ndvi: 0.5 },
  // Per-second inventory drain while Rangers are marching. Tweak these to balance travel stamina.
  movementDrainPerSecond: {
    gas: 0.1,
    water: 0.1,
    food: 0.08,
    ap: 0.15,
  },
  unitStartInventory: {
    soldier: { gas: 0, water: 12, food: 12, chits: 10, wood: 0, components: 0, ap: 5 },
    vehicle: { gas: 10, water: 12, food: 12, chits: 10, wood: 0, components: 0, ap: 7 },
  },
};

function setTerrainSpeedWeights(demWeight = 0.5, ndviWeight = 0.5) {
  const d = Number.isFinite(demWeight) ? Math.max(0, demWeight) : 0;
  const n = Number.isFinite(ndviWeight) ? Math.max(0, ndviWeight) : 0;
  const sum = d + n;
  if (sum <= 0) return;
  BALANCING.terrainSpeedWeights = { dem: d / sum, ndvi: n / sum };
}

function setVehicleTerrainMultipliers(demMultiplier = 0.5, ndviMultiplier = 2) {
  const dem = Number.isFinite(demMultiplier) ? demMultiplier : BALANCING.vehicleDemMultiplier;
  const ndvi = Number.isFinite(ndviMultiplier) ? ndviMultiplier : BALANCING.vehicleNdviMultiplier;
  BALANCING.vehicleDemMultiplier = dem;
  BALANCING.vehicleNdviMultiplier = ndvi;
}

function setVehicleSpeed(speed = 90) {
  if (!Number.isFinite(speed)) return;
  BALANCING.vehicleSpeed = speed;
}

const CONFIG = {
  movePointsPerTurn: 3,
  baseMoveGasCost: 2,
  squad: {
    fuelPerCell: 1,
    maxRangeCells: 6,
  },
  crafting: {
    solarPanel: {
      cost: { components: 5, wood: 5 },
      incomeBoost: { gas: 1 },
    },
  },
  upkeep: { food: 1, water: 1 },
};
const OWNER_COLORS = {
  player: 0x5df577,
  enemy: 0xff8a7f,
  neutral: 0xcfffb3,
};
const SETTLEMENT_TINT_BY_OWNER = {
  player: 0xffffff, // keep current blue-green hue shift
  neutral: 0xffffff, // leave untouched
  enemy: 0xff4d4d, // push enemy towns toward red
};

function ownerLabelColor(owner = "neutral") {
  const rawTint = SETTLEMENT_TINT_BY_OWNER[owner] ?? SETTLEMENT_TINT_BY_OWNER.neutral ?? 0xffffff;
  const normalizedTint = Number.isFinite(rawTint) ? rawTint : 0xffffff;
  const hex = (normalizedTint & 0xffffff).toString(16).padStart(6, "0");
  return `#${hex}`;
}

// Tunable sprite palette shift so settlement icons pop against the basemap.
const SPRITE_SHADOW_STYLE = {
  color: 0x000000,
  alpha: 0.8,
  scale: 1.05,
  offsetX: 0,
  offsetY: 0,
};

// Single knob to scale settlement sprites and their hit area.
const SETTLEMENT_ICON_SCALE = 1.4;
// Separate knob to scale settlement labels independent of sprite scale.
const SETTLEMENT_LABEL_SCALE = 1.35;
const SETTLEMENT_OVERLAP_THRESHOLD = 0.1;
const SETTLEMENT_OVERLAP_SAMPLE_GRID = 6;
const SETTLEMENT_OVERLAP_OFFSET_SMALL = { x: 0, y: 0.2 };
const SETTLEMENT_OVERLAP_OFFSET_LARGE = { x: 0.0, y: 0.2 };
const ICON_SCALE = Math.max(SETTLEMENT_ICON_SCALE || 0.25, 0.05); // legacy clamp (overridden by dev tunables)
// Single knob to scale unit sprites and their related effects.
const UNIT_ICON_SCALE = 1.0;
const DEV_SPRITE_TUNABLES = {
  settlementScale: SETTLEMENT_ICON_SCALE,
  unitScale: UNIT_ICON_SCALE,
};
const GLOW_DISTANCE = {
  unit: { hover: 3, select: 3.6 },
  settlement: { hover: 19, select: 19 },
  settlementSmall: { hover: 17, select: 17 },
  dam: { hover: 2, select: 2 },
};
const DAM_ICON_SCALE = 1.15;
const DAM_HALO_STYLE = {
  color: 0xfff4d6, // warm white
  outerStrength: 4.1,
  innerStrength: 1.1,
  distance: 2, // small positive to avoid shader div/0 while keeping halo centered
  quality: 0.55,
};
const HOME_BASE_NEAR_PCT = 0.75;
const SMALL_SETTLEMENT_NEAR_PCT = 1.0;
const POI_PRIZE_GLOW_COLORS = [
  "rgba(255, 254, 213, 1)",
  "rgba(255, 252, 101, 1)",
  "rgba(246, 217, 0, 0.93)",
];
const DEV_SETTLEMENT_HITBOX = {
  spriteYOffset: 0, // pixels to nudge sprite up/down
  hitboxYOffset: 0, // pixels to nudge hitbox up/down
  hitboxPad: 0, // pixels to expand hitbox on all sides
};
const BATTLE_SPRITE_KEYS = ["battle1", "battle2"];
const BATTLE_SPRITE_KEY = "battle2";
const BATTLE_SPRITE_SOURCES = {
  battle1: "sprites/battle1.png",
  battle2: "sprites/battle2.png",
};
const CAMP_SPRITE_KEY = "camp";
const CAMP_SPRITE_SRC = "sprites/camp.png";
// Global state for the Ranger command Phaser UI embedded in the squad window.
let rangerPaneGame = null;
let rangerPaneScene = null;
let rangerPaneWarmupQueued = false;
let rangerPaneWarmupRunning = false;
let rangerPaneReady = false;
// Tweakable glow/halo that sits behind units.
const UNIT_HALO_STYLE = {
  radius: 32,
  color: 0xfcd34d,
  alpha: 1,
  scale: 1.5,
};
const PING_GLOW_COLOR = 0xfcd34d;
const PING_EMBER_COLOR = 0xf97316;
const PING_RING_TEX = "ping_ring";
const PING_DUST_TEX = "ping_dust";
const PING_RING_BASE_SCALE_START = 0.55;
const PING_RING_BASE_SCALE_END = 1.7;
const PING_EMBER_BASE_SCALE_START = 0.35;
const PING_EMBER_BASE_SCALE_END = 0;
const PING_ZOOM_SCALE_MIN = 0.8;
const PING_ZOOM_SCALE_MAX = 17.5;
// Hard floor for camera zoom-out (higher = less zoomed out).
const CAMERA_MIN_ZOOM = 0.2;
// Offset for settlement sprites (fractions of sprite size). Hitboxes are pixel-perfect, so no separate hitbox offset.
const SETTLEMENT_OFFSET = { x: 0.0, y: 0.5 };
// Offset for settlement labels (fractions of sprite size).
const SETTLEMENT_LABEL_OFFSET = { x: 0.0, y: 0.5 };
// Procedural small-settlement placement rules.
const SMALL_SETTLEMENT_COUNT = 16;
const SMALL_SETTLEMENT_MIN_GAP = 10; // minimum pct gap on both X and Y between small settlements
const SMALL_SETTLEMENT_MIN_GAP_TO_LARGE = 7; // minimum pct distance from any large settlement
const ENCOUNTER_SETTLEMENT_GUARD_PCT = 1.6;
// Sprite cleanup profiles let you tweak trimming per sheet (chroma-key blue backgrounds).
const CHROMA_BG = [0, 174, 239, 255]; // key color used across sprite sheets (#00AEEF)
const LOADING_ART_SOURCES = ["assets/title.jpg", "assets/title.png"];
const MAP_DRAG_THRESHOLD_PX = 5;
// Fallbacks so a tile that never arrives cannot hold the loading screen forever.
const BASEMAP_STARTUP_GATE_TIMEOUT_MS = 20000;
const SESSION_READY_TIMEOUT_MS = 35000;
const BASEMAP_STARTUP_VIEW_PADDING = 1;
const BASEMAP_INITIAL_LOAD_CONCURRENCY = 6;
const BASEMAP_BACKGROUND_LOAD_CONCURRENCY = 2;
const BASEMAP_BACKGROUND_WARM_PADDING = 2;
const BASEMAP_BACKGROUND_WARM_BATCH_SIZE = 12;
const BASEMAP_WARMUP_DELAY_MS = 180;
const BASEMAP_WARMUP_IDLE_TIMEOUT_MS = 850;
const BASEMAP_STARTUP_ZOOM_MULTIPLIER = 8.2;
const BASEMAP_STARTUP_MAX_ZOOM = 1;
const BASEMAP_SESSION_CACHE = {
  manifest: null,
  manifestPromise: null,
  imagePromises: new Map(),
  images: new Map(),
  warmedKeys: new Set(),
  warmupPromise: null,
};
const STARTUP_MAP_IMAGE_SOURCES = [
  "sprites/landmarks.png",
  "sprites/natres.png",
  "sprites/poi.png",
  "sprites/settlements_l.png",
  "sprites/settlements_s.png",
  "sprites/soldiers.png",
  "sprites/vehicles.png",
  "sprites/randoms.png",
  "sprites/battle2.png",
  "sprites/battle1.png",
  "sprites/camp.png",
  "sprites/dams.png",
  "sprites/gunweapons.png",
  "sprites/meleeweapons.png",
  "sprites/rangedweapons.png",
  "sprites/energyweapons.png",
];
const STARTUP_FETCH_WARM_URLS = [
  "watermask-grid.json",
  "json-tiles/dem-grid/manifest.json",
  "json-tiles/ndvi-grid/manifest.json",
];
const STARTUP_MAP_TEXTURES = [
  { key: "landmarks", src: "sprites/landmarks.png" },
  { key: "natres", src: "sprites/natres.png" },
  { key: "poi", src: "sprites/poi.png" },
  { key: "settlementsLarge", src: "sprites/settlements_l.png" },
  { key: "settlementsSmall", src: "sprites/settlements_s.png" },
  { key: "unitsSoldiers", src: "sprites/soldiers.png" },
  { key: "unitsVehicles", src: "sprites/vehicles.png" },
  { key: "randoms", src: "sprites/randoms.png" },
  { key: CAMP_SPRITE_KEY, src: CAMP_SPRITE_SRC },
  { key: "dams", src: "sprites/dams.png" },
  { key: "gunweapons", src: "sprites/gunweapons.png" },
  { key: "meleeweapons", src: "sprites/meleeweapons.png" },
  { key: "rangedweapons", src: "sprites/rangedweapons.png" },
  { key: "energyweapons", src: "sprites/energyweapons.png" },
  ...BATTLE_SPRITE_KEYS.map((key) => ({ key, src: BATTLE_SPRITE_SOURCES[key] })).filter((entry) => !!entry.src),
];
const MAP_SCENE_CRITICAL_TEXTURE_KEYS = new Set([
  "settlementsLarge",
  "settlementsSmall",
  "landmarks",
  "natres",
  "poi",
  "randoms",
  CAMP_SPRITE_KEY,
  "dams",
  "battle1",
  "battle2",
  "unitsSoldiers",
  "unitsVehicles",
]);
const STATIC_FETCH_SESSION_CACHE = new Map();
const STATIC_IMAGE_WARM_CACHE = new Map();
const musicUiHooks = {
  onPlayStateChange: null,
};
const DEFAULT_MUSIC_VOLUME = 0.35;
let musicWidgetControlsAttached = false;

function readStoredMusicVolume() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem("musicVolume");
  if (!raw) return null;
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(1, Math.max(0, parsed));
}

function persistMusicVolume(value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  try {
    window.localStorage.setItem("musicVolume", clamped.toString());
  } catch (_) {
    // storage full or unavailable; the setting just won't persist
  }
}

function readStoredToggle(key, fallback = true) {
  if (typeof window === "undefined" || !window.localStorage) return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function persistToggle(key, value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch (_) {
    // storage full or unavailable; the setting just won't persist
  }
}

function getTransitionMetrics() {
  if (typeof window === "undefined") return null;
  if (!window.__titleMapTransitionMetrics) {
    window.__titleMapTransitionMetrics = {};
  }
  return window.__titleMapTransitionMetrics;
}

function getTransitionProfiler() {
  if (typeof window === "undefined") return null;
  if (!window.__titleMapTransitionProfiler) {
    window.__titleMapTransitionProfiler = {
      active: false,
      startedAt: null,
      newGameClickAt: null,
      events: [],
      longTasks: [],
      resources: [],
      rafGaps: [],
      observer: null,
      rafId: null,
      lastRafAt: null,
      resourceWindowStart: null,
    };
  }
  return window.__titleMapTransitionProfiler;
}

function recordTransitionEvent(name, data = null, at = nowMs()) {
  const profiler = getTransitionProfiler();
  if (!profiler?.active) return null;
  const event = { name, at, sinceClick: profiler.newGameClickAt != null ? at - profiler.newGameClickAt : null };
  if (data && typeof data === "object") {
    Object.assign(event, data);
  }
  profiler.events.push(event);
  return event;
}

function captureTransitionResources() {
  const profiler = getTransitionProfiler();
  if (!profiler || typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return [];
  const start = profiler.resourceWindowStart ?? profiler.newGameClickAt ?? profiler.startedAt ?? 0;
  const entries = performance.getEntriesByType("resource")
    .filter((entry) => entry.startTime >= start)
    .map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: entry.startTime,
      responseEnd: entry.responseEnd,
      duration: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }));
  profiler.resources = entries;
  return entries;
}

function stopTransitionProfiler(reason = "complete") {
  const profiler = getTransitionProfiler();
  if (!profiler?.active) return profiler;
  recordTransitionEvent("profiler:stop", { reason });
  profiler.active = false;
  if (profiler.observer) {
    try {
      profiler.observer.disconnect();
    } catch (err) {
      // Ignore observer shutdown failures.
    }
    profiler.observer = null;
  }
  if (profiler.rafId != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(profiler.rafId);
    profiler.rafId = null;
  }
  captureTransitionResources();
  return profiler;
}

function startTransitionProfiler(context = {}) {
  if (typeof window === "undefined") return null;
  const profiler = getTransitionProfiler();
  if (profiler.observer) {
    try {
      profiler.observer.disconnect();
    } catch (err) {
      // Ignore observer shutdown failures.
    }
  }
  if (profiler.rafId != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(profiler.rafId);
  }
  profiler.active = true;
  profiler.startedAt = nowMs();
  profiler.newGameClickAt = context.newGameClickAt ?? profiler.startedAt;
  profiler.resourceWindowStart = profiler.newGameClickAt;
  profiler.events = [];
  profiler.longTasks = [];
  profiler.resources = [];
  profiler.rafGaps = [];
  profiler.lastRafAt = null;
  recordTransitionEvent("profiler:start", { context });
  if (typeof PerformanceObserver !== "undefined") {
    try {
      profiler.observer = new PerformanceObserver((list) => {
        if (!profiler.active) return;
        list.getEntries().forEach((entry) => {
          profiler.longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          });
        });
      });
      profiler.observer.observe({ type: "longtask", buffered: true });
    } catch (err) {
      profiler.observer = null;
    }
  } else {
    profiler.observer = null;
  }
  if (typeof requestAnimationFrame === "function") {
    const sample = (ts) => {
      if (!profiler.active) return;
      if (profiler.lastRafAt != null) {
        const gap = ts - profiler.lastRafAt;
        if (gap > 34) {
          profiler.rafGaps.push({ at: ts, gap });
        }
      }
      profiler.lastRafAt = ts;
      profiler.rafId = requestAnimationFrame(sample);
    };
    profiler.rafId = requestAnimationFrame(sample);
  } else {
    profiler.rafId = null;
  }
  return profiler;
}

function measureTransitionSpan(name, fn) {
  const start = nowMs();
  recordTransitionEvent(`${name}:start`, null, start);
  const result = fn();
  const end = nowMs();
  recordTransitionEvent(`${name}:end`, {
    durationMs: end - start,
  }, end);
  return result;
}

function resetTransitionMetrics(context = {}) {
  if (typeof window === "undefined") return null;
  const metrics = {
    fromTitle: !!context.fromTitle,
    newGameClickAt: context.newGameClickAt ?? null,
    manifestReadyAt: null,
    initialRequiredTileCount: 0,
    initialRequiredTileKeys: [],
    initialTilesReadyAt: null,
    overlayHiddenAt: null,
    warmupStartedAt: null,
    warmupReadyAt: null,
    warmCacheHits: 0,
    warmCacheUsed: false,
    jsonWarmCacheHits: 0,
    jsonWarmCacheUsed: false,
    initialGateReleasedAt: null,
    profilerSummary: null,
  };
  window.__titleMapTransitionMetrics = metrics;
  return metrics;
}

function patchTransitionMetrics(patch = {}) {
  const metrics = getTransitionMetrics();
  if (!metrics) return null;
  Object.assign(metrics, patch);
  return metrics;
}

function markTransitionTime(key, value = nowMs()) {
  const metrics = getTransitionMetrics();
  if (!metrics) return null;
  metrics[key] = value;
  recordTransitionEvent(`time:${key}`, { value }, value);
  return metrics;
}

function getStartupHomePositionPct() {
  return NODE_PRESETS.find((node) => node?.id === "home")?.pos || { x: 50, y: 50 };
}

function getBasemapStartupViewSize() {
  const mapContainer = document.getElementById("mapContainer");
  const phaserContainer = document.getElementById("phaserContainer");
  const width = Math.max(
    320,
    mapContainer?.clientWidth || phaserContainer?.clientWidth || window.innerWidth || 1600
  );
  const height = Math.max(
    200,
    mapContainer?.clientHeight || phaserContainer?.clientHeight || window.innerHeight || 900
  );
  return { width, height };
}

function getBasemapTileKeyStatic(row, col) {
  return `basemap_tile_${col}_${row}`;
}

function getBasemapTileLayout(manifest) {
  if (!manifest?.width || !manifest?.height) return null;
  const tileSize =
    manifest.tileSize ||
    manifest.tile_size ||
    (manifest.cols ? Math.ceil(manifest.width / manifest.cols) : null) ||
    (manifest.rows ? Math.ceil(manifest.height / manifest.rows) : null) ||
    1024;
  const rows = manifest.rows || Math.ceil(manifest.height / tileSize);
  const cols = manifest.cols || Math.ceil(manifest.width / tileSize);
  return { tileSize, rows, cols };
}

function computeInitialBasemapRequirement(manifest, options = {}) {
  const layout = getBasemapTileLayout(manifest);
  if (!layout) return null;
  const padding = Number.isFinite(options.padding) ? Math.max(0, options.padding) : BASEMAP_STARTUP_VIEW_PADDING;
  const { width: viewWidth, height: viewHeight } = options.viewSize || getBasemapStartupViewSize();
  const coverZoom = Math.max(viewWidth / manifest.width, viewHeight / manifest.height);
  const minZoom = Math.max(0.05, coverZoom, CAMERA_MIN_ZOOM);
  const zoom = Phaser.Math.Clamp(
    coverZoom * (options.zoomMultiplier || BASEMAP_STARTUP_ZOOM_MULTIPLIER),
    minZoom,
    options.maxZoom || BASEMAP_STARTUP_MAX_ZOOM
  );
  const worldViewWidth = viewWidth / zoom;
  const worldViewHeight = viewHeight / zoom;
  const homePct = options.homePct || getStartupHomePositionPct();
  const homeWorld = {
    x: (homePct.x / 100) * manifest.width,
    y: (homePct.y / 100) * manifest.height,
  };
  const maxScrollX = Math.max(0, manifest.width - worldViewWidth);
  const maxScrollY = Math.max(0, manifest.height - worldViewHeight);
  const scrollX = Phaser.Math.Clamp(homeWorld.x - worldViewWidth * 0.5, 0, maxScrollX);
  const scrollY = Phaser.Math.Clamp(homeWorld.y - worldViewHeight * 0.5, 0, maxScrollY);
  const minCol = Phaser.Math.Clamp(Math.floor(scrollX / layout.tileSize) - padding, 0, layout.cols - 1);
  const maxCol = Phaser.Math.Clamp(
    Math.floor((scrollX + worldViewWidth) / layout.tileSize) + padding,
    0,
    layout.cols - 1
  );
  const minRow = Phaser.Math.Clamp(Math.floor(scrollY / layout.tileSize) - padding, 0, layout.rows - 1);
  const maxRow = Phaser.Math.Clamp(
    Math.floor((scrollY + worldViewHeight) / layout.tileSize) + padding,
    0,
    layout.rows - 1
  );
  const requiredKeys = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      requiredKeys.push(getBasemapTileKeyStatic(row, col));
    }
  }
  return {
    requiredKeys,
    range: { minCol, maxCol, minRow, maxRow },
    viewSize: { width: viewWidth, height: viewHeight },
    zoom,
    homeWorld,
  };
}

function scheduleBasemapWarmupTask(task, delay = BASEMAP_WARMUP_DELAY_MS) {
  const run = () => {
    Promise.resolve()
      .then(task)
      .catch((err) => {
        console.warn("Basemap warmup task failed", err);
      });
  };
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const startIdleTask = () => {
      window.requestIdleCallback(run, { timeout: BASEMAP_WARMUP_IDLE_TIMEOUT_MS });
    };
    if (delay > 0) {
      setTimeout(startIdleTask, delay);
    } else {
      startIdleTask();
    }
    return;
  }
  setTimeout(run, delay);
}

async function warmStaticFetch(url, responseType = "text") {
  if (!url) return null;
  const cacheKey = `${responseType}:${url}`;
  if (STATIC_FETCH_SESSION_CACHE.has(cacheKey)) {
    const metrics = getTransitionMetrics();
    if (metrics && responseType === "json") {
      metrics.jsonWarmCacheHits = (metrics.jsonWarmCacheHits || 0) + 1;
      metrics.jsonWarmCacheUsed = true;
    }
    return STATIC_FETCH_SESSION_CACHE.get(cacheKey);
  }
  if (!STATIC_FETCH_SESSION_CACHE.has(cacheKey)) {
    STATIC_FETCH_SESSION_CACHE.set(cacheKey, (async () => {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`Warm fetch failed for ${url}: ${res.status}`);
      if (responseType === "json") return res.json();
      if (responseType === "arrayBuffer") return res.arrayBuffer();
      return res.text();
    })().catch((err) => {
      STATIC_FETCH_SESSION_CACHE.delete(cacheKey);
      throw err;
    }));
  }
  return STATIC_FETCH_SESSION_CACHE.get(cacheKey);
}

async function warmJsonResource(url) {
  return warmStaticFetch(url, "json");
}

async function warmImageSource(src) {
  if (!src) return null;
  if (!STATIC_IMAGE_WARM_CACHE.has(src)) {
    STATIC_IMAGE_WARM_CACHE.set(src, loadImageElement(src, { shareStaticCache: false })
      .then((img) => {
        STATIC_IMAGE_WARM_CACHE.set(src, img);
        return img;
      })
      .catch((err) => {
        STATIC_IMAGE_WARM_CACHE.delete(src);
        throw err;
      }));
  }
  return STATIC_IMAGE_WARM_CACHE.get(src);
}

async function warmImageSourceBatch(sources, concurrency = 4) {
  const items = Array.isArray(sources) ? sources.filter(Boolean) : [];
  if (!items.length) return [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await warmImageSource(items[currentIndex]);
    }
  });
  await Promise.all(workers);
  return items;
}

function clampAdvancedDifficultySettings(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const smallSettlementCount = clampInt(
    source.smallSettlementCount,
    ADVANCED_SETTLEMENT_MIN,
    ADVANCED_SETTLEMENT_MAX,
    ADVANCED_SETTLEMENT_DEFAULT
  );
  const unitSpeedSlider = clampInt(
    source.unitSpeedSlider,
    ADVANCED_SPEED_SLIDER_MIN,
    ADVANCED_SPEED_SLIDER_MAX,
    ADVANCED_SPEED_SLIDER_DEFAULT
  );
  const hardcore = isDemoHardcoreLocked() ? true : !!source.hardcore;
  return { smallSettlementCount, unitSpeedSlider, hardcore };
}

function readStoredAdvancedDifficultySettings() {
  if (typeof window === "undefined" || !window.localStorage) {
    return clampAdvancedDifficultySettings();
  }
  try {
    const raw = window.localStorage.getItem(ADVANCED_DIFFICULTY_STORAGE_KEY);
    if (!raw) return clampAdvancedDifficultySettings();
    const parsed = JSON.parse(raw);
    return clampAdvancedDifficultySettings(parsed);
  } catch (err) {
    console.warn("Failed to read advanced difficulty settings", err);
    return clampAdvancedDifficultySettings();
  }
}

function persistAdvancedDifficultySettings(settings) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const safe = clampAdvancedDifficultySettings(settings);
  try {
    window.localStorage.setItem(ADVANCED_DIFFICULTY_STORAGE_KEY, JSON.stringify(safe));
  } catch (_) {
    // storage full or unavailable; the setting just won't persist
  }
}

function advancedSpeedSettingsFromSlider(sliderValue = ADVANCED_SPEED_SLIDER_DEFAULT) {
  const slider = clampInt(
    sliderValue,
    ADVANCED_SPEED_SLIDER_MIN,
    ADVANCED_SPEED_SLIDER_MAX,
    ADVANCED_SPEED_SLIDER_DEFAULT
  );
  const t = slider / ADVANCED_SPEED_SLIDER_MAX;
  const blend = t <= 0.5 ? (t / 0.5) : ((t - 0.5) / 0.5);
  const soldierSpeed = t <= 0.5
    ? Math.round(
      ADVANCED_SOLDIER_SPEED_MIN
      + (ADVANCED_SOLDIER_SPEED_DEFAULT - ADVANCED_SOLDIER_SPEED_MIN) * blend
    )
    : Math.round(
      ADVANCED_SOLDIER_SPEED_DEFAULT
      + (ADVANCED_SOLDIER_SPEED_MAX - ADVANCED_SOLDIER_SPEED_DEFAULT) * blend
    );
  const vehicleSpeed = t <= 0.5
    ? Math.round(
      ADVANCED_VEHICLE_SPEED_MIN
      + (ADVANCED_VEHICLE_SPEED_DEFAULT - ADVANCED_VEHICLE_SPEED_MIN) * blend
    )
    : Math.round(
      ADVANCED_VEHICLE_SPEED_DEFAULT
      + (ADVANCED_VEHICLE_SPEED_MAX - ADVANCED_VEHICLE_SPEED_DEFAULT) * blend
    );
  return { slider, soldierSpeed, vehicleSpeed };
}

function applyAdvancedDifficultySettings(settings = null) {
  const safe = clampAdvancedDifficultySettings(settings);
  const speed = advancedSpeedSettingsFromSlider(safe.unitSpeedSlider);
  runtimeSmallSettlementCount = safe.smallSettlementCount;
  BALANCING.soldierSpeed = speed.soldierSpeed;
  BALANCING.vehicleSpeed = speed.vehicleSpeed;
  return {
    ...safe,
    soldierSpeed: speed.soldierSpeed,
    vehicleSpeed: speed.vehicleSpeed,
  };
}

const tourState = {
  active: false,
  steps: [],
  index: 0,
  dimEnabled: true,
  lock: false,
  keyHandlerBound: false,
  currentStepId: null,
  pulseTargets: [],
  gameState: null,
  pendingStart: false,
};

const SAVE_SLOT_COUNT = 4;
const SAVE_STORAGE_KEY = "frtd.saveSlots.v1";
const HIGH_SCORES_KEY = "frtd.highScores.v1";
const RESTART_PAYLOAD_KEY = "frtd.restartPayload.v1";
const HARDCORE_SCORE_BONUS = 2000;
const PER_TURN_SCORE_PENALTY = 200;
const LIVE_SCORE_TICK_MS = 20000;
const PER_TICK_SCORE_PENALTY = 20;
const SCORE_SMOOTHING_THRESHOLD = 1000;

function setRestartPayload(payload) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(RESTART_PAYLOAD_KEY, JSON.stringify(payload || {}));
  } catch (_) {
    // storage full or unavailable; the restart falls back to the title screen
  }
}

function consumeRestartPayload() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(RESTART_PAYLOAD_KEY);
  if (!raw) return null;
  window.localStorage.removeItem(RESTART_PAYLOAD_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function defaultSaveData() {
  return {
    version: 1,
    slots: Array.from({ length: SAVE_SLOT_COUNT }, () => null),
    meta: Array.from({ length: SAVE_SLOT_COUNT }, () => null),
    lastSlot: 1,
  };
}

function loadSaveData() {
  if (isDemoSaveDisabled()) return defaultSaveData();
  if (typeof window === "undefined" || !window.localStorage) return defaultSaveData();
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return defaultSaveData();
    const parsed = JSON.parse(raw);
    const data = defaultSaveData();
    if (parsed && typeof parsed === "object") {
      data.version = parsed.version || data.version;
      data.lastSlot = clampInt(parsed.lastSlot, 1, SAVE_SLOT_COUNT, data.lastSlot);
      if (Array.isArray(parsed.slots)) {
        data.slots = parsed.slots.slice(0, SAVE_SLOT_COUNT);
        while (data.slots.length < SAVE_SLOT_COUNT) data.slots.push(null);
      }
      if (Array.isArray(parsed.meta)) {
        data.meta = parsed.meta.slice(0, SAVE_SLOT_COUNT);
        while (data.meta.length < SAVE_SLOT_COUNT) data.meta.push(null);
      }
    }
    return data;
  } catch (err) {
    console.warn("Failed to read save data", err);
    return defaultSaveData();
  }
}

function persistSaveData(data) {
  if (isDemoSaveDisabled()) return;
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Failed to persist save data", err);
    throw err;
  }
}

function loadHighScores() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(HIGH_SCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to read high scores", err);
    return [];
  }
}

function persistHighScores(scores) {
  if (isDemoHighScoresDisabled()) return;
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(scores || []));
  } catch (err) {
    // Must not throw: this runs while the mission-complete screen is being shown.
    console.warn("High scores could not be saved", err);
  }
}

function clearHighScores() {
  if (isDemoHighScoresDisabled()) return;
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(HIGH_SCORES_KEY);
}

function sortHighScores(a, b) {
  const rank = { high: 3, medium: 2, low: 1 };
  const aScore = Number.isFinite(a?.score) ? a.score : computeRunScore(a);
  const bScore = Number.isFinite(b?.score) ? b.score : computeRunScore(b);
  if (aScore !== bScore) return bScore - aScore;
  const aRank = rank[a?.difficultyKey] || 0;
  const bRank = rank[b?.difficultyKey] || 0;
  if (aRank !== bRank) return bRank - aRank;
  const aTime = Number(a?.durationMs) || 0;
  const bTime = Number(b?.durationMs) || 0;
  if (aTime !== bTime) return aTime - bTime;
  const aTurns = Number(a?.turns) || 0;
  const bTurns = Number(b?.turns) || 0;
  if (aTurns !== bTurns) return aTurns - bTurns;
  const aDate = Number(a?.completedAt) || 0;
  const bDate = Number(b?.completedAt) || 0;
  return aDate - bDate;
}

function recordHighScore(entry) {
  if (!entry || isDemoHighScoresDisabled()) return;
  const scores = loadHighScores();
  const record = {
    difficultyKey: entry.difficultyKey || "medium",
    durationMs: Number(entry.durationMs) || 0,
    turns: Number(entry.turns) || 0,
    completedAt: Number(entry.completedAt) || Date.now(),
    score: Number.isFinite(entry.score) ? Math.trunc(entry.score) : computeRunScore({
      ...entry,
      turnsTaken: Number.isFinite(Number(entry.turnsTaken))
        ? Number(entry.turnsTaken)
        : Math.max(0, (Number(entry.turns) || 0) - 1),
    }),
    hardcore: !!entry.hardcore,
  };
  if (Number.isFinite(Number(entry.smallSettlementCount))) {
    record.smallSettlementCount = Number(entry.smallSettlementCount);
  }
  if (Number.isFinite(Number(entry.unitSpeedSlider))) {
    record.unitSpeedSlider = Number(entry.unitSpeedSlider);
  }
  scores.push(record);
  scores.sort(sortHighScores);
  persistHighScores(scores.slice(0, 10));
}

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.min(max, Math.max(min, Math.trunc(num)));
  return clamped;
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function advancedSliderScoreFactor(value, min, defaultVal, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  if (num <= defaultVal) {
    const span = defaultVal - min;
    if (span <= 0) return 1;
    const t = (defaultVal - clampNumber(num, min, defaultVal, defaultVal)) / span;
    return clampNumber(1 + 0.1 * t, 0.9, 1.1, 1);
  }
  const span = max - defaultVal;
  if (span <= 0) return 1;
  const t = (clampNumber(num, defaultVal, max, defaultVal) - defaultVal) / span;
  return clampNumber(1 - 0.1 * t, 0.9, 1.1, 1);
}

function computeRunScore(entry = {}) {
  const difficultyKey = DIFFICULTY_PRESETS[entry.difficultyKey] ? entry.difficultyKey : "medium";
  const difficultyFactor = { low: 0.5, medium: 1, high: 1.5 }[difficultyKey] || 1;
  const durationMs = Math.max(1, Number(entry.durationMs) || 0);
  const ticksElapsed = Math.floor(durationMs / LIVE_SCORE_TICK_MS);
  const settlementFactor = entry.smallSettlementCount == null
    ? 1
    : advancedSliderScoreFactor(
      entry.smallSettlementCount,
      ADVANCED_SETTLEMENT_MIN,
      ADVANCED_SETTLEMENT_DEFAULT,
      ADVANCED_SETTLEMENT_MAX
    );
  const speedFactor = entry.unitSpeedSlider == null
    ? 1
    : advancedSliderScoreFactor(
      entry.unitSpeedSlider,
      ADVANCED_SPEED_SLIDER_MIN,
      ADVANCED_SPEED_SLIDER_DEFAULT,
      ADVANCED_SPEED_SLIDER_MAX
    );
  const turnsTaken = Math.max(0, Number(entry.turnsTaken) || 0);
  const raw = Math.round(10000 * difficultyFactor * settlementFactor * speedFactor);
  const totalPenalty = turnsTaken * PER_TURN_SCORE_PENALTY + ticksElapsed * PER_TICK_SCORE_PENALTY;
  const linearScore = raw - totalPenalty;
  let scoreBeforeBonus;
  if (linearScore >= SCORE_SMOOTHING_THRESHOLD) {
    scoreBeforeBonus = linearScore;
  } else {
    // Below the threshold the same combined penalty (turns + ticks) feeds an
    // exponential decay toward zero. Anchored so the curve has slope -1 per
    // penalty unit at the crossing — no visible kink at the handoff, and any
    // increase in turns/ticks still drops the score, just gently.
    const excessPenalty = totalPenalty - (raw - SCORE_SMOOTHING_THRESHOLD);
    scoreBeforeBonus = SCORE_SMOOTHING_THRESHOLD * Math.exp(-excessPenalty / SCORE_SMOOTHING_THRESHOLD);
  }
  const base = Math.max(1, Math.round(scoreBeforeBonus));
  return base + (entry.hardcore ? HARDCORE_SCORE_BONUS : 0);
}

// Set while the Menu window is open (see isMenuPauseActive).
let menuPauseStartedAt = null;

// The run clock (which feeds the time penalty in the score) stops while the Menu is
// open and while the onboarding tour is showing. Reasons are tracked together so two
// overlapping pauses are only credited once.
const runClockPauseReasons = new Set();
let runClockPausedAt = null;

function pauseRunClock(reason) {
  if (!runClockPauseReasons.size) runClockPausedAt = Date.now();
  runClockPauseReasons.add(reason);
}

function resumeRunClock(reason) {
  if (!runClockPauseReasons.delete(reason)) return;
  if (runClockPauseReasons.size) return;
  const state = getGlobalGameState();
  if (state && Number.isFinite(state.runStartedAt) && Number.isFinite(runClockPausedAt)) {
    state.runStartedAt += Math.max(0, Date.now() - runClockPausedAt);
  }
  runClockPausedAt = null;
  if (state) refreshLiveScoreHud(state, { animate: false });
}

// For when the game state is replaced (load): the paused time belonged to the old run.
function discardRunClockPauses() {
  runClockPauseReasons.clear();
  runClockPausedAt = null;
}

function getRunElapsedMs(state) {
  if (!state) return 0;
  const startedAt = Number(state.runStartedAt) || Date.now();
  const inProgressPause = Number.isFinite(runClockPausedAt)
    ? Math.max(0, Date.now() - runClockPausedAt)
    : 0;
  return Math.max(0, Date.now() - startedAt - inProgressPause);
}

function getLiveRunScore(state) {
  if (!state) return 0;
  return computeRunScore({
    difficultyKey: state.difficultyKey,
    durationMs: getRunElapsedMs(state),
    smallSettlementCount: state.advancedDifficulty?.smallSettlementCount,
    unitSpeedSlider: state.advancedDifficulty?.unitSpeedSlider,
    hardcore: state.hardcore,
    turnsTaken: Math.max(0, (state.turn || 1) - 1),
  });
}

function formatRunDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (val) => `${val}`.padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function formatDifficultyKey(key) {
  if (key === "high") return "High";
  if (key === "low") return "Low";
  return "Medium";
}

function sanitizeResources(raw) {
  const safe = {};
  if (!raw || typeof raw !== "object") {
    RESOURCE_KEYS.forEach((key) => { safe[key] = 0; });
    return safe;
  }
  RESOURCE_KEYS.forEach((key) => {
    safe[key] = clampInt(raw[key], 0, 1e9, 0);
  });
  return safe;
}

function sanitizeVisibility(raw) {
  if (!raw || typeof raw !== "object") return null;
  const width = clampInt(raw.width, 1, 5000, 0);
  const height = clampInt(raw.height, 1, 5000, 0);
  if (!width || !height) return null;
  const total = width * height;
  return {
    width,
    height,
    visible: Array.isArray(raw.visible) ? raw.visible.slice(0, total) : [],
    explored: Array.isArray(raw.explored) ? raw.explored.slice(0, total) : [],
  };
}

function sanitizeNodeSnapshot(raw) {
  if (!raw || typeof raw !== "object" || !raw.id) return null;
  return {
    id: raw.id,
    owner: typeof raw.owner === "string" ? raw.owner : undefined,
    hasSolar: !!raw.hasSolar,
    conquestAttempted: !!raw.conquestAttempted,
    defense: clampInt(raw.defense, 0, 999, 0),
    yields: raw.yields && typeof raw.yields === "object" ? sanitizeResources(raw.yields) : null,
    shopOffers: Array.isArray(raw.shopOffers) ? deepClone(raw.shopOffers) : null,
    shopPool: raw.shopPool && typeof raw.shopPool === "object" ? sanitizeResources(raw.shopPool) : null,
    lastKnownOwner: typeof raw.lastKnownOwner === "string" ? raw.lastKnownOwner : null,
  };
}

function sanitizeSmallSettlementSnapshot(raw) {
  if (!raw || typeof raw !== "object" || !raw.id) return null;
  const pos = raw.pos && typeof raw.pos === "object"
    ? {
      x: clampNumber(raw.pos.x, 0, 100, 0),
      y: clampNumber(raw.pos.y, 0, 100, 0),
    }
    : null;
  return {
    id: raw.id,
    frame: raw.frame,
    pos,
    name: typeof raw.name === "string" ? raw.name : raw.id,
    owner: typeof raw.owner === "string" ? raw.owner : "neutral",
    yields: raw.yields && typeof raw.yields === "object" ? sanitizeResources(raw.yields) : null,
    joinedFaction: !!raw.joinedFaction,
    lastKnownOwner: typeof raw.lastKnownOwner === "string" ? raw.lastKnownOwner : null,
  };
}

function sanitizeSaveSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const safe = { ...snapshot };
  safe.turn = clampInt(snapshot.turn, 1, 100000, 1);
  safe.baseLevel = clampInt(snapshot.baseLevel, 1, 999, 1);
  safe.maxUnits = clampInt(snapshot.maxUnits, 1, 999, DEFAULT_MAX_UNITS);
  safe.baseDifficulty = clampInt(snapshot.baseDifficulty, -50, 50, DEFAULT_ROLL_DIFFICULTY);
  safe.difficulty = clampInt(snapshot.difficulty, -50, 50, DEFAULT_ROLL_DIFFICULTY);
  safe.difficultyStage = clampInt(snapshot.difficultyStage, 0, 999, 0);
  safe.difficultyKey = typeof snapshot.difficultyKey === "string" ? snapshot.difficultyKey : "medium";
  safe.advancedDifficulty = clampAdvancedDifficultySettings(snapshot.advancedDifficulty);
  safe.hardcore = !!snapshot.hardcore;
  // Prefer elapsedRunMs (offline-safe) over a raw wall-clock runStartedAt so the
  // live score and mission-complete score don't get penalized for time spent
  // with the save closed.
  if (Number.isFinite(snapshot.elapsedRunMs)) {
    safe.runStartedAt = Date.now() - Math.max(0, Math.trunc(snapshot.elapsedRunMs));
  } else {
    safe.runStartedAt = Number.isFinite(snapshot.runStartedAt) ? snapshot.runStartedAt : Date.now();
  }
  safe.globalRollBonus = clampInt(snapshot.globalRollBonus, -50, 50, 0);
  safe.resources = sanitizeResources(snapshot.resources);
  safe.visibility = sanitizeVisibility(snapshot.visibility);
  safe.rangerUnits = Array.isArray(snapshot.rangerUnits) ? snapshot.rangerUnits.map((unit) => ({
    ...unit,
    inventory: { ...((unit && unit.inventory) || {}) },
  })) : [];
  safe.knownNodes = Array.isArray(snapshot.knownNodes) ? snapshot.knownNodes : [];
  safe.visibleNodes = Array.isArray(snapshot.visibleNodes) ? snapshot.visibleNodes : [];
  safe.purchasedUpgrades = Array.isArray(snapshot.purchasedUpgrades) ? snapshot.purchasedUpgrades : [];
  safe.tempUpkeepEffects = {
    food: clampInt(snapshot.tempUpkeepEffects?.food, 0, 99, 0),
    water: clampInt(snapshot.tempUpkeepEffects?.water, 0, 99, 0),
  };
  safe.smallSettlements = Array.isArray(snapshot.smallSettlements)
    ? snapshot.smallSettlements.map(sanitizeSmallSettlementSnapshot).filter(Boolean)
    : [];
  safe.nodes = Array.isArray(snapshot.nodes)
    ? snapshot.nodes.map(sanitizeNodeSnapshot).filter(Boolean)
    : [];
  safe.dams = Array.isArray(snapshot.dams) ? snapshot.dams.map((dam) => deepClone(dam)).filter(Boolean) : [];
  safe.camera = sanitizeCamera(snapshot.camera);
  safe.missionCompleteRecorded = !!snapshot.missionCompleteRecorded;
  safe.homeBaseVisited = !!snapshot.homeBaseVisited;
  return safe;
}

function sanitizeCamera(raw) {
  if (!raw || typeof raw !== "object") return null;
  const scrollX = Number(raw.scrollX);
  const scrollY = Number(raw.scrollY);
  const zoom = Number(raw.zoom);
  if (!Number.isFinite(scrollX) || !Number.isFinite(scrollY) || !Number.isFinite(zoom)) return null;
  return {
    scrollX,
    scrollY,
    zoom: Math.min(10, Math.max(0.05, zoom)),
  };
}

function captureCameraState() {
  const cam = mapSceneInstance?.cameras?.main;
  if (!cam) return null;
  return {
    scrollX: cam.scrollX,
    scrollY: cam.scrollY,
    zoom: cam.zoom,
  };
}

function applySavedCameraState(saved, scene = mapSceneInstance) {
  const cam = scene?.cameras?.main;
  if (!cam || !saved) return false;
  if (typeof cam.setZoom === "function") {
    cam.setZoom(saved.zoom);
  } else {
    cam.zoom = saved.zoom;
  }
  if (scene?.worldWidth && scene?.worldHeight) {
    const maxX = Math.max(0, scene.worldWidth - cam.width / cam.zoom);
    const maxY = Math.max(0, scene.worldHeight - cam.height / cam.zoom);
    cam.scrollX = Math.max(0, Math.min(maxX, saved.scrollX));
    cam.scrollY = Math.max(0, Math.min(maxY, saved.scrollY));
  } else {
    cam.scrollX = saved.scrollX;
    cam.scrollY = saved.scrollY;
  }
  scene.userAdjustedCamera = true;
  return true;
}

function buildSaveSnapshot(state) {
  if (!state) return null;
  const visibility = state.visibility
    ? {
      width: state.visibility.width,
      height: state.visibility.height,
      visible: Array.from(state.visibility.visible || []),
      explored: Array.from(state.visibility.explored || []),
    }
    : null;
  const nodes = (state.nodes || []).map((node) => ({
    id: node.id,
    owner: node.owner,
    hasSolar: node.hasSolar,
    conquestAttempted: !!node.conquestAttempted,
    defense: node.defense,
    yields: node.yields ? deepClone(node.yields) : null,
    shopOffers: Array.isArray(node.shopOffers) ? deepClone(node.shopOffers) : null,
    shopPool: node.shopPool ? deepClone(node.shopPool) : null,
    lastKnownOwner: node.lastKnownOwner || null,
  }));
  const dams = (state.dams || []).map((dam) => ({ ...dam }));
  return {
    version: 1,
    savedAt: Date.now(),
    turn: state.turn,
    selectedNode: state.selectedNode,
    squad: state.squad ? { ...state.squad } : null,
    activeUnitId: state.activeUnitId,
    squadSelected: state.squadSelected,
    squadPaneClosed: state.squadPaneClosed,
    squadVisionSource: state.squadVisionSource,
    rangerUnits: (state.rangerUnits || []).map((unit) => ({ ...unit, inventory: { ...(unit.inventory || {}) } })),
    rangerNameCounter: state.rangerNameCounter,
    resources: { ...(state.resources?.resources || {}) },
    turnLosses: state.turnLosses || {},
    purchasedUpgrades: Array.from(state.purchasedUpgrades || []),
    tempUpkeepEffects: deepClone(state.tempUpkeepEffects || { food: 0, water: 0 }),
    globalRollBonus: state.globalRollBonus || 0,
    baseDifficulty: state.baseDifficulty,
    difficulty: state.difficulty,
    difficultyStage: state.difficultyStage,
    difficultyKey: state.difficultyKey,
    advancedDifficulty: clampAdvancedDifficultySettings(state.advancedDifficulty),
    hardcore: !!state.hardcore,
    gameOver: state.gameOver,
    gameOverReason: state.gameOverReason,
    missionComplete: state.missionComplete,
    missionCompleteRecorded: state.missionCompleteRecorded,
    baseLevel: state.baseLevel,
    maxUnits: state.maxUnits,
    settlementSceneSuppressedId: state.settlementSceneSuppressedId || null,
    largeSettlementSceneSuppressedId: state.largeSettlementSceneSuppressedId || null,
    smallSettlements: (state.smallSettlements || []).map((s) => ({ ...s })),
    visibility,
    knownNodes: Array.from(state.knownNodes || []),
    visibleNodes: Array.from(state.visibleNodes || []),
    fogEnabled: state.fogEnabled,
    camera: captureCameraState(),
    nodes,
    dams,
    forceFullApNextTurn: state.forceFullApNextTurn,
    fastTravelTooltipSeen: state.fastTravelTooltipSeen,
    hasStartedTurns: state.hasStartedTurns,
    runStartedAt: state.runStartedAt,
    elapsedRunMs: getRunElapsedMs(state),
    homeBaseVisited: !!state.homeBaseVisited,
  };
}

function applySaveSnapshot(snapshot) {
  const safe = sanitizeSaveSnapshot(snapshot);
  if (!safe) return null;
  const state = new GameState({
    initialResources: safe.resources || INITIAL_RESOURCES,
    baseRollDifficulty: Number.isFinite(safe.baseDifficulty) ? safe.baseDifficulty : DEFAULT_ROLL_DIFFICULTY,
    difficultyKey: safe.difficultyKey || "medium",
    advancedDifficulty: safe.advancedDifficulty,
    runStartedAt: Number.isFinite(safe.runStartedAt) ? safe.runStartedAt : Date.now(),
  });
  state.hardcore = !!safe.hardcore;
  state.logger = new Logger(document.getElementById("logEntries"));
  state.turn = safe.turn || 1;
  state.selectedNode = safe.selectedNode || null;
  state.squad = Object.assign(new RangerSquad("home"), safe.squad || {});
  state.activeUnitId = safe.activeUnitId || null;
  state.squadSelected = !!safe.squadSelected;
  state.squadPaneClosed = !!safe.squadPaneClosed;
  state.squadVisionSource = safe.squadVisionSource || null;
  state.rangerUnits = Array.isArray(safe.rangerUnits) ? safe.rangerUnits.map((unit) => ({
    ...unit,
    inventory: { ...(unit.inventory || {}) },
  })) : [];
  state.rangerNameCounter = Number.isFinite(safe.rangerNameCounter)
    ? safe.rangerNameCounter
    : state.rangerUnits.length;
  state.rangerUnits.forEach((unit) => {
    ensureRangerHasResourceTypes(unit);
    ensureUnitTravelState(state, unit);
    state.clampUnitInventory(unit);
    // A march in progress when the save was made must not resume on its own after load
    // (a WASD march targets the map edge and only stops on key-up).
    unit.isMoving = false;
    unit.moveTargetPct = null;
    unit.keyboardMarching = false;
  });
  state.resources = new ResourceManager(safe.resources || INITIAL_RESOURCES);
  state.turnLosses = safe.turnLosses || {};
  state.purchasedUpgrades = new Set(safe.purchasedUpgrades || []);
  state.tempUpkeepEffects = {
    food: Math.max(0, Math.trunc(safe.tempUpkeepEffects?.food || 0)),
    water: Math.max(0, Math.trunc(safe.tempUpkeepEffects?.water || 0)),
  };
  state.globalRollBonus = safe.globalRollBonus || 0;
  state.baseDifficulty = Number.isFinite(safe.baseDifficulty) ? safe.baseDifficulty : state.baseDifficulty;
  state.difficulty = Number.isFinite(safe.difficulty) ? safe.difficulty : state.difficulty;
  state.difficultyStage = safe.difficultyStage || 0;
  state.advancedDifficulty = clampAdvancedDifficultySettings(safe.advancedDifficulty);
  applyAdvancedDifficultySettings(state.advancedDifficulty);
  state.gameOver = !!safe.gameOver;
  state.gameOverReason = safe.gameOverReason || null;
  state.missionComplete = !!safe.missionComplete;
  state.missionCompleteRecorded = !!safe.missionCompleteRecorded;
  state.baseLevel = safe.baseLevel || 1;
  // Saves from before base level 3 granted its unit slot carry the old cap of 3.
  state.maxUnits = Math.max(safe.maxUnits || state.maxUnits, maxUnitsForBaseLevel(state.baseLevel));
  state.settlementSceneSuppressedId = typeof safe.settlementSceneSuppressedId === "string"
    ? safe.settlementSceneSuppressedId
    : null;
  state.largeSettlementSceneSuppressedId = typeof safe.largeSettlementSceneSuppressedId === "string"
    ? safe.largeSettlementSceneSuppressedId
    : null;
  state.smallSettlements = Array.isArray(safe.smallSettlements)
    ? safe.smallSettlements.map((entry) => new SmallSettlement(entry))
    : [];
  state.fogEnabled = typeof safe.fogEnabled === "boolean" ? safe.fogEnabled : state.fogEnabled;
  state.homeBaseVisited = !!safe.homeBaseVisited;
  if (Array.isArray(safe.nodes)) {
    const nodeOverrides = new Map(safe.nodes.map((node) => [node.id, node]));
    for (const node of state.nodes || []) {
      const override = nodeOverrides.get(node.id);
      if (override) {
        if (typeof override.owner !== "undefined") node.owner = override.owner;
        if (typeof override.hasSolar !== "undefined") node.hasSolar = override.hasSolar;
        if (typeof override.conquestAttempted !== "undefined") node.conquestAttempted = !!override.conquestAttempted;
        if (typeof override.defense !== "undefined") node.defense = override.defense;
        if (Object.prototype.hasOwnProperty.call(override, "yields")) node.yields = override.yields ? deepClone(override.yields) : null;
        if (Object.prototype.hasOwnProperty.call(override, "shopOffers")) node.shopOffers = override.shopOffers ? deepClone(override.shopOffers) : null;
        if (Object.prototype.hasOwnProperty.call(override, "shopPool")) node.shopPool = override.shopPool ? deepClone(override.shopPool) : null;
        if (typeof override.lastKnownOwner !== "undefined") node.lastKnownOwner = override.lastKnownOwner || null;
      }
    }
  }
  if (Array.isArray(safe.dams)) {
    const damOverrides = new Map(safe.dams.map((dam) => [dam.id, dam]));
    state.dams = (state.dams || []).map((dam) => {
      const override = damOverrides.get(dam.id);
      return override ? { ...dam, ...override } : dam;
    });
  }
  if (safe.visibility && safe.visibility.width && safe.visibility.height) {
    const vis = createVisibilityGrid(safe.visibility.width, safe.visibility.height);
    vis.visible = Uint8Array.from(safe.visibility.visible || []);
    vis.explored = Uint8Array.from(safe.visibility.explored || []);
    vis.dirty = true;
    state.visibility = vis;
  }
  state.knownNodes = new Set(safe.knownNodes || []);
  state.visibleNodes = new Set(safe.visibleNodes || []);
  state.forceFullApNextTurn = !!safe.forceFullApNextTurn;
  state.fastTravelTooltipSeen = !!safe.fastTravelTooltipSeen;
  state.hasStartedTurns = !!safe.hasStartedTurns;
  state.savedCamera = safe.camera || null;
  state.refreshVisibility();
  if (state.squad && !state.squad.currentUnitId) {
    state.squad.currentUnitId = state.activeUnitId || state.rangerUnits[0]?.id || null;
  }
  return state;
}

function formatSaveMetaLabel(meta, slotNumber) {
  if (!meta) return `Slot ${slotNumber}`;
  const turn = Number.isFinite(meta.turn) ? `Turn ${meta.turn}` : "Turn ?";
  const stamp = meta.timestamp || "";
  return `Slot ${slotNumber} - ${turn}${stamp ? ` - ${stamp}` : ""}`;
}

function isTransientSceneActive() {
  return !!(encounterOverlayState.active || isAnySceneOverlayActive());
}

function canSaveGame(state = getGlobalGameState()) {
  if (!state || isDemoSaveDisabled()) return false;
  if (state.hardcore) return false;
  if (state.gameOver || state.missionComplete) return false;
  if (isTransientSceneActive()) return false;
  if (isEncounterTransitionActive()) return false;
  return true;
}

function replaceGameStateData(target, source) {
  if (!target || !source || target === source) return source || target || null;
  Object.keys(target).forEach((key) => {
    delete target[key];
  });
  Object.assign(target, source);
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
  return target;
}

function resetMapSceneStateForLoad(scene, state) {
  if (!scene) return;
  scene.setGameState(state);
  scene.smallSettlements = Array.isArray(state?.smallSettlements) ? state.smallSettlements : [];
  scene.smallSettlementsPlaced = !!scene.smallSettlements.length;
  if (scene.smallSettlementVisuals?.forEach) {
    scene.smallSettlementVisuals.forEach((visual) => visual?.container?.destroy?.(true));
    scene.smallSettlementVisuals.clear();
  }
  scene.dams = [];
  if (scene.damVisuals?.forEach) {
    scene.damVisuals.forEach((visual) => visual?.container?.destroy?.(true));
    scene.damVisuals.clear();
  }
  scene.fogNeedsRedraw = true;
  scene.lastUnitClick = null;
}

function updateTurnLabel(state) {
  const label = document.getElementById("turnLabel");
  if (!label || !state) return;
  const turn = Number.isFinite(state.turn) ? state.turn : 1;
  label.textContent = `Turn ${turn}`;
}

function updateSaveDrawerUI(state) {
  const data = loadSaveData();
  const canSaveNow = canSaveGame(state);
  const quicksaveBtn = document.getElementById("quickSaveBtn");
  const slotNum = Math.max(1, Math.min(SAVE_SLOT_COUNT, Math.trunc(data.lastSlot || 1)));
  if (quicksaveBtn) {
    quicksaveBtn.textContent = `(Slot ${slotNum}) [F8]`;
    quicksaveBtn.disabled = !canSaveNow;
    quicksaveBtn.title = canSaveNow ? "" : "Saving is disabled while a transient scene is active.";
  }
  const saveButtons = document.querySelectorAll(".save-slot-btn[data-save-slot]");
  saveButtons.forEach((btn) => {
    const slot = Number(btn.dataset.saveSlot);
    btn.textContent = formatSaveMetaLabel(data.meta[slot - 1], slot);
    btn.disabled = !canSaveNow;
    btn.title = canSaveNow ? "" : "Saving is disabled while a transient scene is active.";
  });
  const loadButtons = document.querySelectorAll(".save-load-btn[data-load-slot]");
  loadButtons.forEach((btn) => {
    const slot = Number(btn.dataset.loadSlot);
    const meta = data.meta[slot - 1];
    btn.textContent = formatSaveMetaLabel(meta, slot);
    btn.disabled = !data.slots[slot - 1];
  });
}

function updateSaveWidgetVisibility(state = getGlobalGameState()) {
  const widget = document.getElementById("saveWidget");
  if (!widget) return;
  widget.classList.toggle("is-hardcore-locked", !!state?.hardcore);
}

function setupSaveWidget(state) {
  updateSaveWidgetVisibility(state);
  if (isDemoSaveDisabled()) return;
  const widget = document.getElementById("saveWidget");
  const toggle = document.getElementById("saveWidgetToggle");
  const drawer = document.getElementById("saveDrawer");
  const resetBtn = document.getElementById("resetSavesBtn");
  if (!widget || !toggle || !drawer) return;
  if (widget.dataset.bound === "true") {
    updateSaveDrawerUI(getGlobalGameState() || state);
    return;
  }
  widget.dataset.bound = "true";
  let closeTimer = null;
  let statusTimer = null;
  let statusEl = drawer.querySelector(".save-drawer-status");
  let resetArmed = false;
  const resetIconLocked = "M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z";
  const resetIconUnlocked = "M17 10V7a3 3 0 0 0-6 0h-2a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h11Z";

  const setResetLockState = (locked) => {
    resetArmed = !locked;
    if (!resetBtn) return;
    resetBtn.dataset.locked = locked ? "true" : "false";
    resetBtn.classList.toggle("unlocked", !locked);
    const path = resetBtn.querySelector(".reset-lock-icon path");
    if (path) {
      path.setAttribute("d", locked ? resetIconLocked : resetIconUnlocked);
    }
  };

  const ensureStatusEl = () => {
    if (statusEl) return statusEl;
    statusEl = document.createElement("div");
    statusEl.className = "save-drawer-status";
    drawer.appendChild(statusEl);
    return statusEl;
  };

  const announceStatus = (message) => {
    const el = ensureStatusEl();
    if (!el) return;
    if (statusTimer) clearTimeout(statusTimer);
    el.textContent = message || "";
    statusTimer = setTimeout(() => {
      el.textContent = "";
      statusTimer = null;
    }, 2200);
  };

  const setOpenState = (open) => {
    widget.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(!!open));
    drawer.setAttribute("aria-hidden", String(!open));
    updateSaveDrawerUI(getGlobalGameState() || state);
    if (open) setResetLockState(true);
  };

  const scheduleClose = (delayMs = 5000) => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      setOpenState(false);
      closeTimer = null;
    }, delayMs);
  };

  const cancelClose = () => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
  };

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpenState(!widget.classList.contains("open"));
  });

  toggle.addEventListener("mouseenter", () => {
    setOpenState(true);
    scheduleClose(5000);
  });

  drawer.addEventListener("mouseenter", () => {
    setOpenState(true);
    cancelClose();
  });

  drawer.addEventListener("mouseleave", () => {
    scheduleClose(5000);
  });

  document.addEventListener("click", (event) => {
    if (!widget.classList.contains("open")) return;
    if (!widget.contains(event.target)) setOpenState(false);
  });

  const handleSaveToSlot = (slot, options = {}) => {
    const { confirmOverwrite = true } = options;
    const currentState = getGlobalGameState() || state;
    if (!canSaveGame(currentState)) {
      announceStatus("Cannot save while a transient scene is active.");
      updateSaveDrawerUI(currentState);
      return;
    }
    const data = loadSaveData();
    const idx = slot - 1;
    const snapshot = buildSaveSnapshot(currentState);
    if (!snapshot) return;
    const existing = data.slots[idx];
    if (existing && confirmOverwrite) {
      const confirmed = window.confirm(`Overwrite Slot ${slot}?`);
      if (!confirmed) return;
    }
    data.slots[idx] = snapshot;
    data.meta[idx] = {
      turn: snapshot.turn,
      baseLevel: snapshot.baseLevel,
      timestamp: new Date(snapshot.savedAt).toLocaleString(),
    };
    data.lastSlot = slot;
    try {
      persistSaveData(data);
    } catch {
      announceStatus(`Save failed for Slot ${slot}.`);
      currentState.logger?.log(`Save failed for Slot ${slot}.`);
      updateSaveDrawerUI(currentState);
      return;
    }
    updateSaveDrawerUI(currentState);
    currentState.logger?.log(`Saved game to Slot ${slot}.`);
  };

  const handleLoadFromSlot = (slot) => {
    // The pending turn advance mutates the live state object in place, so a load during
    // the end-turn transition (or a restart) would be advanced a turn straight away.
    if (getGlobalGameState()?.endTurnInFlight || isMapEndTurnTransitionActive() || sessionRestartPromise) {
      announceStatus("Cannot load right now. Try again in a moment.");
      return null;
    }
    const data = loadSaveData();
    const idx = slot - 1;
    const snapshot = data.slots[idx];
    if (!snapshot) {
      announceStatus(`Slot ${slot} is empty.`);
      return false;
    }
    const loadedState = applySaveSnapshot(snapshot);
    if (!loadedState) {
      announceStatus(`Slot ${slot} could not be loaded.`);
      return false;
    }
    data.lastSlot = slot;
    try {
      persistSaveData(data);
    } catch {
      // Keep loading even if metadata refresh fails.
    }
    const liveState = getGlobalGameState();
    const activeState = liveState ? replaceGameStateData(liveState, loadedState) : loadedState;
    const restoredUiState = {
      selectedNode: Object.prototype.hasOwnProperty.call(snapshot, "selectedNode") ? snapshot.selectedNode : activeState.selectedNode,
      squadSelected: !!snapshot?.squadSelected,
      squadPaneClosed: !!snapshot?.squadPaneClosed,
    };
    setGlobalGameState(activeState);
    resetMapSceneStateForLoad(mapSceneInstance, activeState);
    rangerPaneScene?.setGameState(activeState);
    teardownScenesForStateSwap();
    // An open Menu would otherwise credit its paused time to the loaded run.
    menuPauseStartedAt = null;
    discardRunClockPauses();
    closeMapPanes(activeState, { preserveState: true });
    activeState.selectedNode = restoredUiState.selectedNode;
    activeState.squadSelected = restoredUiState.squadSelected;
    activeState.squadPaneClosed = restoredUiState.squadPaneClosed;
    renderResources(activeState);
    renderMap(activeState);
    updateTownWindow(activeState);
    updateSquadWindow(activeState);
    activeState.selectedNode = restoredUiState.selectedNode;
    activeState.squadSelected = restoredUiState.squadSelected;
    activeState.squadPaneClosed = restoredUiState.squadPaneClosed;
    if (restoredUiState.squadSelected && !restoredUiState.squadPaneClosed) {
      document.getElementById("squadWindow")?.classList.remove("hidden");
    }
    updateRegionModal(activeState, null);
    refreshRangerPaneScene(activeState, { forceRebuild: true });
    updateTurnLabel(activeState);
    updateMusicEnablement();
    applySoundSettingsToDiceScenes(true);
    if (activeState.savedCamera) {
      applySavedCameraState(activeState.savedCamera);
    }
    activeState.logger?.log(`Loaded game from Slot ${slot}.`);
    updateSaveDrawerUI(activeState);
    updateSaveWidgetVisibility(activeState);
    refreshLiveScoreHud(activeState, { animate: false });
    refreshEndTurnButtonAvailability();
    announceStatus(`Loaded Slot ${slot}.`);
    // Saves made on an end screen by older versions: show that screen again.
    if (activeState.gameOver) {
      showGameOverOverlay(activeState.gameOverReason);
    } else if (activeState.missionComplete) {
      showMissionCompleteOverlay();
    }
    return true;
  };

  const quicksaveBtn = document.getElementById("quickSaveBtn");
  if (quicksaveBtn) {
    quicksaveBtn.addEventListener("click", () => {
      const data = loadSaveData();
      const slot = Math.max(1, Math.min(SAVE_SLOT_COUNT, Math.trunc(data.lastSlot || 1)));
      handleSaveToSlot(slot, { confirmOverwrite: false });
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "F8") return;
    if (event.repeat) return;
    if (!canSaveGame()) return;
    const data = loadSaveData();
    const slot = Math.max(1, Math.min(SAVE_SLOT_COUNT, Math.trunc(data.lastSlot || 1)));
    handleSaveToSlot(slot, { confirmOverwrite: false });
  });

  const saveButtons = document.querySelectorAll(".save-slot-btn[data-save-slot]");
  saveButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const slot = Number(btn.dataset.saveSlot);
      if (!slot) return;
      handleSaveToSlot(slot);
    });
  });

  const loadButtons = document.querySelectorAll(".save-load-btn[data-load-slot]");
  loadButtons.forEach((btn) => {
    const onLoadClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const slot = Number(btn.dataset.loadSlot);
      if (!slot) return;
      const loaded = handleLoadFromSlot(slot);
      if (loaded === false) {
        (getGlobalGameState() || state)?.logger?.log(`No save data found in Slot ${slot}.`);
      }
    };
    btn.addEventListener("click", onLoadClick);
  });

  if (resetBtn) {
    setResetLockState(true);
    resetBtn.addEventListener("click", () => {
      if (!resetArmed) {
        setResetLockState(false);
        return;
      }
      persistSaveData(defaultSaveData());
      updateSaveDrawerUI(state);
      announceStatus("Saved games cleared.");
      setResetLockState(true);
    });
  }

  updateSaveDrawerUI(state);
}

let MUSIC_TRACKS = [];
const MUSIC_VOLUME = readStoredMusicVolume() ?? DEFAULT_MUSIC_VOLUME;

const musicState = {
  audio: null,
  order: [],
  idx: -1,
  playing: false,
  userPaused: false,
  volume: MUSIC_VOLUME,
  enabled: true,
  preloaded: false,
  preloadedFirst: false,
  preloadedClips: [],
  firstTrackListenerAttached: false,
  currentTrack: null,
  userSeekingProgress: false,
};

if (!isReleaseMode() && typeof window !== "undefined") {
  window.musicState = musicState;
}

function parseTrackDisplayName(filename) {
  if (typeof filename !== "string") return "";
  const trimmed = filename.trim();
  if (!trimmed) return "";
  const base = trimmed.replace(/\.(mp3|wav|ogg)$/i, "");
  let title;
  if (base.includes(" - ")) {
    const segments = base.split(" - ").map((s) => s.trim()).filter(Boolean);
    title = segments.length ? segments[segments.length - 1] : base;
  } else {
    // No " - " separator: find the last track-number-like segment and take everything after.
    const matches = [...base.matchAll(/[-_\s](\d{1,3})[-_\s]+([^]+)$/g)];
    title = matches.length ? matches[matches.length - 1][2] : base;
  }
  title = title.replace(/^\d{1,3}\s*[-.]?\s*/, "").trim();
  // If the result is entirely lowercase (a user-renamed all-lowercase-hyphenated style),
  // convert hyphens/underscores to spaces and title-case each word.
  if (title && title === title.toLowerCase()) {
    title = title
      .replace(/[-_]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1))
      .join(" ");
  }
  return title || base;
}

function refreshMusicTrackLabel() {
  if (typeof document === "undefined") return;
  const el = document.getElementById("musicTrackName");
  if (!el) return;
  const track = musicState.currentTrack || "";
  const display = parseTrackDisplayName(track) || "—";
  let inner = el.querySelector(".music-track-name__inner");
  if (!inner) {
    el.textContent = "";
    inner = document.createElement("span");
    inner.className = "music-track-name__inner";
    el.appendChild(inner);
  }
  if (inner.textContent !== display) {
    inner.textContent = display;
  }
  el.setAttribute("title", track || "");
  // Recompute marquee after layout settles.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => updateMusicTrackMarquee(el, inner));
  } else {
    updateMusicTrackMarquee(el, inner);
  }
}

function updateMusicTrackMarquee(el, inner) {
  if (!el || !inner) return;
  const outer = el.clientWidth;
  const innerW = inner.scrollWidth;
  const overflow = innerW - outer;
  if (overflow > 2) {
    el.style.setProperty("--marquee-distance", `-${overflow}px`);
    el.classList.add("is-marquee");
  } else {
    el.style.removeProperty("--marquee-distance");
    el.classList.remove("is-marquee");
  }
}

function formatTrackTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function refreshMusicProgressUI() {
  if (typeof document === "undefined") return;
  const audio = musicState.audio;
  const slider = document.getElementById("musicProgressSlider");
  const currentEl = document.getElementById("musicTimeCurrent");
  const totalEl = document.getElementById("musicTimeTotal");
  const duration = Number.isFinite(audio?.duration) ? audio.duration : 0;
  const current = Number.isFinite(audio?.currentTime) ? audio.currentTime : 0;
  if (slider) {
    if (duration > 0) {
      slider.max = String(duration);
      if (!musicState.userSeekingProgress) {
        slider.value = String(Math.min(current, duration));
      }
      slider.disabled = false;
    } else {
      slider.value = "0";
      slider.disabled = true;
    }
  }
  if (currentEl) currentEl.textContent = formatTrackTime(current);
  if (totalEl) totalEl.textContent = formatTrackTime(duration);
}

let musicListPromise = null;

function isValidMusicFile(name) {
  return typeof name === "string" && name.trim().length > 0 && /\.(mp3|wav)$/i.test(name.trim());
}

function loadMusicTrackList() {
  if (musicListPromise) return musicListPromise;
  musicListPromise = fetch("music/index.json")
    .then((res) => {
      if (!res.ok) throw new Error(`music index ${res.status}`);
      return res.json();
    })
    .then((payload) => {
      const tracks = Array.isArray(payload)
        ? payload
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((name) => isValidMusicFile(name))
        : [];
      MUSIC_TRACKS = tracks;
      musicState.order = [];
      musicState.idx = -1;
      musicState.preloaded = false;
      musicState.preloadedFirst = false;
      musicState.firstTrackListenerAttached = false;
      musicState.preloadedClips.length = 0;
      return tracks;
    })
    .catch((err) => {
      console.warn("Failed to load music index:", err);
      musicListPromise = null;
      MUSIC_TRACKS = [];
      musicState.order = [];
      musicState.idx = -1;
      musicState.preloaded = false;
      musicState.preloadedFirst = false;
      musicState.firstTrackListenerAttached = false;
      musicState.preloadedClips.length = 0;
      return [];
    });
  return musicListPromise;
}

function shuffleOrder(tracks = []) {
  const list = Array.isArray(tracks) ? tracks.slice() : [];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function pickNextTrack() {
  if (!MUSIC_TRACKS.length) return null;
  if (!musicState.order.length) {
    musicState.order = shuffleOrder(MUSIC_TRACKS);
    musicState.idx = 0;
    return musicState.order[0];
  }
  if (musicState.idx < 0) {
    musicState.idx = 0;
    return musicState.order[0];
  }
  musicState.idx += 1;
  if (musicState.idx >= musicState.order.length) {
    musicState.order = shuffleOrder(MUSIC_TRACKS);
    musicState.idx = 0;
  }
  return musicState.order[musicState.idx];
}

function pickPreviousTrack() {
  if (!MUSIC_TRACKS.length) return null;
  if (!musicState.order.length) {
    musicState.order = shuffleOrder(MUSIC_TRACKS);
    musicState.idx = musicState.order.length - 1;
    return musicState.order[musicState.idx] || null;
  }
  musicState.idx -= 1;
  if (musicState.idx < 0) {
    musicState.order = shuffleOrder(MUSIC_TRACKS);
    musicState.idx = musicState.order.length - 1;
  }
  return musicState.order[musicState.idx] || null;
}

// Bumped whenever a new source is requested, so a play() promise rejected because a
// newer track replaced it cannot mark that newer track as stopped.
let musicPlayRequestId = 0;

function ensureMusicAudio() {
  if (musicState.audio) return musicState.audio;
  const audio = new Audio();
  audio.loop = false;
  audio.preload = "auto";
  audio.addEventListener("ended", () => {
    musicState.playing = false;
    musicUiHooks.onPlayStateChange?.(false);
    if (musicState.enabled) {
      startMusic();
    }
  });
  audio.addEventListener("timeupdate", refreshMusicProgressUI);
  audio.addEventListener("loadedmetadata", refreshMusicProgressUI);
  audio.addEventListener("durationchange", refreshMusicProgressUI);
  audio.addEventListener("pause", persistMusicState);
  audio.addEventListener("play", persistMusicState);
  musicState.audio = audio;
  return audio;
}

function playTrack(track) {
  if (!track) return;
  const audio = ensureMusicAudio();
  const src = `music/${encodeURIComponent(track)}`;
  audio.src = src;
  audio.volume = musicState.volume;
  audio.currentTime = 0;
  musicState.playing = true;
  musicState.userPaused = false;
  musicState.currentTrack = track;
  refreshMusicTrackLabel();
  refreshMusicProgressUI();
  musicUiHooks.onPlayStateChange?.(true);
  persistMusicState();
  const requestId = ++musicPlayRequestId;
  const promise = audio.play();
  if (promise && typeof promise.catch === "function") {
    promise.catch(() => {
      if (requestId !== musicPlayRequestId) return;
      musicState.playing = false;
      musicUiHooks.onPlayStateChange?.(false);
    });
  }
}

function startMusic(trackOverride = null) {
  if (!musicState.enabled) return;
  // Honor a user's prior "pause" intent across init races and auto-restart
  // callbacks (e.g. the resume-from-storage path racing with
  // enableTitleScreenMusic, the recursive after-tracks-load callback below,
  // the preload `canplaythrough` listener, and the audio `ended` handler).
  // An explicit `trackOverride` indicates a user action (prev/next/playTrack
  // with a specific track) and is allowed to override.
  if (musicState.userPaused && !trackOverride) return;
  if (musicState.playing && !trackOverride) return;
  if (!trackOverride && musicState.audio && musicState.audio.src) {
    const audio = musicState.audio;
    if (audio.paused && !audio.ended) {
      musicState.playing = true;
      musicState.userPaused = false;
      musicUiHooks.onPlayStateChange?.(true);
      const requestId = musicPlayRequestId;
      const promise = audio.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {
          if (requestId !== musicPlayRequestId) return;
          musicState.playing = false;
          musicUiHooks.onPlayStateChange?.(false);
        });
      }
      return;
    }
  }
  if (!MUSIC_TRACKS.length) {
    loadMusicTrackList().then((tracks) => {
      if (!tracks.length) return;
      if (musicState.enabled && !musicState.playing) {
        startMusic();
      }
    });
    return;
  }
  const track = trackOverride || pickNextTrack();
  if (!track) return;
  playTrack(track);
}

function stopMusic() {
  const audio = musicState.audio;
  if (!audio) return;
  musicState.playing = false;
  musicState.userPaused = false;
  musicUiHooks.onPlayStateChange?.(false);
  audio.pause();
  audio.currentTime = 0;
}

function pauseMusic() {
  const audio = musicState.audio;
  if (!audio) return;
  musicState.playing = false;
  musicState.userPaused = true;
  musicUiHooks.onPlayStateChange?.(false);
  audio.pause();
}

function updateMusicEnablement() {
  // Music is always enabled now; the helper still exists as the resume / autoplay-unlock entry point.
  musicState.enabled = true;
  const enabled = true;
  if (enabled) {
    const hasPausedTrack = !!(musicState.audio?.src && musicState.audio.paused && !musicState.audio.ended);
    if (!MUSIC_TRACKS.length) {
      loadMusicTrackList().then((tracks) => {
        if (tracks.length && musicState.enabled && !musicState.playing && !musicState.userPaused) {
          startMusic();
        }
        preloadFirstMusicTrack();
      });
      return;
    }
    if (!musicState.preloadedFirst) {
      preloadFirstMusicTrack();
    }
    if (!musicState.playing && !musicState.userPaused && !hasPausedTrack) {
      startMusic();
    } else if (musicState.audio) {
      musicState.audio.volume = musicState.volume;
      if (musicState.audio.paused && !musicState.userPaused) {
        musicState.playing = true;
        musicUiHooks.onPlayStateChange?.(true);
        const requestId = musicPlayRequestId;
        const promise = musicState.audio.play();
        if (promise && typeof promise.catch === "function") {
          promise.catch(() => {
            if (requestId !== musicPlayRequestId) return;
            musicState.playing = false;
            musicUiHooks.onPlayStateChange?.(false);
          });
        }
      }
    }
  } else {
    // Mute: pause without resetting currentTime so unmuting resumes from the same spot.
    if (musicState.audio && !musicState.audio.paused) {
      musicState.audio.pause();
    }
    if (musicState.playing) {
      musicState.playing = false;
      musicUiHooks.onPlayStateChange?.(false);
    }
  }
}

function preloadFirstMusicTrack() {
  return loadMusicTrackList().then((tracks) => {
    if (musicState.preloaded || musicState.preloadedFirst || !tracks.length) return;
    if (!musicState.order.length) {
      musicState.order = shuffleOrder(tracks);
      musicState.idx = -1;
    }
    const track = musicState.order[0];
    if (!track) return;
    musicState.preloadedFirst = true;
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = `music/${encodeURIComponent(track)}`;
    if (!musicState.firstTrackListenerAttached) {
      musicState.firstTrackListenerAttached = true;
      audio.addEventListener("canplaythrough", () => {
        if (!musicState.playing) {
          startMusic();
        }
      }, { once: true });
    }
    audio.load();
    musicState.preloadedClips = [audio];
  }).catch(() => {});
}

function preloadMusicTracks() {
  return loadMusicTrackList().then((tracks) => {
    if (musicState.preloaded || !tracks.length) return;
    musicState.preloaded = true;
    musicState.preloadedFirst = true;
    musicState.preloadedClips.length = 0;
    tracks.forEach((track, idx) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = `music/${encodeURIComponent(track)}`;
      if (idx === 0 && !musicState.firstTrackListenerAttached) {
        musicState.firstTrackListenerAttached = true;
        audio.addEventListener("canplaythrough", () => {
          if (!musicState.playing) {
            updateMusicEnablement();
          }
        }, { once: true });
      }
      audio.load();
      musicState.preloadedClips.push(audio);
    });
  }).catch(() => {});
}

const MUSIC_STATE_KEY = "frtd.musicState.v1";

function persistMusicState() {
  if (typeof window === "undefined" || !window.localStorage) return;
  const track = musicState.currentTrack;
  const audio = musicState.audio;
  if (!track) return;
  try {
    window.localStorage.setItem(MUSIC_STATE_KEY, JSON.stringify({
      track,
      currentTime: Number.isFinite(audio?.currentTime) ? audio.currentTime : 0,
      playing: !musicState.userPaused,
    }));
  } catch (_) { /* storage full or blocked */ }
}

function resumeMusicFromStorage() {
  if (typeof window === "undefined" || !window.localStorage) return false;
  let data = null;
  try {
    const raw = window.localStorage.getItem(MUSIC_STATE_KEY);
    if (!raw) return false;
    data = JSON.parse(raw);
  } catch (_) {
    return false;
  }
  if (!data?.track || typeof data.currentTime !== "number") return false;
  if (!Array.isArray(MUSIC_TRACKS) || !MUSIC_TRACKS.includes(data.track)) return false;
  if (!musicState.order.length) {
    musicState.order = shuffleOrder(MUSIC_TRACKS);
  }
  const idx = musicState.order.indexOf(data.track);
  if (idx >= 0) {
    musicState.idx = idx;
  } else {
    musicState.order.unshift(data.track);
    musicState.idx = 0;
  }
  musicState.preloadedFirst = true;
  const audio = ensureMusicAudio();
  audio.src = `music/${encodeURIComponent(data.track)}`;
  audio.volume = musicState.volume;
  musicState.currentTrack = data.track;
  musicState.playing = false;
  musicState.userPaused = !data.playing;
  refreshMusicTrackLabel();
  refreshMusicProgressUI();
  musicUiHooks.onPlayStateChange?.(false);
  const requestId = ++musicPlayRequestId;
  const applySeekAndPlay = () => {
    if (requestId !== musicPlayRequestId) return;
    try { audio.currentTime = data.currentTime; } catch (_) { /* metadata not ready */ }
    refreshMusicProgressUI();
    if (data.playing) {
      musicState.playing = true;
      musicUiHooks.onPlayStateChange?.(true);
      const promise = audio.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {
          // Autoplay blocked; the unlock listener will retry on first user gesture.
          if (requestId !== musicPlayRequestId) return;
          musicState.playing = false;
          musicUiHooks.onPlayStateChange?.(false);
        });
      }
    }
  };
  if (audio.readyState >= 1) {
    applySeekAndPlay();
  } else {
    audio.addEventListener("loadedmetadata", applySeekAndPlay, { once: true });
  }
  return true;
}

// Fog-of-war tunables.
const FOG_SETTINGS = {
  enabled: 1,
  gridWidth: 362, // tuned to keep cells square on the map and roughly half the previous area
  gridHeight: 181,
  rangerVisionRadiusPct: 4, // percent of map width (legacy fallback)
  soldierVisionRadiusPct: 4,
  vehicleVisionRadiusPct: 5,
  settlementVisionRadiusPct: 5, // percent of map width
  exploredAlpha: 0.55,
  unknownAlpha: 1,
  ghostAlpha: 0.55,
};

function createVisibilityGrid(width = FOG_SETTINGS.gridWidth, height = FOG_SETTINGS.gridHeight) {
  const w = Math.max(4, Math.floor(width));
  const h = Math.max(4, Math.floor(height));
  return {
    width: w,
    height: h,
    visible: new Uint8Array(w * h),
    explored: new Uint8Array(w * h),
    dirty: true,
  };
}

function fogSetting(key) {
  // Allows runtime overrides via window.devFog without mutating defaults.
  const overrides = (typeof window !== "undefined" ? window.devFog : null) || {};
  const val = overrides[key];
  return typeof val === "number" ? val : FOG_SETTINGS[key];
}

function getSoldierVisionRadiusPct(overrides = {}) {
  return overrides.soldierVisionRadiusPct
    ?? overrides.rangerVisionRadiusPct
    ?? FOG_SETTINGS.soldierVisionRadiusPct
    ?? FOG_SETTINGS.rangerVisionRadiusPct;
}

function getVehicleVisionRadiusPct(overrides = {}) {
  return overrides.vehicleVisionRadiusPct
    ?? overrides.rangerVisionRadiusPct
    ?? FOG_SETTINGS.vehicleVisionRadiusPct
    ?? FOG_SETTINGS.rangerVisionRadiusPct;
}

function getSettlementVisionRadiusPct(overrides = {}) {
  return overrides.settlementVisionRadiusPct ?? FOG_SETTINGS.settlementVisionRadiusPct;
}

function getUnitVisionRadiusPct(unit, overrides = {}) {
  const base = isVehicleUnit(unit)
    ? getVehicleVisionRadiusPct(overrides)
    : getSoldierVisionRadiusPct(overrides);
  const bonus = Math.max(0, Math.trunc(unit?.visionBonus || 0));
  return base + bonus;
}

function isFogEnabled(state) {
  if (typeof state?.fogEnabled === "boolean") return state.fogEnabled;
  if (typeof window !== "undefined" && typeof window.devFogEnabled === "boolean") return window.devFogEnabled;
  return fogSetting("enabled") === 1;
}

function setFogMode(target, mode = 1) {
  let state = target;
  let desired = mode;
  if (typeof target === "number" || typeof target === "boolean" || target === undefined) {
    desired = target;
    state = (typeof mapSceneInstance?.gameState !== "undefined" && mapSceneInstance?.gameState) || state;
    state = state || getGlobalGameState() || null;
  }
  const enabled = desired === 1 || desired === true;
  if (state) state.fogEnabled = enabled;
  if (typeof window !== "undefined") window.devFogEnabled = enabled;
  persistToggle("fogEnabled", enabled);
  if (state?.visibility) {
    state.visibility.dirty = true;
  }
  if (state?.refreshVisibility) {
    state.refreshVisibility();
  }
  if (state?.logger) {
    state.logger.log(`Fog of war ${enabled ? "enabled" : "disabled"}.`);
  }
  if (typeof renderMap === "function" && state) {
    renderMap(state);
  }
  if (typeof updateDevPanel === "function" && state) {
    updateDevPanel(state);
  }
  return enabled ? 1 : 0;
}

function ensureVisibilityGrid(state) {
  if (!state) return null;
  const overrides = (typeof window !== "undefined" ? window.devFog : null) || {};
  const width = Math.max(4, Math.floor(overrides.gridWidth ?? FOG_SETTINGS.gridWidth));
  const height = Math.max(4, Math.floor(overrides.gridHeight ?? FOG_SETTINGS.gridHeight));
  const needsReset = !state.visibility
    || state.visibility.width !== width
    || state.visibility.height !== height
    || !state.visibility.visible
    || !state.visibility.explored;
  if (needsReset) {
    state.visibility = createVisibilityGrid(width, height);
  }
  if (!state.knownNodes) state.knownNodes = new Set();
  if (!state.visibleNodes) state.visibleNodes = new Set();
  return state.visibility;
}

function pctToCell(pct, grid) {
  if (!pct || !grid?.width || !grid?.height) return null;
  const clamp = (typeof Phaser !== "undefined" && Phaser.Math && Phaser.Math.Clamp)
    ? Phaser.Math.Clamp
    : (val, min, max) => Math.min(max, Math.max(min, val));
  const cx = clamp(Math.floor((pct.x / 100) * grid.width), 0, grid.width - 1);
  const cy = clamp(Math.floor((pct.y / 100) * grid.height), 0, grid.height - 1);
  const idx = cy * grid.width + cx;
  return { cx, cy, idx };
}

function isPctVisible(pct, state) {
  if (!isFogEnabled(state)) return true;
  const vis = state?.visibility || state?.gameState?.visibility;
  if (!vis || !vis.visible) return false;
  const cell = pctToCell(pct, vis);
  if (!cell || cell.idx < 0 || cell.idx >= vis.visible.length) return false;
  return !!vis.visible[cell.idx];
}

function isPctExplored(pct, state) {
  if (!isFogEnabled(state)) return true;
  const vis = state?.visibility || state?.gameState?.visibility;
  if (!vis || !vis.explored) return false;
  const cell = pctToCell(pct, vis);
  if (!cell || cell.idx < 0 || cell.idx >= vis.explored.length) return false;
  return !!vis.explored[cell.idx];
}

function getVisibilityCellIndexForPct(pct, state) {
  const vis = state?.visibility || state?.gameState?.visibility;
  const cell = pctToCell(pct, vis);
  return typeof cell?.idx === "number" ? cell.idx : -1;
}

function isNodeVisible(nodeId, state) {
  if (!state) return true;
  if (state.visibleNodes && state.visibleNodes.size) {
    return state.visibleNodes.has(nodeId);
  }
  const node = state.nodeMap?.get ? state.nodeMap.get(nodeId) : null;
  return node ? isPctVisible(node.pos, state) : true;
}

function collectVisionSources(state) {
  const sources = [];
  if (!state) return sources;
  const overrides = (typeof window !== "undefined" ? window.devFog : null) || {};
  const settlementRadius = getSettlementVisionRadiusPct(overrides);
  const addSource = (pct, radiusPct) => {
    if (!pct || typeof pct.x !== "number" || typeof pct.y !== "number") return;
    const r = Math.max(0, radiusPct || 0);
    if (r <= 0) return;
    sources.push({ x: pct.x, y: pct.y, radiusPct: r });
  };
  for (const unit of state.rangerUnits || []) {
    ensureUnitTravelState(state, unit);
    if (!unit.deployed || unit.isDead) continue;
    const pos = getUnitPositionPct(state, unit);
    addSource(pos, getUnitVisionRadiusPct(unit, overrides));
  }
  for (const node of state.nodes || []) {
    if (node.owner === "player") {
      addSource(node.pos, settlementRadius);
    }
  }
  if (state.smallSettlements?.length) {
    for (const settlement of state.smallSettlements) {
      if (settlement.owner === "player") {
        addSource(settlement.pos, settlementRadius * 0.7);
      }
    }
  }
  return sources;
}

function computeVisibility(state) {
  if (!state) return null;
  const vis = ensureVisibilityGrid(state);
  if (!vis) return null;
  if (!isFogEnabled(state)) {
    if (vis.visible) vis.visible.fill(1);
    if (vis.explored) vis.explored.fill(1);
    state.visibleNodes = new Set(state.nodes.map((n) => n.id));
    state.knownNodes = new Set(state.visibleNodes);
    vis.dirty = false;
    return vis;
  }
  const { width, height } = vis;
  const visible = vis.visible;
  const explored = vis.explored;
  visible.fill(0);
  const sources = collectVisionSources(state);
  const total = width * height;
  const markVisible = (cx, cy) => {
    const idx = cy * width + cx;
    if (idx < 0 || idx >= total) return;
    visible[idx] = 1;
  };
  const cellToPct = (cx, cy) => ({
    x: ((cx + 0.5) / width) * 100,
    y: ((cy + 0.5) / height) * 100,
  });
  for (const src of sources) {
    const radius = Math.max(0, src.radiusPct || 0);
    if (radius <= 0) continue;
    const minCx = Math.max(0, Math.floor(((src.x - radius) / 100) * width));
    const maxCx = Math.min(width - 1, Math.ceil(((src.x + radius) / 100) * width));
    const minCy = Math.max(0, Math.floor(((src.y - radius) / 100) * height));
    const maxCy = Math.min(height - 1, Math.ceil(((src.y + radius) / 100) * height));
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const pct = cellToPct(cx, cy);
        const dx = pct.x - src.x;
        const dy = pct.y - src.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= radius) {
          markVisible(cx, cy);
        }
      }
    }
  }
  let exploredChanged = false;
  for (let i = 0; i < total; i++) {
    if (visible[i] && !explored[i]) {
      explored[i] = 1;
      exploredChanged = true;
    }
  }
  const prevKnown = new Set(state.knownNodes || []);
  const prevVisible = new Set(state.visibleNodes || []);
  state.visibleNodes = new Set();
  state.knownNodes = new Set(prevKnown);
  for (const node of state.nodes || []) {
    const seen = isPctExplored(node.pos, state);
    if (seen) {
      state.knownNodes.add(node.id);
    }
    const nodeVisible = isPctVisible(node.pos, state);
    if (nodeVisible) {
      state.visibleNodes.add(node.id);
      node.lastKnownOwner = node.owner;
    }
  }
  const homeNode = state.nodeMap?.get?.("home");
  if (homeNode) {
    state.knownNodes.add(homeNode.id);
    homeNode.lastKnownOwner = homeNode.owner;
  }
  if (state.selectedNode && !state.visibleNodes.has(state.selectedNode)) {
    state.selectedNode = null;
  }
  const visibleChanged = exploredChanged
    || state.visibleNodes.size !== prevVisible.size
    || state.knownNodes.size !== prevKnown.size;
  vis.dirty = true;
  vis.lastChangedHadDiff = visibleChanged;
  return vis;
}

function getSettlementScale() {
  const dev = window.devSpriteScales || DEV_SPRITE_TUNABLES;
  const val = dev.settlementScale ?? DEV_SPRITE_TUNABLES.settlementScale;
  return Math.max(0.05, val || SETTLEMENT_ICON_SCALE);
}
function getSettlementLabelScale() {
  const base = getSettlementScale();
  return Math.max(0.05, base * (SETTLEMENT_LABEL_SCALE || 1) * 1.33);
}
function getSettlementLabelScaleForScene(scene) {
  return getSettlementLabelScale();
}
function getSettlementLabelSizes(labelScale = getSettlementLabelScale()) {
  const scale = Math.max(0.05, Number.isFinite(labelScale) ? labelScale : 1);
  return {
    nameFontSize: Math.max(17, Math.round(19 * scale)),
    ownerFontSize: Math.max(15, Math.round(15 * scale)),
  };
}
const SMALL_SETTLEMENT_SCALE_RATIO = 0.65;

function getSmallSettlementScale() {
  return Math.max(0.2, getSettlementScale() * SMALL_SETTLEMENT_SCALE_RATIO);
}

function getSmallSettlementLabelScale() {
  return Math.max(0.2, getSettlementLabelScale() * SMALL_SETTLEMENT_SCALE_RATIO);
}

function getSmallSettlementLabelScaleForScene(scene) {
  const base = getSettlementLabelScaleForScene(scene);
  return Math.max(0.2, base * SMALL_SETTLEMENT_SCALE_RATIO);
}
function getUnitScale() {
  const dev = window.devSpriteScales || DEV_SPRITE_TUNABLES;
  const val = dev.unitScale ?? DEV_SPRITE_TUNABLES.unitScale;
  return Math.max(0.2, val || UNIT_ICON_SCALE);
}

function getSettlementHitboxAdjust() {
  const dev = window.devSettleHitbox || DEV_SETTLEMENT_HITBOX;
  return {
    spriteYOffset: dev.spriteYOffset ?? DEV_SETTLEMENT_HITBOX.spriteYOffset,
    hitboxYOffset: dev.hitboxYOffset ?? DEV_SETTLEMENT_HITBOX.hitboxYOffset,
    hitboxPad: dev.hitboxPad ?? DEV_SETTLEMENT_HITBOX.hitboxPad,
  };
}
const SPRITE_SHEET_KEYS = [
  "settlementsLarge",
  "settlementsSmall",
  "landmarks",
  "poi",
  "natres",
  "unitsSoldiers",
  "unitsVehicles",
  "randoms",
  ...BATTLE_SPRITE_KEYS,
  CAMP_SPRITE_KEY,
  "dams",
  "gunweapons",
  "meleeweapons",
  "rangedweapons",
  "energyweapons",
];
const SPRITE_CLEANUP_PROFILES = {
  // Simplified chroma key (mirrors export script): tolerance + bgColors, no feather/erode/keep-largest.
  default: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  settlementsLarge: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  settlementsSmall: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  landmarks: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  poi: { tolerance: 70, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  natres: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  unitsSoldiers: { tolerance: 120, alphaCutoff: 16, bgColors: [CHROMA_BG] },
  unitsVehicles: { tolerance: 120, alphaCutoff: 16, bgColors: [CHROMA_BG] },
  randoms: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  battle1: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  battle2: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  [CAMP_SPRITE_KEY]: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  dams: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  gunweapons: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  meleeweapons: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  rangedweapons: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
  energyweapons: { tolerance: 120, alphaCutoff: 12, bgColors: [CHROMA_BG] },
};
const PRECOMPUTED_SPRITE_ATLAS_DATA =
/* <precomputed-sprite-atlas-data> */
JSON.parse(String.raw`{
  "atlasFrames": {
    "settlementsPlayer": [
      {
        "name": "settlementsLarge-0",
        "x": 1095,
        "y": 39,
        "w": 359,
        "h": 187
      },
      {
        "name": "settlementsLarge-1",
        "x": 748,
        "y": 43,
        "w": 333,
        "h": 182
      },
      {
        "name": "settlementsLarge-2",
        "x": 409,
        "y": 58,
        "w": 317,
        "h": 165
      },
      {
        "name": "settlementsLarge-3",
        "x": 77,
        "y": 66,
        "w": 302,
        "h": 151
      },
      {
        "name": "settlementsLarge-4",
        "x": 401,
        "y": 273,
        "w": 333,
        "h": 167
      },
      {
        "name": "settlementsLarge-5",
        "x": 1098,
        "y": 273,
        "w": 366,
        "h": 166
      },
      {
        "name": "settlementsLarge-6",
        "x": 749,
        "y": 280,
        "w": 336,
        "h": 159
      },
      {
        "name": "settlementsLarge-7",
        "x": 59,
        "y": 281,
        "w": 329,
        "h": 160
      },
      {
        "name": "settlementsLarge-8",
        "x": 747,
        "y": 492,
        "w": 341,
        "h": 170
      },
      {
        "name": "settlementsLarge-9",
        "x": 62,
        "y": 493,
        "w": 335,
        "h": 164
      },
      {
        "name": "settlementsLarge-10",
        "x": 1103,
        "y": 495,
        "w": 366,
        "h": 170
      },
      {
        "name": "settlementsLarge-11",
        "x": 402,
        "y": 509,
        "w": 348,
        "h": 152
      },
      {
        "name": "settlementsLarge-12",
        "x": 58,
        "y": 701,
        "w": 343,
        "h": 200
      },
      {
        "name": "settlementsLarge-13",
        "x": 1105,
        "y": 708,
        "w": 381,
        "h": 196
      },
      {
        "name": "settlementsLarge-14",
        "x": 411,
        "y": 710,
        "w": 315,
        "h": 190
      },
      {
        "name": "settlementsLarge-15",
        "x": 735,
        "y": 740,
        "w": 359,
        "h": 162
      }
    ],
    "settlementsNeutral": [
      {
        "name": "settlementsLarge-0",
        "x": 1095,
        "y": 39,
        "w": 359,
        "h": 187
      },
      {
        "name": "settlementsLarge-1",
        "x": 748,
        "y": 43,
        "w": 333,
        "h": 182
      },
      {
        "name": "settlementsLarge-2",
        "x": 409,
        "y": 58,
        "w": 317,
        "h": 165
      },
      {
        "name": "settlementsLarge-3",
        "x": 77,
        "y": 66,
        "w": 302,
        "h": 151
      },
      {
        "name": "settlementsLarge-4",
        "x": 401,
        "y": 273,
        "w": 333,
        "h": 167
      },
      {
        "name": "settlementsLarge-5",
        "x": 1098,
        "y": 273,
        "w": 366,
        "h": 166
      },
      {
        "name": "settlementsLarge-6",
        "x": 749,
        "y": 280,
        "w": 336,
        "h": 159
      },
      {
        "name": "settlementsLarge-7",
        "x": 59,
        "y": 281,
        "w": 329,
        "h": 160
      },
      {
        "name": "settlementsLarge-8",
        "x": 747,
        "y": 492,
        "w": 341,
        "h": 170
      },
      {
        "name": "settlementsLarge-9",
        "x": 62,
        "y": 493,
        "w": 335,
        "h": 164
      },
      {
        "name": "settlementsLarge-10",
        "x": 1103,
        "y": 495,
        "w": 366,
        "h": 170
      },
      {
        "name": "settlementsLarge-11",
        "x": 402,
        "y": 509,
        "w": 348,
        "h": 152
      },
      {
        "name": "settlementsLarge-12",
        "x": 58,
        "y": 701,
        "w": 343,
        "h": 200
      },
      {
        "name": "settlementsLarge-13",
        "x": 1105,
        "y": 708,
        "w": 381,
        "h": 196
      },
      {
        "name": "settlementsLarge-14",
        "x": 411,
        "y": 710,
        "w": 315,
        "h": 190
      },
      {
        "name": "settlementsLarge-15",
        "x": 735,
        "y": 740,
        "w": 359,
        "h": 162
      }
    ],
    "settlementsEnemy": [
      {
        "name": "settlementsLarge-0",
        "x": 1095,
        "y": 39,
        "w": 359,
        "h": 187
      },
      {
        "name": "settlementsLarge-1",
        "x": 748,
        "y": 43,
        "w": 333,
        "h": 182
      },
      {
        "name": "settlementsLarge-2",
        "x": 409,
        "y": 58,
        "w": 317,
        "h": 165
      },
      {
        "name": "settlementsLarge-3",
        "x": 77,
        "y": 66,
        "w": 302,
        "h": 151
      },
      {
        "name": "settlementsLarge-4",
        "x": 401,
        "y": 273,
        "w": 333,
        "h": 167
      },
      {
        "name": "settlementsLarge-5",
        "x": 1098,
        "y": 273,
        "w": 366,
        "h": 166
      },
      {
        "name": "settlementsLarge-6",
        "x": 749,
        "y": 280,
        "w": 336,
        "h": 159
      },
      {
        "name": "settlementsLarge-7",
        "x": 59,
        "y": 281,
        "w": 329,
        "h": 160
      },
      {
        "name": "settlementsLarge-8",
        "x": 747,
        "y": 492,
        "w": 341,
        "h": 170
      },
      {
        "name": "settlementsLarge-9",
        "x": 62,
        "y": 493,
        "w": 335,
        "h": 164
      },
      {
        "name": "settlementsLarge-10",
        "x": 1103,
        "y": 495,
        "w": 366,
        "h": 170
      },
      {
        "name": "settlementsLarge-11",
        "x": 402,
        "y": 509,
        "w": 348,
        "h": 152
      },
      {
        "name": "settlementsLarge-12",
        "x": 58,
        "y": 701,
        "w": 343,
        "h": 200
      },
      {
        "name": "settlementsLarge-13",
        "x": 1105,
        "y": 708,
        "w": 381,
        "h": 196
      },
      {
        "name": "settlementsLarge-14",
        "x": 411,
        "y": 710,
        "w": 315,
        "h": 190
      },
      {
        "name": "settlementsLarge-15",
        "x": 735,
        "y": 740,
        "w": 359,
        "h": 162
      }
    ],
    "settlements": [
      {
        "name": "settlementsLarge-0",
        "x": 1095,
        "y": 39,
        "w": 359,
        "h": 187
      },
      {
        "name": "settlementsLarge-1",
        "x": 748,
        "y": 43,
        "w": 333,
        "h": 182
      },
      {
        "name": "settlementsLarge-2",
        "x": 409,
        "y": 58,
        "w": 317,
        "h": 165
      },
      {
        "name": "settlementsLarge-3",
        "x": 77,
        "y": 66,
        "w": 302,
        "h": 151
      },
      {
        "name": "settlementsLarge-4",
        "x": 401,
        "y": 273,
        "w": 333,
        "h": 167
      },
      {
        "name": "settlementsLarge-5",
        "x": 1098,
        "y": 273,
        "w": 366,
        "h": 166
      },
      {
        "name": "settlementsLarge-6",
        "x": 749,
        "y": 280,
        "w": 336,
        "h": 159
      },
      {
        "name": "settlementsLarge-7",
        "x": 59,
        "y": 281,
        "w": 329,
        "h": 160
      },
      {
        "name": "settlementsLarge-8",
        "x": 747,
        "y": 492,
        "w": 341,
        "h": 170
      },
      {
        "name": "settlementsLarge-9",
        "x": 62,
        "y": 493,
        "w": 335,
        "h": 164
      },
      {
        "name": "settlementsLarge-10",
        "x": 1103,
        "y": 495,
        "w": 366,
        "h": 170
      },
      {
        "name": "settlementsLarge-11",
        "x": 402,
        "y": 509,
        "w": 348,
        "h": 152
      },
      {
        "name": "settlementsLarge-12",
        "x": 58,
        "y": 701,
        "w": 343,
        "h": 200
      },
      {
        "name": "settlementsLarge-13",
        "x": 1105,
        "y": 708,
        "w": 381,
        "h": 196
      },
      {
        "name": "settlementsLarge-14",
        "x": 411,
        "y": 710,
        "w": 315,
        "h": 190
      },
      {
        "name": "settlementsLarge-15",
        "x": 735,
        "y": 740,
        "w": 359,
        "h": 162
      }
    ],
    "settlementsSmall": [
      {
        "name": "settlementsSmall-0",
        "x": 1111,
        "y": 61,
        "w": 307,
        "h": 158
      },
      {
        "name": "settlementsSmall-1",
        "x": 774,
        "y": 69,
        "w": 304,
        "h": 149
      },
      {
        "name": "settlementsSmall-2",
        "x": 463,
        "y": 70,
        "w": 291,
        "h": 146
      },
      {
        "name": "settlementsSmall-3",
        "x": 125,
        "y": 71,
        "w": 309,
        "h": 149
      },
      {
        "name": "settlementsSmall-4",
        "x": 776,
        "y": 261,
        "w": 314,
        "h": 155
      },
      {
        "name": "settlementsSmall-5",
        "x": 455,
        "y": 267,
        "w": 294,
        "h": 148
      },
      {
        "name": "settlementsSmall-6",
        "x": 1113,
        "y": 269,
        "w": 317,
        "h": 148
      },
      {
        "name": "settlementsSmall-7",
        "x": 123,
        "y": 275,
        "w": 305,
        "h": 139
      },
      {
        "name": "settlementsSmall-8",
        "x": 771,
        "y": 441,
        "w": 330,
        "h": 192
      },
      {
        "name": "settlementsSmall-9",
        "x": 458,
        "y": 453,
        "w": 296,
        "h": 177
      },
      {
        "name": "settlementsSmall-10",
        "x": 119,
        "y": 460,
        "w": 319,
        "h": 172
      },
      {
        "name": "settlementsSmall-11",
        "x": 1113,
        "y": 467,
        "w": 325,
        "h": 169
      },
      {
        "name": "settlementsSmall-12",
        "x": 121,
        "y": 670,
        "w": 313,
        "h": 199
      },
      {
        "name": "settlementsSmall-13",
        "x": 778,
        "y": 674,
        "w": 311,
        "h": 191
      },
      {
        "name": "settlementsSmall-14",
        "x": 1106,
        "y": 690,
        "w": 339,
        "h": 174
      },
      {
        "name": "settlementsSmall-15",
        "x": 452,
        "y": 698,
        "w": 308,
        "h": 167
      }
    ],
    "dams": [
      {
        "name": "dams-0",
        "x": 396,
        "y": 66,
        "w": 235,
        "h": 111
      },
      {
        "name": "dams-1",
        "x": 1075,
        "y": 69,
        "w": 384,
        "h": 122
      },
      {
        "name": "dams-2",
        "x": 93,
        "y": 81,
        "w": 229,
        "h": 84
      },
      {
        "name": "dams-3",
        "x": 686,
        "y": 83,
        "w": 334,
        "h": 101
      },
      {
        "name": "dams-4",
        "x": 521,
        "y": 258,
        "w": 405,
        "h": 145
      },
      {
        "name": "dams-5",
        "x": 984,
        "y": 269,
        "w": 478,
        "h": 143
      },
      {
        "name": "dams-6",
        "x": 106,
        "y": 274,
        "w": 354,
        "h": 120
      },
      {
        "name": "dams-7",
        "x": 987,
        "y": 481,
        "w": 499,
        "h": 163
      },
      {
        "name": "dams-8",
        "x": 65,
        "y": 486,
        "w": 391,
        "h": 135
      },
      {
        "name": "dams-9",
        "x": 503,
        "y": 487,
        "w": 449,
        "h": 140
      },
      {
        "name": "dams-10",
        "x": 483,
        "y": 720,
        "w": 412,
        "h": 221
      },
      {
        "name": "dams-11",
        "x": 920,
        "y": 724,
        "w": 603,
        "h": 228
      },
      {
        "name": "dams-12",
        "x": 48,
        "y": 744,
        "w": 401,
        "h": 184
      }
    ],
    "landmarks": [
      {
        "name": "landmarks-0",
        "x": 399,
        "y": 26,
        "w": 325,
        "h": 177
      },
      {
        "name": "landmarks-1",
        "x": 1089,
        "y": 32,
        "w": 313,
        "h": 172
      },
      {
        "name": "landmarks-2",
        "x": 747,
        "y": 43,
        "w": 337,
        "h": 159
      },
      {
        "name": "landmarks-3",
        "x": 139,
        "y": 58,
        "w": 211,
        "h": 138
      },
      {
        "name": "landmarks-4",
        "x": 111,
        "y": 239,
        "w": 269,
        "h": 158
      },
      {
        "name": "landmarks-5",
        "x": 408,
        "y": 241,
        "w": 317,
        "h": 162
      },
      {
        "name": "landmarks-6",
        "x": 753,
        "y": 246,
        "w": 324,
        "h": 154
      },
      {
        "name": "landmarks-7",
        "x": 1105,
        "y": 255,
        "w": 311,
        "h": 127
      },
      {
        "name": "landmarks-8",
        "x": 426,
        "y": 430,
        "w": 293,
        "h": 176
      },
      {
        "name": "landmarks-9",
        "x": 1247,
        "y": 441,
        "w": 46,
        "h": 53
      },
      {
        "name": "landmarks-10",
        "x": 88,
        "y": 442,
        "w": 325,
        "h": 165
      },
      {
        "name": "landmarks-11",
        "x": 1103,
        "y": 442,
        "w": 328,
        "h": 162
      },
      {
        "name": "landmarks-12",
        "x": 737,
        "y": 454,
        "w": 350,
        "h": 150
      },
      {
        "name": "landmarks-13",
        "x": 772,
        "y": 621,
        "w": 286,
        "h": 173
      },
      {
        "name": "landmarks-14",
        "x": 426,
        "y": 652,
        "w": 298,
        "h": 142
      },
      {
        "name": "landmarks-15",
        "x": 1102,
        "y": 662,
        "w": 344,
        "h": 130
      },
      {
        "name": "landmarks-16",
        "x": 88,
        "y": 663,
        "w": 302,
        "h": 130
      },
      {
        "name": "landmarks-17",
        "x": 775,
        "y": 820,
        "w": 299,
        "h": 164
      },
      {
        "name": "landmarks-18",
        "x": 1109,
        "y": 850,
        "w": 343,
        "h": 133
      },
      {
        "name": "landmarks-19",
        "x": 92,
        "y": 853,
        "w": 310,
        "h": 131
      },
      {
        "name": "landmarks-20",
        "x": 431,
        "y": 866,
        "w": 315,
        "h": 124
      }
    ],
    "poi": [
      {
        "name": "poi-0",
        "x": 156,
        "y": 1,
        "w": 196,
        "h": 117
      },
      {
        "name": "poi-1",
        "x": 5,
        "y": 12,
        "w": 148,
        "h": 82
      },
      {
        "name": "poi-2",
        "x": 375,
        "y": 26,
        "w": 224,
        "h": 104
      },
      {
        "name": "poi-3",
        "x": 4,
        "y": 163,
        "w": 328,
        "h": 170
      },
      {
        "name": "poi-4",
        "x": 559,
        "y": 216,
        "w": 198,
        "h": 91
      },
      {
        "name": "poi-5",
        "x": 361,
        "y": 221,
        "w": 145,
        "h": 69
      },
      {
        "name": "poi-6",
        "x": 795,
        "y": 225,
        "w": 213,
        "h": 98
      },
      {
        "name": "poi-7",
        "x": 348,
        "y": 340,
        "w": 322,
        "h": 181
      },
      {
        "name": "poi-8",
        "x": 828,
        "y": 365,
        "w": 181,
        "h": 92
      },
      {
        "name": "poi-9",
        "x": 685,
        "y": 389,
        "w": 117,
        "h": 75
      },
      {
        "name": "poi-10",
        "x": 526,
        "y": 517,
        "w": 375,
        "h": 178
      },
      {
        "name": "poi-11",
        "x": 17,
        "y": 556,
        "w": 236,
        "h": 115
      },
      {
        "name": "poi-12",
        "x": 926,
        "y": 576,
        "w": 98,
        "h": 79
      },
      {
        "name": "poi-13",
        "x": 668,
        "y": 687,
        "w": 316,
        "h": 149
      },
      {
        "name": "poi-14",
        "x": 173,
        "y": 693,
        "w": 223,
        "h": 121
      },
      {
        "name": "poi-15",
        "x": 8,
        "y": 704,
        "w": 164,
        "h": 105
      },
      {
        "name": "poi-16",
        "x": 396,
        "y": 873,
        "w": 203,
        "h": 128
      },
      {
        "name": "poi-17",
        "x": 787,
        "y": 878,
        "w": 237,
        "h": 132
      },
      {
        "name": "poi-18",
        "x": 182,
        "y": 891,
        "w": 218,
        "h": 86
      },
      {
        "name": "poi-19",
        "x": 3,
        "y": 893,
        "w": 178,
        "h": 80
      }
    ],
    "randoms": [
      {
        "name": "randoms-0",
        "x": 767,
        "y": 27,
        "w": 316,
        "h": 209
      },
      {
        "name": "randoms-1",
        "x": 464,
        "y": 28,
        "w": 292,
        "h": 214
      },
      {
        "name": "randoms-2",
        "x": 1096,
        "y": 41,
        "w": 354,
        "h": 201
      },
      {
        "name": "randoms-3",
        "x": 90,
        "y": 45,
        "w": 358,
        "h": 191
      },
      {
        "name": "randoms-4",
        "x": 459,
        "y": 269,
        "w": 297,
        "h": 216
      },
      {
        "name": "randoms-5",
        "x": 1101,
        "y": 290,
        "w": 355,
        "h": 188
      },
      {
        "name": "randoms-6",
        "x": 769,
        "y": 296,
        "w": 334,
        "h": 191
      },
      {
        "name": "randoms-7",
        "x": 94,
        "y": 307,
        "w": 351,
        "h": 180
      },
      {
        "name": "randoms-8",
        "x": 448,
        "y": 520,
        "w": 313,
        "h": 198
      },
      {
        "name": "randoms-9",
        "x": 81,
        "y": 523,
        "w": 351,
        "h": 190
      },
      {
        "name": "randoms-10",
        "x": 1099,
        "y": 525,
        "w": 355,
        "h": 192
      },
      {
        "name": "randoms-11",
        "x": 769,
        "y": 526,
        "w": 323,
        "h": 189
      },
      {
        "name": "randoms-12",
        "x": 769,
        "y": 737,
        "w": 332,
        "h": 218
      },
      {
        "name": "randoms-13",
        "x": 444,
        "y": 750,
        "w": 317,
        "h": 204
      },
      {
        "name": "randoms-14",
        "x": 1107,
        "y": 750,
        "w": 362,
        "h": 203
      },
      {
        "name": "randoms-15",
        "x": 91,
        "y": 766,
        "w": 355,
        "h": 183
      }
    ],
    "battle1": [
      {
        "name": "battle1-0",
        "x": 429,
        "y": 30,
        "w": 197,
        "h": 229
      },
      {
        "name": "battle1-1",
        "x": 1108,
        "y": 30,
        "w": 166,
        "h": 229
      },
      {
        "name": "battle1-2",
        "x": 1256,
        "y": 31,
        "w": 177,
        "h": 229
      },
      {
        "name": "battle1-3",
        "x": 912,
        "y": 37,
        "w": 177,
        "h": 222
      },
      {
        "name": "battle1-4",
        "x": 796,
        "y": 38,
        "w": 128,
        "h": 222
      },
      {
        "name": "battle1-5",
        "x": 606,
        "y": 41,
        "w": 133,
        "h": 215
      },
      {
        "name": "battle1-6",
        "x": 109,
        "y": 61,
        "w": 296,
        "h": 185
      },
      {
        "name": "battle1-7",
        "x": 126,
        "y": 284,
        "w": 240,
        "h": 233
      },
      {
        "name": "battle1-8",
        "x": 779,
        "y": 287,
        "w": 336,
        "h": 227
      },
      {
        "name": "battle1-9",
        "x": 1174,
        "y": 298,
        "w": 274,
        "h": 219
      },
      {
        "name": "battle1-10",
        "x": 405,
        "y": 301,
        "w": 343,
        "h": 215
      },
      {
        "name": "battle1-11",
        "x": 1140,
        "y": 523,
        "w": 296,
        "h": 220
      },
      {
        "name": "battle1-12",
        "x": 781,
        "y": 539,
        "w": 344,
        "h": 205
      },
      {
        "name": "battle1-13",
        "x": 579,
        "y": 543,
        "w": 172,
        "h": 200
      },
      {
        "name": "battle1-14",
        "x": 120,
        "y": 551,
        "w": 303,
        "h": 185
      },
      {
        "name": "battle1-15",
        "x": 457,
        "y": 558,
        "w": 149,
        "h": 182
      },
      {
        "name": "battle1-16",
        "x": 791,
        "y": 754,
        "w": 155,
        "h": 219
      },
      {
        "name": "battle1-17",
        "x": 939,
        "y": 759,
        "w": 149,
        "h": 219
      },
      {
        "name": "battle1-18",
        "x": 1160,
        "y": 759,
        "w": 268,
        "h": 214
      },
      {
        "name": "battle1-19",
        "x": 454,
        "y": 763,
        "w": 322,
        "h": 210
      },
      {
        "name": "battle1-20",
        "x": 157,
        "y": 775,
        "w": 292,
        "h": 193
      }
    ],
    "battle2": [
      {
        "name": "battle2-0",
        "x": 1082,
        "y": 10,
        "w": 395,
        "h": 255
      },
      {
        "name": "battle2-1",
        "x": 359,
        "y": 14,
        "w": 352,
        "h": 245
      },
      {
        "name": "battle2-2",
        "x": 97,
        "y": 24,
        "w": 215,
        "h": 240
      },
      {
        "name": "battle2-3",
        "x": 710,
        "y": 26,
        "w": 365,
        "h": 233
      },
      {
        "name": "battle2-4",
        "x": 110,
        "y": 282,
        "w": 296,
        "h": 221
      },
      {
        "name": "battle2-5",
        "x": 1226,
        "y": 285,
        "w": 210,
        "h": 253
      },
      {
        "name": "battle2-6",
        "x": 400,
        "y": 288,
        "w": 366,
        "h": 207
      },
      {
        "name": "battle2-7",
        "x": 777,
        "y": 309,
        "w": 308,
        "h": 193
      },
      {
        "name": "battle2-8",
        "x": 1070,
        "y": 328,
        "w": 166,
        "h": 172
      },
      {
        "name": "battle2-9",
        "x": 483,
        "y": 471,
        "w": 272,
        "h": 285
      },
      {
        "name": "battle2-10",
        "x": 280,
        "y": 519,
        "w": 163,
        "h": 109
      },
      {
        "name": "battle2-11",
        "x": 85,
        "y": 522,
        "w": 163,
        "h": 135
      },
      {
        "name": "battle2-12",
        "x": 1081,
        "y": 542,
        "w": 368,
        "h": 218
      },
      {
        "name": "battle2-13",
        "x": 794,
        "y": 547,
        "w": 281,
        "h": 211
      },
      {
        "name": "battle2-14",
        "x": 133,
        "y": 575,
        "w": 229,
        "h": 186
      },
      {
        "name": "battle2-15",
        "x": 332,
        "y": 641,
        "w": 165,
        "h": 115
      },
      {
        "name": "battle2-16",
        "x": 796,
        "y": 751,
        "w": 265,
        "h": 238
      },
      {
        "name": "battle2-17",
        "x": 130,
        "y": 770,
        "w": 290,
        "h": 202
      },
      {
        "name": "battle2-18",
        "x": 1114,
        "y": 771,
        "w": 320,
        "h": 217
      },
      {
        "name": "battle2-19",
        "x": 465,
        "y": 801,
        "w": 344,
        "h": 174
      }
    ],
    "camp": [
      {
        "name": "camp-0",
        "x": 760,
        "y": 29,
        "w": 374,
        "h": 160
      },
      {
        "name": "camp-1",
        "x": 1122,
        "y": 34,
        "w": 357,
        "h": 158
      },
      {
        "name": "camp-2",
        "x": 50,
        "y": 38,
        "w": 355,
        "h": 152
      },
      {
        "name": "camp-3",
        "x": 388,
        "y": 41,
        "w": 383,
        "h": 149
      },
      {
        "name": "camp-4",
        "x": 56,
        "y": 220,
        "w": 359,
        "h": 164
      },
      {
        "name": "camp-5",
        "x": 765,
        "y": 220,
        "w": 735,
        "h": 168
      },
      {
        "name": "camp-6",
        "x": 402,
        "y": 224,
        "w": 371,
        "h": 163
      },
      {
        "name": "camp-7",
        "x": 782,
        "y": 415,
        "w": 367,
        "h": 169
      },
      {
        "name": "camp-8",
        "x": 45,
        "y": 416,
        "w": 750,
        "h": 167
      },
      {
        "name": "camp-9",
        "x": 1133,
        "y": 422,
        "w": 371,
        "h": 161
      },
      {
        "name": "camp-10",
        "x": 772,
        "y": 615,
        "w": 724,
        "h": 166
      },
      {
        "name": "camp-11",
        "x": 398,
        "y": 619,
        "w": 384,
        "h": 166
      },
      {
        "name": "camp-12",
        "x": 41,
        "y": 620,
        "w": 369,
        "h": 164
      },
      {
        "name": "camp-13",
        "x": 1134,
        "y": 812,
        "w": 358,
        "h": 168
      },
      {
        "name": "camp-14",
        "x": 772,
        "y": 813,
        "w": 386,
        "h": 164
      },
      {
        "name": "camp-15",
        "x": 41,
        "y": 820,
        "w": 365,
        "h": 157
      },
      {
        "name": "camp-16",
        "x": 395,
        "y": 821,
        "w": 384,
        "h": 158
      }
    ],
    "natres": [
      {
        "name": "natres-0",
        "x": 1104,
        "y": 29,
        "w": 323,
        "h": 175
      },
      {
        "name": "natres-1",
        "x": 117,
        "y": 31,
        "w": 283,
        "h": 177
      },
      {
        "name": "natres-2",
        "x": 425,
        "y": 35,
        "w": 327,
        "h": 170
      },
      {
        "name": "natres-3",
        "x": 754,
        "y": 37,
        "w": 334,
        "h": 170
      },
      {
        "name": "natres-4",
        "x": 110,
        "y": 234,
        "w": 315,
        "h": 176
      },
      {
        "name": "natres-5",
        "x": 767,
        "y": 237,
        "w": 313,
        "h": 175
      },
      {
        "name": "natres-6",
        "x": 434,
        "y": 247,
        "w": 322,
        "h": 164
      },
      {
        "name": "natres-7",
        "x": 1098,
        "y": 248,
        "w": 344,
        "h": 158
      },
      {
        "name": "natres-8",
        "x": 436,
        "y": 442,
        "w": 324,
        "h": 160
      },
      {
        "name": "natres-9",
        "x": 776,
        "y": 447,
        "w": 305,
        "h": 156
      },
      {
        "name": "natres-10",
        "x": 103,
        "y": 455,
        "w": 316,
        "h": 147
      },
      {
        "name": "natres-11",
        "x": 1174,
        "y": 462,
        "w": 199,
        "h": 26
      },
      {
        "name": "natres-12",
        "x": 1097,
        "y": 471,
        "w": 344,
        "h": 132
      },
      {
        "name": "natres-13",
        "x": 774,
        "y": 622,
        "w": 294,
        "h": 178
      },
      {
        "name": "natres-14",
        "x": 436,
        "y": 626,
        "w": 324,
        "h": 171
      },
      {
        "name": "natres-15",
        "x": 114,
        "y": 627,
        "w": 302,
        "h": 173
      },
      {
        "name": "natres-16",
        "x": 1214,
        "y": 639,
        "w": 97,
        "h": 43
      },
      {
        "name": "natres-17",
        "x": 1093,
        "y": 677,
        "w": 356,
        "h": 120
      },
      {
        "name": "natres-18",
        "x": 1106,
        "y": 825,
        "w": 331,
        "h": 157
      },
      {
        "name": "natres-19",
        "x": 111,
        "y": 829,
        "w": 301,
        "h": 154
      },
      {
        "name": "natres-20",
        "x": 438,
        "y": 832,
        "w": 321,
        "h": 149
      },
      {
        "name": "natres-21",
        "x": 774,
        "y": 835,
        "w": 313,
        "h": 148
      },
      {
        "name": "natres-22",
        "x": 592,
        "y": 836,
        "w": 72,
        "h": 42
      },
      {
        "name": "natres-23",
        "x": 309,
        "y": 844,
        "w": 84,
        "h": 84
      },
      {
        "name": "natres-24",
        "x": 143,
        "y": 845,
        "w": 76,
        "h": 71
      },
      {
        "name": "natres-25",
        "x": 1316,
        "y": 860,
        "w": 102,
        "h": 37
      }
    ],
    "unitsSoldiers": [
      {
        "name": "unitsSoldiers-0",
        "x": 787,
        "y": 37,
        "w": 176,
        "h": 269
      },
      {
        "name": "unitsSoldiers-1",
        "x": 355,
        "y": 38,
        "w": 130,
        "h": 264
      },
      {
        "name": "unitsSoldiers-2",
        "x": 566,
        "y": 40,
        "w": 147,
        "h": 262
      },
      {
        "name": "unitsSoldiers-3",
        "x": 1239,
        "y": 41,
        "w": 179,
        "h": 268
      },
      {
        "name": "unitsSoldiers-4",
        "x": 1008,
        "y": 44,
        "w": 184,
        "h": 262
      },
      {
        "name": "unitsSoldiers-5",
        "x": 131,
        "y": 52,
        "w": 138,
        "h": 249
      },
      {
        "name": "unitsSoldiers-6",
        "x": 755,
        "y": 355,
        "w": 227,
        "h": 261
      },
      {
        "name": "unitsSoldiers-7",
        "x": 1241,
        "y": 355,
        "w": 190,
        "h": 259
      },
      {
        "name": "unitsSoldiers-8",
        "x": 315,
        "y": 357,
        "w": 200,
        "h": 255
      },
      {
        "name": "unitsSoldiers-9",
        "x": 555,
        "y": 357,
        "w": 185,
        "h": 259
      },
      {
        "name": "unitsSoldiers-10",
        "x": 996,
        "y": 361,
        "w": 213,
        "h": 255
      },
      {
        "name": "unitsSoldiers-11",
        "x": 109,
        "y": 364,
        "w": 183,
        "h": 250
      },
      {
        "name": "unitsSoldiers-12",
        "x": 996,
        "y": 666,
        "w": 227,
        "h": 281
      },
      {
        "name": "unitsSoldiers-13",
        "x": 543,
        "y": 669,
        "w": 202,
        "h": 274
      },
      {
        "name": "unitsSoldiers-14",
        "x": 1232,
        "y": 670,
        "w": 212,
        "h": 275
      },
      {
        "name": "unitsSoldiers-15",
        "x": 307,
        "y": 671,
        "w": 224,
        "h": 273
      },
      {
        "name": "unitsSoldiers-16",
        "x": 65,
        "y": 674,
        "w": 235,
        "h": 270
      },
      {
        "name": "unitsSoldiers-17",
        "x": 806,
        "y": 676,
        "w": 171,
        "h": 268
      },
      {
        "name": "unitsSoldiers-18",
        "x": 786,
        "y": 704,
        "w": 34,
        "h": 75
      }
    ],
    "unitsVehicles": [
      {
        "name": "unitsVehicles-0",
        "x": 130,
        "y": 42,
        "w": 294,
        "h": 208
      },
      {
        "name": "unitsVehicles-1",
        "x": 459,
        "y": 42,
        "w": 301,
        "h": 208
      },
      {
        "name": "unitsVehicles-2",
        "x": 787,
        "y": 44,
        "w": 295,
        "h": 206
      },
      {
        "name": "unitsVehicles-3",
        "x": 1113,
        "y": 45,
        "w": 288,
        "h": 204
      },
      {
        "name": "unitsVehicles-4",
        "x": 121,
        "y": 290,
        "w": 314,
        "h": 180
      },
      {
        "name": "unitsVehicles-5",
        "x": 449,
        "y": 298,
        "w": 299,
        "h": 168
      },
      {
        "name": "unitsVehicles-6",
        "x": 775,
        "y": 314,
        "w": 303,
        "h": 152
      },
      {
        "name": "unitsVehicles-7",
        "x": 1110,
        "y": 320,
        "w": 295,
        "h": 146
      },
      {
        "name": "unitsVehicles-8",
        "x": 99,
        "y": 504,
        "w": 342,
        "h": 197
      },
      {
        "name": "unitsVehicles-9",
        "x": 451,
        "y": 540,
        "w": 322,
        "h": 161
      },
      {
        "name": "unitsVehicles-10",
        "x": 780,
        "y": 545,
        "w": 307,
        "h": 154
      },
      {
        "name": "unitsVehicles-11",
        "x": 1103,
        "y": 547,
        "w": 314,
        "h": 152
      },
      {
        "name": "unitsVehicles-12",
        "x": 89,
        "y": 747,
        "w": 333,
        "h": 201
      },
      {
        "name": "unitsVehicles-13",
        "x": 767,
        "y": 761,
        "w": 321,
        "h": 182
      },
      {
        "name": "unitsVehicles-14",
        "x": 439,
        "y": 764,
        "w": 324,
        "h": 180
      },
      {
        "name": "unitsVehicles-15",
        "x": 1098,
        "y": 769,
        "w": 334,
        "h": 174
      }
    ]
  },
  "unitFrameNames": {
    "soldier1": "unitsSoldiers-0",
    "soldier2": "unitsSoldiers-1",
    "soldier3": "unitsSoldiers-2",
    "soldier4": "unitsSoldiers-3",
    "soldier5": "unitsSoldiers-4",
    "soldier6": "unitsSoldiers-5",
    "soldier7": "unitsSoldiers-6",
    "soldier8": "unitsSoldiers-7",
    "soldier9": "unitsSoldiers-8",
    "soldier10": "unitsSoldiers-9",
    "soldier11": "unitsSoldiers-10",
    "soldier12": "unitsSoldiers-11",
    "soldier13": "unitsSoldiers-12",
    "soldier14": "unitsSoldiers-13",
    "soldier15": "unitsSoldiers-14",
    "soldier16": "unitsSoldiers-15",
    "soldier17": "unitsSoldiers-16",
    "soldier18": "unitsSoldiers-17"
  },
  "vehicleFrameNames": {
    "vehicle1": "unitsVehicles-2",
    "vehicle2": "unitsVehicles-0",
    "vehicle3": "unitsVehicles-7",
    "vehicle4": "unitsVehicles-6",
    "vehicle5": "unitsVehicles-5",
    "vehicle6": "unitsVehicles-4",
    "vehicle7": "unitsVehicles-11",
    "vehicle8": "unitsVehicles-10",
    "vehicle9": "unitsVehicles-9",
    "vehicle10": "unitsVehicles-14",
    "vehicle11": "unitsVehicles-13",
    "vehicle12": "unitsVehicles-8",
    "vehicle13": "unitsVehicles-1",
    "vehicle14": "unitsVehicles-3",
    "vehicle15": "unitsVehicles-12",
    "vehicle16": "unitsVehicles-15"
  }
}`)
/* </precomputed-sprite-atlas-data> */;
function loadSpriteCleanupOverrides() {
  try {
    const raw = localStorage.getItem("spriteCleanupOverrides");
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("Failed to parse sprite cleanup overrides", err);
    return {};
  }
}
function saveSpriteCleanupOverrides(overrides) {
  try {
    localStorage.setItem("spriteCleanupOverrides", JSON.stringify(overrides || {}));
  } catch (err) {
    console.warn("Failed to persist sprite cleanup overrides", err);
  }
}
let spriteCleanupOverrides = loadSpriteCleanupOverrides();
function spriteSheetLabel(key) {
  const labels = {
    settlementsLarge: "Settlements (large)",
    settlementsSmall: "Settlements (small)",
    landmarks: "Landmarks",
    poi: "Points of interest",
    natres: "Natural resources",
    unitsSoldiers: "Units: soldiers",
    unitsVehicles: "Units: vehicles",
    randoms: "Randoms",
    battle1: "Battle (set 1)",
    battle2: "Battle (set 2)",
    [CAMP_SPRITE_KEY]: "Camp",
    dams: "Dams",
    gunweapons: "Weapons: firearms",
    meleeweapons: "Weapons: melee",
    rangedweapons: "Weapons: ranged",
    energyweapons: "Weapons: energy",
  };
  return labels[key] || key;
}
function spriteCleanupProfileFor(key) {
  const base = SPRITE_CLEANUP_PROFILES[key] || SPRITE_CLEANUP_PROFILES.default || {};
  const override = spriteCleanupOverrides?.[key] || {};
  return { ...base, ...override };
}
const UPGRADE_ITEMS = [
  {
    id: "reconKit",
    label: "Recon Kit",
    cost: "2 components",
    subtitle: "Boosts scouting reach around the map.",
  },
  {
    id: "reinforcedHull",
    label: "Reinforced Hull",
    cost: "1 components, 1 wood",
    subtitle: "+1 defense for Ranger deployments.",
  },
];

const HOME_BUILD_IDS = {
  reconUnit: "assembleReconUnit",
  vehicleUnit: "assembleVehicleUnit",
  trainUnit: "trainUnit",
  levelUpUnit: "levelUpUnit",
  weaponUpgrade: "weaponUpgrade",
  baseLevelTwo: "baseLevelTwo",
  baseLevelThree: "baseLevelThree",
  solarPanel: "solarPanel",
  binocs: "binocs",
  luckyCharm: "luckyCharm",
  firesale: "firesale",
  waterConservation: "waterConservation",
  foodRationing: "foodRationing",
  rescueDrone: "rescueDrone",
  gasDrone: "gasDrone",
};

const SETTLEMENT_SNAP_OFFSET = {
  small: { x: 0, y: 0 },
  large: { x: 0, y: 0 },
};

function setSettlementSnapOffset(kind = "small", x = 0, y = 0) {
  const key = kind === "large" ? "large" : "small";
  const nx = Number.isFinite(x) ? x : SETTLEMENT_SNAP_OFFSET[key].x;
  const ny = Number.isFinite(y) ? y : SETTLEMENT_SNAP_OFFSET[key].y;
  SETTLEMENT_SNAP_OFFSET[key] = { x: nx, y: ny };
}

function getSettlementSnapOffset(kind = "small") {
  const key = kind === "large" ? "large" : "small";
  return SETTLEMENT_SNAP_OFFSET[key] || { x: 0, y: 0 };
}

const HOME_BUILD_COSTS = {
  reconUnit: { chits: 10, components: 1, food: 12, water: 12 },
  vehicleUnit: { chits: 20, gas: 10, food: 12, water: 12, wood: 5, components: 5 },
  trainUnit: { chits: 10, components: 1 },
  levelUpUnit: { chits: 10, components: 1 },
  levelUpVehicle: { chits: 20, components: 2 },
  weaponUpgrade: { chits: 20, components: 1, wood: 1 },
  weaponUpgradeVehicle: { chits: 20, components: 1, wood: 1 },
  baseLevelTwo: { chits: 30, food: 10, water: 10, wood: 10 },
  baseLevelThree: { chits: 30, components: 5, food: 5, water: 5, wood: 10 },
  solarPanel: CONFIG.crafting.solarPanel.cost,
  binocs: { components: 10, wood: 1, chits: 2 },
  luckyCharm: { components: 5, wood: 5 },
  firesale: {},
  waterConservation: { chits: 30, components: 1 },
  foodRationing: { chits: 30, wood: 1 },
  rescueDrone: { chits: 30, water: 2, food: 2 },
  gasDrone: { chits: 30, gas: 5 },
};
const TRAINING_PATHS = {
  soldier: ["soldier1", "soldier2", "soldier6", "soldier1", "soldier9","soldier7", "soldier8", "soldier14", "soldier18", "soldier16", "soldier13", "soldier17", "soldier15"],
};
const DEFAULT_TRAINING_PATH = "soldier";
const DEFAULT_SPRITE_STAGE = Math.max(0, TRAINING_PATHS[DEFAULT_TRAINING_PATH].indexOf("soldier2"));

// Settlement coordinates are expressed as % across the basemap (0-100).
// The current values were snapped to red-circle centroids in basemaplocs.jpg.
const NODE_PRESETS = [
  {
    id: "home",
    name: "Home Bunker",
    pos: { x: 29, y: 51.5 },
    type: "player",
    stronghold: true,
    defense: 2,
    yields: { chits: 1, food: 1, gas: 1 },
    reward: { gas: 2 },
  },
  {
    id: "bayBridge",
    name: "Bay Bridge Wreck",
    pos: { x: 40.3, y: 18.69 },
    type: "neutral",
    stronghold: false,
    defense: 1,
    yields: { chits: 1, components: 1 },
    movePenaltyGas: 1,
  },
  {
    id: "berkeley",
    name: "Berkeley Hills",
    pos: { x: 53.2, y: 20.69 },
    type: "neutral",
    stronghold: false,
    defense: 1,
    yields: { wood: 1, food: 1 },
  },
  {
    id: "tesroRefinery",
    name: "Tesro Refinery",
    pos: { x: 37.13, y: 28.01 },
    type: "neutral",
    stronghold: false,
    defense: 1,
    yields: { gas: 1, components: 1 },
  },
  {
    id: "richmond",
    name: "Richmond Ruins",
    pos: { x: 52.42, y: 1.83 },
    type: "enemy",
    stronghold: true,
    defense: 3,
    yields: { components: 2 },
    reward: { chits: 3, components: 1 },
  },
  {
    id: "marin",
    name: "Marin Foothills",
    pos: { x: 18.81, y: 41.09 },
    type: "enemy",
    stronghold: false,
    defense: 2,
    yields: { wood: 1, water: 1 },
  },
  {
    id: "oakland",
    name: "Danville Hydroponics",
    pos: { x: 39.59, y: 49.78 },
    type: "neutral",
    stronghold: true,
    defense: 2,
    yields: { gas: 1, components: 1 },
    movePenaltyGas: 1,
  },
  {
    id: "peninsula",
    name: "Peninsula Farms",
    pos: { x: 24, y: 57 },
    type: "enemy",
    stronghold: false,
    defense: 1,
    yields: { food: 2, water: 1 },
  },
  {
    id: "sanMateo",
    name: "San Mateo Yard",
    pos: { x: 69.86, y: 59.32 },
    type: "enemy",
    stronghold: false,
    defense: 2,
    yields: { chits: 1, gas: 1 },
  },
  {
    id: "sanJose",
    name: "South Bay Depot",
    pos: { x: 82.47, y: 95.25 },
    type: "enemy",
    stronghold: true,
    defense: 3,
    yields: { chits: 1, components: 1, gas: 1 },
    reward: { chits: 2, gas: 2 },
  },
  {
    id: "ardenasettlement",
    name: "Ardena",
    pos: { x: 56.54, y: 60.84 },
    type: "neutral",
    stronghold: false,
    defense: 1,
    yields: { chits: 1, food: 1 },
  },
  {
    id: "santaCruz",
    name: "Santa Cruz Outpost",
    pos: { x: 36, y: 70.76 },
    type: "neutral",
    stronghold: false,
    defense: 1,
    yields: { food: 1, wood: 1 },
  },
];
const SETTLEMENT_UPKEEP_BLOCKED_KEYS = new Set(["chits"]);
function sanitizeSettlementUpkeep(upkeep = {}) {
  const safe = {};
  for (const [key, amount] of Object.entries(upkeep || {})) {
    if (SETTLEMENT_UPKEEP_BLOCKED_KEYS.has(key)) continue;
    const num = Number(amount) || 0;
    if (num > 0) safe[key] = num;
  }
  return safe;
}
const HOME_BASE_UPKEEP = sanitizeSettlementUpkeep({ chits: 7, food: 4, water: 4 });
const LARGE_SETTLEMENT_UPKEEP = sanitizeSettlementUpkeep({ food: 2, water: 2 });

// Centralized settlement naming so you can tweak labels in one place.
const SETTLEMENT_NAMES = {
  home: "Outpost 06",
  bayBridge: "Neon City",
  berkeley: "Antioch Radswamp", 
  tesroRefinery: "Tesro Refinery",
  richmond: "Rice Fields",
  marin: "Marin Foothills",
  oakland: "Danville Hydroponics",
  peninsula: "Embarcadero",
  sanMateo: "Weston Ranch",
  sanJose: "Livingston Depot",
  ardenasettlement: "Ardena",
  santaCruz: "Radio Fremont",
};
// Allows pinning specific atlas frames to settlements by id. Values can be:
// - number: frame index (0-based) applied to all owner variants
// - string: exact frame name (must exist in the owner atlas), or a name ending in "-N" to match by index suffix
const SETTLEMENT_FRAME_OVERRIDES = {
  ardenasettlement: 8,
  santaCruz: 12,
  richmond: 4,
  tesroRefinery: 11,
  sanJose: 14,
  oakland: 10,
  marin: 3,
  peninsula: 5, 
  sanMateo: 6,
  bayBridge: 13,
  berkeley: 2,
};
const SETTLEMENT_IMAGE_OVERRIDES = {
  "Tesro Refinery": "assets/images/Tesro.jpg",
};

const DAM_PRESETS = [
  { id: "camancheDam", name: "Camanche Dam", pos: { x: 73.8, y: 4.25 } },
  { id: "newHoganDam", name: "New Hogan Dam", pos: { x: 81.28, y: 12.71 } },
  { id: "donPedroDam", name: "Don Pedro Dam", pos: { x: 95.17, y: 64.18 } },
  { id: "newMelonesDam", name: "New Melones Dam", pos: { x: 91.43, y: 35.92 } },
];

const EDGES = [
  ["home", "bayBridge"],
  ["home", "peninsula"],
  ["home", "sanMateo"],
  ["bayBridge", "berkeley"],
  ["bayBridge", "tesroRefinery"],
  ["berkeley", "tesroRefinery"],
  ["bayBridge", "oakland"],
  ["berkeley", "richmond"],
  ["berkeley", "marin"],
  ["oakland", "sanMateo"],
  ["sanMateo", "peninsula"],
  ["peninsula", "santaCruz"],
  ["sanMateo", "sanJose"],
  ["sanJose", "santaCruz"],
  ["oakland", "sanJose"],
];

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
function fmtResourceKey(key) {
  const map = {
    chits: "Chits",
    wood: "Wood",
    gas: "Gas",
    components: "Components",
    water: "Water",
    food: "Food",
    ap: "Action Points",
  };
  return map[key] || key;
}

function summarizeResources(obj) {
  return RESOURCE_KEYS.map((k) => `${fmtResourceKey(k)}: ${obj[k] || 0}`).join(", ");
}

function greekSuffix(index = 0) {
  const greek = ["\u0391", "\u0392", "\u0393", "\u0394", "\u0395", "\u0396", "\u0397", "\u0398", "\u0399", "\u039A", "\u039B", "\u039C", "\u039D", "\u039E", "\u039F", "\u03A0", "\u03A1", "\u03A3", "\u03A4", "\u03A5", "\u03A6", "\u03A7", "\u03A8", "\u03A9"];
  const spelled = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi", "Rho", "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega"];
  const cycle = greek.length;
  const tier = Math.floor(index / cycle); // after omega, start ?2, ?2, etc.
  const pos = index % cycle;
  const glyph = greek[pos] || "";
  const word = spelled[pos] || `Unit${index + 1}`;
  return {
    glyph: tier > 0 ? `${glyph}${tier + 1}` : glyph,
    word: tier > 0 ? `${word} ${tier + 1}` : word,
    tier,
  };
}
let cachedGreekSupport = null;
function canRenderGreek(sampleFont = "Share Tech Mono, monospace") {
  if (cachedGreekSupport !== null) return cachedGreekSupport;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      cachedGreekSupport = false;
      return cachedGreekSupport;
    }
    ctx.font = `16px ${sampleFont}`;
    const glyph = ctx.measureText("\u0391").width;
    const fallback = ctx.measureText("A").width;
    cachedGreekSupport = Math.abs(glyph - fallback) > 0.1;
  } catch (err) {
    cachedGreekSupport = false;
  }
  return cachedGreekSupport;
}

function iconForResource(key) {
  return RESOURCE_ICONS[key] || "?";
}

function resourceListMarkup(obj) {
  return RESOURCE_KEYS.filter((k) => obj[k]).map((k) => {
    return `<span class="res-pill"><span class="res-ic">${iconForResource(k)}</span>${obj[k]} ${fmtResourceKey(k)}</span>`;
  }).join(" ");
}

const GAME_OVER_NARRATIVES = {
  food: "Hunger hollowed out the camp and discipline snapped. Starvation, leading to riots, had people tearing through the streets. The last stores were stripped bare. The resourceful few fled to take their chances in the wilderness, while stife and desolation consumed the base.",
  water: "With no more water coming into the town from scavenging missions, tanks went dry and the heat did the rest. Thirst killed the weak first, then the rest, who fought for scraps until the town fell silent.",
  demo: "And that, friend, is unfortunately the end of the demo as turn 10 has been reached. Hope you enjoyed playing it!",
  rangers: "All of your rangers have perished in the wasteland. With no one left to scout, scavenge or stand watch, the supply runs stopped and the radio went quiet. The outpost held on for a while, then the dust took it like everything else.",
};
const MISSION_COMPLETE_NARRATIVE = "After long last, weeks toiling through the wasteland, pushing yourself and your squad through senseless violence, sadness and desolation, you reach your destination. A green, verdant landscape unfolds before you, with a massive freshwater lake, anchored by a gushing dam, promising an end to water and food troubles. You radio your finding back into base, as you gaze down as the radioactive lowlands behind, crying tears of joy.";

// Firesale trades stockpile goods for chits each turn. With nothing to sell it pays
// nothing (and charges nothing) instead of handing out free chits.
const FIRESALE_INCOME = { chits: 3 };
const FIRESALE_UPKEEP = { gas: 2, components: 2, wood: 2 };
function isFiresaleTradingThisTurn(state) {
  if (!hasPurchasedUpgrade(state, HOME_BUILD_IDS.firesale)) return false;
  return !!state?.resources?.canAfford?.(FIRESALE_UPKEEP);
}

function ensureCriticalResourceFloor(state) {
  if (!state?.resources?.resources) return;
  ["food", "water"].forEach((key) => {
    const raw = Number(state.resources.get(key)) || 0;
    const safe = Math.max(0, Math.floor(raw));
    if (safe !== raw) {
      state.resources.resources[key] = safe;
    }
  });
}

function showGameOverOverlay(reasonKey) {
  const overlay = document.getElementById("gameOverOverlay");
  if (!overlay) return;
  stopLiveScoreTicker();
  const reasonEl = document.getElementById("gameOverReason");
  const narrative = GAME_OVER_NARRATIVES[reasonKey] || "The town falls to ruin.";
  if (reasonEl) {
    reasonEl.textContent = narrative;
  }
  // Lets style.css vary the screen per cause (e.g. [data-reason="rangers"]).
  overlay.dataset.reason = reasonKey || "";
  overlay.classList.remove("hidden");
  overlay.classList.add("is-visible");
  overlay.setAttribute("aria-hidden", "false");
}

// Ends the run when the last living ranger dies. Dead units stay on the map.
function checkGameOverNoRangers(state) {
  if (!state || state.gameOver || state.missionComplete) return false;
  if (!Array.isArray(state.rangerUnits) || !state.rangerUnits.length) return false;
  if (countLivingRangerUnits(state) > 0) return false;
  state.gameOver = true;
  state.gameOverReason = "rangers";
  cancelEncounterTimer();
  showGameOverOverlay("rangers");
  return true;
}

function showMissionCompleteOverlay() {
  const overlay = document.getElementById("missionOverlay");
  if (!overlay) return;
  stopLiveScoreTicker();
  const reasonEl = document.getElementById("missionReason");
  const statsEl = document.getElementById("missionStats");
  const state = getGlobalGameState();
  if (reasonEl) {
    reasonEl.textContent = MISSION_COMPLETE_NARRATIVE;
  }
  if (statsEl) {
    if (state) {
      const durationMs = getRunElapsedMs(state);
      const turns = Number(state.turn) || 0;
      const difficultyKey = state.difficultyKey || "medium";
      const hardcore = !!state.hardcore;
      const advanced = state.advancedDifficulty || {};
      const smallSettlementCount = Number.isFinite(Number(advanced.smallSettlementCount))
        ? Number(advanced.smallSettlementCount)
        : null;
      const unitSpeedSlider = Number.isFinite(Number(advanced.unitSpeedSlider))
        ? Number(advanced.unitSpeedSlider)
        : null;
      const turnsTaken = Math.max(0, turns - 1);
      const scoreEntry = { difficultyKey, durationMs, hardcore, turnsTaken };
      if (smallSettlementCount != null) scoreEntry.smallSettlementCount = smallSettlementCount;
      if (unitSpeedSlider != null) scoreEntry.unitSpeedSlider = unitSpeedSlider;
      const score = computeRunScore(scoreEntry);
      const modeLabel = hardcore ? " \u2022 Hardcore" : "";
      statsEl.textContent = `Difficulty: ${formatDifficultyKey(difficultyKey)}${modeLabel} \u2022 Time: ${formatRunDuration(durationMs)} \u2022 Turns: ${turns} \u2022 Score: ${score}`;
      if (!state.missionCompleteRecorded) {
        recordHighScore({
          difficultyKey,
          durationMs,
          turns,
          completedAt: Date.now(),
          score,
          hardcore,
          smallSettlementCount,
          unitSpeedSlider,
        });
        state.missionCompleteRecorded = true;
      }
    } else {
      statsEl.textContent = "";
    }
  }
  overlay.classList.remove("hidden");
  overlay.classList.add("is-visible");
  overlay.setAttribute("aria-hidden", "false");
}

function checkGameOverResources(state, { showOverlay = false } = {}) {
  if (!state || state.gameOver) return false;
  ensureCriticalResourceFloor(state);
  const critical = ["food", "water"];
  for (const key of critical) {
    const val = state.resources.get(key);
    if (val <= 0) {
      if (showOverlay) {
        state.gameOver = true;
        state.gameOverReason = key;
        showGameOverOverlay(key);
      }
      return true;
    }
  }
  return false;
}

function renderResources(state) {
  const panel = document.getElementById("resourcePanel");
  if (!panel || !state) return;
  panel.innerHTML = "";
  ensureCriticalResourceFloor(state);
  const label = document.createElement("div");
  label.className = "resource-label";
  label.innerHTML = `<span class="base-emoji">\uD83C\uDFF0</span> Lvl ${state.baseLevel || 1}. Stockpile:`;
  panel.appendChild(label);
  for (const key of RESOURCE_KEYS) {
    const pill = document.createElement("div");
    pill.className = "resource-pill";
    pill.innerHTML = `<span class="res-ic">${iconForResource(key)}</span>${fmtResourceKey(key)}: <span class="resource-value" data-resource-key="${key}">${state.resources.get(key)}</span>`;
    panel.appendChild(pill);
  }
  const homeBuildList = document.getElementById("homeBuildList");
  if (homeBuildList) {
    updateUpgradeWindow(state, homeBuildList);
  }
}

function snapshotStockpileResources(state) {
  const snapshot = {};
  if (!state?.resources) return snapshot;
  RESOURCE_KEYS.forEach((key) => {
    snapshot[key] = Number(state.resources.get(key)) || 0;
  });
  return snapshot;
}

function clearResourceValueFx(panel = document.getElementById("resourcePanel")) {
  if (!panel) return;
  panel.querySelectorAll(".resource-value").forEach((el) => {
    if (el._resourceValueFxTimeouts) {
      el._resourceValueFxTimeouts.forEach((id) => clearTimeout(id));
      el._resourceValueFxTimeouts = null;
    }
    el.classList.remove(
      "bonus-transition",
      "bonus-transition-start",
      "bonus-transition-swap",
      "bonus-transition-positive",
      "bonus-transition-negative"
    );
  });
}

function runBonusTransitionAnimation(el, fromText, toText, direction) {
  if (!el) return;
  if (fromText === toText) {
    el.textContent = toText;
    return;
  }
  if (el._resourceValueFxTimeouts) {
    el._resourceValueFxTimeouts.forEach((id) => clearTimeout(id));
  }
  el._resourceValueFxTimeouts = [];
  el.classList.remove(
    "bonus-transition",
    "bonus-transition-start",
    "bonus-transition-swap",
    "bonus-transition-positive",
    "bonus-transition-negative"
  );
  const directionClass = direction === "negative" ? "bonus-transition-negative" : "bonus-transition-positive";
  el.textContent = fromText;
  el.classList.add("bonus-transition", "bonus-transition-start", directionClass);
  const swapId = setTimeout(() => {
    el.classList.remove("bonus-transition-start");
    el.classList.add("bonus-transition-swap");
    el.textContent = toText;
  }, 180);
  const settleId = setTimeout(() => {
    if (el._resourceValueFxTimeouts) {
      el._resourceValueFxTimeouts.forEach((id) => clearTimeout(id));
      el._resourceValueFxTimeouts = null;
    }
    el.classList.remove(
      "bonus-transition",
      "bonus-transition-start",
      "bonus-transition-swap",
      "bonus-transition-positive",
      "bonus-transition-negative"
    );
    el.textContent = toText;
  }, 520);
  el._resourceValueFxTimeouts = [swapId, settleId];
}

function animateResourceValueTransition(resourceKey, fromValue, toValue, delta) {
  const panel = document.getElementById("resourcePanel");
  const el = panel?.querySelector(`.resource-value[data-resource-key="${resourceKey}"]`);
  if (!el) return;
  const fromVal = Number.isFinite(fromValue) ? Math.trunc(fromValue) : Math.trunc(Number(fromValue) || 0);
  const toVal = Number.isFinite(toValue) ? Math.trunc(toValue) : Math.trunc(Number(toValue) || 0);
  runBonusTransitionAnimation(el, `${fromVal}`, `${toVal}`, delta < 0 ? "negative" : "positive");
}

const LIVE_SCORE_VISIBLE_KEY = "frtd.liveScoreVisible.v1";

function isLiveScoreVisiblePref() {
  if (typeof window === "undefined" || !window.localStorage) return true;
  const raw = window.localStorage.getItem(LIVE_SCORE_VISIBLE_KEY);
  if (raw === null) return true;
  return raw !== "false";
}

function setLiveScoreVisiblePref(visible) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(LIVE_SCORE_VISIBLE_KEY, visible ? "true" : "false");
  } catch (_) {
    // storage full or unavailable; the setting just won't persist
  }
}

function applyLiveScoreVisibility(visible) {
  const widget = document.getElementById("liveScoreWidget");
  if (widget) widget.classList.toggle("hidden", !visible);
  if (visible) {
    const state = getGlobalGameState();
    if (state && !liveScoreTickHandle) startLiveScoreTicker(state);
  } else {
    stopLiveScoreTicker();
  }
}

let liveScoreDisplayed = null;
let liveScoreTickHandle = null;

function formatLiveScore(value) {
  return Number(value).toLocaleString("en-US");
}

function refreshLiveScoreHud(state, { animate = true } = {}) {
  const el = document.getElementById("liveScoreValue");
  if (!el || !state) return;
  const next = getLiveRunScore(state);
  if (liveScoreDisplayed === null || !animate) {
    el.textContent = formatLiveScore(next);
    liveScoreDisplayed = next;
    return;
  }
  if (next === liveScoreDisplayed) return;
  const delta = next - liveScoreDisplayed;
  runBonusTransitionAnimation(el, formatLiveScore(liveScoreDisplayed), formatLiveScore(next), delta < 0 ? "negative" : "positive");
  liveScoreDisplayed = next;
}

function startLiveScoreTicker(state) {
  stopLiveScoreTicker();
  liveScoreDisplayed = null;
  const visible = isLiveScoreVisiblePref();
  const widget = document.getElementById("liveScoreWidget");
  if (widget) widget.classList.toggle("hidden", !visible);
  refreshLiveScoreHud(state, { animate: false });
  if (!visible) return;
  liveScoreTickHandle = setInterval(() => {
    const current = getGlobalGameState();
    if (current) refreshLiveScoreHud(current);
  }, LIVE_SCORE_TICK_MS);
}

function stopLiveScoreTicker() {
  if (liveScoreTickHandle) {
    clearInterval(liveScoreTickHandle);
    liveScoreTickHandle = null;
  }
}

function animateEndTurnResourceDiffs(state, beforeSnapshot) {
  if (!state || !beforeSnapshot) return;
  const afterSnapshot = snapshotStockpileResources(state);
  RESOURCE_KEYS.forEach((key) => {
    const before = Number(beforeSnapshot[key]) || 0;
    const after = Number(afterSnapshot[key]) || 0;
    const delta = after - before;
    if (!delta) return;
    animateResourceValueTransition(key, before, after, delta);
  });
}

function hasResourceValues(obj) {
  return RESOURCE_KEYS.some((key) => (obj?.[key] || 0) > 0);
}

function addResourceTotals(target, source, multiplier = 1) {
  if (!target || !source) return;
  RESOURCE_KEYS.forEach((key) => {
    const val = source[key] || 0;
    if (!val) return;
    target[key] = (target[key] || 0) + val * multiplier;
  });
}

function getTempUpkeepEffects(state) {
  if (!state) return { food: 0, water: 0 };
  const source = state.tempUpkeepEffects || {};
  return {
    food: Math.max(0, Math.trunc(source.food || 0)),
    water: Math.max(0, Math.trunc(source.water || 0)),
  };
}

function applyTempUpkeepReductions(upkeep, state, reductionRows = null) {
  const next = sanitizeSettlementUpkeep(upkeep || {});
  const effects = getTempUpkeepEffects(state);
  if (effects.water > 0 && next.water > 0) {
    const original = next.water;
    next.water = Math.floor(original / 2);
    if (Array.isArray(reductionRows) && original !== next.water) {
      reductionRows.push({
        label: "Water Conservation",
        tag: `${effects.water} turn${effects.water === 1 ? "" : "s"} left`,
        amounts: { water: original - next.water },
      });
    }
  }
  if (effects.food > 0 && next.food > 0) {
    const original = next.food;
    next.food = Math.floor(original / 2);
    if (Array.isArray(reductionRows) && original !== next.food) {
      reductionRows.push({
        label: "Food Rationing",
        tag: `${effects.food} turn${effects.food === 1 ? "" : "s"} left`,
        amounts: { food: original - next.food },
      });
    }
  }
  return next;
}

function buildRescueDroneMeterHtml(unit, key, maxOverride = null) {
  const limits = getUnitInventoryLimits(unit);
  const max = Math.max(1, Math.trunc(maxOverride || limits[key] || 20));
  const value = Math.max(0, Math.min(max, Math.trunc(unit?.inventory?.[key] || 0)));
  const icon = iconForResource(key);
  let cells = "";
  for (let i = 0; i < max; i += 1) {
    cells += `<span class="unit-meter-chip${i < value ? " is-filled" : ""}"></span>`;
  }
  return `<div class="unit-meter-line"><span class="unit-meter-label">${icon}</span><span class="unit-meter-grid" aria-label="${fmtResourceKey(key)} ${value} of ${max}">${cells}</span><span class="unit-meter-value">${value}/${max}</span></div>`;
}

function buildRescueDroneStatusHtml(unit) {
  return `${buildRescueDroneMeterHtml(unit, "food")}${buildRescueDroneMeterHtml(unit, "water")}`;
}

function buildGasDroneStatusHtml(unit) {
  return buildRescueDroneMeterHtml(unit, "gas");
}

function buildTurnUpkeepTotals(state, { includeReductionRows = false } = {}) {
  const total = {};
  const rows = includeReductionRows ? [] : null;
  const homeBaseUpkeep = sanitizeSettlementUpkeep(HOME_BASE_UPKEEP);
  const largeSettlementUpkeep = sanitizeSettlementUpkeep(LARGE_SETTLEMENT_UPKEEP);
  if (!state) return { total, reductionRows: rows || [] };
  for (const node of state.nodes || []) {
    if (node.owner !== "player") continue;
    if (node.id === "home") {
      addResourceTotals(total, homeBaseUpkeep, 1);
      continue;
    }
    if (hasResourceValues(largeSettlementUpkeep)) {
      addResourceTotals(total, largeSettlementUpkeep, 1);
    }
  }
  if (isFiresaleTradingThisTurn(state)) {
    addResourceTotals(total, FIRESALE_UPKEEP, 1);
  }
  const unitUpkeep = typeof state.getUnitUpkeep === "function"
    ? state.getUnitUpkeep()
    : { food: 0, water: 0 };
  if (hasResourceValues(unitUpkeep)) {
    addResourceTotals(total, unitUpkeep, 1);
  }
  return {
    total: applyTempUpkeepReductions(total, state, rows),
    reductionRows: rows || [],
  };
}

function buildEndTurnBreakdown(state) {
  const homeBaseUpkeep = sanitizeSettlementUpkeep(HOME_BASE_UPKEEP);
  const largeSettlementUpkeep = sanitizeSettlementUpkeep(LARGE_SETTLEMENT_UPKEEP);
  const incomeRows = [];
  const expenseRows = [];
  const incomeTotals = {};
  const expenseTotals = {};
  if (!state) return { incomeRows, expenseRows, netTotals: {} };

  for (const node of state.nodes || []) {
    if (node.owner !== "player" || node.id === "home") continue;
    const income = deepClone(node.yields || {});
    if (hasResourceValues(income)) {
      incomeRows.push({ label: node.name || "Settlement", amounts: income });
      addResourceTotals(incomeTotals, income, 1);
    }
    if (hasResourceValues(largeSettlementUpkeep)) {
      expenseRows.push({ label: node.name || "Settlement", amounts: largeSettlementUpkeep, includeInNet: true });
      addResourceTotals(expenseTotals, largeSettlementUpkeep, 1);
    }
  }

  for (const settlement of state.smallSettlements || []) {
    if (settlement.owner !== "player" || !hasSettlementIncome(settlement)) continue;
    incomeRows.push({ label: settlement.name || "Settlement", amounts: settlement.yields });
    addResourceTotals(incomeTotals, settlement.yields, 1);
  }

  if (hasResourceValues(homeBaseUpkeep)) {
    expenseRows.push({ label: "Home Base", amounts: homeBaseUpkeep, includeInNet: true });
    addResourceTotals(expenseTotals, homeBaseUpkeep, 1);
  }
  if (hasPurchasedUpgrade(state, HOME_BUILD_IDS.solarPanel)) {
    const solarIncome = deepClone(CONFIG.crafting.solarPanel.incomeBoost || {});
    if (hasResourceValues(solarIncome)) {
      incomeRows.push({ label: "Home Base", tag: "Solar", amounts: solarIncome });
      addResourceTotals(incomeTotals, solarIncome, 1);
    }
  }
  if (isFiresaleTradingThisTurn(state)) {
    const firesaleIncome = { ...FIRESALE_INCOME };
    const firesaleUpkeep = { ...FIRESALE_UPKEEP };
    incomeRows.push({ label: "Firesale", tag: "Equipment", amounts: firesaleIncome });
    addResourceTotals(incomeTotals, firesaleIncome, 1);
    expenseRows.push({ label: "Firesale", tag: "Equipment", amounts: firesaleUpkeep, includeInNet: true });
    addResourceTotals(expenseTotals, firesaleUpkeep, 1);
  }
  const unitUpkeep = typeof state.getUnitUpkeep === "function"
    ? state.getUnitUpkeep()
    : { food: 0, water: 0 };
  if (hasResourceValues(unitUpkeep)) {
    expenseRows.push({ label: "Units", amounts: unitUpkeep, includeInNet: true });
    addResourceTotals(expenseTotals, unitUpkeep, 1);
  }
  const { reductionRows } = buildTurnUpkeepTotals(state, { includeReductionRows: true });
  reductionRows.forEach((row) => {
    incomeRows.push({ ...row, tag: row.tag || "Equipment" });
    addResourceTotals(incomeTotals, row.amounts, 1);
  });

  const netTotals = {};
  RESOURCE_KEYS.forEach((key) => {
    const income = incomeTotals[key] || 0;
    const expense = expenseTotals[key] || 0;
    if (income || expense) netTotals[key] = income - expense;
  });

  return { incomeRows, expenseRows, netTotals };
}

function renderEndTurnTooltip(state) {
  const tip = document.getElementById("endTurnTooltip");
  if (!tip || !state) return;
  tip.innerHTML = "";
  const { incomeRows, expenseRows, netTotals } = buildEndTurnBreakdown(state);

  const title = document.createElement("div");
  title.className = "end-turn-tooltip-title";
  title.textContent = "End of Turn Ledger";
  tip.appendChild(title);

  const buildLedgerSection = (label, rows, mode) => {
    const section = document.createElement("div");
    section.className = "end-turn-tooltip-section";
    const heading = document.createElement("div");
    heading.className = "end-turn-tooltip-heading";
    heading.textContent = label;
    section.appendChild(heading);

    const ledger = document.createElement("div");
    ledger.className = "end-turn-ledger";
    const header = document.createElement("div");
    header.className = "end-turn-ledger-row end-turn-ledger-header";
    const headLabel = document.createElement("div");
    headLabel.className = "end-turn-cell end-turn-label-cell";
    headLabel.textContent = "Source";
    header.appendChild(headLabel);
    RESOURCE_KEYS.forEach((key) => {
      const cell = document.createElement("div");
      cell.className = "end-turn-cell end-turn-resource-head";
      cell.innerHTML = `<span class="res-ic" title="${fmtResourceKey(key)}">${iconForResource(key)}</span>`;
      header.appendChild(cell);
    });
    ledger.appendChild(header);

    if (!rows.length) {
      const emptyRow = document.createElement("div");
      emptyRow.className = "end-turn-ledger-row";
      const emptyCell = document.createElement("div");
      emptyCell.className = "end-turn-cell end-turn-label-cell end-turn-empty";
      emptyCell.textContent = "None yet.";
      emptyRow.appendChild(emptyCell);
      RESOURCE_KEYS.forEach(() => {
        const cell = document.createElement("div");
        cell.className = "end-turn-cell end-turn-resource-cell";
        cell.textContent = "—";
        emptyRow.appendChild(cell);
      });
      ledger.appendChild(emptyRow);
      section.appendChild(ledger);
      return section;
    }

    rows.forEach((row) => {
      const line = document.createElement("div");
      line.className = "end-turn-ledger-row";
      const labelEl = document.createElement("div");
      labelEl.className = "end-turn-cell end-turn-label-cell";
      labelEl.textContent = row.label;
      if (row.tag) {
        const tag = document.createElement("span");
        tag.className = "end-turn-tag";
        tag.textContent = row.tag;
        labelEl.appendChild(tag);
      }
      line.appendChild(labelEl);
      RESOURCE_KEYS.forEach((key) => {
        const val = row.amounts?.[key] || 0;
        const cell = document.createElement("div");
        cell.className = "end-turn-cell end-turn-resource-cell";
        if (val) {
          const sign = mode === "income" ? "+" : "-";
          cell.classList.add(mode === "income" ? "end-turn-positive" : "end-turn-negative");
          cell.textContent = `${sign}${val}`;
        } else {
          cell.textContent = "—";
        }
        line.appendChild(cell);
      });
      ledger.appendChild(line);
    });

    section.appendChild(ledger);
    return section;
  };

  tip.appendChild(buildLedgerSection("Income", incomeRows, "income"));
  tip.appendChild(buildLedgerSection("Upkeep", expenseRows, "expense"));

  const netSection = document.createElement("div");
  netSection.className = "end-turn-tooltip-net";
  const netLedger = document.createElement("div");
  netLedger.className = "end-turn-ledger end-turn-ledger-net";
  const netRow = document.createElement("div");
  netRow.className = "end-turn-ledger-row";
  const netLabelCell = document.createElement("div");
  netLabelCell.className = "end-turn-cell end-turn-label-cell";
  netLabelCell.textContent = "Net Change";
  netRow.appendChild(netLabelCell);
  RESOURCE_KEYS.forEach((key) => {
    const val = netTotals[key] || 0;
    const cell = document.createElement("div");
    cell.className = "end-turn-cell end-turn-resource-cell";
    if (val > 0) {
      cell.classList.add("end-turn-positive");
      cell.textContent = `+${val}`;
    } else if (val < 0) {
      cell.classList.add("end-turn-negative");
      cell.textContent = `-${Math.abs(val)}`;
    } else {
      cell.classList.add("end-turn-neutral");
      cell.textContent = "—";
    }
    netRow.appendChild(cell);
  });
  netLedger.appendChild(netRow);
  netSection.appendChild(netLedger);
  tip.appendChild(netSection);

  const note = document.createElement("div");
  note.className = "end-turn-tooltip-note";
  note.textContent = "Applies at next turn start. Upkeeps draw from the base stockpile.";
  tip.appendChild(note);
}
 
// ---------------------------------------------------------------------------
// Core systems: resources, nodes, squad, game state
// ---------------------------------------------------------------------------

class Logger {
  constructor(element) {
    this.el = element;
  }
  log(msg, { id = null } = {}) {
    if (!this.el) return null;
    const entry = document.createElement("div");
    const time = new Date().toLocaleTimeString();
    const prefix = `[${time}]`;
    entry.dataset.timestamp = prefix;
    if (id) entry.dataset.logId = id;
    entry.textContent = `${prefix} ${msg}`;
    this.el.prepend(entry);
    return entry;
  }
  update(entryOrId, msg) {
    if (!this.el || !entryOrId) return null;
    let entry = entryOrId;
    if (typeof entryOrId === "string") {
      entry = this.el.querySelector(`[data-log-id="${entryOrId}"]`);
    }
    if (!entry) return null;
    const prefix = entry.dataset?.timestamp || (entry.textContent.match(/^\[[^\]]+\]/) || [])[0] || "";
    const cleanPrefix = prefix || `[${new Date().toLocaleTimeString()}]`;
    entry.dataset.timestamp = cleanPrefix;
    entry.textContent = cleanPrefix ? `${cleanPrefix} ${msg}` : msg;
    return entry;
  }
}

class ResourceManager {
  constructor(initial) {
    this.resources = { ...initial };
  }
  get(key) {
    return this.resources[key] || 0;
  }
  add(obj) {
    for (const k of Object.keys(obj)) {
      this.resources[k] = (this.resources[k] || 0) + obj[k];
    }
  }
  canAfford(cost) {
    return Object.keys(cost).every((k) => this.get(k) >= cost[k]);
  }
  spend(cost, onLoss) {
    if (!this.canAfford(cost)) return false;
    for (const k of Object.keys(cost)) {
      const before = this.get(k);
      this.resources[k] -= cost[k];
      const delta = Math.max(0, before - this.get(k));
      if (delta && typeof onLoss === "function") onLoss(k, delta);
    }
    return true;
  }
  applyYield(yieldObj) {
    this.add(yieldObj);
  }
  applyUpkeep(upkeep, onLoss) {
    for (const k of Object.keys(upkeep)) {
      const before = this.get(k);
      this.resources[k] = Math.max(0, this.get(k) - upkeep[k]);
      const delta = Math.max(0, before - this.get(k));
      if (delta && typeof onLoss === "function") onLoss(k, delta);
    }
  }
}

class MapNode {
  constructor(data) {
    Object.assign(this, data);
    this.owner = data.type; // player, enemy, neutral
    this.hasSolar = false;
  }
}

class SmallSettlement {
  constructor({ id, frame, pos, name, owner = "neutral", yields = null, joinedFaction = false, lastKnownOwner = null }) {
    this.id = id;
    this.frame = frame;
    this.pos = pos; // { x, y } in map percent coords
    this.name = name || id;
    this.owner = owner;
    this.yields = yields ? deepClone(yields) : null;
    this.joinedFaction = !!joinedFaction;
    this.lastKnownOwner = lastKnownOwner || null;
  }
}

class RangerSquad {
  constructor(startNode) {
    this.spawnNode = startNode;
    this.currentNode = null;
    this.deployed = false;
    this.movePoints = 0;
    this.moveRange = CONFIG.movePointsPerTurn; // number of grid squares per move
    this.currentUnitId = null; // links to a Ranger unit in game state
    this.positionPct = null; // { x, y } expressed as % across the basemap
    this.moveTargetPct = null; // destination for free-move marches
    this.isMoving = false;
    this.justDeployed = false;
    this.hasLeftHome = false;
  }
  resetMoves() {
    this.movePoints = CONFIG.movePointsPerTurn;
  }

  deploy(nodeId, positionPct = null) {
    this.currentNode = nodeId;
    this.deployed = true;
    this.resetMoves();
    this.positionPct = positionPct ? { x: positionPct.x, y: positionPct.y } : null;
    this.moveTargetPct = null;
    this.isMoving = false;
    this.justDeployed = true;
  }
}

function getUnitMaxAp(unit) {
  const base = 5;
  const bonus = unit?.apBonus || 0;
  return base + Math.max(0, bonus);
}

function getUnitInventoryLimits(unit) {
  return {
    gas: 20,
    water: 20,
    food: 20,
    chits: 20,
    wood: 10,
    components: 30,
    ap: getUnitMaxAp(unit),
  };
}

function getUnitRemainingCapacity(unit, key) {
  if (!unit?.inventory || !key) return 0;
  const limits = getUnitInventoryLimits(unit);
  const max = Number.isFinite(limits[key]) ? limits[key] : 0;
  const current = typeof unit.inventory[key] === "number" ? unit.inventory[key] : 0;
  return Math.max(0, max - Math.max(0, current));
}

class GameState {
  constructor(options = {}) {
    this.nodes = NODE_PRESETS.map((n) => {
      const node = deepClone(n);
      node.name = SETTLEMENT_NAMES[node.id] || node.name;
      return new MapNode(node);
    });
    this.nodeMap = new Map(this.nodes.map((n) => [n.id, n]));
    this.dams = DAM_PRESETS.map((d) => deepClone(d));
    this.edges = EDGES;
    this.turn = 1;
    this.selectedNode = null;
    this.squad = new RangerSquad("home");
    this.activeUnitId = null;
    this.squadSelected = false;
    this.squadPaneClosed = true;
    this.squadVisionSource = null;
    this.rangerUnits = []; // each: { id, callsign, glyph, fallback, inventory }
    this.rangerNameCounter = 0;
    this.logger = new Logger(document.getElementById("logEntries"));
    this.dev = {
      clickProbeEnabled: false,
      lastMapClick: null,
      teleportArmed: false,
    };
    this.fogEnabled = typeof window !== "undefined" && typeof window.devFogEnabled === "boolean"
      ? !!window.devFogEnabled
      : fogSetting("enabled") === 1;
    const baseRollDifficulty = Number.isFinite(options.baseRollDifficulty)
      ? Math.trunc(options.baseRollDifficulty)
      : DEFAULT_ROLL_DIFFICULTY;
    this.resources = new ResourceManager(options.initialResources || INITIAL_RESOURCES);
    this.turnLosses = {};
    this.purchasedUpgrades = new Set();
    this.tempUpkeepEffects = { food: 0, water: 0 };
    this.globalRollBonus = 0;
    this.baseDifficulty = baseRollDifficulty;
    this.difficulty = baseRollDifficulty;
    this.difficultyStage = 0;
    this.gameOver = false;
    this.gameOverReason = null;
    this.missionComplete = false;
    this.missionCompleteRecorded = false;
    this.baseLevel = 1;
    this.maxUnits = 2;
    this.smallSettlements = [];
    this.visibility = createVisibilityGrid();
    this.knownNodes = new Set();
    this.visibleNodes = new Set();
    this.refreshVisibility();
    this.settlementSceneSuppressedId = null;
    this.largeSettlementSceneSuppressedId = null;
    this.largeSettlementSceneSuppressUntil = 0;
    this.forceFullApNextTurn = false;
    this.fastTravelTooltipSeen = false;
    this.ensureBaseRanger();
    this.hasStartedTurns = false;
    this.endTurnInFlight = false;
    this.runStartedAt = Number.isFinite(options.runStartedAt) ? options.runStartedAt : Date.now();
    this.difficultyKey = options.difficultyKey || "medium";
    this.advancedDifficulty = clampAdvancedDifficultySettings(options.advancedDifficulty);
  }

  ensureBaseRanger() {
    if (this.rangerUnits.length) return;
    const first = this.createRangerUnit();
    this.activeUnitId = first.id;
  }

  createRangerUnit(options = {}) {
    if (this.maxUnits && countLivingRangerUnits(this) >= this.maxUnits) return null;
    const index = this.rangerNameCounter++;
    const suffix = greekSuffix(index);
    const greekOk = canRenderGreek();
    const callsign = `Recon ${greekOk && suffix.glyph ? suffix.glyph : suffix.word}`;
    const homePos = this.nodeMap?.get?.("home")?.pos || null;
    const type = options.type || "soldier";
    const startInventory = {
      ...(BALANCING.unitStartInventory?.[type] ?? BALANCING.unitStartInventory?.soldier ?? {}),
    };
    const inventory = { ...startInventory };
    // Ranger units keep per-unit inventory and deterministic names (greek suffixes cycle after omega -> a2, �2, ...).
    const unit = {
      id: `ranger-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      callsign,
      glyph: suffix.glyph,
      fallback: suffix.word,
      type,
      inventory,
      isDead: false,
      deployed: false,
      currentNodeId: "home",
      positionPct: homePos ? { x: homePos.x, y: homePos.y } : null,
      moveTargetPct: null,
      isMoving: false,
      movePoints: 0,
      justDeployed: false,
      hasLeftHome: false,
      spriteStage: type === "vehicle" ? 0 : DEFAULT_SPRITE_STAGE,
      rollBonus: 0,
      apBonus: 0,
      solarBonus: 0,
      visionBonus: 0,
      weaponFrameIndex: 1,
      level: 1,
    };
    if (hasPurchasedUpgrade(this, HOME_BUILD_IDS.binocs)) {
      unit.visionBonus = Math.max(0, Math.trunc(unit.visionBonus || 0) + 2);
    }
    inventory.ap = getUnitMaxAp(unit);
    this.rangerUnits.push(unit);
    return unit;
  }

  resetTurnLosses() {
    this.turnLosses = {};
  }

  recordResourceLoss(reason, key, amount) {
    if (!reason || !key || amount <= 0) return;
    if (!this.turnLosses[reason]) {
      this.turnLosses[reason] = {};
    }
    this.turnLosses[reason][key] = (this.turnLosses[reason][key] || 0) + amount;
  }

  recordLossObject(reason, lossObj) {
    if (!lossObj) return;
    for (const [key, amount] of Object.entries(lossObj)) {
      const num = Math.max(0, Number(amount) || 0);
      if (num > 0) this.recordResourceLoss(reason, key, num);
    }
  }

  summarizeResourceLosses() {
    const parts = [];
    for (const [reason, resources] of Object.entries(this.turnLosses || {})) {
      for (const [key, amount] of Object.entries(resources || {})) {
        if (amount > 0) {
          parts.push(`${fmtResourceKey(key)} -${amount} (${reason})`);
        }
      }
    }
    return parts;
  }

  logTurnResourceLosses() {
    if (!this.logger) return;
    const parts = this.summarizeResourceLosses();
    if (!parts.length) return;
    this.logger.log(`Supplies lost: ${parts.join(", ")}.`);
  }

  clampUnitInventory(unit) {
    if (!unit?.inventory) return;
    const limits = getUnitInventoryLimits(unit);
    for (const [key, max] of Object.entries(limits)) {
      const val = unit.inventory[key];
      const num = typeof val === "number" ? val : 0;
      unit.inventory[key] = Math.min(max, Math.max(0, num));
    }
  }

  getUnitUpkeep() {
    const livingUnits = (this.rangerUnits || []).filter((unit) => unit && !unit.isDead).length;
    return {
      food: livingUnits,
      water: livingUnits,
    };
  }

  markUnitDead(unit, reason = "ran out of supplies", detailReason = "") {
    if (!unit || unit.isDead) return false;
    const wasActive = this.activeUnitId === unit.id;
    const squadWasCurrent = this.squad?.currentUnitId === unit.id;
    unit.isDead = true;
    unit.deathReason = detailReason || reason;
    this.clampUnitInventory(unit);
    unit.isMoving = false;
    unit.moveTargetPct = null;
    unit.movePoints = 0;
    if (this.logger) {
      this.logger.log(`${unit.callsign} perished (${reason}).`);
    }
    this.refreshVisibility();
    renderMap(this);
    updateSquadWindow(this);
    refreshRangerPaneScene(this);
    if (wasActive || squadWasCurrent) {
      this.activeUnitId = null;
      this.squadSelected = false;
    }
    if (squadWasCurrent && this.squad) {
      this.squad.currentUnitId = null;
    }
    if (mapSceneInstance && (wasActive || squadWasCurrent)) {
      mapSceneInstance.setActiveUnitMarker(null);
    }
    if (mapSceneInstance) {
      mapSceneInstance.syncMarkerToSquad();
    }
    const homeUi = document.getElementById("homeBaseUi");
    const homeUnitsPanel = document.getElementById("homeBaseUnitsPanel");
    if (homeUi && !homeUi.classList.contains("hidden") && homeUnitsPanel && !homeUnitsPanel.classList.contains("hidden")) {
      renderHomeBaseUnits(this);
    }
    checkGameOverNoRangers(this);
    return true;
  }

  checkUnitVitality(unit, reason = "ran out of supplies") {
    if (!unit || unit.isDead) return false;
    const inv = unit.inventory || {};
    const outOfFood = (inv.food ?? 0) <= 0;
    const outOfWater = (inv.water ?? 0) <= 0;
    if (!outOfFood && !outOfWater) return false;
    const why = outOfFood && outOfWater ? "out of food and water" : outOfFood ? "out of food" : "out of water";
    return this.markUnitDead(unit, reason || why, why);
  }

  adjacentTo(nodeId) {
    const adj = [];
    for (const [a, b] of this.edges) {
      if (a === nodeId) adj.push(b);
      else if (b === nodeId) adj.push(a);
    }
    return adj;
  }

  markVisible(nodeId) {
    if (!nodeId) return;
    this.visibleNodes.add(nodeId);
    this.knownNodes.add(nodeId);
  }

  revealAround(nodeId) {
    if (!nodeId) return;
    const ids = [nodeId, ...this.adjacentTo(nodeId)];
    for (const id of ids) {
      this.markVisible(id);
    }
  }

  refreshVisibility() {
    if (!isFogEnabled(this)) {
      const vis = ensureVisibilityGrid(this);
      this.visibleNodes = new Set(this.nodes.map((n) => n.id));
      this.knownNodes = new Set(this.visibleNodes);
      if (vis?.visible) vis.visible.fill(1);
      if (vis?.explored) vis.explored.fill(1);
      if (vis) vis.dirty = false;
    } else {
      computeVisibility(this);
    }
    const anyDeployed = (this.rangerUnits || []).some((unit) => {
      ensureUnitTravelState(this, unit);
      return !!unit.deployed;
    });
    if (!anyDeployed) {
      this.squadSelected = false;
      this.squadVisionSource = null;
    }
  }

  getSquadRange() {
    const unit = getActiveRangerUnit(this);
    if (unit?.isDead) return 0;
    if (!unit?.deployed) return 0;
    const limit = CONFIG.squad?.maxRangeCells || CONFIG.movePointsPerTurn;
    if (!isVehicleUnit(unit)) return limit;
    const perCell = CONFIG.squad?.fuelPerCell || 1;
    if (perCell <= 0) return limit;
    const gasRange = Math.floor((Math.max(0, Number(unit.inventory?.gas) || 0)) / perCell);
    return Math.max(0, Math.min(limit, gasRange));
  }

  startTurn() {
    this.resetTurnLosses();
    this.hasStartedTurns = true;
    this.logger.log(`Turn ${this.turn} begins.`);
    this.updateDifficultyForTurn();
    for (const node of this.nodes) {
      if (node.owner === "player") {
        if (node.id === "home") continue;
        const income = deepClone(node.yields || {});
        this.resources.applyYield(income);
      }
    }
    for (const settlement of this.smallSettlements || []) {
      if (settlement.owner !== "player" || !hasSettlementIncome(settlement)) continue;
      this.resources.applyYield(deepClone(settlement.yields || {}));
    }
    if (hasPurchasedUpgrade(this, HOME_BUILD_IDS.solarPanel)) {
      this.resources.applyYield(deepClone(CONFIG.crafting.solarPanel.incomeBoost || {}));
    }
    if (isFiresaleTradingThisTurn(this)) {
      this.resources.applyYield({ ...FIRESALE_INCOME });
    }
    const { total: upkeepTotals } = buildTurnUpkeepTotals(this);
    if (hasResourceValues(upkeepTotals)) {
      this.resources.applyUpkeep(upkeepTotals, (key, amount) => this.recordResourceLoss("turn upkeep", key, amount));
    }
    if (this.tempUpkeepEffects) {
      if ((this.tempUpkeepEffects.water || 0) > 0) this.tempUpkeepEffects.water -= 1;
      if ((this.tempUpkeepEffects.food || 0) > 0) this.tempUpkeepEffects.food -= 1;
    }
    if (checkGameOverResources(this, { showOverlay: true })) {
      return;
    }
    for (const unit of this.rangerUnits) {
      if (!unit || unit.isDead) continue;
      ensureRangerHasResourceTypes(unit);
      unit.inventory.ap = getUnitMaxAp(unit);
    }
    if (this.forceFullApNextTurn) {
      if (this.logger) {
        this.logger.log("Battle shock refills all unit action points.");
      }
      this.forceFullApNextTurn = false;
    }
    for (const unit of this.rangerUnits || []) {
      ensureUnitTravelState(this, unit);
      if (unit.deployed && !unit.isDead) {
        unit.movePoints = CONFIG.movePointsPerTurn;
      } else {
        unit.movePoints = 0;
      }
    }
    this.refreshVisibility();
    renderResources(this);
    renderMap(this);
    updateRegionModal(this, this.selectedNode);
    updateTownWindow(this);
    updateSquadWindow(this);
  }

  updateDifficultyForTurn() {
    const stage = Math.max(0, Math.floor(Math.max(1, this.turn) / DIFFICULTY_TURN_STEP));
    const base = Number.isFinite(this.baseDifficulty) ? this.baseDifficulty : DEFAULT_ROLL_DIFFICULTY;
    const floor = Math.min(MAX_DIFFICULTY_HANDICAP, base);
    const nextDifficulty = Math.max(floor, base + stage * DIFFICULTY_STEP_DELTA);
    const difficultyChanged = nextDifficulty !== this.difficulty;
    if (difficultyChanged) {
      this.difficulty = nextDifficulty;
    }
    if (stage !== this.difficultyStage && stage > 0) {
      this.difficultyStage = stage;
      // Once the handicap has hit its floor there is nothing new to announce.
      if (this.logger && difficultyChanged) {
        const turnsPassed = stage * DIFFICULTY_TURN_STEP;
        const turnPenalty = nextDifficulty - base;
        const entry = this.logger.log(
          `⚠️ ${turnsPassed} turns have passed. The wasteland hardens its grip. Luck runs colder as the days drag on. Dice roll modifier now ${nextDifficulty} (difficulty setting ${base}, turns passed ${turnPenalty}).`
        );
        if (entry) entry.style.fontWeight = "bold";
      }
    }
  }

  async endTurn() {
    if (this.gameOver || this.missionComplete) return;
    if (isEndTurnBlockedByEncounter()) return;
    if (isDemoTurnLimitEnabled() && this.turn >= DEMO_MAX_TURNS) {
      this.gameOver = true;
      this.gameOverReason = "demo";
      showGameOverOverlay("demo");
      return;
    }
    if (this.endTurnInFlight) {
      return;
    }
    this.endTurnInFlight = true;
    setEndTurnUiLocked(true);
    // Movement is frozen during the transition, so a running encounter timer would
    // otherwise fire on top of it. It restarts with the march afterwards.
    cancelEncounterTimer({ preservePending: true });
    await closeAllScreensForEndTurn();
    const preTurnStockpile = snapshotStockpileResources(this);
    const runTurnAdvance = () => this.executeEndTurnAdvance();
    try {
      if (mapSceneInstance?.ready && typeof mapSceneInstance.playEndTurnTransition === "function") {
        await mapSceneInstance.playEndTurnTransition(runTurnAdvance, {
          onPeakCovered: () => {
            animateEndTurnResourceDiffs(this, preTurnStockpile);
            refreshLiveScoreHud(this);
          },
        });
      } else {
        runTurnAdvance();
        animateEndTurnResourceDiffs(this, preTurnStockpile);
        refreshLiveScoreHud(this);
      }
    } finally {
      this.endTurnInFlight = false;
      refreshEndTurnButtonAvailability();
    }
  }

  executeEndTurnAdvance() {
    this.squadSelected = false;
    this.selectedNode = null;
    this.logTurnResourceLosses();
    this.resetTurnLosses();
    this.turn += 1;
    this.aiTurn();
    renderResources(this);
    renderMap(this);
    updateRegionModal(this, null);
    updateTownWindow(this);
    updateSquadWindow(this);
    document.getElementById("turnLabel").textContent = `Turn ${this.turn}`;
    this.startTurn();
    if (this.gameOver) {
      return;
    }
    const activeUnit = getActiveRangerUnit(this);
    const firstAvailableUnit =
      activeUnit?.deployed && !activeUnit?.isDead
        ? activeUnit
        : (this.rangerUnits || []).find((unit) => unit?.deployed && !unit?.isDead) || null;
    if (firstAvailableUnit) {
      activateUnitShortcut(this, firstAvailableUnit);
    }
    checkGameOverResources(this, { showOverlay: true });
  }

  aiTurn() {
    for (const node of this.nodes) {
      if (node.owner === "enemy" && node.stronghold) {
        if (Math.random() < 0.35) {
          node.defense += 1;
        }
      }
    }
  }

  selectNode(id) {
    const node = this.nodeMap.get(id);
    if (!node) return;
    const visible = this.visibleNodes.has(id);
    if (!visible) return;
    this.selectedNode = id;
    if (id === "home") {
      const activeUnit = getActiveRangerUnit(this);
      const canMarchHome = this.squadSelected
        && activeUnit
        && !activeUnit.isDead
        && activeUnit.deployed
        && !isUnitAtHome(activeUnit, this);
      if (canMarchHome) {
        // A live, selected unit is away from home — issue a march order toward the base instead
        // of opening the pane. Walk-up collision will open the scene when the unit arrives.
        issueMarchOrderToNode(this, node);
        updateTownWindow(this);
        return;
      }
      // No selected unit (or it's dead/already at home) — open the home base pane directly.
      // Clear suppression so the click always wins over walk-up suppression set previously.
      this.largeSettlementSceneSuppressedId = null;
      this.largeSettlementSceneSuppressPos = null;
      if (!largeSettlementOverlayState.active) {
        startLargeSettlementScene("home");
      }
      updateTownWindow(this);
      return;
    }
    updateRegionModal(this, id);
    updateTownWindow(this);
  }

  moveSquad(targetId) {
    if (!targetId) return;
    const active = getActiveRangerUnit(this);
    if (!active?.deployed) {
      alert("Deploy the Rangers first.");
      return;
    }
    if (active?.isDead) {
      alert("Rangers are dead and cannot move.");
      return;
    }
    const target = this.nodeMap.get(targetId);
    const squadNode = this.nodeMap.get(active.currentNodeId);
    if (!target || !squadNode) return;
    if (!this.visibleNodes.has(targetId)) {
      alert("Destination not visible.");
      return;
    }
    const distance = manhattan(getCell(squadNode), getCell(target));
    const range = this.getSquadRange();
    if (distance <= 0 || distance > range) {
      alert(isVehicleUnit(active) ? "Destination outside Ranger fuel range." : "Destination outside Ranger range.");
      return;
    }
    if (active.movePoints <= 0) {
      alert("Out of Move Points this turn.");
      return;
    }
    const gasCost = gasCostForMove(this, squadNode, target);
    if (isVehicleUnit(active) && gasCost > 0) {
      ensureRangerHasResourceTypes(active);
      const availableGas = Math.max(0, Number(active.inventory?.gas) || 0);
      if (availableGas < gasCost) {
        alert("Not enough Gas to move.");
        return;
      }
      active.inventory.gas = availableGas - gasCost;
      this.recordResourceLoss("movement", "gas", gasCost);
    }
    active.movePoints -= 1;
    active.currentNodeId = targetId;
    active.positionPct = { x: target.pos.x, y: target.pos.y };
    active.moveTargetPct = null;
    active.isMoving = false;
    this.squadVisionSource = targetId;
    this.refreshVisibility();
    if (isVehicleUnit(active) && gasCost > 0) {
      this.logger.log(`Squad moved to ${target.name}. Gas -${gasCost}.`);
    } else {
      this.logger.log(`Squad moved to ${target.name}.`);
    }
    renderResources(this);
    renderMap(this);
    updateRegionModal(this, targetId);
    updateTownWindow(this);
    updateSquadWindow(this);
    if (target.stronghold && target.owner !== "player") {
      this.captureNode(target, true);
    }
  }
  captureNode(node, victory) {
    if (victory) {
      node.owner = "player";
      node.defense = 1;
      if (node.reward) {
        this.resources.add(node.reward);
        this.logger.log(`Captured ${node.name}! Rewards: ${summarizeResources(node.reward)}.`);
      } else {
        this.logger.log(`Captured ${node.name}!`);
      }
    } else {
      node.defense = Math.max(0, node.defense - 1);
    }
    this.refreshVisibility();
    renderResources(this);
    renderMap(this);
    updateRegionModal(this, node.id);
    updateTownWindow(this);
    updateSquadWindow(this);
  }

}
function renderMap(state) {
  if (mapSceneInstance && mapSceneInstance.ready) {
    mapSceneInstance.refresh(state);
  }
  const mapContainer = document.getElementById("mapContainer");
  const mapRect = mapContainer ? mapContainer.getBoundingClientRect() : null;
  if (mapRect) {
    renderRangeOverlay(state, mapRect, mapSceneInstance?.cameras?.main);
  }
  syncUnitShortcuts(state);
}

function renderRangeOverlay(state, rect, camera) {
  const canvas = document.getElementById("rangeCanvas");
  if (!canvas || !camera) return;
  // Nothing is drawn on this canvas; keep the blended full-map layer out of the compositor.
  canvas.style.display = "none";
  const activeUnit = getActiveRangerUnit(state);
  const unitDead = !!activeUnit?.isDead;
  const hasAnchor = !!getUnitPositionPct(state, activeUnit) || !!activeUnit?.currentNodeId;
  const showOverlay =
    state.squadSelected && activeUnit?.deployed && hasAnchor && state.getSquadRange() > 0 && !unitDead;
  if (!showOverlay) return;
  const anchor = getUnitPositionPct(state, activeUnit)
    || (activeUnit?.currentNodeId ? state.nodeMap.get(activeUnit.currentNodeId)?.pos : null);
  if (anchor && activeUnit && !activeUnit.positionPct) {
    activeUnit.positionPct = { x: anchor.x, y: anchor.y };
  }
}

function getUnitShortcutLabel(unit) {
  const glyph = `${unit?.glyph || ""}`.trim();
  if (glyph) return glyph.toLowerCase();
  const callsign = `${unit?.callsign || ""}`.trim();
  if (callsign) return callsign[0].toLowerCase();
  return "?";
}

function activateUnitShortcut(state, unit, options = {}) {
  if (!state || !unit) return;
  state.activeUnitId = unit.id;
  if (state.squad) state.squad.currentUnitId = unit.id;
  state.squadSelected = true;
  state.squadPaneClosed = false;
  updateSquadWindow(state);
  renderHomeBaseUnits(state);
  refreshRangerPaneScene(state, { forceRebuild: true });
  updateUpgradeWindow(state, document.getElementById("homeBuildList"));
  if (mapSceneInstance?.setActiveUnitMarker) {
    mapSceneInstance.setActiveUnitMarker(unit.id);
  }
  if (!options.keepViewport && mapSceneInstance?.focusCameraOnUnit) {
    mapSceneInstance.userAdjustedCamera = false;
    mapSceneInstance.focusCameraOnUnit(unit, { setZoom: true, zoom: mapSceneInstance.initialZoom });
  }
  renderMapAdoptingSettlementOverlaps(state);
}

function syncUnitShortcuts(state) {
  const host = document.getElementById("unitShortcuts");
  if (!host) return;
  host.innerHTML = "";
  const units = (state?.rangerUnits || []).filter((unit) => unit?.deployed);
  if (!units.length) return;
  units.forEach((unit) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary map-ctrl-btn unit-shortcut-btn";
    btn.textContent = getUnitShortcutLabel(unit);
    btn.title = unit.callsign || "Unit";
    btn.onclick = () => {
      // Switching units mid-encounter would redirect the roll and its outcome.
      if (isEncounterTransitionActive()) return;
      activateUnitShortcut(state, unit);
    };
    host.appendChild(btn);
  });
}

function centerCameraOnHomeAndOwned(state) {
  if (!mapSceneInstance?.cameras?.main || !mapSceneInstance.ready) return;
  const cam = mapSceneInstance.cameras.main;
  const view = mapSceneInstance.getViewSize({});
  const homePos = mapSceneInstance.getHomeWorldPosition();
  if (!homePos) return;
  const pts = [];
  for (const node of state.nodes) {
    if (node.owner === "player") {
      pts.push({ x: (node.pos.x / 100) * mapSceneInstance.worldWidth, y: (node.pos.y / 100) * mapSceneInstance.worldHeight });
    }
  }
  for (const unit of state.rangerUnits || []) {
    ensureUnitTravelState(state, unit);
    if (!unit.deployed) continue;
    const pos = getUnitPositionPct(state, unit);
    if (!pos) continue;
    pts.push({
      x: (pos.x / 100) * mapSceneInstance.worldWidth,
      y: (pos.y / 100) * mapSceneInstance.worldHeight,
    });
  }
  if (!pts.length) {
    mapSceneInstance.focusCameraOnHome({ setZoom: true });
    return;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const bboxW = Math.max(1, maxX - minX);
  const bboxH = Math.max(1, maxY - minY);
  const padFactor = 0.10; // 10% padding outside owned assets
  const padW = Math.max(bboxW * padFactor, 180);
  const padH = Math.max(bboxH * padFactor, 180);
  const halfWNeeded = Math.max(maxX - homePos.x + padW, homePos.x - minX + padW);
  const halfHNeeded = Math.max(maxY - homePos.y + padH, homePos.y - minY + padH);
  const halfViewW = Math.max(1, view.width / 2);
  const halfViewH = Math.max(1, view.height / 2);
  const zoomX = halfViewW / halfWNeeded;
  const zoomY = halfViewH / halfHNeeded;
  const bestFit = Math.min(zoomX, zoomY);
  const maxAllowed = mapSceneInstance.initialZoom || mapSceneInstance.maxZoom;
  const targetZoom = Phaser.Math.Clamp(Math.min(bestFit, maxAllowed), mapSceneInstance.minZoom, mapSceneInstance.maxZoom);
  cam.setZoom(targetZoom);
  cam.centerOn(homePos.x, homePos.y);
  mapSceneInstance.userAdjustedCamera = false;
}
function renderFogLayer(state, rect) {
  const canvas = document.getElementById("fogCanvas");
  if (canvas) {
    canvas.style.display = "none";
  }
}

function carveFog(ctx, x, y, radius, strength) {
  const gradient = ctx.createRadialGradient(x, y, Math.max(10, radius * 0.2), x, y, radius);
  gradient.addColorStop(0, `rgba(0,0,0,${strength})`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

const loadingOverlayArtState = {
  canvas: null,
  ctx: null,
  offscreen: null,
  image: null,
  ready: false,
  loadPromise: null,
  outroPromise: null,
  rafId: null,
  resizeListenerAttached: false,
  pendingRefresh: false,
};
const titleScreenState = {
  overlayEl: null,
  artCanvas: null,
  artCtx: null,
  artOffscreen: null,
  artImage: null,
  artReady: false,
  artLoadPromise: null,
  artResizeListenerAttached: false,
  artPendingRefresh: false,
  artLayoutReady: false,
  shaderReadyPromise: null,
  shaderHostEl: null,
  menuEl: null,
  howToEl: null,
  creditsEl: null,
  highScoresEl: null,
  loadingEl: null,
  storyBtn: null,
  howToBtn: null,
  creditsBtn: null,
  highScoresBtn: null,
  newGameBtn: null,
  quitBtn: null,
  menuPanelEl: null,
  musicWrapEl: null,
  musicParentEl: null,
  difficultyButtons: {},
  difficultyKey: readStoredTitleDifficulty() || TITLE_SCREEN_DEFAULT_DIFFICULTY,
  advancedSettings: readStoredAdvancedDifficultySettings(),
  advancedToggleBtn: null,
  advancedPaneEl: null,
  advancedSettlementSlider: null,
  advancedSpeedSlider: null,
  advancedHardcoreCheckbox: null,
  advancedResetBtn: null,
  advancedPaneOpen: false,
  game: null,
  scene: null,
  titleShader: null,
  titleFxReady: false,
  enabled: false,
  visible: false,
  pendingStart: false,
  gameStarted: false,
  startingGame: false,
  returnFromStory: false,
  basemapWarmupScheduled: false,
  basemapWarmupComplete: false,
};
const encounterOverlayState = {
  overlayEl: null,
  canvas: null,
  ctx: null,
  messageEl: null,
  image: null,
  ready: false,
  active: false,
  effect: null,
  loadPromise: null,
  offscreen: null,
  encounterTimerId: null,
  encounterTimerEta: null,
  encounterUnitId: null,
  resizeListenerAttached: false,
  pendingResize: false,
  clickListenerAttached: false,
  eventsGuarded: false,
  transitionLocked: false,
};
const campOverlayState = {
  overlayEl: null,
  canvas: null,
  ctx: null,
  messageEl: null,
  titleEl: null,
  returnBtn: null,
  image: null,
  ready: false,
  active: false,
  effect: null,
  badgeFadeStart: null,
  badgeFadeDuration: 0,
  badgeFadeRafId: null,
  loadPromise: null,
  offscreen: null,
  resizeListenerAttached: false,
  pendingResize: false,
  returnListenerAttached: false,
  diceWrapper: null,
  diceHost: null,
  diceValueEl: null,
  diceGlowEl: null,
  diceFace: 1,
  rolling: false,
  rollRafId: null,
  rollTimeout: null,
  rollId: 0,
  messageTimeout: null,
  clickListenerAttached: false,
  diceScene: null,
  diceRenderer: null,
  diceReadyPromise: null,
  exitEnabled: false,
  eventsGuarded: false,
};
const poiOverlayState = {
  overlayEl: null,
  canvas: null,
  ctx: null,
  messageEl: null,
  titleEl: null,
  returnBtn: null,
  image: null,
  ready: false,
  active: false,
  effect: null,
  badgeFadeStart: null,
  badgeFadeDuration: 0,
  badgeFadeRafId: null,
  loadPromise: null,
  offscreen: null,
  resizeListenerAttached: false,
  pendingResize: false,
  returnListenerAttached: false,
  diceWrapper: null,
  diceHost: null,
  diceValueEl: null,
  diceGlowEl: null,
  diceFace: 1,
  rolling: false,
  rollRafId: null,
  rollTimeout: null,
  rollId: 0,
  messageTimeout: null,
  clickListenerAttached: false,
  diceScene: null,
  diceRenderer: null,
  diceReadyPromise: null,
  exitEnabled: false,
  eventsGuarded: false,
  badgeHiddenUntilRoll: true,
  prizeEl: null,
  prizeTimeout: null,
  prizeBadge: null,
  badgePulseRafId: null,
};
const randomOverlayState = {
  overlayEl: null,
  canvas: null,
  ctx: null,
  messageEl: null,
  titleEl: null,
  returnBtn: null,
  image: null,
  ready: false,
  active: false,
  effect: null,
  badgeFadeStart: null,
  badgeFadeDuration: 0,
  badgeFadeRafId: null,
  loadPromise: null,
  offscreen: null,
  resizeListenerAttached: false,
  pendingResize: false,
  returnListenerAttached: false,
  diceWrapper: null,
  diceHost: null,
  diceValueEl: null,
  diceGlowEl: null,
  diceFace: 1,
  rolling: false,
  rollRafId: null,
  rollTimeout: null,
  rollId: 0,
  messageTimeout: null,
  clickListenerAttached: false,
  diceScene: null,
  diceRenderer: null,
  diceReadyPromise: null,
  exitEnabled: false,
  eventsGuarded: false,
};
const battleOverlayState = {
  overlayEl: null,
  canvas: null,
  ctx: null,
  messageEl: null,
  titleEl: null,
  returnBtn: null,
  image: null,
  ready: false,
  active: false,
  effect: null,
  badgeFadeStart: null,
  badgeFadeDuration: 0,
  badgeFadeRafId: null,
  loadPromise: null,
  offscreen: null,
  resizeListenerAttached: false,
  pendingResize: false,
  returnListenerAttached: false,
  diceWrapper: null,
  diceHost: null,
  diceValueEl: null,
  diceGlowEl: null,
  diceFace: 1,
  rolling: false,
  rollRafId: null,
  rollTimeout: null,
  rollId: 0,
  messageTimeout: null,
  clickListenerAttached: false,
  diceScene: null,
  diceRenderer: null,
  diceReadyPromise: null,
  exitEnabled: false,
  eventsGuarded: false,
};
const storyOverlayState = {
  overlayEl: null,
  containerEl: null,
  active: false,
  game: null,
  scene: null,
  entries: [],
  returnToTitle: false,
  skipBtn: null,
  skipListenerAttached: false,
  skipRequested: false,
};
const ROADS_FEATURE_ENABLED = false;
const TITLE_SHADER_TARGET_FPS = 45;
const TITLE_ART_FALLBACK_WIDTH = 2048;
const TITLE_ART_FALLBACK_HEIGHT = 1323;
const TITLE_TEXT_FADE_DURATION = 2400;
const END_TURN_TRANSITION_TOTAL_MS = 3500;
const END_TURN_TRANSITION_BUILD_MS = 1500;
const END_TURN_TRANSITION_PEAK_HOLD_MS = 1000;
const END_TURN_TRANSITION_PEAK_HALF_HOLD_MS = END_TURN_TRANSITION_PEAK_HOLD_MS / 2;
const END_TURN_TRANSITION_CLEAR_MS = 1500;
const END_TURN_TRANSITION_SHADER_DEPTH = 98;
const END_TURN_TRANSITION_BLACK_DEPTH = 99;
let titleGlowShaderSource = "";
let titleGlowShaderCacheEntry = null;

function storeTitleGlowShaderSource(source) {
  if (typeof source !== "string" || !source.trim()) {
    return "";
  }
  titleGlowShaderSource = source;
  return titleGlowShaderSource;
}

function cloneTitleGlowShaderCacheEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    key: entry.key || "titleGlow",
    fragmentSrc: typeof entry.fragmentSrc === "string" ? entry.fragmentSrc : "",
    vertexSrc: typeof entry.vertexSrc === "string" ? entry.vertexSrc : "",
    uniforms: entry.uniforms && typeof entry.uniforms === "object" ? { ...entry.uniforms } : {},
  };
}

function extractTitleGlowShaderSource(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  if (Array.isArray(entry)) {
    return entry.filter((part) => typeof part === "string").join("\n");
  }
  if (typeof entry === "object") {
    const candidates = [
      entry.fragmentSrc,
      entry.fragSrc,
      entry.glsl,
      entry.source,
      entry.data,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
      if (Array.isArray(candidate)) {
        const joined = candidate.filter((part) => typeof part === "string").join("\n");
        if (joined.trim()) return joined;
      }
    }
  }
  return "";
}

function captureTitleGlowShaderSourceFromScene(scene) {
  const shaderEntry = scene?.cache?.shader?.get?.("titleGlow");
  const source = extractTitleGlowShaderSource(shaderEntry);
  if (source) {
    storeTitleGlowShaderSource(source);
  }
  const clonedEntry = cloneTitleGlowShaderCacheEntry(shaderEntry);
  if (clonedEntry?.fragmentSrc) {
    titleGlowShaderCacheEntry = clonedEntry;
  }
  if (source) {
    return source;
  }
  return "";
}

function seedTitleGlowShaderCache(scene) {
  const shaderCache = scene?.cache?.shader;
  if (!shaderCache) return false;
  if (typeof shaderCache.exists === "function" && shaderCache.exists("titleGlow")) {
    return true;
  }
  const clonedEntry = cloneTitleGlowShaderCacheEntry(titleGlowShaderCacheEntry);
  if (!clonedEntry || typeof shaderCache.add !== "function") {
    return false;
  }
  shaderCache.add("titleGlow", clonedEntry);
  return true;
}

class TitleScreenScene extends Phaser.Scene {
  constructor() {
    super("TitleScreenScene");
    this.shader = null;
  }

  preload() {
    this.load.glsl("titleGlow", "assets/shaders/title-glow.glsl");
  }

  create() {
    titleScreenState.scene = this;
    const width = Math.max(1, this.scale.width);
    const height = Math.max(1, this.scale.height);
    const shader = this.add.shader("titleGlow", width * 0.5, height * 0.5, width, height);
    shader.setBlendMode(Phaser.BlendModes.MULTIPLY);
    const phaseSeed = Math.random() * 12;
    shader.setUniform("phaseSeed", phaseSeed);
    shader.setUniform("xOffset", Math.random() * 0.3 - 0.15);
    this.shader = shader;
    captureTitleGlowShaderSourceFromScene(this);
    shader.setAlpha(1);
    titleScreenState.titleShader = shader;
    titleScreenState.titleFxReady = true;
    syncTitleShaderRevealState();
    revealTitleScreenUiIfReady();
    this.input.keyboard.on("keydown-F9", () => {
      if (!isDevPanelAllowed()) return;
      const showing = shader.visible;
      shader.setVisible(!showing);
    });
  }

}

class MapTurnTransitionShaderScene extends Phaser.Scene {
  constructor() {
    super("MapTurnTransitionShaderScene");
    this.shader = null;
    this.phaseSeed = Math.random() * 12;
    this.xOffset = Math.random() * 0.3 - 0.15;
  }

  preload() {
    if (seedTitleGlowShaderCache(this)) return;
    this.load.glsl("titleGlow", "assets/shaders/title-glow.glsl");
  }

  create() {
    const width = Math.max(1, this.scale.width);
    const height = Math.max(1, this.scale.height);
    const shader = this.add.shader("titleGlow", width * 0.5, height * 0.5, width, height);
    shader.setOrigin(0.5);
    shader.setBlendMode(Phaser.BlendModes.NORMAL);
    shader.setUniform("phaseSeed", this.phaseSeed);
    shader.setUniform("xOffset", this.xOffset);
    shader.setUniform("progress", 0);
    shader.setUniform("densityBoost", 0);
    shader.setUniform("dimStrength", 0);
    this.shader = shader;
    captureTitleGlowShaderSourceFromScene(this);
  }

  update() {
    if (!this.shader) return;
    const hostScene = mapSceneInstance;
    const state = hostScene?.endTurnTransitionState || {};
    const progress = Phaser.Math.Clamp(Number(state.progress) || 0, 0, 1);
    const densityBoost = Phaser.Math.Clamp(Math.sin(progress * Math.PI) * 1.35, 0, 1.35);
    const dimStrength = Phaser.Math.Clamp(0.28 + Math.sin(progress * Math.PI) * 0.42, 0, 0.8);
    this.shader.setUniform("progress", progress);
    this.shader.setUniform("densityBoost", densityBoost);
    this.shader.setUniform("dimStrength", dimStrength);
    if (
      typeof this.shader.setSize === "function"
      && (this.shader.width !== this.scale.width || this.shader.height !== this.scale.height)
    ) {
      this.shader.setSize(this.scale.width, this.scale.height);
      this.shader.setPosition(this.scale.width * 0.5, this.scale.height * 0.5);
    }
  }
}

const newGameFadeState = {
  overlayEl: null,
  textEl: null,
};

function ensureNewGameFadeOverlay() {
  if (newGameFadeState.overlayEl) return newGameFadeState.overlayEl;
  const overlay = document.createElement("div");
  overlay.id = "newGameFadeOverlay";
  overlay.className = "ng-fade hidden";
  const box = document.createElement("div");
  box.className = "loading-box ng-fade-box";
  const text = document.createElement("div");
  text.className = "loading-text ng-fade-text";
  text.textContent = "L O A D I N G";
  const dots = document.createElement("span");
  dots.className = "loading-dots";
  for (let i = 0; i < 3; i++) dots.appendChild(document.createElement("i"));
  text.appendChild(dots);
  box.appendChild(text);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  newGameFadeState.overlayEl = overlay;
  newGameFadeState.boxEl = box;
  newGameFadeState.textEl = text;
  return overlay;
}

function showNewGameFade() {
  const overlay = ensureNewGameFadeOverlay();
  overlay.classList.remove("hidden");
  // Force a reflow so the .is-visible class change triggers a transition
  // rather than being batched with the .hidden removal.
  void overlay.offsetHeight;
  overlay.classList.add("is-visible");
}

function hideNewGameFade(durationMs = 500) {
  const overlay = newGameFadeState.overlayEl;
  if (!overlay) return;
  overlay.classList.remove("is-visible");
  window.setTimeout(() => {
    if (!overlay.classList.contains("is-visible")) {
      overlay.classList.add("hidden");
    }
  }, durationMs + 50);
}

function startTitleScreenFxReveal() {
  return;
}

function syncTitleShaderRevealState() {
  if (!titleScreenState.overlayEl) return;
  const ready = !!(titleScreenState.visible && titleScreenState.titleFxReady && titleScreenState.titleShader);
  titleScreenState.overlayEl.classList.toggle("shader-ready", ready);
}

function revealTitleScreenUiIfReady() {
  if (!titleScreenState.visible || !titleScreenState.overlayEl) return;
  titleScreenState.overlayEl.classList.add("art-ready");
  requestAnimationFrame(() => {
    if (!titleScreenState.visible || !titleScreenState.overlayEl) return;
    titleScreenState.overlayEl.classList.add("is-visible");
    syncTitleShaderRevealState();
    startTitleScreenFxReveal();
  });
}

function destroyTitleShaderGame() {
  if (titleScreenState.game) {
    titleScreenState.game.destroy(true);
    titleScreenState.game = null;
    titleScreenState.scene = null;
  }
  titleScreenState.titleShader = null;
  titleScreenState.titleFxReady = false;
  syncTitleShaderRevealState();
}

async function buildTitleShaderGame() {
  if (!ensureTitleScreenElements()) return;
  if (!titleScreenState.shaderHostEl) return;
  if (titleScreenState.game) return;
  const rect = titleScreenState.shaderHostEl.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || titleScreenState.shaderHostEl.clientWidth || 1));
  const height = Math.max(1, Math.floor(rect.height || titleScreenState.shaderHostEl.clientHeight || 1));
  titleScreenState.game = new Phaser.Game({
    type: Phaser.WEBGL,
    width,
    height,
    parent: titleScreenState.shaderHostEl,
    transparent: true,
    fps: {
      target: TITLE_SHADER_TARGET_FPS,
      min: 15,
    },
    scene: [TitleScreenScene],
  });
}

function rebuildTitleShaderGame() {
  if (!titleScreenState.visible) return;
  destroyTitleShaderGame();
  buildTitleShaderGame();
}

function setTitleLoadingVisible(visible) {
  if (!ensureTitleScreenElements()) return;
  if (titleScreenState.loadingEl) {
    titleScreenState.loadingEl.classList.toggle("hidden", !visible);
  }
}

function moveMusicWidgetIntoTitle() {
  const wrap = titleScreenState.musicWrapEl || document.getElementById("titleMusicWrap");
  const menu = titleScreenState.menuEl || document.getElementById("titleMenu");
  if (!wrap || !menu) return;
  if (!titleScreenState.musicParentEl && wrap.parentElement && wrap.parentElement !== menu) {
    titleScreenState.musicParentEl = wrap.parentElement;
  }
  if (wrap.parentElement === menu) return;
  const menuPanel = titleScreenState.menuPanelEl || document.getElementById("titleMenuPanel");
  if (menuPanel && menuPanel.parentElement === menu) {
    menu.insertBefore(wrap, menuPanel);
  } else {
    menu.appendChild(wrap);
  }
}

function restoreMusicWidgetFromTitle() {
  const wrap = titleScreenState.musicWrapEl || document.getElementById("titleMusicWrap");
  const dock = document.getElementById("musicWidgetDock");
  if (!wrap) return;
  if (dock) {
    dock.appendChild(wrap);
    return;
  }
  if (!titleScreenState.musicParentEl) return;
  titleScreenState.musicParentEl.appendChild(wrap);
}

function showTitleScreen() {
  if (!ensureTitleScreenElements()) return;
  document.body.classList.add("title-active");
  document.documentElement.classList.remove("title-boot");
  titleScreenState.overlayEl.classList.remove("hidden");
  titleScreenState.overlayEl.setAttribute("aria-hidden", "false");
  titleScreenState.visible = true;
  titleScreenState.pendingStart = false;
  titleScreenState.startingGame = false;
  titleScreenState.artLayoutReady = false;
  titleScreenState.titleFxReady = !!titleScreenState.titleShader;
  titleScreenState.overlayEl.classList.remove("is-visible");
  titleScreenState.overlayEl.classList.remove("art-ready");
  titleScreenState.overlayEl.classList.remove("shader-ready");
  setTitleLoadingVisible(false);
  renderTitleHighScores();
  updateTitleArtLayoutVars();
  if (titleScreenState.artReady) {
    drawTitleArt();
  } else {
    setupTitleArt();
  }
  try {
    titleScreenState.game?.loop?.wake();
  } catch (_) {
    // nothing to wake
  }
  buildTitleShaderGame();
  moveMusicWidgetIntoTitle();
  enableTitleScreenMusic();
  revealTitleScreenUiIfReady();
  scheduleTitleBasemapWarmup();
}

function hideTitleScreen() {
  if (!ensureTitleScreenElements()) return;
  titleScreenState.overlayEl.classList.add("hidden");
  titleScreenState.overlayEl.classList.remove("is-visible");
  titleScreenState.overlayEl.classList.remove("art-ready");
  titleScreenState.overlayEl.classList.remove("shader-ready");
  titleScreenState.overlayEl.setAttribute("aria-hidden", "true");
  titleScreenState.visible = false;
  titleScreenState.artLayoutReady = false;
  titleScreenState.titleFxReady = false;
  setTitleLoadingVisible(false);
  restoreMusicWidgetFromTitle();
  document.body.classList.remove("title-active");
  document.documentElement.classList.remove("title-boot");
  // Stop drawing the title shader once the title is hidden.
  try {
    titleScreenState.game?.loop?.sleep();
  } catch (_) {
    // nothing to sleep
  }
}

function setTitleDifficulty(key) {
  const requested = DIFFICULTY_PRESETS[key] ? key : TITLE_SCREEN_DEFAULT_DIFFICULTY;
  const next = isDemoDifficultyLocked() ? "low" : requested;
  titleScreenState.difficultyKey = next;
  if (!isDemoDifficultyLocked()) persistTitleDifficulty(next);
  const lockDifficulty = isDemoDifficultyLocked();
  Object.entries(titleScreenState.difficultyButtons).forEach(([difficultyKey, button]) => {
    if (!button) return;
    const shouldDisable = lockDifficulty && difficultyKey !== "low";
    button.disabled = shouldDisable;
    button.setAttribute("aria-disabled", shouldDisable ? "true" : "false");
    button.classList.toggle("active", difficultyKey === next);
  });
}

function setTitleAdvancedPaneVisible(visible) {
  const next = !!visible;
  titleScreenState.advancedPaneOpen = next;
  if (titleScreenState.advancedPaneEl) {
    titleScreenState.advancedPaneEl.classList.toggle("hidden", !next);
  }
  if (titleScreenState.advancedToggleBtn) {
    titleScreenState.advancedToggleBtn.classList.toggle("active", next);
    titleScreenState.advancedToggleBtn.setAttribute("aria-expanded", next ? "true" : "false");
  }
}

function renderTitleAdvancedDifficultyControls() {
  const safe = clampAdvancedDifficultySettings(titleScreenState.advancedSettings);
  titleScreenState.advancedSettings = safe;
  const speed = advancedSpeedSettingsFromSlider(safe.unitSpeedSlider);
  if (titleScreenState.advancedSettlementSlider) {
    titleScreenState.advancedSettlementSlider.value = `${safe.smallSettlementCount}`;
  }
  if (titleScreenState.advancedSpeedSlider) {
    titleScreenState.advancedSpeedSlider.value = `${safe.unitSpeedSlider}`;
  }
  if (titleScreenState.advancedHardcoreCheckbox) {
    titleScreenState.advancedHardcoreCheckbox.checked = !!safe.hardcore;
    const demoLocked = isDemoHardcoreLocked();
    titleScreenState.advancedHardcoreCheckbox.disabled = demoLocked;
    titleScreenState.advancedHardcoreCheckbox.setAttribute(
      "aria-disabled",
      demoLocked ? "true" : "false"
    );
    const labelEl = titleScreenState.advancedHardcoreCheckbox.closest(".title-hardcore-row");
    if (labelEl) {
      labelEl.setAttribute(
        "data-tooltip",
        demoLocked
          ? "Demo mode is always Hardcore. No saving or loading."
          : "Higher score but no saving/loading"
      );
    }
  }
}

function handleTitleAdvancedDifficultyChange(partial = {}) {
  titleScreenState.advancedSettings = clampAdvancedDifficultySettings({
    ...(titleScreenState.advancedSettings || {}),
    ...(partial || {}),
  });
  persistAdvancedDifficultySettings(titleScreenState.advancedSettings);
  renderTitleAdvancedDifficultyControls();
}

const TITLE_HIGH_SCORES_COPY_SVG = `
      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
        <rect x="6" y="6" width="11" height="12" rx="2" ry="2"
              fill="rgba(8,10,6,0.85)" stroke="currentColor" stroke-width="1.6"/>
        <rect x="3" y="2" width="11" height="12" rx="2" ry="2"
              fill="rgba(8,10,6,0.95)" stroke="currentColor" stroke-width="1.6"/>
      </svg>`;
const TITLE_HIGH_SCORES_COPY_OK_SVG = `
      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
        <path d="M4 10.5 L8.5 15 L16 6" fill="none" stroke="currentColor"
              stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
const TITLE_HIGH_SCORES_COPY_FAIL_SVG = `
      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
        <path d="M5 5 L15 15 M15 5 L5 15" fill="none" stroke="currentColor"
              stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;

function renderTitleHighScoresCopyButton(disabled) {
  const tooltip = disabled ? "Nothing to copy" : "Copy as image";
  return `
      <button id="titleHighScoresCopyBtn"
              class="title-score-copy"
              type="button"
              aria-label="Copy high scores to clipboard"
              data-tooltip="${tooltip}"
              ${disabled ? "disabled" : ""}>
        ${TITLE_HIGH_SCORES_COPY_SVG}
      </button>`;
}

async function copyHighScoresPaneToClipboard(button) {
  const pane = titleScreenState.highScoresEl;
  if (!pane || !button) return;
  const showFeedback = (variant) => {
    if (!button.isConnected) return;
    button.classList.remove("copied", "failed");
    if (variant === "ok") {
      button.classList.add("copied");
      button.innerHTML = TITLE_HIGH_SCORES_COPY_OK_SVG;
      button.setAttribute("data-tooltip", "Copied!");
    } else {
      button.classList.add("failed");
      button.innerHTML = TITLE_HIGH_SCORES_COPY_FAIL_SVG;
      button.setAttribute("data-tooltip", "Copy failed");
    }
    setTimeout(() => {
      if (!button.isConnected) return;
      button.classList.remove("copied", "failed");
      button.innerHTML = TITLE_HIGH_SCORES_COPY_SVG;
      button.setAttribute("data-tooltip", "Copy as image");
    }, 1500);
  };

  if (typeof html2canvas !== "function"
      || typeof ClipboardItem === "undefined"
      || !navigator.clipboard
      || typeof navigator.clipboard.write !== "function") {
    showFeedback("fail");
    return;
  }

  button.disabled = true;
  const prevMaxHeight = pane.style.maxHeight;
  const prevHeight = pane.style.height;
  const prevOverflow = pane.style.overflow;
  pane.style.maxHeight = "none";
  pane.style.height = "auto";
  pane.style.overflow = "visible";
  try {
    const canvas = await html2canvas(pane, {
      backgroundColor: null,
      scale: window.devicePixelRatio || 1,
      useCORS: true,
      logging: false,
    });
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    showFeedback("ok");
  } catch (err) {
    console.warn("[high-scores] copy-to-clipboard failed", err);
    showFeedback("fail");
  } finally {
    pane.style.maxHeight = prevMaxHeight;
    pane.style.height = prevHeight;
    pane.style.overflow = prevOverflow;
    button.disabled = false;
  }
}

function renderTitleHighScoresToolbar(disabled) {
  return `
    <div class="title-score-toolbar">
      ${renderTitleHighScoresCopyButton(disabled)}
      <button id="titleHighScoresResetBtn" class="title-score-reset" type="button">Reset</button>
    </div>
  `;
}

function renderTitleHighScores() {
  if (!titleScreenState.highScoresEl) return;
  const scores = loadHighScores();
  if (!scores.length) {
    titleScreenState.highScoresEl.innerHTML = `
      ${renderTitleHighScoresToolbar(true)}
      <div class="title-score-empty">No successful runs yet.</div>
    `;
    const resetBtn = document.getElementById("titleHighScoresResetBtn");
    if (resetBtn) {
      resetBtn.onclick = () => {
        clearHighScores();
        renderTitleHighScores();
      };
    }
    return;
  }
  const rows = scores.map((score, idx) => {
    const difficulty = formatDifficultyKey(score.difficultyKey);
    const duration = formatRunDuration(score.durationMs);
    const turns = Number(score.turns) || 0;
    const completedAt = Number(score.completedAt) || 0;
    const scoreValue = Number.isFinite(score.score) ? score.score : computeRunScore(score);
    const mode = score.hardcore ? "Hardcore" : "Standard";
    const completedLabel = completedAt ? new Date(completedAt).toLocaleString() : "Unknown";
    return `
      <tr>
        <td>#${idx + 1}</td>
        <td class="col-score">${scoreValue}</td>
        <td>${difficulty}</td>
        <td>${mode}</td>
        <td>${duration}</td>
        <td>${turns}</td>
        <td>${completedLabel}</td>
      </tr>
    `;
  });
  titleScreenState.highScoresEl.innerHTML = `
    ${renderTitleHighScoresToolbar(false)}
    <table class="title-score-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th class="col-score">Score</th>
          <th>Difficulty</th>
          <th>Mode</th>
          <th>Time</th>
          <th>Turns</th>
          <th>Completed</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join("")}
      </tbody>
    </table>
  `;
  const resetBtn = document.getElementById("titleHighScoresResetBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      clearHighScores();
      renderTitleHighScores();
    };
  }
  const copyBtn = document.getElementById("titleHighScoresCopyBtn");
  if (copyBtn) {
    copyBtn.onclick = () => copyHighScoresPaneToClipboard(copyBtn);
  }
}

function requestAppQuit() {
  if (typeof window === "undefined") return;
  // Browser builds (including itch.io embeds) cannot self-close — `window.close`
  // is a no-op for windows the script didn't open. Instead, exit fullscreen so
  // the itch.io wrapper returns the player to the game's landing page.
  if (!isElectronApp()) {
    exitFullscreenSafely();
    // Top-level tab (the Darwin Studio site opens /play/ in a new tab): close the tab, which browsers allow
    // while it has no other history; otherwise go back to the site's Games page.
    let inFrame = true;
    try { inFrame = window.self !== window.top; } catch { inFrame = true; }
    if (!inFrame && /\.github\.io$/i.test(window.location.hostname)) {
      window.close();
      setTimeout(() => { window.location.href = new URL("../games.html", window.location.href).href; }, 300);
    }
    return;
  }
  if (typeof window.electronAPI?.quit === "function") {
    window.electronAPI.quit();
    return;
  }
  if (typeof window.close === "function") {
    window.close();
  }
}

function returnToTitleScreen() {
  if (typeof window === "undefined") return;
  persistToggle("titleScreenEnabled", true);
  persistMusicState();
  window.location.reload();
}

function renderCreditsWithLinks(target, text) {
  if (!target) return;
  target.textContent = "";
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s]+/g;
  let lastIndex = 0;
  let match;
  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      target.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    let label;
    let url;
    let trailing = "";
    if (match[1] && match[2]) {
      label = match[1];
      url = match[2];
    } else {
      url = match[0];
      while (url.length > 0 && /[.,;:!?)\]]/.test(url[url.length - 1])) {
        trailing = url[url.length - 1] + trailing;
        url = url.slice(0, -1);
      }
      label = url;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.textContent = label;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    target.appendChild(anchor);
    if (trailing) target.appendChild(document.createTextNode(trailing));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    target.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function setupTitleScreen() {
  if (!ensureTitleScreenElements()) return;
  setupTitleArt();
  loadTitleFont();
  if (titleScreenState.howToEl) {
    const howToText = typeof window !== "undefined" ? window.ContentLibrary?.HowToPlayText : null;
    if (typeof howToText === "string") {
      titleScreenState.howToEl.textContent = howToText;
    }
  }
  if (titleScreenState.creditsEl) {
    const creditsText = typeof window !== "undefined" ? window.ContentLibrary?.CreditsText : null;
    if (typeof creditsText === "string") {
      renderCreditsWithLinks(titleScreenState.creditsEl, creditsText);
    }
  }
  renderTitleHighScores();
  setTitleDifficulty(titleScreenState.difficultyKey);
  renderTitleAdvancedDifficultyControls();
  setTitleAdvancedPaneVisible(false);
  if (titleScreenState.advancedToggleBtn) {
    titleScreenState.advancedToggleBtn.onclick = () => {
      setTitleAdvancedPaneVisible(!titleScreenState.advancedPaneOpen);
    };
  }
  if (titleScreenState.advancedSettlementSlider) {
    titleScreenState.advancedSettlementSlider.oninput = (evt) => {
      const value = Number.parseInt(evt?.target?.value, 10);
      handleTitleAdvancedDifficultyChange({ smallSettlementCount: value });
    };
  }
  if (titleScreenState.advancedSpeedSlider) {
    titleScreenState.advancedSpeedSlider.oninput = (evt) => {
      const value = Number.parseInt(evt?.target?.value, 10);
      handleTitleAdvancedDifficultyChange({ unitSpeedSlider: value });
    };
  }
  if (titleScreenState.advancedHardcoreCheckbox) {
    titleScreenState.advancedHardcoreCheckbox.onchange = (evt) => {
      handleTitleAdvancedDifficultyChange({ hardcore: !!evt?.target?.checked });
    };
  }
  if (titleScreenState.advancedResetBtn) {
    titleScreenState.advancedResetBtn.onclick = () => {
      handleTitleAdvancedDifficultyChange({
        smallSettlementCount: ADVANCED_SETTLEMENT_DEFAULT,
        unitSpeedSlider: ADVANCED_SPEED_SLIDER_DEFAULT,
        hardcore: false,
      });
    };
  }
  if (titleScreenState.storyBtn) {
    titleScreenState.storyBtn.onclick = () => {
      titleScreenState.returnFromStory = true;
      startIntroStory({ restart: true, returnToTitle: true });
    };
  }
  if (titleScreenState.howToBtn && titleScreenState.howToEl) {
    titleScreenState.howToBtn.onclick = () => {
      const isHidden = titleScreenState.howToEl.classList.contains("hidden");
      if (isHidden && titleScreenState.creditsEl) {
        titleScreenState.creditsEl.classList.add("hidden");
      }
      if (isHidden && titleScreenState.highScoresEl) {
        titleScreenState.highScoresEl.classList.add("hidden");
      }
      titleScreenState.howToEl.classList.toggle("hidden", !isHidden);
    };
  }
  if (titleScreenState.creditsBtn && titleScreenState.creditsEl) {
    titleScreenState.creditsBtn.onclick = () => {
      const isHidden = titleScreenState.creditsEl.classList.contains("hidden");
      if (isHidden && titleScreenState.howToEl) {
        titleScreenState.howToEl.classList.add("hidden");
      }
      if (isHidden && titleScreenState.highScoresEl) {
        titleScreenState.highScoresEl.classList.add("hidden");
      }
      titleScreenState.creditsEl.classList.toggle("hidden", !isHidden);
    };
  }
  if (titleScreenState.highScoresBtn && titleScreenState.highScoresEl) {
    titleScreenState.highScoresBtn.onclick = () => {
      renderTitleHighScores();
      const isHidden = titleScreenState.highScoresEl.classList.contains("hidden");
      if (isHidden && titleScreenState.howToEl) {
        titleScreenState.howToEl.classList.add("hidden");
      }
      if (isHidden && titleScreenState.creditsEl) {
        titleScreenState.creditsEl.classList.add("hidden");
      }
      titleScreenState.highScoresEl.classList.toggle("hidden", !isHidden);
    };
  }
  if (titleScreenState.newGameBtn) {
    titleScreenState.newGameBtn.onclick = async () => {
      if (titleScreenState.gameStarted) {
        hideTitleScreen();
        return;
      }
      if (titleScreenState.startingGame) return;
      titleScreenState.pendingStart = true;
      const menuEl = titleScreenState.menuEl || document.getElementById("titleMenu");
      if (menuEl) menuEl.style.pointerEvents = "none";
      showNewGameFade();
      try {
        await startGameSession({
          difficultyKey: titleScreenState.difficultyKey,
          fromTitle: true,
          advancedDifficulty: titleScreenState.advancedSettings,
        });
      } catch (err) {
        console.warn("New Game transition failed", err);
      } finally {
        setLoadingOverlay(false);
        hideNewGameFade();
        if (menuEl) menuEl.style.pointerEvents = "";
      }
    };
  }
  if (titleScreenState.quitBtn) {
    titleScreenState.quitBtn.onclick = () => {
      requestAppQuit();
    };
  }
  Object.entries(titleScreenState.difficultyButtons).forEach(([key, button]) => {
    if (!button) return;
    button.onclick = () => setTitleDifficulty(key);
  });
}

async function ensureTitleBasemapWarmup() {
  if (BASEMAP_SESSION_CACHE.warmupPromise) {
    return BASEMAP_SESSION_CACHE.warmupPromise;
  }
  BASEMAP_SESSION_CACHE.warmupPromise = (async () => {
    const metrics = getTransitionMetrics();
    if (metrics && !metrics.warmupStartedAt) {
      metrics.warmupStartedAt = nowMs();
    }
    const manifest = await fetchBasemapManifest();
    if (!manifest) return false;
    const requirement = computeInitialBasemapRequirement(manifest, { padding: BASEMAP_STARTUP_VIEW_PADDING });
    if (!requirement?.requiredKeys?.length) return false;
    const tilesByKey = buildBasemapTileLookup(manifest);
    const requiredTiles = requirement.requiredKeys
      .map((key) => tilesByKey.get(key))
      .filter(Boolean);
    const [demManifest, ndviManifest] = await Promise.all([
      warmJsonResource("json-tiles/dem-grid/manifest.json").catch(() => null),
      warmJsonResource("json-tiles/ndvi-grid/manifest.json").catch(() => null),
    ]);
    const warmJsonUrls = [
      ...STARTUP_FETCH_WARM_URLS,
      ...getLayerWarmTileUrls(demManifest, requirement),
      ...getLayerWarmTileUrls(ndviManifest, requirement),
    ];
    await Promise.all([
      loadBasemapTileBatch(requiredTiles, {
        concurrency: BASEMAP_INITIAL_LOAD_CONCURRENCY,
        markWarm: true,
      }),
      warmImageSourceBatch(STARTUP_MAP_IMAGE_SOURCES, 4),
      Promise.all(warmJsonUrls.map((url) => warmJsonResource(url).catch(() => null))),
      loadGameFonts().catch(() => false),
    ]);
    titleScreenState.basemapWarmupComplete = requiredTiles.every((tile) => BASEMAP_SESSION_CACHE.images.has(tile.src));
    if (titleScreenState.basemapWarmupComplete) {
      markTransitionTime("warmupReadyAt");
      return true;
    }
    return false;
  })().catch((err) => {
    BASEMAP_SESSION_CACHE.warmupPromise = null;
    throw err;
  });
  return BASEMAP_SESSION_CACHE.warmupPromise;
}

function scheduleTitleBasemapWarmup() {
  if (titleScreenState.basemapWarmupScheduled || titleScreenState.basemapWarmupComplete || titleScreenState.gameStarted) return;
  titleScreenState.basemapWarmupScheduled = true;
  scheduleBasemapWarmupTask(async () => {
    try {
      await ensureTitleBasemapWarmup();
    } finally {
      titleScreenState.basemapWarmupScheduled = false;
    }
  });
}

const STATIC_SCENE_TITLES = {
  battle: "Enemies!",
  poi: "Loot!",
  random: "An Oddity!",
  camp: "Camp!",
};
const settlementOverlayState = {
  overlayEl: null,
  canvas: null,
  ctx: null,
  messageEl: null,
  returnBtn: null,
  image: null,
  imageKey: null,
  imageCache: new Map(),
  loadPromiseKey: null,
  ready: false,
  active: false,
  loadPromise: null,
  offscreen: null,
  effect: null,
  messageTimeout: null,
  titleEl: null,
  currentSettlementName: null,
  currentSettlementId: null,
  resizeListenerAttached: false,
  pendingResize: false,
  returnListenerAttached: false,
  clickListenerAttached: false,
  exitEnabled: false,
  diceWrapper: null,
  diceHost: null,
  diceValueEl: null,
  diceGlowEl: null,
  diceBox: null,
  diceReadyPromise: null,
  rolling: false,
  rollId: 0,
  diceRolled: false,
};
const largeSettlementOverlayState = {
  overlayEl: null,
  canvas: null,
  ctx: null,
  messageEl: null,
  returnBtn: null,
  image: null,
  imageKey: null,
  imageCache: new Map(),
  loadPromiseKey: null,
  ready: false,
  active: false,
  loadPromise: null,
  offscreen: null,
  effect: null,
  messageTimeout: null,
  titleEl: null,
  currentSettlementName: null,
  currentSettlementId: null,
  resizeListenerAttached: false,
  pendingResize: false,
  returnListenerAttached: false,
  clickListenerAttached: false,
  exitEnabled: false,
  diceWrapper: null,
  diceHost: null,
  diceValueEl: null,
  diceGlowEl: null,
  diceBox: null,
  diceReadyPromise: null,
  rolling: false,
  rollId: 0,
  diceRolled: false,
  rollStage: null,
  rollTimeout: null,
  neutralSlotResource: null,
  neutralSlotActive: false,
  neutralActionBtn: null,
  shopWindow: null,
  shopList: null,
  shopApplyBtn: null,
  shopToggleBtn: null,
  shopTitle: null,
  shopOpen: false,
  shopDragBound: false,
  shopDragging: false,
  shopDragPointerId: null,
  shopDragStartX: 0,
  shopDragStartY: 0,
  shopDragStartLeft: 0,
  shopDragStartTop: 0,
  shopDragMoved: false,
  shopHasCustomPosition: false,
  shopLeft: 0,
  shopTop: 0,
  shopSuppressClickUntil: 0,
};
const DICE_SOUND_OVERLAYS = [campOverlayState, poiOverlayState, randomOverlayState, battleOverlayState];
const SCENE_OVERLAY_STATES = {
  camp: campOverlayState,
  poi: poiOverlayState,
  random: randomOverlayState,
  battle: battleOverlayState,
};
const STORY_DEFAULT_TIMINGS = {
  imageFadeInMs: 3000,
  textFadeInMs: 1500,
  textHoldBaseMs: 900,
  textHoldPerCharMs: 32,
  textHoldMultiplier: 1.4,
  textRevealMs: 200,
  textFadeOutMs: 900,
  imageHoldMs: 600,
  wipeMs: 1500,
  wipeFeather: 0.1,
  finalFadeMs: 1600,
  pixelateDuration: 1000,
  pixelateSize: 32,
};

function resolveStoryTimings() {
  const dev = (typeof window !== "undefined" ? window.devStoryTimings : null) || {};
  const timings = { ...STORY_DEFAULT_TIMINGS };
  const sharedFade = Number(dev.fadeMs);
  if (Number.isFinite(sharedFade)) {
    timings.imageFadeInMs = sharedFade;
    timings.textFadeInMs = sharedFade;
    timings.textFadeOutMs = sharedFade;
  }
  return { ...timings, ...dev };
}

function getIntroStoryEntries() {
  const fromState = Array.isArray(storyOverlayState.entries) ? storyOverlayState.entries : [];
  if (fromState.length) return fromState;
  const fromLibrary = typeof window !== "undefined" ? window.ContentLibrary?.IntroStory : null;
  return Array.isArray(fromLibrary) ? fromLibrary : [];
}

function ensureStoryOverlayElements() {
  if (!storyOverlayState.overlayEl || !storyOverlayState.containerEl) {
    const overlay = document.getElementById("storyOverlay");
    const container = document.getElementById("storyPhaserContainer");
    if (!overlay || !container) return false;
    storyOverlayState.overlayEl = overlay;
    storyOverlayState.containerEl = container;
  }
  const skipBtn = document.getElementById("storySkipBtn");
  storyOverlayState.skipBtn = skipBtn;
  if (skipBtn && !storyOverlayState.skipListenerAttached) {
    skipBtn.addEventListener("click", handleStorySkipClick);
    storyOverlayState.skipListenerAttached = true;
  }
  return true;
}

async function handleStorySkipClick(evt) {
  if (evt) {
    evt.preventDefault();
    evt.stopPropagation();
  }
  if (!storyOverlayState.active || storyOverlayState.skipRequested) return;
  const scene = storyOverlayState.scene;
  storyOverlayState.skipRequested = true;
  storyOverlayState.returnToTitle = true;
  const skipBtn = storyOverlayState.skipBtn;
  if (skipBtn) {
    skipBtn.disabled = true;
    skipBtn.setAttribute("aria-disabled", "true");
  }
  if (scene && typeof scene.finishStory === "function") {
    scene.isTransitioning = false;
    const originalWaitForFadeOut = scene.waitForFadeOut?.bind(scene);
    scene.waitForFadeOut = () => Promise.resolve();
    const baseTimings = scene.timings || resolveStoryTimings();
    const skipTimings = {
      ...baseTimings,
      finalFadeMs: 0,
      pixelateDuration: Math.max(400, Number(baseTimings.pixelateDuration ?? 1000)),
      pixelateSize: Math.max(8, Number(baseTimings.pixelateSize ?? 32)),
    };
    try {
      await scene.finishStory(skipTimings);
    } finally {
      scene.waitForFadeOut = originalWaitForFadeOut || function (camera, duration, r, g, b) {
        if (originalWaitForFadeOut) return originalWaitForFadeOut(camera, duration, r, g, b);
        return Promise.resolve();
      };
    }
    return;
  }
  stopIntroStory();
}

function destroyStoryGame() {
  if (storyOverlayState.game) {
    storyOverlayState.game.destroy(true);
    storyOverlayState.game = null;
    storyOverlayState.scene = null;
  }
}

function fitStoryImageToView(scene, image) {
  if (!scene || !image) return;
  const width = Math.max(1, scene.scale.width || scene.game?.scale?.width || 1);
  const height = Math.max(1, scene.scale.height || scene.game?.scale?.height || 1);
  const scale = Math.min(1, Math.min(width / image.width, height / image.height));
  image.setScale(scale);
  image.setPosition(width * 0.5, height * 0.5);
}

function setPostFxPixelateAmount(effect, value) {
  if (!effect) return;
  if (effect.size && typeof effect.size === "object") {
    effect.size.x = value;
    effect.size.y = value;
  } else if ("amount" in effect) {
    effect.amount = value;
  } else if ("size" in effect) {
    effect.size = value;
  }
}

const STORY_SCENE_KEYS = {
  primary: "StorySlideA",
  secondary: "StorySlideB",
};

const STORY_GLOW_SPEED_PRESETS = { slow: 0.5, medium: 1.6, fast: 4.0 };

// Story slides are named "<n>.png" in content.js and in the glow-point table below, but
// the art ships as WebP (about a quarter of the size). Originals live outside the build.
const STORY_IMAGE_EXTENSION = "webp";
function storyImageUrl(name) {
  const file = String(name || "").replace(/\.png$/i, `.${STORY_IMAGE_EXTENSION}`);
  return `assets/images/story/${file}`;
}

const STORY_SLIDE_GLOW_POINTS = Object.fromEntries(
  Object.entries({
    "1.png": [
      { x: 899, y: 636, radius: 60, color: 0xfcc36e, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 1005, y: 779, radius: 60, color: 0xf8923e, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 795, y: 767, radius: 60, color: 0xfeecb0, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 619, y: 1484, radius: 60, color: 0xffe495, alphaScale: 0.6, speedMultiplier: 1.6 },
    ],
    "2.png": [
      { x: 1495, y: 661, radius: 60, color: 0xfcda89, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 1540, y: 753, radius: 60, color: 0xfcf9e7, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 1447, y: 745, radius: 60, color: 0xffbc48, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 1467, y: 1201, radius: 60, color: 0xfda036, alphaScale: 0.6, speedMultiplier: 1.6 },
    ],
    "7.png": [
      { x: 613, y: 902, radius: 60, color: 0xf4e2d0, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 2320, y: 930, radius: 60, color: 0xebdfd6, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 2368, y: 524, radius: 60, color: 0xe5c6aa, alphaScale: 0.6, speedMultiplier: 1.6 },
    ],
    "8.png": [
      { x: 1537, y: 250, radius: 60, color: 0xfffdfd, alphaScale: 0.6, speedMultiplier: 4.0 },
      { x: 1528, y: 482, radius: 60, color: 0xfefffe, alphaScale: 0.6, speedMultiplier: 4.0 },
      { x: 1537, y: 647, radius: 60, color: 0xfefffe, alphaScale: 0.6, speedMultiplier: 4.0 },
    ],
    "9.png": [
      { x: 2407, y: 353, radius: 60, color: 0xfbf9f6, alphaScale: 0.6, speedMultiplier: 0.25 },
      { x: 2097, y: 392, radius: 60, color: 0xf8fbf8, alphaScale: 0.6, speedMultiplier: 0.25 },
      { x: 1747, y: 325, radius: 60, color: 0xfdf8f4, alphaScale: 0.6, speedMultiplier: 0.25 },
      { x: 1296, y: 429, radius: 60, color: 0xfaf9f7, alphaScale: 0.6, speedMultiplier: 0.25 },
    ],
    "10.png": [
      { x: 1108, y: 334, radius: 60, color: 0xd4dbc2, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 2494, y: 387, radius: 60, color: 0xc4cdb2, alphaScale: 0.6, speedMultiplier: 1.6 },
    ],
    "12.png": [
      { x: 2637, y: 303, radius: 60, color: 0xeeedea, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 1735, y: 1112, radius: 60, color: 0xf6f6f7, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 1447, y: 1115, radius: 60, color: 0xfaf5ed, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 1178, y: 655, radius: 60, color: 0xdddee1, alphaScale: 0.6, speedMultiplier: 1.6 },
    ],
    "13.png": [
      { x: 596, y: 1296, radius: 60, color: 0xf5d787, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 2612, y: 406, radius: 60, color: 0xdfd3ac, alphaScale: 0.6, speedMultiplier: 1.6 },
    ],
    "14.png": [
      { x: 1590, y: 958, radius: 60, color: 0xf9dba5, alphaScale: 0.6, speedMultiplier: 1.6 },
      { x: 823, y: 1207, radius: 60, color: 0xf6e5ce, alphaScale: 0.6, speedMultiplier: 1.6 },
    ],
  }).map(([k, pts]) => [k, pts.map(p => ({
    ...p,
    seed: Math.random() * 1000,
    alphaScale: 0.7 + Math.random() * 0.12,
  }))])
);

class StorySlideScene extends Phaser.Scene {
  constructor(key) {
    super(key);
    this.sceneKey = key;
    this.activeToken = 0;
    this.currentImage = null;
    this.nextImage = null;
    this.storyText = null;
    this.slideIndex = 0;
    this.nextSceneKey = null;
    this.entries = [];
    this.timings = null;
    this.isTransitioning = false;
    this.glowSprites = [];
  }

  preload() {
    const entries = getIntroStoryEntries();
    const first = entries[0];
    if (first?.image) {
      const key = "story-slide-0";
      this.load.image(key, storyImageUrl(first.image));
    }
  }

  create() {
    storyOverlayState.scene = this;
    this.cameras.main.setBackgroundColor(0x000000);
    this.scale.on("resize", () => this.layoutActiveElements());
    this.input.keyboard.on("keydown-ESC", () => stopIntroStory());
    if (this.input.mouse && this.input.mouse.disableContextMenu) {
      this.input.mouse.disableContextMenu();
    }
    this.input.on("pointerdown", (pointer) => {
      if (typeof window !== "undefined" && window.devStoryGlowDebug && this.currentImage) {
        if (pointer.button === 2 || (pointer.rightButtonDown && pointer.rightButtonDown())) {
          this.advanceSlide();
          return;
        }
        this.logGlowDebugPoint(pointer);
        return;
      }
      this.advanceSlide();
    });
    this.events.on("transitionstart", () => {
      this.isTransitioning = true;
    });
    this.events.on("transitioncomplete", () => {
      this.isTransitioning = false;
    });
    const data = this.scene.settings.data || {};
    this.slideIndex = Number.isFinite(data.index) ? data.index : 0;
    this.nextSceneKey = data.nextKey
      || (this.sceneKey === STORY_SCENE_KEYS.primary ? STORY_SCENE_KEYS.secondary : STORY_SCENE_KEYS.primary);
    this.skipFadeIn = !!data.skipFadeIn;
    this.restartStory();
  }

  restartStory() {
    this.activeToken += 1;
    this.isFinishing = false;
    this.tweens.killAll();
    this.children.removeAll(true);
    this.currentImage = null;
    this.nextImage = null;
    this.storyText = null;
    this.glowSprites = [];
    this.playStory(this.activeToken);
  }

  layoutActiveElements() {
    if (this.currentImage) fitStoryImageToView(this, this.currentImage);
    if (this.nextImage) fitStoryImageToView(this, this.nextImage);
    if (this.storyText) this.layoutStoryText(this.storyText);
    this.layoutGlowSprites();
  }

  layoutStoryText(bundle) {
    if (!bundle?.text || !bundle.text.active || !bundle.text.scene) return;
    const width = Math.max(1, this.scale.width || 1);
    const height = Math.max(1, this.scale.height || 1);
    const fontSize = 18;
    const wrapWidth = Math.min(width * 0.74, 600);
    bundle.text.setFontSize(fontSize);
    bundle.text.setWordWrapWidth(wrapWidth);
    if (bundle.glowText) {
      bundle.glowText.setFontSize(fontSize);
      bundle.glowText.setWordWrapWidth(wrapWidth);
    }
    const bottomPadding = 20;
    bundle.text.setPosition(width * 0.5, Math.max(bottomPadding, height - bottomPadding));
    if (bundle.glowText) {
      bundle.glowText.setPosition(width * 0.5, Math.max(bottomPadding, height - bottomPadding));
    }
    this.applyTextRevealMask(bundle);
  }

  createStoryText(text) {
    const width = Math.max(1, this.scale.width || 1);
    const height = Math.max(1, this.scale.height || 1);
    const fontSize = 18;
    const wrapWidth = Math.min(width * 0.74, 600);
    const storyText = this.add.text(width * 0.5, height * 0.78, text, {
      fontFamily: "\"Pixel Times\", \"Times New Roman\", serif",
      fontSize: `${fontSize}px`,
      color: "#00ff2fff",
      align: "left",
      wordWrap: { width: wrapWidth, useAdvancedWrap: true },
    }).setOrigin(0.5, 0.5);
    storyText.setScale(1);
    storyText.setResolution(1);
    storyText.setShadow(0, 0, "#000000ff", 4, true, true);
    const glowText = this.add.text(width * 0.5, height * 0.78, text, {
      fontFamily: "\"Pixel Times\", \"Times New Roman\", serif",
      fontSize: `${fontSize}px`,
      color: "#ffffff",
      align: "left",
      wordWrap: { width: wrapWidth, useAdvancedWrap: true },
    }).setOrigin(0.5, 0.5);
    glowText.setScale(1);
    glowText.setResolution(1);
    glowText.setShadow(0, 0, "#ffffffff", 7, true, true);
    glowText.setDepth(4);
    storyText.setDepth(5);
    storyText.setAlpha(0);
    glowText.setAlpha(0);
    const maskGraphic = this.add.graphics();
    maskGraphic.setVisible(false);
    const mask = maskGraphic.createGeometryMask();
    storyText.setMask(mask);
    glowText.setMask(mask);
    const revealState = { progress: 0 };
    const bundle = {
      text: storyText,
      glowText,
      targets: [storyText, glowText],
      maskGraphic,
      revealState,
      destroy: () => {
        storyText.destroy();
        glowText.destroy();
        maskGraphic.destroy();
      },
    };
    this.storyText = bundle;
    this.applyTextRevealMask(bundle);
    return bundle;
  }

  applyTextRevealMask(bundle) {
    if (!bundle?.maskGraphic || !bundle?.text) return;
    const bounds = bundle.text.getBounds();
    const progress = Math.min(1, Math.max(0, bundle.revealState?.progress || 0));
    const revealHeight = bounds.height * progress;
    bundle.maskGraphic.clear();
    bundle.maskGraphic.fillStyle(0xffffff, 1);
    bundle.maskGraphic.fillRect(bounds.left, bounds.top, bounds.width, revealHeight);
  }

  tweenTo(targets, props, duration, ease) {
    const easeFn = ease || resolvePhaserEase();
    return new Promise((resolve) => {
      this.tweens.add({
        targets,
        duration,
        ease: easeFn,
        ...props,
        onComplete: () => resolve(),
        onStop: () => resolve(),
      });
    });
  }

  wait(ms) {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, () => resolve());
    });
  }

  waitForFadeOut(camera, duration, r, g, b) {
    return new Promise((resolve) => {
      camera.once("camerafadeoutcomplete", () => resolve());
      camera.fadeOut(duration, r, g, b);
    });
  }

  ensureStoryImageLoaded(index) {
    return new Promise((resolve) => {
      if (!Number.isFinite(index) || index < 0) return resolve();
      const entries = getIntroStoryEntries();
      const entry = entries[index];
      if (!entry?.image) return resolve();
      const key = `story-slide-${index}`;
      if (this.textures.exists(key)) return resolve();

      const startLoad = () => {
        if (this.textures.exists(key)) return resolve();
        this.load.image(key, storyImageUrl(entry.image));
        this.load.once("complete", () => resolve());
        this.load.once("loaderror", () => resolve());
        this.load.start();
      };

      if (this.load.isLoading && this.load.isLoading()) {
        this.load.once("complete", () => startLoad());
        this.load.once("loaderror", () => startLoad());
        return;
      }

      startLoad();
    });
  }

  async playStory(token) {
    const entries = getIntroStoryEntries();
    if (!entries.length) return;
    const timings = resolveStoryTimings();
    this.entries = entries;
    this.timings = timings;
    await this.ensureStoryImageLoaded(this.slideIndex);
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    if (!this.skipFadeIn) {
      cam.fadeIn(timings.imageFadeInMs, 0, 0, 0);
    }
    const entry = entries[this.slideIndex];
    if (!entry) return;
    const imageKey = `story-slide-${this.slideIndex}`;
    const image = this.add.image(0, 0, imageKey).setOrigin(0.5);
    image.setAlpha(this.skipFadeIn ? 1 : 0);
    fitStoryImageToView(this, image);
    this.currentImage = image;
    this.createGlowEffects(entry.image);
    const nextIndex = this.slideIndex + 1;
    if (nextIndex < entries.length) {
      void this.ensureStoryImageLoaded(nextIndex);
    }
    if (!this.skipFadeIn) {
      await this.tweenTo(image, { alpha: 1 }, timings.imageFadeInMs);
    }
    if (token !== this.activeToken) return;

    const textBundle = this.createStoryText(entry.text);
    const revealTween = new Promise((resolve) => {
      this.tweens.add({
        targets: textBundle.revealState,
        progress: 1,
        duration: timings.textRevealMs,
        ease: "Linear",
        onUpdate: () => this.applyTextRevealMask(textBundle),
        onComplete: () => resolve(),
        onStop: () => resolve(),
      });
    });
    const fadeTween = this.tweenTo(textBundle.targets, { alpha: 1 }, timings.textFadeInMs);
    await Promise.all([revealTween, fadeTween]);
    if (token !== this.activeToken) return;
    const baseHold = Math.max(0, timings.textHoldBaseMs || 0);
    const perChar = Math.max(0, timings.textHoldPerCharMs || 0);
    const multiplier = Number.isFinite(timings.textHoldMultiplier) ? timings.textHoldMultiplier : 1;
    const charCount = Math.max(1, String(entry.text || "").length);
    const holdMs = Math.max(0, (baseHold + perChar * charCount) * multiplier);
    await this.wait(holdMs);
    if (token !== this.activeToken) return;
    await this.tweenTo(textBundle.targets, { alpha: 0 }, timings.textFadeOutMs);
    textBundle.destroy();
    this.storyText = null;
    if (token !== this.activeToken) return;
    await this.wait(timings.imageHoldMs);
    if (token !== this.activeToken) return;

    if (this.slideIndex >= entries.length - 1) {
      await this.finishStory(timings);
      return;
    }

    this.transitionToNextSlide(timings);
    return;
  }

  async finishStory(timings) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.isFinishing = true;
    const cam = this.cameras.main;
    await this.waitForFadeOut(cam, timings.finalFadeMs, 255, 255, 255);
    const pixelate = cam.postFX.addPixelate(1, 1);
    const pixelTarget = Math.max(1, Number(timings.pixelateSize ?? 32));
    await new Promise((resolve) => {
      this.tweens.addCounter({
        from: 1,
        to: pixelTarget,
        duration: Number(timings.pixelateDuration ?? 1000),
        ease: "Linear",
        onUpdate: (tween) => {
          const value = tween.getValue();
          setPostFxPixelateAmount(pixelate, value);
        },
        onComplete: () => resolve(),
        onStop: () => resolve(),
      });
    });
    cam.postFX.remove(pixelate);
    stopIntroStory();
  }

  transitionToNextSlide(timings) {
    if (this.isTransitioning || (this.scene.isTransitioning && this.scene.isTransitioning())) return;
    this.isTransitioning = true;
    const fx = this.cameras.main.postFX.addWipe(
      Math.max(0.001, Number(timings.wipeFeather ?? 0.06)),
      1,
      1
    );
    fx.progress = 0;
    this.scene.transition({
      target: this.nextSceneKey,
      duration: timings.wipeMs,
      moveBelow: true,
      data: {
        index: this.slideIndex + 1,
        nextKey: this.sceneKey,
        skipFadeIn: true,
      },
      onUpdate: (progress) => {
        fx.progress = progress;
      },
    });
  }

  createGlowEffects(imageName) {
    const points = STORY_SLIDE_GLOW_POINTS[imageName];
    if (!points || !points.length) return;
    const textureKey = ensureBasemapGlowTexture(this);
    for (const pt of points) {
      const sprite = this.add.image(0, 0, textureKey).setOrigin(0.5);
      sprite.setBlendMode(Phaser.BlendModes.ADD);
      sprite.setTint(pt.color || 0xffb840);
      sprite.setDepth(1);
      sprite.setAlpha(0);
      this.glowSprites.push({ sprite, point: pt, seed: pt.seed ?? Math.random() * 1000 });
    }
    this.layoutGlowSprites();
  }

  layoutGlowSprites() {
    if (!this.glowSprites?.length || !this.currentImage) return;
    const width = Math.max(1, this.scale.width || 1);
    const height = Math.max(1, this.scale.height || 1);
    const img = this.currentImage;
    const scale = Math.min(1, Math.min(width / img.width, height / img.height));
    const cx = width * 0.5;
    const cy = height * 0.5;
    const halfW = img.width * 0.5;
    const halfH = img.height * 0.5;
    for (const entry of this.glowSprites) {
      const screenX = cx + (entry.point.x - halfW) * scale;
      const screenY = cy + (entry.point.y - halfH) * scale;
      const r = Math.max(12, (entry.point.radius || 60) * scale);
      const spriteScale = (r * 2) / BASEMAP_GLOW_TEXTURE_SIZE;
      entry.sprite.setPosition(screenX, screenY);
      entry.sprite.setScale(spriteScale);
    }
  }

  update(time, delta) {
    if (!this.glowSprites?.length) return;
    const now = performance.now();
    const imageAlpha = this.currentImage?.alpha ?? 1;
    for (const entry of this.glowSprites) {
      const flicker = computeFlameFlicker(entry.seed, now, entry.point.speedMultiplier ?? 1);
      const alpha = (entry.point.alphaScale ?? 0.22) * Math.max(0.08, Math.min(0.9, flicker)) * imageAlpha;
      entry.sprite.setAlpha(alpha);
    }
  }

  logGlowDebugPoint(pointer) {
    const img = this.currentImage;
    if (!img) return;
    const width = Math.max(1, this.scale.width || 1);
    const height = Math.max(1, this.scale.height || 1);
    const scale = Math.min(1, Math.min(width / img.width, height / img.height));
    const cx = width * 0.5;
    const cy = height * 0.5;
    const ix = Math.round((pointer.x - cx) / scale + img.width * 0.5);
    const iy = Math.round((pointer.y - cy) / scale + img.height * 0.5);
    if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return;

    let colorHex = "0xffb840";
    const imageKey = `story-slide-${this.slideIndex}`;
    try {
      const pixel = this.textures.getPixel(ix, iy, imageKey);
      if (pixel) {
        colorHex = "0x" + ((pixel.red << 16) | (pixel.green << 8) | pixel.blue).toString(16).padStart(6, "0");
      }
    } catch (e) { /* fall back to default color */ }

    const speedSetting = (typeof window !== "undefined" && window.devStoryGlowSpeed) || "medium";
    const speedVal = typeof speedSetting === "number"
      ? speedSetting
      : (STORY_GLOW_SPEED_PRESETS[speedSetting] ?? STORY_GLOW_SPEED_PRESETS.medium);

    const entry = `{ x: ${ix}, y: ${iy}, radius: 60, color: ${colorHex}, alphaScale: 0.6, speedMultiplier: ${speedVal} },`;
    console.log(`[StoryGlow] slide ${this.slideIndex} (${this.entries[this.slideIndex]?.image}):`);
    console.log(entry);
  }

  advanceSlide() {
    if (storyOverlayState.skipRequested) return;
    if (this.isFinishing) return;
    const entries = this.entries || [];
    const timings = this.timings || resolveStoryTimings();
    if (this.isTransitioning && !(this.scene.isTransitioning && this.scene.isTransitioning())) {
      this.isTransitioning = false;
    }
    if (this.isTransitioning) return;
    this.activeToken += 1;
    this.tweens.killAll();
    this.time.removeAllEvents();
    if (this.storyText) {
      this.storyText.destroy();
      this.storyText = null;
    }
    if (!entries.length) return;
    if (this.slideIndex >= entries.length - 1) {
      this.finishStory(timings);
      return;
    }
    this.transitionToNextSlide(timings);
  }
}

class StorySlideSceneA extends StorySlideScene {
  constructor() {
    super(STORY_SCENE_KEYS.primary);
  }
}

class StorySlideSceneB extends StorySlideScene {
  constructor() {
    super(STORY_SCENE_KEYS.secondary);
  }
}

function startIntroStory(options = {}) {
  const { restart = true } = options;
  if (!ensureStoryOverlayElements()) return;
  if (storyOverlayState.skipBtn) {
    storyOverlayState.skipBtn.disabled = false;
    storyOverlayState.skipBtn.removeAttribute("aria-disabled");
  }
  storyOverlayState.skipRequested = false;
  const entries = getIntroStoryEntries();
  if (!entries.length) {
    console.warn("Intro story unavailable: ContentLibrary.IntroStory is empty.");
    return;
  }
  storyOverlayState.returnToTitle = !!options.returnToTitle;
  storyOverlayState.entries = entries;
  hideAllSceneOverlays();
  document.body.classList.remove("title-active");
  document.documentElement.classList.remove("title-boot");
  storyOverlayState.overlayEl.classList.remove("hidden");
  storyOverlayState.active = true;
  // The story overlay is opaque: stop drawing the title shader under it.
  try { titleScreenState.game?.loop?.sleep(); } catch (_) {}
  document.body.classList.add("story-active");
  const toggle = document.getElementById("devStoryToggle");
  if (toggle) toggle.checked = true;
  if (storyOverlayState.game && restart) {
    destroyStoryGame();
  }
  if (!storyOverlayState.game) {
    storyOverlayState.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "storyPhaserContainer",
      backgroundColor: "#000000",
      fps: {
        target: 60,
        min: 10,
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [StorySlideSceneA, StorySlideSceneB],
    });
  } else if (!restart) {
    storyOverlayState.game.scene.start(STORY_SCENE_KEYS.primary, {
      index: 0,
      nextKey: STORY_SCENE_KEYS.secondary,
    });
  }
}

function stopIntroStory() {
  destroyStoryGame();
  if (storyOverlayState.overlayEl) {
    storyOverlayState.overlayEl.classList.add("hidden");
  }
  storyOverlayState.active = false;
  document.body.classList.remove("story-active");
  if (titleScreenState.visible && titleScreenState.game?.loop?.started) {
    try { titleScreenState.game.loop.wake(); } catch (_) {}
  }
  if (storyOverlayState.returnToTitle && titleScreenState.enabled && !titleScreenState.gameStarted) {
    showTitleScreen();
  }
  storyOverlayState.returnToTitle = false;
  storyOverlayState.skipRequested = false;
  if (storyOverlayState.skipBtn) {
    storyOverlayState.skipBtn.disabled = false;
    storyOverlayState.skipBtn.removeAttribute("aria-disabled");
  }
  const toggle = document.getElementById("devStoryToggle");
  if (toggle) toggle.checked = false;
}

function applySoundSettingsToDiceScenes(_enabled) {
  const volume = getDiceSfxVolume();
  for (const overlayState of DICE_SOUND_OVERLAYS) {
    const renderer = overlayState?.diceRenderer;
    const diceBox = renderer?.box;
    if (!diceBox) continue;
    diceBox.volume = volume;
    diceBox.sounds = true;
    if (typeof diceBox.setVolume === "function") {
      diceBox.setVolume(volume);
    }
  }
  const settlementBox = settlementOverlayState?.diceBox;
  if (settlementBox) {
    settlementBox.volume = volume;
    settlementBox.sounds = true;
    if (typeof settlementBox.setVolume === "function") {
      settlementBox.setVolume(volume);
    }
  }
  const largeSettlementBox = largeSettlementOverlayState?.diceBox;
  if (largeSettlementBox) {
    largeSettlementBox.volume = volume;
    largeSettlementBox.sounds = true;
    if (typeof largeSettlementBox.setVolume === "function") {
      largeSettlementBox.setVolume(volume);
    }
  }
}
const pendingEncounter = {
  sceneKey: null,
  textureKey: null,
  frameKey: null,
  lockedFrame: false,
};
const activeEncounter = {
  sceneKey: null,
  textureKey: null,
  frameKey: null,
  lockedFrame: false,
};
const currentEncounterBadge = {
  textureKey: null,
  frameKey: null,
  image: null,
  sx: 0,
  sy: 0,
  sw: 0,
  sh: 0,
};
const ENCOUNTER_LOG_LABELS = {
  poi: "loot.",
  random: "strange phenomena.",
  camp: "a rest stop.",
  battle: "enemies.",
};
const encounterLogState = {
  entry: null,
  entryId: null,
  sceneKey: null,
  counter: 0,
};
const ENCOUNTER_TEXTURE_KEYS = {
  poi: "poi",
  random: "randoms",
  battle: BATTLE_SPRITE_KEY,
  camp: CAMP_SPRITE_KEY,
};
const encounterBadgeImageCache = {};
const ENCOUNTER_SCALE = 0.96; // contain image with a small inset to allow drift without stretching
const SHOW_ENCOUNTER_PREVIEW_SPRITE = false;
const ENCOUNTER_BADGE_FADE_MS = 300;
const ENCOUNTER_BADGE_MAX_FRACTION = 0.3;
const CAMP_BADGE_MAX_FRACTION = 0.25;
const POI_PRIZE_BADGE_SCALE_MULTIPLIER = 0.78;
const ENCOUNTER_BADGE_GLOW_COLOR = "rgba(141, 255, 177, 0.7)";
const ENCOUNTER_FLAME_POINTS = [
  { x: 1594, y: 941, radius: 140 },
  { x: 1568, y: 948, radius: 140 },
  { x: 736, y: 721, radius: 90 },
  { x: 573, y: 715, radius: 90 },
];
const CAMP_FLAME_POINTS = [
  { x: 1034, y: 902, radius: 115 },
  { x: 1031, y: 855, radius: 115 },
  { x: 972, y: 853, radius: 105 },
  { x: 1628, y: 850, radius: 130 },
];
const HOME_SCENE_LIGHT_POINTS = [
  { x: 2032, y: 388, radius: 90, alphaScale: 0.4, speedMultiplier: 1.6, innerColor: 0x8cffaa, outerColor: 0x46dc6e },
  { x: 1961, y: 395, radius: 90, alphaScale: 0.3, speedMultiplier: 1.8, innerColor: 0x8cffaa, outerColor: 0x46dc6e },
  { x: 2242, y: 1232, radius: 60, alphaScale: 0.3, speedMultiplier: 6.6, innerColor: 0xfff1b0, outerColor: 0xffa000 },
  { x: 2066, y: 1197, radius: 60, alphaScale: 0.2, speedMultiplier: 6.6, innerColor: 0xffdf9d, outerColor: 0xff8a00 },
];
const CAMP_SCALE = ENCOUNTER_SCALE;

const TEXT_FADE_IN_MS = 2000;
const ROLL_TO_NARRATIVE_DELAY_MS = 300;
const OUTCOME_FADE_MS = 700;
const SCENE_MESSAGE_IDS = {
  camp: "campMessage",
  poi: "poiMessage",
  random: "randomMessage",
  battle: "battleMessage",
};
const CONTENT_LIBRARY_KEYS = {
  camp: "Camps",
  poi: "Pois",
  random: "Randoms",
  battle: "Battles",
};
const textRevealTimers = new WeakMap();

// Basemap light effects can be extended by appending rows with { pos, color, radiusPct, alphaScale, speedMultiplier }.
const BASEMAP_LIGHT_ANIMATIONS = ([
  {
    id: "tisland1", 
    pos: { x: 26.29, y: 49.65 }, 
    radiusPct: 0.5, 
    color: 0x36f710,
    alphaScale: 0.4,
    speedMultiplier: 0.9,
    alwaysOn: true
  },  
  {
    id: "tisland2", 
    pos: { x: 26.4, y: 50.28 }, 
    radiusPct: 0.3, 
    color: 0x21940a,
    alphaScale: 0.3,
    speedMultiplier: 0.65,
    alwaysOn: true
  },
  {
    id: "airfield1", 
    pos: { x: 31.34, y: 59.91 }, 
    radiusPct: 0.5, 
    color: 0xffd11a,
    alphaScale: 0.4,
    speedMultiplier: 1.7,
    alwaysOn: true
  },  
  {
    id: "airfield2", 
    pos: { x: 31.03, y: 61.22 }, 
    radiusPct: 0.3, 
    color: 0xffd11a,
    alphaScale: 0.3,
    speedMultiplier: 2.4,
    alwaysOn: true
  },
  {
    id: "airfield3",
    pos: { x: 25.71, y: 72.75 },
    radiusPct: 0.28,
    color: 0xffd11a,
    alphaScale: 0.24,
    speedMultiplier: 1.55
  },
  {
    id: "airfield4",
    pos: { x: 25.73, y: 72.96 },
    radiusPct: 0.24,
    color: 0xffd11a,
    alphaScale: 0.2,
    speedMultiplier: 2.05
  },
  {
    id: "airfield6",
    pos: { x: 26.06, y: 73.56 },
    radiusPct: 0.3,
    color: 0xffd11a,
    alphaScale: 0.25,
    speedMultiplier: 1.65
  },
  {
    id: "airfield7",
    pos: { x: 27.21, y: 39.55 },
    radiusPct: 0.32,
    color: 0xffd11a,
    alphaScale: 0.28,
    speedMultiplier: 1.8
  },
  {
    id: "airfield8",
    pos: { x: 26.37, y: 39.59 },
    radiusPct: 0.28,
    color: 0xffd11a,
    alphaScale: 0.24,
    speedMultiplier: 1.55
  },
  {
    id: "airfield9",
    pos: { x: 26.03, y: 37.95 },
    radiusPct: 0.3,
    color: 0xffd11a,
    alphaScale: 0.26,
    speedMultiplier: 1.7
  },
  {
    id: "airfield10",
    pos: { x: 28.33, y: 39.76 },
    radiusPct: 0.34,
    color: 0xffd11a,
    alphaScale: 0.29,
    speedMultiplier: 1.95
  },
  {
    id: "airfield11",
    pos: { x: 27.21, y: 37.59 },
    radiusPct: 0.28,
    color: 0xffd11a,
    alphaScale: 0.23,
    speedMultiplier: 1.6
  },
  {
    id: "airfield12",
    pos: { x: 26.59, y: 36.66 },
    radiusPct: 0.26,
    color: 0xffd11a,
    alphaScale: 0.6,
    speedMultiplier: 1.45
  },
  {
    id: "airfield13",
    pos: { x: 44.67, y: 67.18 },
    radiusPct: 0.32,
    color: 0xffd11a,
    alphaScale: 0.28,
    speedMultiplier: 1.75
  },
  {
    id: "airfield14",
    pos: { x: 44.24, y: 66.87 },
    radiusPct: 0.28,
    color: 0xffd11a,
    alphaScale: 0.24,
    speedMultiplier: 1.58
  },
  {
    id: "airfield15",
    pos: { x: 44.93, y: 62.54 },
    radiusPct: 0.34,
    color: 0xffd11a,
    alphaScale: 0.3,
    speedMultiplier: 1.92
  },
  {
    id: "airfield16",
    pos: { x: 43.40, y: 66.88 },
    radiusPct: 0.3,
    color: 0xffd11a,
    alphaScale: 0.25,
    speedMultiplier: 1.63
  },
  {
    id: "airfield17",
    pos: { x: 43.55, y: 64.15 },
    radiusPct: 0.29,
    color: 0xffd11a,
    alphaScale: 0.24,
    speedMultiplier: 1.54
  },
  {
    id: "airfield18",
    pos: { x: 41.43, y: 65.10 },
    radiusPct: 0.31,
    color: 0xffd11a,
    alphaScale: 0.27,
    speedMultiplier: 1.68
  },
  {
    id: "airfield19",
    pos: { x: 43.17, y: 60.50 },
    radiusPct: 0.28,
    color: 0xffd11a,
    alphaScale: 0.23,
    speedMultiplier: 1.5
  },
  {
    id: "radiation1",
    pos: { x: 24.70, y: 74.12 },
    radiusPct: 0.34,
    color: 0xc7ff2f,
    alphaScale: 0.38,
    speedMultiplier: 1.1
  },
  {
    id: "radiation10",
    pos: { x: 26.86, y: 39.53 },
    radiusPct: 0.3,
    color: 0x8fcd2a,
    alphaScale: 0.29,
    speedMultiplier: 0.58
  },
  {
    id: "radiation11",
    pos: { x: 26.75, y: 39.38 },
    radiusPct: 0.26,
    color: 0x7fbe22,
    alphaScale: 0.25,
    speedMultiplier: 0.47
  },
  {
    id: "radiation2",
    pos: { x: 45.55, y: 89.30 },
    radiusPct: 0.42,
    color: 0x8fbe1d,
    alphaScale: 0.33,
    speedMultiplier: 0.52
  },
  {
    id: "radiation3",
    pos: { x: 45.80, y: 90.94 },
    radiusPct: 0.56,
    color: 0x85b816,
    alphaScale: 0.53,
    speedMultiplier: 0.36
  },
  {
    id: "radiation4",
    pos: { x: 45.81, y: 76.88 },
    radiusPct: 0.36,
    color: 0x99cc22,
    alphaScale: 0.27,
    speedMultiplier: 0.6
  },
  {
    id: "radiation5",
    pos: { x: 45.36, y: 78.11 },
    radiusPct: 0.4,
    color: 0x92c61f,
    alphaScale: 0.4,
    speedMultiplier: 0.48
  },
  {
    id: "radiation6",
    pos: { x: 44.89, y: 78.85 },
    radiusPct: 0.44,
    color: 0x88bd19,
    alphaScale: 0.46,
    speedMultiplier: 0.42
  },
  {
    id: "radiation7",
    pos: { x: 50.10, y: 77.73 },
    radiusPct: 0.38,
    color: 0x93c71f,
    alphaScale: 0.31,
    speedMultiplier: 0.47
  },
  {
    id: "radiation8",
    pos: { x: 49.23, y: 75.71 },
    radiusPct: 0.42,
    color: 0x8ab91b,
    alphaScale: 0.36,
    speedMultiplier: 0.51
  },
  {
    id: "radiation9",
    pos: { x: 48.70, y: 73.95 },
    radiusPct: 0.46,
    color: 0x82af17,
    alphaScale: 0.41,
    speedMultiplier: 0.44
  },
]).map((entry) => ({ ...entry, seed: Math.random() * 1000 }));
const BASEMAP_GLOW_TEXTURE_SIZE = 128;
const BASEMAP_GLOW_DEPTH = -0.6;
const BASEMAP_GLOW_ZOOM_FAR = 0.2;
const BASEMAP_GLOW_ZOOM_MEDIUM = 0.34;
const BASEMAP_GLOW_VIEW_MARGIN_PX = 160;

function colorToRgba(color = 0xffffff, alpha = 1) {
  const hex = typeof color === "number" ? color : parseInt(color, 16);
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

const BASEMAP_GLOW_SHARED_TEXTURE_KEY = "basemapGlowShared";

function ensureBasemapGlowTexture(scene) {
  const textureKey = BASEMAP_GLOW_SHARED_TEXTURE_KEY;
  if (scene.textures.exists(textureKey)) return textureKey;
  const texture = scene.textures.createCanvas(textureKey, BASEMAP_GLOW_TEXTURE_SIZE, BASEMAP_GLOW_TEXTURE_SIZE);
  if (!texture || !texture.context) return textureKey;
  const half = BASEMAP_GLOW_TEXTURE_SIZE * 0.5;
  const gradient = texture.context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.4)");
  gradient.addColorStop(0.8, "rgba(255,255,255,0.16)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  texture.context.clearRect(0, 0, BASEMAP_GLOW_TEXTURE_SIZE, BASEMAP_GLOW_TEXTURE_SIZE);
  texture.context.fillStyle = gradient;
  texture.context.fillRect(0, 0, BASEMAP_GLOW_TEXTURE_SIZE, BASEMAP_GLOW_TEXTURE_SIZE);
  texture.refresh();
  return textureKey;
}

function getBasemapGlowTextureKey() {
  return BASEMAP_GLOW_SHARED_TEXTURE_KEY;
}

function getBasemapGlowZoomTier(zoom = 1) {
  if (zoom <= BASEMAP_GLOW_ZOOM_FAR) return "far";
  if (zoom <= BASEMAP_GLOW_ZOOM_MEDIUM) return "medium";
  return "close";
}

function getBasemapGlowLayout(effect, width, height) {
  if (!effect) return null;
  const cached = effect._layout;
  if (cached && cached.width === width && cached.height === height) return cached;
  const diag = Math.max(width, height);
  const px = ((typeof effect.pos?.x === "number" ? effect.pos.x : 0) / 100) * width;
  const py = ((typeof effect.pos?.y === "number" ? effect.pos.y : 0) / 100) * height;
  const radiusPct = Math.max(0.3, effect.radiusPct ?? 16);
  const radius = (radiusPct / 100) * diag;
  const scale = Math.max(0.01, (radius * 2) / BASEMAP_GLOW_TEXTURE_SIZE);
  const layout = { width, height, px, py, radius, scale };
  effect._layout = layout;
  return layout;
}

function shouldRenderBasemapGlow(effect, scene, cam, layout) {
  if (!effect || !scene || !cam || !layout) return false;
  if (!effect.alwaysOn && !isPctVisible(effect.pos, scene.gameState)) return false;
  const view = cam.worldView;
  if (!view) return false;
  const margin = BASEMAP_GLOW_VIEW_MARGIN_PX + layout.radius;
  if (
    layout.px + margin < view.x
    || layout.px - margin > view.x + view.width
    || layout.py + margin < view.y
    || layout.py - margin > view.y + view.height
  ) {
    return false;
  }
  const zoomTier = getBasemapGlowZoomTier(cam.zoom || 1);
  if (zoomTier === "far") {
    return !!effect.alwaysOn;
  }
  if (zoomTier === "medium" && !effect.alwaysOn) {
    return (effect.alphaScale ?? 0) >= 0.3 || (effect.radiusPct ?? 0) >= 0.34;
  }
  return true;
}

function ensurePingTextures(scene) {
  if (!scene || scene.textures.exists(PING_RING_TEX)) return;
  const size = 64;
  const ringTex = scene.textures.createCanvas(PING_RING_TEX, size, size);
  if (!ringTex || !ringTex.context) return;
  const ringCtx = ringTex.context;
  ringCtx.clearRect(0, 0, size, size);
  ringCtx.strokeStyle = "#ffffff";
  ringCtx.lineWidth = 5;
  ringCtx.lineCap = "round";
  const cx = size * 0.5;
  const cy = size * 0.5;
  const radius = size * 0.33;
  for (let i = 0; i < 18; i += 1) {
    if (Math.random() < 0.2) continue;
    const start = (i / 18) * Math.PI * 2;
    const end = start + Math.PI * 2 * (0.04 + Math.random() * 0.07);
    ringCtx.globalAlpha = 0.7 + Math.random() * 0.3;
    ringCtx.beginPath();
    ringCtx.arc(cx, cy, radius + (Math.random() - 0.5) * 2, start, end);
    ringCtx.stroke();
  }
  ringTex.refresh();

  const dustTex = scene.textures.createCanvas(PING_DUST_TEX, size, size);
  if (!dustTex || !dustTex.context) return;
  const dustCtx = dustTex.context;
  dustCtx.clearRect(0, 0, size, size);
  const grad = dustCtx.createRadialGradient(cx, cy, 4, cx, cy, size * 0.4);
  grad.addColorStop(0, "rgba(255,255,255,0.7)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.3)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  dustCtx.fillStyle = grad;
  dustCtx.beginPath();
  dustCtx.arc(cx, cy, size * 0.4, 0, Math.PI * 2);
  dustCtx.fill();
  dustTex.refresh();
}

function computeBasemapGlowAlpha(effect, now) {
  const speedMultiplier = typeof effect.speedMultiplier === "number" ? effect.speedMultiplier : 1;
  const flicker = computeFlameFlicker(effect.seed || 0, now, speedMultiplier);
  const alphaScale = typeof effect.alphaScale === "number" ? effect.alphaScale : 0.6;
  return alphaScale * Math.max(0.08, Math.min(0.9, flicker));
}

function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!target.isContentEditable;
}

function isAnyUnitMoving(state) {
  if (!state?.rangerUnits?.length) return false;
  return state.rangerUnits.some((unit) => unit?.deployed && !isUnitIdle(unit));
}

function isEncounterTransitionActive() {
  return !!encounterOverlayState.transitionLocked;
}

function setEncounterTransitionActive(active) {
  encounterOverlayState.transitionLocked = !!active;
  refreshEndTurnButtonAvailability();
}

function isMapEndTurnTransitionActive() {
  return !!mapSceneInstance?.isEndTurnTransitionActive;
}

function isRunOver(state = getGlobalGameState()) {
  return !!(state && (state.gameOver || state.missionComplete));
}

// True while the Menu window is open. The score clock is stopped for that time, so the
// run is held as well: units do not move and no orders or End Turn are accepted.
function isMenuPauseActive() {
  return Number.isFinite(menuPauseStartedAt);
}

function canIssueUnitMovementOrders() {
  return !isRunOver() && !isMenuPauseActive() && !isEncounterTransitionActive() && !isTransientSceneActive() && !isMapEndTurnTransitionActive();
}

function canUseMapHotkeys(state, event, options = {}) {
  if (!state) return false;
  if (isRunOver(state)) return false;
  if (isMenuPauseActive()) return false;
  if (tourState.active) return false;
  if (isEncounterTransitionActive()) return false;
  if (isMapEndTurnTransitionActive()) return false;
  if (isAnySceneOverlayActive()) return false;
  if (!options.allowWhileMoving && isAnyUnitMoving(state)) return false;
  if (event && isEditableTarget(event.target)) return false;
  return true;
}

function isAnySceneOverlayActive() {
  return !!(
    campOverlayState.active
    || poiOverlayState.active
    || randomOverlayState.active
    || battleOverlayState.active
    || settlementOverlayState.active
    || largeSettlementOverlayState.active
    || storyOverlayState.active
  );
}

function isOtherSceneLocked(current) {
  const scenes = [
    campOverlayState,
    poiOverlayState,
    randomOverlayState,
    battleOverlayState,
    settlementOverlayState,
    largeSettlementOverlayState,
  ];
  return scenes.some((s) => s !== current && s.active && !s.exitEnabled);
}

// Used when the game state is being swapped out from under the UI (load, restart).
// hideAllSceneOverlays alone leaves the encounter splash up, refuses to close a scene
// whose roll is still pending, and leaves the encounter movement lock set.
function teardownScenesForStateSwap() {
  cancelEncounterTimer();
  if (mapSceneInstance?.clearEncounterPreview) {
    mapSceneInstance.clearEncounterPreview();
  }
  if (encounterOverlayState.active) toggleEncounterOverlay(false);
  [campOverlayState, poiOverlayState, randomOverlayState, battleOverlayState].forEach((sceneState) => {
    // Bumping rollId orphans an in-flight roll so its outcome is never applied.
    sceneState.rollId = (sceneState.rollId || 0) + 1;
    sceneState.rolling = false;
    setOverlayExitEnabled(sceneState, true);
  });
  [settlementOverlayState, largeSettlementOverlayState].forEach((sceneState) => {
    sceneState.rollId = (sceneState.rollId || 0) + 1;
    sceneState.rolling = false;
  });
  hideAllSceneOverlays();
  clearPendingEncounter();
  resetEncounterRollGate();
  encounterOverlayState.encounterUnitId = null;
  setEncounterTransitionActive(false);
}

function hideAllSceneOverlays(exceptState = null) {
  if (campOverlayState.active && exceptState !== campOverlayState) toggleCampOverlay(false);
  if (poiOverlayState.active && exceptState !== poiOverlayState) togglePoiOverlay(false);
  if (randomOverlayState.active && exceptState !== randomOverlayState) toggleRandomOverlay(false);
  if (battleOverlayState.active && exceptState !== battleOverlayState) toggleBattleOverlay(false);
  if (storyOverlayState.active) stopIntroStory();
  if (settlementOverlayState.active && exceptState !== settlementOverlayState) {
    setOverlayExitEnabled(settlementOverlayState, true);
    toggleSettlementOverlay(false);
  }
  if (largeSettlementOverlayState.active && exceptState !== largeSettlementOverlayState) {
    setOverlayExitEnabled(largeSettlementOverlayState, true);
    toggleLargeSettlementOverlay(false);
  }
}

function closeMapPanes(state, options = {}) {
  const panes = ["squadWindow", "townWindow", "howToWindow", "upgradeWindow", "regionModal", "logOverlay"];
  const fadeMs = Number(options.squadFadeMs) || 0;
  panes.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === "squadWindow" && fadeMs > 0 && !el.classList.contains("hidden")) {
      el.classList.add("encounter-fading-out");
      if (el._encounterFadeTimer) clearTimeout(el._encounterFadeTimer);
      el._encounterFadeTimer = setTimeout(() => {
        el.classList.add("hidden");
        el.classList.remove("encounter-fading-out");
        el._encounterFadeTimer = null;
      }, fadeMs);
      return;
    }
    el.classList.add("hidden");
  });
  const howToWin = document.getElementById("howToWindow");
  if (howToWin) howToWin.setAttribute("aria-hidden", "true");
  const howToBtn = document.getElementById("howToBtn");
  if (howToBtn) howToBtn.setAttribute("aria-expanded", "false");
  document.body.classList.remove("howto-open");
  if (state) {
    if (!options.preserveState) {
      state.squadPaneClosed = true;
    }
    if (!options.keepSelection && !options.preserveState) {
      state.squadSelected = false;
    }
  }
}

function openSquadPaneForReturn(state) {
  if (!state) return;
  const unit = getActiveRangerUnit(state);
  if (!unit?.deployed) return;
  state.squadSelected = true;
  state.squadPaneClosed = false;
  updateSquadWindow(state);
}

function getLoggerInstance() {
  const state = getGlobalGameState();
  return state?.logger || null;
}

function encounterDebugEnabled() {
  return typeof window !== "undefined" && !!window.DEBUG_ENCOUNTER_SPRITES;
}

function logEncounterDebug(message, data) {
  if (!encounterDebugEnabled()) return;
  if (typeof data === "undefined") {
    console.log(`[Encounter] ${message}`);
  } else {
    console.log(`[Encounter] ${message}`, data);
  }
}

function logEncounterStart(sceneKey) {
  const logger = getLoggerInstance();
  if (!logger) return null;
  const id = `enc-${Date.now()}-${(++encounterLogState.counter % 100000)}`;
  const entry = logger.log("Rangers encountered ...", { id });
  encounterLogState.entry = entry;
  encounterLogState.entryId = id;
  encounterLogState.sceneKey = sceneKey || null;
  return entry;
}

function resolveEncounterLog(sceneKey) {
  const logger = getLoggerInstance();
  const target = encounterLogState.entry || encounterLogState.entryId;
  if (!logger || !target) {
    encounterLogState.entry = null;
    encounterLogState.entryId = null;
    encounterLogState.sceneKey = null;
    return null;
  }
  const label = ENCOUNTER_LOG_LABELS[sceneKey] || ENCOUNTER_LOG_LABELS[encounterLogState.sceneKey] || "something out there";
  logger.update(target, `Rangers encountered ${label}.`);
  encounterLogState.entry = null;
  encounterLogState.entryId = null;
  encounterLogState.sceneKey = null;
  return label;
}

function suppressHomeSceneAfterEncounter() {
  const state = getGlobalGameState();
  if (!state) return;
  state.largeSettlementSceneSuppressedId = "home";
  state.largeSettlementSceneSuppressUntil = performance.now() + 1500;
}

function logHomeSceneDebug(...args) {
  if (typeof window === "undefined") return;
  if (!window.devHomeSceneDebug) return;
  console.log("[HomeScene]", ...args);
}

function pickRandomBattleSpriteKey() {
  return BATTLE_SPRITE_KEYS[Math.floor(Math.random() * BATTLE_SPRITE_KEYS.length)];
}

function resolveBattleTextureKey() {
  if (BATTLE_SPRITE_KEYS.includes(pendingEncounter.textureKey)) {
    return pendingEncounter.textureKey;
  }
  if (BATTLE_SPRITE_KEYS.includes(activeEncounter.textureKey)) {
    return activeEncounter.textureKey;
  }
  return pickRandomBattleSpriteKey();
}

function defaultBattleFrameKey(textureKey) {
  const key = BATTLE_SPRITE_KEYS.includes(textureKey) ? textureKey : BATTLE_SPRITE_KEY;
  return `${key}-0`;
}

function encounterTextureKeyForScene(sceneKey) {
  if (sceneKey === "battle") {
    return resolveBattleTextureKey();
  }
  return ENCOUNTER_TEXTURE_KEYS[sceneKey] || null;
}

function pickEncounterFrameForScene(sceneKey) {
  const textureKey = encounterTextureKeyForScene(sceneKey);
  if (!textureKey) return { textureKey: null, frameKey: null };
  const frames = (mapSceneInstance?.atlasFrames && mapSceneInstance.atlasFrames[textureKey]) || [];
  const frameKey = frames.length ? frames[Math.floor(Math.random() * frames.length)] : null;
  return { textureKey, frameKey };
}

function encounterTextureSrc(textureKey) {
  switch (textureKey) {
    case "poi":
      return "sprites/poi.png";
    case "randoms":
      return "sprites/randoms.png";
    case "battle1":
    case "battle2":
      return BATTLE_SPRITE_SOURCES[textureKey] || null;
    case CAMP_SPRITE_KEY:
      return CAMP_SPRITE_SRC;
    default:
      return null;
  }
}

function cacheBadgeFrameData({ image, sx, sy, sw, sh, textureKey, frameKey }) {
  if (!image || !sw || !sh) return;
  currentEncounterBadge.textureKey = textureKey || null;
  currentEncounterBadge.frameKey = frameKey || null;
  currentEncounterBadge.image = image;
  currentEncounterBadge.sx = sx;
  currentEncounterBadge.sy = sy;
  currentEncounterBadge.sw = sw;
  currentEncounterBadge.sh = sh;
}

function resetCurrentEncounterBadge() {
  currentEncounterBadge.textureKey = null;
  currentEncounterBadge.frameKey = null;
  currentEncounterBadge.image = null;
  currentEncounterBadge.sx = 0;
  currentEncounterBadge.sy = 0;
  currentEncounterBadge.sw = 0;
  currentEncounterBadge.sh = 0;
}

function clearActiveEncounter() {
  if (
    activeEncounter.sceneKey
    || activeEncounter.textureKey
    || activeEncounter.frameKey
    || activeEncounter.lockedFrame
  ) {
    logEncounterDebug("Active encounter cleared.", { ...activeEncounter });
  }
  activeEncounter.sceneKey = null;
  activeEncounter.textureKey = null;
  activeEncounter.frameKey = null;
  activeEncounter.lockedFrame = false;
}

function setActiveEncounter(selection) {
  if (!selection) return;
  const shouldLog = encounterDebugEnabled();
  const prev = shouldLog ? { ...activeEncounter } : null;
  activeEncounter.sceneKey = selection.sceneKey || null;
  activeEncounter.textureKey = selection.textureKey || null;
  activeEncounter.frameKey = selection.frameKey || null;
  activeEncounter.lockedFrame = !!selection.lockedFrame;
  if (shouldLog && (
    prev.sceneKey !== activeEncounter.sceneKey
    || prev.textureKey !== activeEncounter.textureKey
    || prev.frameKey !== activeEncounter.frameKey
    || prev.lockedFrame !== activeEncounter.lockedFrame
  )) {
    logEncounterDebug("Active encounter set.", { from: prev, to: { ...activeEncounter } });
  }
  syncSceneSpriteLabel(activeEncounter.sceneKey, activeEncounter.frameKey);
}

function ensureActiveEncounter(sceneKey = null) {
  if (activeEncounter.sceneKey && (!sceneKey || activeEncounter.sceneKey === sceneKey)) {
    return activeEncounter;
  }
  const pending = ensurePendingEncounter(sceneKey);
  setActiveEncounter(pending);
  logEncounterDebug("Active encounter synced from pending.", {
    requestedSceneKey: sceneKey,
    pending: { ...pending },
  });
  return activeEncounter;
}

function syncEncounterBadgeFromSelection(selection) {
  const target = selection || ensureActiveEncounter();
  const textureKey = target?.textureKey;
  const frameKey = target?.frameKey;
  if (!textureKey || !mapSceneInstance?.textures?.exists(textureKey)) {
    resetCurrentEncounterBadge();
    return null;
  }
  const tex = mapSceneInstance.textures.get(textureKey);
  if (!tex) {
    resetCurrentEncounterBadge();
    return null;
  }
  if (!frameKey) {
    const source = tex.getSourceImage?.();
    if (source?.width && source?.height) {
      cacheBadgeFrameData({
        image: source,
        sx: 0,
        sy: 0,
        sw: source.width,
        sh: source.height,
        textureKey,
        frameKey: null,
      });
      return { ...currentEncounterBadge };
    }
    resetCurrentEncounterBadge();
    return null;
  }
  const frame = tex.get(frameKey);
  if (!frame?.source?.image) {
    resetCurrentEncounterBadge();
    return null;
  }
  const sx = typeof frame.cutX === "number" ? frame.cutX : (typeof frame.x === "number" ? frame.x : 0);
  const sy = typeof frame.cutY === "number" ? frame.cutY : (typeof frame.y === "number" ? frame.y : 0);
  const sw = typeof frame.cutWidth === "number" ? frame.cutWidth : (typeof frame.width === "number" ? frame.width : 0);
  const sh = typeof frame.cutHeight === "number" ? frame.cutHeight : (typeof frame.height === "number" ? frame.height : 0);
  if (sw > 0 && sh > 0) {
    cacheBadgeFrameData({ image: frame.source.image, sx, sy, sw, sh, textureKey, frameKey });
    return { ...currentEncounterBadge };
  }
  resetCurrentEncounterBadge();
  return null;
}

function syncSceneSpriteLabel(sceneKey, frameKey) {
  if (!sceneKey) return;
  const state = getGlobalGameState();
  if (!state) return;
  state.sceneSpriteLabels = state.sceneSpriteLabels || {};
  if (frameKey) {
    state.sceneSpriteLabels[sceneKey] = frameKey;
  } else {
    delete state.sceneSpriteLabels[sceneKey];
  }
  if (sceneKey === "battle") {
    state.currentBattleSpriteLabel = frameKey || null;
  }
}

function syncBattleSpriteLabel(frameKey) {
  syncSceneSpriteLabel("battle", frameKey);
}

function getSceneSpriteLabelFromState(sceneKey) {
  if (!sceneKey) return null;
  const state = getGlobalGameState();
  return state?.sceneSpriteLabels?.[sceneKey] || null;
}

function ensurePendingEncounter(sceneKey = null) {
  const desiredKey = sceneKey || pendingEncounter.sceneKey || pickNextSceneKey(sceneSelectionWeights);
  if (!desiredKey) {
    clearPendingEncounter();
    return pendingEncounter;
  }
  const expectedTexture = encounterTextureKeyForScene(desiredKey);
  const shouldLog = encounterDebugEnabled();
  const prev = shouldLog ? { ...pendingEncounter } : null;
  const reasons = shouldLog ? [] : null;
  if (pendingEncounter.textureKey !== expectedTexture) {
    resetCurrentEncounterBadge();
    if (reasons) reasons.push("texture-reset");
  }
  pendingEncounter.sceneKey = desiredKey;
  if (pendingEncounter.textureKey !== expectedTexture) {
    pendingEncounter.textureKey = expectedTexture;
    pendingEncounter.frameKey = null;
    pendingEncounter.lockedFrame = false;
  }
  const frames = (mapSceneInstance?.atlasFrames && pendingEncounter.textureKey
    ? mapSceneInstance.atlasFrames[pendingEncounter.textureKey] || []
    : []);
  if (
    !pendingEncounter.lockedFrame
    && (!pendingEncounter.frameKey || (frames.length && !frames.includes(pendingEncounter.frameKey)))
  ) {
    const picked = pickEncounterFrameForScene(desiredKey);
    pendingEncounter.textureKey = picked.textureKey;
    pendingEncounter.frameKey = picked.frameKey;
    pendingEncounter.lockedFrame = !!picked.frameKey;
    if (reasons) reasons.push("frame-pick");
  }
  if (shouldLog && (
    prev.sceneKey !== pendingEncounter.sceneKey
    || prev.textureKey !== pendingEncounter.textureKey
    || prev.frameKey !== pendingEncounter.frameKey
    || prev.lockedFrame !== pendingEncounter.lockedFrame
  )) {
    logEncounterDebug(
      `Pending encounter updated${reasons && reasons.length ? ` (${reasons.join(", ")})` : ""}.`,
      { from: prev, to: { ...pendingEncounter } }
    );
  }
  if (!activeEncounter.sceneKey && pendingEncounter.frameKey) {
    syncSceneSpriteLabel(pendingEncounter.sceneKey || desiredKey, pendingEncounter.frameKey);
  }
  if (
    pendingEncounter.frameKey
    && mapSceneInstance?.textures?.exists(pendingEncounter.textureKey)
    && mapSceneInstance.textures.getFrame(pendingEncounter.textureKey, pendingEncounter.frameKey)
  ) {
    const tex = mapSceneInstance.textures.get(pendingEncounter.textureKey);
    const frame = tex?.get?.(pendingEncounter.frameKey);
    if (frame?.source?.image) {
      const sx = typeof frame.cutX === "number" ? frame.cutX : (typeof frame.x === "number" ? frame.x : 0);
      const sy = typeof frame.cutY === "number" ? frame.cutY : (typeof frame.y === "number" ? frame.y : 0);
      const sw = typeof frame.cutWidth === "number" ? frame.cutWidth : (typeof frame.width === "number" ? frame.width : 0);
      const sh = typeof frame.cutHeight === "number" ? frame.cutHeight : (typeof frame.height === "number" ? frame.height : 0);
      if (sw > 0 && sh > 0) {
        cacheBadgeFrameData({ image: frame.source.image, sx, sy, sw, sh, textureKey: pendingEncounter.textureKey, frameKey: pendingEncounter.frameKey });
      }
    }
  }
  return pendingEncounter;
}

function clearPendingEncounter() {
  if (
    pendingEncounter.sceneKey
    || pendingEncounter.textureKey
    || pendingEncounter.frameKey
    || pendingEncounter.lockedFrame
  ) {
    logEncounterDebug("Pending encounter cleared.", { ...pendingEncounter });
  }
  pendingEncounter.sceneKey = null;
  pendingEncounter.textureKey = null;
  pendingEncounter.frameKey = null;
  pendingEncounter.lockedFrame = false;
  resetCurrentEncounterBadge();
  clearActiveEncounter();
  if (mapSceneInstance?.clearEncounterPreview) {
    mapSceneInstance.clearEncounterPreview();
  }
}

function haltSquadMovementForEncounter() {
  const state = mapSceneInstance?.gameState || getGlobalGameState();
  if (!state) return;
  let touched = false;
  for (const unit of state.rangerUnits || []) {
    if (!unit?.deployed || unit?.isDead) continue;
    if (unit.isMoving || unit.moveTargetPct || unit.keyboardMarching) touched = true;
    unit.isMoving = false;
    unit.moveTargetPct = null;
    unit.keyboardMarching = false;
  }
  if (!touched && !getActiveRangerUnit(state)) return;
  if (mapSceneInstance?.syncMarkersToUnits) {
    mapSceneInstance.syncMarkersToUnits();
  } else if (mapSceneInstance?.syncMarkerToSquad) {
    mapSceneInstance.syncMarkerToSquad();
  }
  if (typeof computeVisibility === "function") {
    computeVisibility(state);
  }
  if (mapSceneInstance) {
    mapSceneInstance.marchUiDirty = true;
    mapSceneInstance.marchUiAccumulator = 0;
    mapSceneInstance.refreshMarchingUi?.(true);
  }
  updateEncounterTimerFromMovement(false);
}

function setOverlayDiceVisibility(state, visible) {
  if (!state?.diceWrapper) return;
  state.diceWrapper.style.display = visible ? "" : "none";
}

function setOverlayExitEnabled(state, enabled) {
  if (!state) return;
  const allowExit = !!enabled;
  state.exitEnabled = allowExit;
  if (state.returnBtn) {
    state.returnBtn.disabled = !allowExit;
  }
  if (state === settlementOverlayState || state === largeSettlementOverlayState) {
    refreshEndTurnButtonAvailability();
  }
}

function wait(ms = 0) {
  const delay = Math.max(0, Number.isFinite(ms) ? ms : 0);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function waitForAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

let encounterRollUsed = false;

function resetEncounterRollGate() {
  encounterRollUsed = false;
}

function isEncounterRollLocked() {
  return encounterRollUsed;
}

function markEncounterRollUsed() {
  encounterRollUsed = true;
}

const WEAPON_UPGRADE_PATH = [
  { atlas: "meleeweapons", frameIndex: 0 },
  { atlas: "meleeweapons", frameIndex: 1 },
  { atlas: "meleeweapons", frameIndex: 4 },
  { atlas: "meleeweapons", frameIndex: 7 },
  { atlas: "meleeweapons", frameIndex: 14 },
  { atlas: "gunweapons", frameIndex: 2 },
  { atlas: "gunweapons", frameIndex: 0 },
  { atlas: "gunweapons", frameIndex: 7 },
  { atlas: "gunweapons", frameIndex: 10 },
  { atlas: "gunweapons", frameIndex: 14 },
  { atlas: "energyweapons", frameIndex: 13 },
  { atlas: "energyweapons", frameIndex: 0 },
  { atlas: "energyweapons", frameIndex: 2 },
  { atlas: "energyweapons", frameIndex: 14 },
  { atlas: "energyweapons", frameIndex: 19 },
];
const VEHICLE_FRAME_SEQUENCE = [
  "vehicle3",
  "vehicle1",
  "vehicle8",
  "vehicle7",
  "vehicle6",
  "vehicle5",
  "vehicle12",
  "vehicle11",
  "vehicle10",
  "vehicle15",
  "vehicle14",
  "vehicle15",
  "vehicle9",
];
const VEHICLE_SPRITE_END_STAGE = 9;
const VEHICLE_MAX_UPGRADE_LEVEL = (() => {
  return VEHICLE_FRAME_SEQUENCE.reduce((max, key) => {
    const keyMatch = /vehicle(\d+)/.exec(key || "");
    const value = keyMatch ? parseInt(keyMatch[1], 10) : 0;
    return Math.max(max, value);
  }, 0);
})();
const SOLDIER_MAX_UPGRADE_LEVEL = 15;
const BASE_LEVEL_UPGRADE_CAP = 10;

function reorderVehicleFrameNames(names = {}, sequence = VEHICLE_FRAME_SEQUENCE, frames = []) {
  if (!names || !sequence?.length) return names;
  const usedFrames = new Set();
  const ordered = {};
  let index = 0;
  const frameValues = new Set(Object.values(names).filter(Boolean));
  const assignFrameValue = (frameValue) => {
    if (!frameValue || usedFrames.has(frameValue)) return;
    index += 1;
    ordered[`vehicle${index}`] = frameValue;
    usedFrames.add(frameValue);
  };
  const resolveKey = (key) => {
    if (!key) return null;
    if (names[key]) return names[key]; // supports "vehicle1" style entries
    if (frameValues.has(key)) return key; // supports direct atlas frame names
    return null;
  };
  for (const key of sequence) {
    assignFrameValue(resolveKey(key));
  }
  Object.keys(names)
    .sort((a, b) => parseInt(a.replace("vehicle", ""), 10) - parseInt(b.replace("vehicle", ""), 10))
    .forEach((key) => assignFrameValue(names[key]));
  if (Array.isArray(frames) && frames.length) {
    frames.forEach((frame) => assignFrameValue(frame));
  }
  return ordered;
}

function registerAtlasFramesOnTexture(scene, textureKey, frames = []) {
  const texture = scene?.textures?.get?.(textureKey);
  if (!texture || !frames?.length) return;
  frames.forEach((frame) => {
    if (!frame?.name) return;
    const existing = texture.frames?.[frame.name];
    if (existing) return;
    texture.add(frame.name, 0, frame.x, frame.y, frame.w, frame.h);
  });
}

function applyPrecomputedSpriteAtlases(scene) {
  if (!scene || !PRECOMPUTED_SPRITE_ATLAS_DATA?.atlasFrames) return false;
  const atlasFrames = PRECOMPUTED_SPRITE_ATLAS_DATA.atlasFrames || {};
  registerAtlasFramesOnTexture(scene, "settlementsLarge", atlasFrames.settlementsPlayer || []);
  registerAtlasFramesOnTexture(scene, "settlementsSmall", atlasFrames.settlementsSmall || []);
  registerAtlasFramesOnTexture(scene, "dams", atlasFrames.dams || []);
  registerAtlasFramesOnTexture(scene, "landmarks", atlasFrames.landmarks || []);
  registerAtlasFramesOnTexture(scene, "poi", atlasFrames.poi || []);
  registerAtlasFramesOnTexture(scene, "randoms", atlasFrames.randoms || []);
  registerAtlasFramesOnTexture(scene, "battle1", atlasFrames.battle1 || []);
  registerAtlasFramesOnTexture(scene, "battle2", atlasFrames.battle2 || []);
  registerAtlasFramesOnTexture(scene, CAMP_SPRITE_KEY, atlasFrames[CAMP_SPRITE_KEY] || []);
  registerAtlasFramesOnTexture(scene, "natres", atlasFrames.natres || []);
  registerAtlasFramesOnTexture(scene, "unitsSoldiers", atlasFrames.unitsSoldiers || []);
  registerAtlasFramesOnTexture(scene, "unitsVehicles", atlasFrames.unitsVehicles || []);
  scene.atlasFrames = {
    settlementsPlayer: (atlasFrames.settlementsPlayer || []).map((frame) => frame.name),
    settlementsNeutral: (atlasFrames.settlementsNeutral || []).map((frame) => frame.name),
    settlementsEnemy: (atlasFrames.settlementsEnemy || []).map((frame) => frame.name),
    settlements: (atlasFrames.settlements || []).map((frame) => frame.name),
    settlementsSmall: (atlasFrames.settlementsSmall || []).map((frame) => frame.name),
    dams: (atlasFrames.dams || []).map((frame) => frame.name),
    landmarks: (atlasFrames.landmarks || []).map((frame) => frame.name),
    poi: (atlasFrames.poi || []).map((frame) => frame.name),
    randoms: (atlasFrames.randoms || []).map((frame) => frame.name),
    battle1: (atlasFrames.battle1 || []).map((frame) => frame.name),
    battle2: (atlasFrames.battle2 || []).map((frame) => frame.name),
    [CAMP_SPRITE_KEY]: (atlasFrames[CAMP_SPRITE_KEY] || []).map((frame) => frame.name),
    natres: (atlasFrames.natres || []).map((frame) => frame.name),
    unitsSoldiers: (atlasFrames.unitsSoldiers || []).map((frame) => frame.name),
    unitsVehicles: (atlasFrames.unitsVehicles || []).map((frame) => frame.name),
  };
  scene.unitFrameNames = { ...(PRECOMPUTED_SPRITE_ATLAS_DATA.unitFrameNames || {}) };
  scene.vehicleFrameNames = { ...(PRECOMPUTED_SPRITE_ATLAS_DATA.vehicleFrameNames || {}) };
  ensureSettlementFrameMap(scene);
  ensureDamFrameMap(scene);
  scene.syncMarkersToUnits();
  return true;
}

function rollDeterministicDie(sides = 20, rngFn = Math.random) {
  const face = 1 + Math.floor(rngFn() * Math.max(1, sides));
  return Math.max(1, Math.min(sides, face));
}

function parseRollBonusExpression(value) {
  if (value == null) return [];
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) return [];
    return [{ type: "flat", value: Math.trunc(value) }];
  }
  let expr = String(value).trim();
  if (!expr) return [];
  const rollBonusMatch = expr.match(/^rollbonus\((.*)\)$/i);
  if (rollBonusMatch) {
    expr = rollBonusMatch[1].trim();
  }
  expr = expr.replace(/\s+/g, "");
  if (!expr) return [];
  const parts = expr.match(/[+-]?[^+-]+/g) || [];
  const terms = [];
  for (const part of parts) {
    if (!part) continue;
    const diceMatch = part.match(/^([+-]?)(\d*)d(\d+)$/i);
    if (diceMatch) {
      const sign = diceMatch[1] === "-" ? -1 : 1;
      const count = parseInt(diceMatch[2] || "1", 10);
      const sides = parseInt(diceMatch[3], 10);
      if (count > 0 && sides > 0) {
        terms.push({ type: "dice", sign, count, sides });
      }
      continue;
    }
    const flatMatch = part.match(/^([+-]?\d+)$/);
    if (flatMatch) {
      const flatValue = parseInt(flatMatch[1], 10);
      if (flatValue !== 0) {
        terms.push({ type: "flat", value: flatValue });
      }
    }
  }
  return terms;
}

function getRollBonusSources({ state, unit, context } = {}) {
  const sources = [];
  if (unit?.rollBonus && context !== "poi") {
    sources.push({ label: "Weapon", value: unit.rollBonus });
  }
  if (context === "poi" && hasPurchasedUpgrade(state, HOME_BUILD_IDS.luckyCharm)) {
    sources.push({ label: "Lucky Charm", value: 3 });
  }
  if (state?.globalRollBonus) sources.push({ label: "Global", value: state.globalRollBonus });
  return sources;
}

function evaluateRollBonus(terms, rngFn = Math.random) {
  let total = 0;
  const expressionParts = [];
  for (const term of terms) {
    if (term.type === "flat") {
      total += term.value;
      expressionParts.push(term.value >= 0 ? `+${term.value}` : `${term.value}`);
      continue;
    }
    if (term.type === "dice") {
      let sum = 0;
      for (let i = 0; i < term.count; i += 1) {
        sum += rollDeterministicDie(term.sides, rngFn);
      }
      total += term.sign * sum;
      const signPrefix = term.sign < 0 ? "-" : "+";
      expressionParts.push(`${signPrefix}${term.count}d${term.sides}`);
    }
  }
  return { total, expression: expressionParts.join("") };
}

function normalizeBonusExpression(expression) {
  if (!expression) return "";
  return expression.startsWith("+") ? expression.slice(1) : expression;
}

function normalizeBonusSourceValue(value) {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) return "";
    const truncated = Math.trunc(value);
    return truncated >= 0 ? `+${truncated}` : `${truncated}`;
  }
  let expr = String(value).trim();
  if (!expr) return "";
  const rollBonusMatch = expr.match(/^rollbonus\((.*)\)$/i);
  if (rollBonusMatch) {
    expr = rollBonusMatch[1].trim();
  }
  expr = expr.replace(/\s+/g, "");
  return expr;
}

function formatSignedModifier(value) {
  const num = Math.trunc(Number(value) || 0);
  return num >= 0 ? `+ ${num}` : `- ${Math.abs(num)}`;
}

function formatRollBonusLine(expression, total) {
  if (!expression) return "";
  const totalLabel = total >= 0 ? `+${total}` : `${total}`;
  return `Bonus: ${expression} (total ${totalLabel})`;
}

function formatRollModifierLine(difficulty, sources = []) {
  if (!Number.isFinite(difficulty) && !sources.length) return "";
  const pieces = [];
  const difficultyLabel = Number.isFinite(difficulty) ? (difficulty >= 0 ? `+${difficulty}` : `${difficulty}`) : "+0";
  pieces.push(`difficulty ${difficultyLabel}`);
  sources.forEach((source) => {
    const expr = normalizeBonusSourceValue(source?.value);
    if (!expr) return;
    const label = String(source?.label || "bonus").trim().toLowerCase();
    pieces.push(`${label} ${expr}`);
  });
  return `Modifiers: ${pieces.join(", ")}`;
}

function formatRollResultMessage(prefix, rollInfo) {
  if (!rollInfo) return `${prefix}`;
  if (!rollInfo.hasBonus) return `${prefix}${rollInfo.finalRoll}!`;
  const bonusLabel = formatSignedModifier(rollInfo.bonusTotal);
  let text = `${prefix}${rollInfo.baseRoll} ${bonusLabel} = ${rollInfo.finalRoll}!`;
  if (rollInfo.unclampedRoll !== rollInfo.finalRoll) {
    text += " (capped)";
  }
  return text;
}

function applyRollModifiers(baseRoll, { state, unit, context, rngFn = Math.random } = {}) {
  const isCritical = baseRoll === 1 || baseRoll === 20;
  if (isCritical) {
    return {
      baseRoll,
      finalRoll: baseRoll,
      bonusTotal: 0,
      bonusExpression: "",
      bonusLine: "Critical roll! No modifiers applied",
      difficulty: 0,
      unclampedRoll: baseRoll,
      hasBonus: false,
    };
  }
  const difficultyRaw = Number.isFinite(state?.difficulty) ? Math.trunc(state.difficulty) : DEFAULT_ROLL_DIFFICULTY;
  const sources = getRollBonusSources({ state, unit, context });
  const terms = sources.flatMap((source) => parseRollBonusExpression(source.value));
  const evaluation = evaluateRollBonus(terms, rngFn);
  const totalBonus = difficultyRaw + evaluation.total;
  const unclamped = baseRoll + totalBonus;
  const finalRoll = Math.max(1, Math.min(20, Math.floor(unclamped)));
  const normalizedExpression = normalizeBonusExpression(evaluation.expression);
  return {
    baseRoll,
    finalRoll,
    bonusTotal: totalBonus,
    bonusExpression: normalizedExpression,
    bonusLine: formatRollModifierLine(difficultyRaw, sources),
    difficulty: difficultyRaw,
    unclampedRoll: unclamped,
    hasBonus: totalBonus !== 0 || terms.length > 0 || difficultyRaw !== 0,
  };
}

function setOverlayDiceFace(state, face = 1) {
  if (!state) return;
  const resolved = Number.isFinite(face) ? Math.floor(face) : parseInt(face, 10);
  const clamped = Number.isFinite(resolved) ? Math.max(1, Math.min(20, resolved)) : 1;
  state.diceFace = clamped;
  if (state.diceValueEl) {
    state.diceValueEl.textContent = clamped.toString();
  }
}

function clearOverlayDiceValueFx(state) {
  if (!state?.diceValueEl) return;
  const el = state.diceValueEl;
  if (Array.isArray(state.diceValueFxTimeouts)) {
    state.diceValueFxTimeouts.forEach((id) => clearTimeout(id));
  }
  state.diceValueFxTimeouts = [];
  el.classList.remove(
    "bonus-transition",
    "bonus-transition-start",
    "bonus-transition-swap",
    "bonus-transition-positive",
    "bonus-transition-negative"
  );
}

function animateOverlayDiceBonusTransition(state, fromFace, toFace, rollId = null, bonusTotal = 0) {
  if (!state?.diceValueEl) return Promise.resolve();
  const fromVal = Number.isFinite(fromFace) ? Math.floor(fromFace) : parseInt(fromFace, 10);
  const toVal = Number.isFinite(toFace) ? Math.floor(toFace) : parseInt(toFace, 10);
  if (!Number.isFinite(fromVal) || !Number.isFinite(toVal) || fromVal === toVal) {
    setOverlayDiceFace(state, toFace);
    return Promise.resolve();
  }
  clearOverlayDiceValueFx(state);
  const el = state.diceValueEl;
  const directionClass = bonusTotal < 0 ? "bonus-transition-negative" : "bonus-transition-positive";
  el.textContent = fromVal.toString();
  el.classList.add("bonus-transition", "bonus-transition-start", directionClass);
  return new Promise((resolve) => {
    const settle = () => {
      clearOverlayDiceValueFx(state);
      if (!state.active || (rollId !== null && state.rollId !== rollId)) {
        resolve();
        return;
      }
      el.textContent = toVal.toString();
      resolve();
    };
    const swapId = setTimeout(() => {
      if (!state.active || (rollId !== null && state.rollId !== rollId)) {
        settle();
        return;
      }
      el.classList.remove("bonus-transition-start");
      el.classList.add("bonus-transition-swap");
      el.textContent = toVal.toString();
    }, 180);
    const settleId = setTimeout(settle, 520);
    state.diceValueFxTimeouts = [swapId, settleId];
  });
}

function applyOverlayDiceGlow(state, enabled) {
  if (!state) return;
  const glowOn = !!enabled;
  if (state.diceWrapper?.classList) {
    state.diceWrapper.classList.toggle("glow", glowOn);
    return;
  }
  if (state.diceGlowEl) {
    state.diceGlowEl.style.opacity = glowOn ? "0.9" : "0";
  }
}

function overlayStateByScene(sceneKey) {
  if (!sceneKey) return null;
  const key = sceneKey.toLowerCase();
  if (key === "camp") {
    if (typeof document !== "undefined") ensureCampOverlayElements();
    return campOverlayState;
  }
  if (key === "poi") {
    if (typeof document !== "undefined") ensurePoiOverlayElements();
    return poiOverlayState;
  }
  if (key === "random") {
    if (typeof document !== "undefined") ensureRandomOverlayElements();
    return randomOverlayState;
  }
  if (key === "battle") {
    if (typeof document !== "undefined") ensureBattleOverlayElements();
    return battleOverlayState;
  }
  if (key === "settlement") {
    if (typeof document !== "undefined") ensureSettlementOverlayElements();
    return settlementOverlayState;
  }
  return null;
}

function setSceneDiceFace(sceneKey, face = 1) {
  const state = overlayStateByScene(sceneKey);
  if (!state) return;
  setOverlayDiceFace(state, face);
}

function applySceneDiceGlow(sceneKey, enabled) {
  const state = overlayStateByScene(sceneKey);
  if (!state) return;
  applyOverlayDiceGlow(state, enabled);
}

function getSceneMessageElement(sceneKey) {
  const state = overlayStateByScene(sceneKey);
  return state?.messageEl || null;
}

function ensureSceneNarrativeElement(sceneKey, messageEl) {
  if (!messageEl || typeof document === "undefined") return null;
  const existing = messageEl.querySelector(".scene-narrative");
  if (existing) return existing;
  const narrativeEl = document.createElement("div");
  narrativeEl.className = "scene-narrative";
  narrativeEl.style.display = "none";
  const returnBtn = messageEl.querySelector("button");
  if (returnBtn) {
    messageEl.insertBefore(narrativeEl, returnBtn);
  } else {
    messageEl.appendChild(narrativeEl);
  }
  return narrativeEl;
}

function ensureSceneOutcomeElement(sceneKey, messageEl) {
  if (!messageEl || typeof document === "undefined") return null;
  const existing = messageEl.querySelector(".scene-outcome");
  if (existing) return existing;
  const outcomeEl = document.createElement("div");
  outcomeEl.className = "scene-outcome";
  outcomeEl.style.display = "none";
  const returnBtn = messageEl.querySelector("button");
  if (returnBtn) {
    messageEl.insertBefore(outcomeEl, returnBtn);
  } else {
    messageEl.appendChild(outcomeEl);
  }
  return outcomeEl;
}

function ensureSceneBonusElement(sceneKey, messageEl) {
  if (!messageEl || typeof document === "undefined") return null;
  const existing = messageEl.querySelector(".scene-bonus");
  if (existing) return existing;
  const bonusEl = document.createElement("div");
  bonusEl.className = "scene-bonus";
  bonusEl.style.display = "none";
  const returnBtn = messageEl.querySelector("button");
  if (returnBtn) {
    messageEl.insertBefore(bonusEl, returnBtn);
  } else {
    messageEl.appendChild(bonusEl);
  }
  return bonusEl;
}

function setSceneBonusLine(sceneKey, text) {
  const messageEl = getSceneMessageElement(sceneKey);
  if (!messageEl) return;
  const bonusEl = ensureSceneBonusElement(sceneKey, messageEl);
  if (!bonusEl) return;
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    bonusEl.style.display = "none";
    bonusEl.textContent = "";
    return;
  }
  bonusEl.style.display = "";
  bonusEl.textContent = trimmed;
}

function resetSceneMessageVisuals(sceneKey) {
  const messageEl = getSceneMessageElement(sceneKey);
  if (!messageEl) return;
  const narrativeEl = messageEl.querySelector(".scene-narrative");
  if (narrativeEl) {
    narrativeEl.textContent = "";
    narrativeEl.style.display = "none";
    narrativeEl.style.opacity = "0";
    narrativeEl.style.visibility = "hidden";
    narrativeEl.style.animation = "none";
  }
  const outcomeEl = messageEl.querySelector(".scene-outcome");
  if (outcomeEl) {
    outcomeEl.textContent = "";
    outcomeEl.style.display = "none";
    outcomeEl.style.opacity = "1";
  }
  const bonusEl = messageEl.querySelector(".scene-bonus");
  if (bonusEl) {
    bonusEl.textContent = "";
    bonusEl.style.display = "none";
  }
}

function revealText(element, text, { durationMs = 1000 } = {}) {
  if (!element) return Promise.resolve();
  const targetText = String(text ?? "");
  element.textContent = "";
  if (!targetText) return Promise.resolve();
  if (typeof window !== "undefined" && window.matchMedia) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      element.textContent = targetText;
      return Promise.resolve();
    }
  }
  element.style.opacity = "0";
  element.style.visibility = "hidden";
  element.style.animation = "none";
  element.textContent = targetText;
  const start = performance.now();
  return new Promise((resolve) => {
    const step = (now) => {
      const t = Math.min(1, (now - start) / Math.max(1, durationMs));
      if (t > 0 && element.style.visibility !== "visible") {
        element.style.visibility = "visible";
      }
      element.style.opacity = t.toString();
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        element.style.visibility = "visible";
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

function guardOverlayEvents(state) {
  if (!state?.overlayEl || state.eventsGuarded) return;
  const blocker = (e) => {
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  };
  ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click"].forEach((evt) => {
    state.overlayEl.addEventListener(evt, blocker, true);
  });
  state.eventsGuarded = true;
}

function setLoadingOverlay(visible) {
  const overlay = document.getElementById("loadingOverlay");
  const canvas = document.getElementById("loadingArtCanvas");
  const box = overlay?.querySelector?.(".loading-box");
  if (!overlay) return;
  recordTransitionEvent("loadingOverlay:toggle", { visible: !!visible });
  const textOnly = overlay.dataset.mode === "text-only";
  if (visible) {
    overlay.removeAttribute("hidden");
  } else {
    overlay.setAttribute("hidden", "");
  }
  overlay.classList.toggle("hidden", !visible);
  overlay.classList.remove("is-visible");
  if (canvas) {
    canvas.style.display = visible && !textOnly ? "block" : "none";
  }
  if (visible) {
    // Reset outro for potential re-use; art stays cached.
    loadingOverlayArtState.outroPromise = null;
    const revealOverlay = () => {
      if (!overlay.classList.contains("hidden")) {
        overlay.classList.add("is-visible");
      }
    };
    if (textOnly) {
      if (box) {
        box.style.opacity = "";
        box.style.transform = "";
        box.style.transitionDuration = "";
      }
      void overlay.offsetHeight;
      revealOverlay();
    } else {
      if (box) {
        box.style.opacity = "";
        box.style.transform = "";
        box.style.transitionDuration = "";
      }
      requestAnimationFrame(revealOverlay);
    }
  } else {
    if (box) {
      box.style.opacity = "";
      box.style.transform = "";
      box.style.transitionDuration = "";
    }
    overlay.dataset.mode = "art";
    resetLoadingOverlayMessage();
    setTitleLoadingVisible(false);
    if (titleScreenState.pendingStart) {
      titleScreenState.pendingStart = false;
      hideTitleScreen();
    }
  }
}

function sizeLoadingArtCanvas() {
  const canvas = loadingOverlayArtState.canvas || document.getElementById("loadingArtCanvas");
  if (!canvas) return null;
  if (!loadingOverlayArtState.canvas) loadingOverlayArtState.canvas = canvas;
  if (!loadingOverlayArtState.ctx) loadingOverlayArtState.ctx = canvas.getContext("2d", { alpha: false });
  const mapContainer = document.getElementById("mapContainer");
  const rect = mapContainer?.getBoundingClientRect ? mapContainer.getBoundingClientRect() : null;
  const width = Math.max(1, Math.floor(rect?.width || mapContainer?.clientWidth || canvas.clientWidth || canvas.width || 1));
  const height = Math.max(1, Math.floor(rect?.height || mapContainer?.clientHeight || canvas.clientHeight || canvas.height || 1));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
}

function drawLoadingArt(pixelSize = 1) {
  if (!loadingOverlayArtState.image) return;
  const dims = sizeLoadingArtCanvas();
  const canvas = loadingOverlayArtState.canvas;
  const ctx = loadingOverlayArtState.ctx;
  if (!dims || !canvas || !ctx) return;
  const { width, height } = dims;
  const img = loadingOverlayArtState.image;
  const scale = Math.min(width / img.width, height / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (width - dw) * 0.5;
  const dy = (height - dh) * 0.5;
  const step = Math.max(1, Math.floor(pixelSize));
  ctx.clearRect(0, 0, width, height);
  if (step === 1) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  const offscreen = loadingOverlayArtState.offscreen || document.createElement("canvas");
  loadingOverlayArtState.offscreen = offscreen;
  offscreen.width = Math.max(1, Math.ceil(width / step));
  offscreen.height = Math.max(1, Math.ceil(height / step));
  const octx = offscreen.getContext("2d");
  octx.clearRect(0, 0, offscreen.width, offscreen.height);
  const miniScale = Math.min(offscreen.width / img.width, offscreen.height / img.height);
  const miniDw = img.width * miniScale;
  const miniDh = img.height * miniScale;
  const miniDx = (offscreen.width - miniDw) * 0.5;
  const miniDy = (offscreen.height - miniDh) * 0.5;
  octx.drawImage(img, miniDx, miniDy, miniDw, miniDh);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, 0, 0, offscreen.width, offscreen.height, 0, 0, width, height);
}

function refreshLoadingArt(pixelSize = 1) {
  sizeLoadingArtCanvas();
  if (loadingOverlayArtState.ready) {
    drawLoadingArt(pixelSize);
  }
}

function setupLoadingArt() {
  if (loadingOverlayArtState.loadPromise) return loadingOverlayArtState.loadPromise;
  recordTransitionEvent("loadingArt:setup:start");
  const canvas = document.getElementById("loadingArtCanvas");
  if (!canvas) return null;
  loadingOverlayArtState.canvas = canvas;
  loadingOverlayArtState.ctx = canvas.getContext("2d", { alpha: false });
  sizeLoadingArtCanvas();
  if (!loadingOverlayArtState.resizeListenerAttached) {
    loadingOverlayArtState.resizeListenerAttached = true;
    window.addEventListener("resize", () => {
      if (loadingOverlayArtState.pendingRefresh) return;
      loadingOverlayArtState.pendingRefresh = true;
      requestAnimationFrame(() => {
        loadingOverlayArtState.pendingRefresh = false;
        refreshLoadingArt(1);
      });
    });
  }
  loadingOverlayArtState.loadPromise = (async () => {
    for (const src of LOADING_ART_SOURCES) {
      try {
        recordTransitionEvent("loadingArt:source:start", { src });
        const img = await loadImageElement(src);
        loadingOverlayArtState.image = img;
        loadingOverlayArtState.ready = true;
        drawLoadingArt(1);
        recordTransitionEvent("loadingArt:source:ready", { src, width: img.width, height: img.height });
        return img;
      } catch (err) {
        console.warn("Failed to load loading art", src, err);
        recordTransitionEvent("loadingArt:source:error", { src, message: err?.message || String(err) });
      }
    }
    throw new Error("Loading art unavailable");
  })().catch((err) => {
    console.warn("Loading splash art unavailable", err);
    recordTransitionEvent("loadingArt:setup:error", { message: err?.message || String(err) });
  });
  return loadingOverlayArtState.loadPromise;
}

function playLoadingOverlayOutro(options = {}) {
  if (loadingOverlayArtState.outroPromise) return loadingOverlayArtState.outroPromise;
  recordTransitionEvent("loadingOverlay:outro:start");
  loadingOverlayArtState.outroPromise = (async () => {
    const overlay = document.getElementById("loadingOverlay");
    const box = overlay?.querySelector?.(".loading-box");
    const textOnly = overlay?.dataset.mode === "text-only";
    if (textOnly) {
      const textOnlyOutroMs = Math.max(1, Number(options.durationMs) || END_TURN_TRANSITION_CLEAR_MS);
      if (overlay) {
        overlay.classList.remove("is-visible");
      }
      if (box) {
        box.style.transitionDuration = `${textOnlyOutroMs}ms, ${textOnlyOutroMs}ms`;
        box.style.opacity = "0";
        box.style.transform = "translateY(8px)";
      }
      await new Promise((resolve) => setTimeout(resolve, textOnlyOutroMs));
      setLoadingOverlay(false);
      markTransitionTime("overlayHiddenAt");
      const profiler = stopTransitionProfiler("overlayHidden");
      if (profiler) {
        patchTransitionMetrics({
          profilerSummary: {
            events: profiler.events,
            longTasks: profiler.longTasks,
            resources: profiler.resources,
            rafGaps: profiler.rafGaps,
          },
        });
      }
      return;
    }
    if (loadingOverlayArtState.loadPromise) {
      try {
        await loadingOverlayArtState.loadPromise;
      } catch (_) {
        // Ignore art failures; fall through to hide overlay.
      }
    }
    if (!loadingOverlayArtState.ready || !loadingOverlayArtState.canvas || !loadingOverlayArtState.ctx) {
      setLoadingOverlay(false);
      const profiler = stopTransitionProfiler("overlayHiddenWithoutArt");
      if (profiler) {
        patchTransitionMetrics({
          profilerSummary: {
            events: profiler.events,
            longTasks: profiler.longTasks,
            resources: profiler.resources,
            rafGaps: profiler.rafGaps,
          },
        });
      }
      return;
    }
    sizeLoadingArtCanvas();
    const canvas = loadingOverlayArtState.canvas;
    const duration = 0;
    const maxPixel = Math.max(8, Math.ceil(Math.max(canvas.width, canvas.height) / 22));
    if (duration <= 0) {
      drawLoadingArt(maxPixel);
      setLoadingOverlay(false);
      markTransitionTime("overlayHiddenAt");
      const profiler = stopTransitionProfiler("overlayHidden");
      if (profiler) {
        patchTransitionMetrics({
          profilerSummary: {
            events: profiler.events,
            longTasks: profiler.longTasks,
            resources: profiler.resources,
            rafGaps: profiler.rafGaps,
          },
        });
      }
      return;
    }
    await new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const pixelSize = 1 + t * maxPixel;
        drawLoadingArt(pixelSize);
        if (t < 1) {
          loadingOverlayArtState.rafId = requestAnimationFrame(step);
        } else {
          loadingOverlayArtState.rafId = null;
          resolve();
        }
      };
      loadingOverlayArtState.rafId = requestAnimationFrame(step);
    });
    setLoadingOverlay(false);
    markTransitionTime("overlayHiddenAt");
    const profiler = stopTransitionProfiler("overlayHidden");
    if (profiler) {
      patchTransitionMetrics({
        profilerSummary: {
          events: profiler.events,
          longTasks: profiler.longTasks,
          resources: profiler.resources,
          rafGaps: profiler.rafGaps,
        },
      });
    }
  })();
  return loadingOverlayArtState.outroPromise;
}

function loadImageElement(src, options = {}) {
  if (options.shareStaticCache !== false && STATIC_IMAGE_WARM_CACHE.has(src)) {
    const cached = STATIC_IMAGE_WARM_CACHE.get(src);
    return cached && typeof cached.then === "function" ? cached : Promise.resolve(cached);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (options.crossOrigin) {
      img.crossOrigin = options.crossOrigin;
    }
    img.onload = async () => {
      try {
        if (typeof img.decode === "function") {
          await img.decode();
        }
      } catch (_) {
        // Some browsers reject decode on cached or partially decoded images; onload is still sufficient.
      }
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

function ensureTitleScreenElements() {
  if (titleScreenState.overlayEl) return true;
  const overlay = document.getElementById("titleScreenOverlay");
  if (!overlay) return false;
  titleScreenState.overlayEl = overlay;
  titleScreenState.artCanvas = document.getElementById("titleScreenArtCanvas");
  titleScreenState.shaderHostEl = document.getElementById("titleShaderHost");
  titleScreenState.menuEl = document.getElementById("titleMenu");
  titleScreenState.menuPanelEl = document.getElementById("titleMenuPanel");
  titleScreenState.musicWrapEl = document.getElementById("titleMusicWrap");
  titleScreenState.howToEl = document.getElementById("titleHowToPanel");
  titleScreenState.creditsEl = document.getElementById("titleCreditsPanel");
  titleScreenState.highScoresEl = document.getElementById("titleHighScoresPanel");
  titleScreenState.loadingEl = document.getElementById("titleLoadingIndicator");
  titleScreenState.storyBtn = document.getElementById("titleStoryBtn");
  titleScreenState.howToBtn = document.getElementById("titleHowToBtn");
  titleScreenState.creditsBtn = document.getElementById("titleCreditsBtn");
  titleScreenState.highScoresBtn = document.getElementById("titleHighScoresBtn");
  titleScreenState.newGameBtn = document.getElementById("titleNewGameBtn");
  titleScreenState.quitBtn = document.getElementById("titleQuitBtn");
  titleScreenState.difficultyButtons = {
    low: document.getElementById("titleDifficultyLow"),
    medium: document.getElementById("titleDifficultyMedium"),
    high: document.getElementById("titleDifficultyHigh"),
  };
  titleScreenState.advancedToggleBtn = document.getElementById("titleDifficultyAdvancedBtn");
  titleScreenState.advancedPaneEl = document.getElementById("titleDifficultyAdvancedPane");
  titleScreenState.advancedSettlementSlider = document.getElementById("titleAdvSettlementSlider");
  titleScreenState.advancedSpeedSlider = document.getElementById("titleAdvUnitSpeedSlider");
  titleScreenState.advancedHardcoreCheckbox = document.getElementById("titleAdvHardcoreCheckbox");
  titleScreenState.advancedResetBtn = document.getElementById("titleAdvResetBtn");
  guardOverlayPointerEvents(titleScreenState);
  return true;
}

function sizeTitleArtCanvas() {
  const canvas = titleScreenState.artCanvas || document.getElementById("titleScreenArtCanvas");
  if (!canvas) return null;
  if (!titleScreenState.artCanvas) titleScreenState.artCanvas = canvas;
  if (!titleScreenState.artCtx) titleScreenState.artCtx = canvas.getContext("2d", { alpha: false });
  const overlay = titleScreenState.overlayEl || document.getElementById("titleScreenOverlay");
  const rect = overlay?.getBoundingClientRect ? overlay.getBoundingClientRect() : null;
  const width = Math.max(1, Math.floor(rect?.width || overlay?.clientWidth || canvas.clientWidth || canvas.width || 1));
  const height = Math.max(1, Math.floor(rect?.height || overlay?.clientHeight || canvas.clientHeight || canvas.height || 1));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
}

function updateTitleArtLayoutVars(imageWidth = TITLE_ART_FALLBACK_WIDTH, imageHeight = TITLE_ART_FALLBACK_HEIGHT) {
  const overlay = titleScreenState.overlayEl || document.getElementById("titleScreenOverlay");
  if (!overlay) return null;
  const rect = overlay.getBoundingClientRect ? overlay.getBoundingClientRect() : null;
  const width = Math.max(1, Math.floor(rect?.width || overlay.clientWidth || 1));
  const height = Math.max(1, Math.floor(rect?.height || overlay.clientHeight || 1));
  const safeImageWidth = Math.max(1, Math.floor(imageWidth || TITLE_ART_FALLBACK_WIDTH));
  const safeImageHeight = Math.max(1, Math.floor(imageHeight || TITLE_ART_FALLBACK_HEIGHT));
  const scale = Math.min(width / safeImageWidth, height / safeImageHeight);
  const dw = safeImageWidth * scale;
  const dh = safeImageHeight * scale;
  const dx = (width - dw) * 0.5;
  const dy = (height - dh) * 0.5;
  const menu = titleScreenState.menuEl || document.getElementById("titleMenu");
  const menuWidth = Math.floor(menu?.offsetWidth || 320);
  const rightMargin = Math.max(0, Math.floor(width - (dx + dw)));
  const bottomMargin = Math.max(0, Math.floor(height - (dy + dh)));
  const leftMargin = Math.max(0, Math.floor(dx));
  overlay.style.setProperty("--title-art-left", `${leftMargin + 16}px`);
  overlay.style.setProperty("--title-art-right", `${rightMargin + 16}px`);
  overlay.style.setProperty("--title-art-bottom", `${bottomMargin + 16}px`);
  overlay.style.setProperty("--title-menu-width", `${menuWidth}px`);
  return { width, height, dx, dy, dw, dh };
}

function drawTitleArt() {
  if (!titleScreenState.artImage) return;
  const dims = sizeTitleArtCanvas();
  const canvas = titleScreenState.artCanvas;
  const ctx = titleScreenState.artCtx;
  if (!dims || !canvas || !ctx) return;
  const layout = updateTitleArtLayoutVars(titleScreenState.artImage.width, titleScreenState.artImage.height);
  if (!layout) return;
  const { width, height } = layout;
  // Keep the CSS background as the single visible title art surface.
  // Drawing the same image again on canvas introduced a tiny alignment shift.
  ctx.clearRect(0, 0, width, height);
  titleScreenState.artLayoutReady = true;
  revealTitleScreenUiIfReady();
}

function refreshTitleArt() {
  sizeTitleArtCanvas();
  if (titleScreenState.artReady) {
    drawTitleArt();
  }
}

function setupTitleArt() {
  if (titleScreenState.artLoadPromise) return titleScreenState.artLoadPromise;
  if (!ensureTitleScreenElements()) return null;
  titleScreenState.artLoadPromise = (async () => {
    for (const src of LOADING_ART_SOURCES) {
      try {
        const img = await loadImageElement(src);
        titleScreenState.artImage = img;
        titleScreenState.artReady = true;
        drawTitleArt();
        return img;
      } catch (err) {
        console.warn("Failed to load title art", src, err);
      }
    }
    throw new Error("Title art unavailable");
  })().catch((err) => {
    console.warn("Title screen art unavailable", err);
  });
  if (!titleScreenState.artResizeListenerAttached) {
    titleScreenState.artResizeListenerAttached = true;
    window.addEventListener("resize", () => {
      if (titleScreenState.artPendingRefresh) return;
      titleScreenState.artPendingRefresh = true;
      requestAnimationFrame(() => {
        titleScreenState.artPendingRefresh = false;
        refreshTitleArt();
        rebuildTitleShaderGame();
      });
    });
  }
  return titleScreenState.artLoadPromise;
}

function guardOverlayPointerEvents(state) {
  if (!state?.overlayEl || state.overlayGuarded) return;
  const stopEvent = (event) => {
    event.stopPropagation();
  };
  const stopContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const events = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "touchstart", "touchend"];
  events.forEach((eventName) => {
    state.overlayEl.addEventListener(eventName, stopEvent);
  });
  state.overlayEl.addEventListener("contextmenu", stopContextMenu);
  state.overlayGuarded = true;
}

function ensureEncounterOverlayElements() {
  if (encounterOverlayState.overlayEl && encounterOverlayState.canvas && encounterOverlayState.ctx && encounterOverlayState.messageEl) return true;
  const overlay = document.getElementById("encounterOverlay");
  const canvas = document.getElementById("encounterCanvas");
  const message = document.getElementById("encounterMessage");
  if (!overlay || !canvas) return false;
  encounterOverlayState.overlayEl = overlay;
  encounterOverlayState.canvas = canvas;
  encounterOverlayState.ctx = canvas.getContext("2d");
  encounterOverlayState.messageEl = message;
  guardOverlayPointerEvents(encounterOverlayState);
  if (!encounterOverlayState.clickListenerAttached) {
    overlay.addEventListener("click", handleEncounterOverlayClick);
    encounterOverlayState.clickListenerAttached = true;
  }
  if (!encounterOverlayState.keydownListenerAttached) {
    document.addEventListener("keydown", handleEncounterOverlayKeydown);
    encounterOverlayState.keydownListenerAttached = true;
  }
  if (!encounterOverlayState.resizeListenerAttached) {
    encounterOverlayState.resizeListenerAttached = true;
    window.addEventListener("resize", () => {
      if (!encounterOverlayState.active) return;
      if (encounterOverlayState.pendingResize) return;
      encounterOverlayState.pendingResize = true;
      requestAnimationFrame(() => {
        encounterOverlayState.pendingResize = false;
        sizeEncounterCanvas();
        const eff = encounterOverlayState.effect;
        const lastPixel = eff?.lastPixelSize || 1;
        const lastVignette = eff?.lastVignetteAlpha ?? 1;
        drawEncounterFrame(lastPixel, lastVignette, performance.now());
      });
    });
  }
  return true;
}

function ensurePoiOverlayElements() {
  const ready = ensureSceneOverlayElements(poiOverlayState, "poi", {
    onOverlayClick: handlePoiOverlayClick,
    onReturnClick: handlePoiReturnClick,
    onResize: () => {
      sizePoiCanvas();
      drawPoiFrame();
    },
  });
  if (ready && !poiOverlayState.prizeEl) {
    poiOverlayState.prizeEl = document.getElementById("poiPrizeBadge");
  }
  return ready;
}

function ensureRandomOverlayElements() {
  return ensureSceneOverlayElements(randomOverlayState, "random", {
    onOverlayClick: handleRandomOverlayClick,
    onReturnClick: handleRandomReturnClick,
    onResize: () => {
      sizeRandomCanvas();
      drawRandomFrame();
    },
  });
}

function ensureBattleOverlayElements() {
  return ensureSceneOverlayElements(battleOverlayState, "battle", {
    onOverlayClick: handleBattleOverlayClick,
    onReturnClick: handleBattleReturnClick,
    onResize: () => {
      sizeBattleCanvas();
      drawBattleFrame();
    },
  });
}

function sizeEncounterCanvas() {
  if (!encounterOverlayState.canvas || !encounterOverlayState.overlayEl) return null;
  const rect = encounterOverlayState.overlayEl.getBoundingClientRect
    ? encounterOverlayState.overlayEl.getBoundingClientRect()
    : null;
  const width = Math.max(1, Math.floor(rect?.width || window.innerWidth || encounterOverlayState.canvas.clientWidth || 1));
  const height = Math.max(1, Math.floor(rect?.height || window.innerHeight || encounterOverlayState.canvas.clientHeight || 1));
  if (encounterOverlayState.canvas.width !== width || encounterOverlayState.canvas.height !== height) {
    encounterOverlayState.canvas.width = width;
    encounterOverlayState.canvas.height = height;
  }
  return { width, height };
}

function loadEncounterImage() {
  if (encounterOverlayState.ready && encounterOverlayState.image) return Promise.resolve(encounterOverlayState.image);
  if (!encounterOverlayState.loadPromise) {
    encounterOverlayState.loadPromise = loadImageElement("assets/encounter.jpg")
      .then((img) => {
        encounterOverlayState.image = img;
        encounterOverlayState.ready = true;
        return img;
      })
      .catch((err) => {
        encounterOverlayState.ready = false;
        encounterOverlayState.image = null;
        encounterOverlayState.loadPromise = null;
        console.warn("Encounter splash failed to load", err);
        throw err;
      });
  }
  return encounterOverlayState.loadPromise;
}

function cancelEncounterEffect() {
  const eff = encounterOverlayState.effect;
  if (eff?.rafId) {
    cancelAnimationFrame(eff.rafId);
  }
  encounterOverlayState.effect = null;
  if (encounterOverlayState.messageTimeout) {
    clearTimeout(encounterOverlayState.messageTimeout);
    encounterOverlayState.messageTimeout = null;
  }
}

function computeEncounterScale(width, height, img, scaleFactor = ENCOUNTER_SCALE) {
  if (!img || !width || !height) return { scale: 1, dw: width, dh: height };
  const containScale = Math.min(width / img.width, height / img.height);
  const scale = containScale * (scaleFactor ?? ENCOUNTER_SCALE);
  return { scale, dw: img.width * scale, dh: img.height * scale };
}

function sampleEncounterDelaySeconds(cfg = ENCOUNTER_TIMER_CONFIG) {
  const mean = Math.max(0.2, cfg?.meanSeconds ?? 10);
  const stddev = Math.max(0.05, cfg?.stddevSeconds ?? 3);
  const min = Math.max(0.2, cfg?.minSeconds ?? 1);
  const max = Math.max(min, cfg?.maxSeconds ?? mean * 4);
  // Box-Muller transform for a normal draw.
  const u1 = Math.max(1e-6, Math.random());
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const raw = mean + stddev * z0;
  return Math.min(max, Math.max(min, raw));
}

function drawEncounterFlames(ctx, eff, img, scaleData, dx, dy, now) {
  drawFlames(ctx, eff, img, scaleData, dx, dy, now, ENCOUNTER_FLAME_POINTS, 0.53);
}

function computeFlameFlicker(seed, now, speedMultiplier = 1) {
  const reference = typeof now === "number" ? now : (typeof performance !== "undefined" ? performance.now() : Date.now());
  const t = reference * 0.001 * Math.max(0.01, speedMultiplier);
  const speed = 1 + (seed % 0.35);
  return (
    0.1
    + 0.20 * Math.sin(t * (2 + speed * 2.5) + seed)
    + 0.15 * Math.sin(t * (0.6 + speed * 1.6) + seed * 1.7)
  );
}

function drawFlames(ctx, eff, img, scaleData, dx, dy, now, points, alphaScale = 0.6) {
  if (!img || !scaleData?.scale) return;
  const seeds = eff.flameSeeds || [];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const seed = seeds[i] || 0;
    const flicker = computeFlameFlicker(seed, now, eff?.speedMultiplier ?? 1);
    const alpha = alphaScale * Math.max(0.08, Math.min(0.9, flicker));
    const px = dx + p.x * scaleData.scale;
    const py = dy + p.y * scaleData.scale;
    const r = Math.max(18, (p.radius || 100) * scaleData.scale);
    const g = ctx.createRadialGradient(px, py, r * 0.1, px, py, r);
    g.addColorStop(0, `rgba(255, 220, 150, ${alpha * 0.85})`);
    g.addColorStop(0.35, `rgba(255, 170, 80, ${alpha * 0.6})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHomeSceneLights(ctx, eff, img, scaleData, dx, dy, now) {
  if (!img || !scaleData?.scale) return;
  if (!eff.homeLightSeeds) {
    eff.homeLightSeeds = HOME_SCENE_LIGHT_POINTS.map(() => Math.random() * 1000);
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < HOME_SCENE_LIGHT_POINTS.length; i++) {
    const p = HOME_SCENE_LIGHT_POINTS[i];
    const seed = eff.homeLightSeeds[i] || 0;
    const flicker = computeFlameFlicker(seed, now, p.speedMultiplier ?? 1);
    const alpha = (p.alphaScale ?? 0.6) * Math.max(0.08, Math.min(0.9, flicker));
    const px = dx + p.x * scaleData.scale;
    const py = dy + p.y * scaleData.scale;
    const r = Math.max(18, (p.radius || 80) * scaleData.scale);
    const innerColor = colorToRgba(p.innerColor ?? 0x8cffaa, alpha * 0.85);
    const outerColor = colorToRgba(p.outerColor ?? 0x46dc6e, alpha * 0.55);
    const g = ctx.createRadialGradient(px, py, r * 0.12, px, py, r);
    g.addColorStop(0, innerColor);
    g.addColorStop(0.35, outerColor);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEncounterFrame(pixelSize = 1, vignetteAlpha = 1, timestamp = null) {
  if (!ensureEncounterOverlayElements()) return;
  const dims = sizeEncounterCanvas();
  const ctx = encounterOverlayState.ctx;
  const img = encounterOverlayState.image;
  if (!dims || !ctx) return;
  const { width, height } = dims;
  const step = Math.max(1, Math.floor(pixelSize || 1));
  const eff = encounterOverlayState.effect || {};
  const now = typeof timestamp === "number" ? timestamp : performance.now();
  const driftDuration = eff.driftDuration || 18000;
  const rawDrift =
    driftDuration > 0
      ? Math.sin(((now - (eff.start || now)) / driftDuration) * Math.PI * 2)
      : 0;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(5, 8, 5, 0.9)";
  ctx.fillRect(0, 0, width, height);
  if (img) {
    const { scale, dw, dh } = computeEncounterScale(width, height, img);
    const availableX = Math.max(0, (width - dw) * 0.5);
    const driftAmplitude = Math.min(eff.driftAmplitude ?? 0, availableX);
    const drift = rawDrift * driftAmplitude;
    const dx = (width - dw) * 0.5 + drift;
    const dy = (height - dh) * 0.5;
    if (step === 1) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      const offscreen = encounterOverlayState.offscreen || document.createElement("canvas");
      encounterOverlayState.offscreen = offscreen;
      offscreen.width = Math.max(1, Math.ceil(dw / step));
      offscreen.height = Math.max(1, Math.ceil(dh / step));
      // Pixelate the contained image size, not the full overlay.
      const miniScale = Math.min(offscreen.width / img.width, offscreen.height / img.height);
      const miniDw = img.width * miniScale;
      const miniDh = img.height * miniScale;
      const miniDx = (offscreen.width - miniDw) * 0.5;
      const miniDy = (offscreen.height - miniDh) * 0.5;
      const octx = offscreen.getContext("2d");
      octx.clearRect(0, 0, offscreen.width, offscreen.height);
      octx.drawImage(img, miniDx, miniDy, miniDw, miniDh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, 0, 0, offscreen.width, offscreen.height, dx, dy, dw, dh);
    }
    drawEncounterFlames(ctx, eff, img, { scale, dw, dh }, dx, dy, now);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.fillRect(0, 0, width, height);
  }
  const strength = Math.min(1, Math.max(0, vignetteAlpha || 0));
  ctx.save();
  // Phaser vignette-like pass: darken edges strongly, keep center lighter.
  // Hard-edged "looking glass" vignette: tight falloff near the rim.
  const maxDim = Math.max(width, height);
  const radiusInner = maxDim * 0.15;
  const radiusOuter = maxDim * 0.25;
  const vignette = ctx.createRadialGradient(width / 2, height / 2, radiusInner, width / 2, height / 2, radiusOuter);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.9, `rgba(0,0,0,${0.08 * strength})`);
  vignette.addColorStop(0.98, `rgba(0,0,0,${0.65 * strength})`);
  vignette.addColorStop(1, `rgba(0,0,0,${1 * strength})`);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  eff.lastPixelSize = step;
  eff.lastVignetteAlpha = strength;
  encounterOverlayState.effect = eff;
}

function cancelEncounterTimer({ preservePending = false } = {}) {
  if (encounterOverlayState.encounterTimerId) {
    clearTimeout(encounterOverlayState.encounterTimerId);
  }
  encounterOverlayState.encounterTimerId = null;
  encounterOverlayState.encounterTimerEta = null;
  const previewActive = !!(
    mapSceneInstance?.encounterPreviewSprite
    || mapSceneInstance?.encounterPreviewCameraTween
    || mapSceneInstance?.encounterPreviewDwell
  );
  const overlayActive = encounterOverlayState.active || isAnySceneOverlayActive();
  // Preserve pending encounter/preview while an encounter is already in progress.
  if (!preservePending && !overlayActive && !previewActive) {
    if (encounterDebugEnabled() && (pendingEncounter.sceneKey || activeEncounter.sceneKey)) {
      logEncounterDebug("Clearing pending encounter (timer canceled).", {
        pending: { ...pendingEncounter },
        active: { ...activeEncounter },
      });
    }
    clearPendingEncounter();
  }
}

function triggerEncounterFromTimer() {
  if (encounterOverlayState.encounterTimerId) {
    clearTimeout(encounterOverlayState.encounterTimerId);
  }
  encounterOverlayState.encounterTimerId = null;
  encounterOverlayState.encounterTimerEta = null;
  if (encounterOverlayState.active) return;
  const encounterState = mapSceneInstance?.gameState || getGlobalGameState();
  if (!encounterState || encounterState.gameOver || encounterState.missionComplete) return;
  if (encounterState.endTurnInFlight || isMapEndTurnTransitionActive()) return;
  // The roll bonus and the outcome are both read from the active unit, so make the
  // unit that actually ran into the encounter the active one before anything opens.
  const encounterUnit = (encounterState.rangerUnits || []).find(
    (unit) => unit?.id === encounterOverlayState.encounterUnitId && unit.deployed && !unit.isDead
  ) || null;
  if (encounterUnit && encounterState.activeUnitId !== encounterUnit.id) {
    encounterState.activeUnitId = encounterUnit.id;
    if (encounterState.squad) encounterState.squad.currentUnitId = encounterUnit.id;
    if (mapSceneInstance?.setActiveUnitMarker) {
      mapSceneInstance.setActiveUnitMarker(encounterUnit.id);
    }
    refreshRangerPaneScene(encounterState, { forceRebuild: true });
  }
  setEncounterTransitionActive(true);
  haltSquadMovementForEncounter();
  hideAllSceneOverlays();
  closeMapPanes(
    mapSceneInstance?.gameState || getGlobalGameState(),
    { keepSelection: true, squadFadeMs: 250 }
  );
  ensurePendingEncounter();
  if (!pendingEncounter.sceneKey) {
    setEncounterTransitionActive(false);
    return;
  }
  const handled = mapSceneInstance?.playEncounterPreview
    ? mapSceneInstance.playEncounterPreview(pendingEncounter)
    : false;
  if (!handled) {
    toggleEncounterOverlay(true);
  }
}

function startEncounterTimer() {
  if (encounterOverlayState.active || isAnySceneOverlayActive()) return;
  const previewActive = !!(mapSceneInstance?.encounterPreviewSprite || mapSceneInstance?.encounterPreviewCameraTween || mapSceneInstance?.encounterPreviewDwell);
  if (previewActive) return;
  if (encounterOverlayState.encounterTimerId) return;
  const state = mapSceneInstance?.gameState || getGlobalGameState();
  const candidateId = encounterOverlayState.encounterUnitId;
  let candidateUnit = candidateId && state?.rangerUnits
    ? state.rangerUnits.find((u) => u?.id === candidateId) || null
    : null;
  if (!candidateUnit) candidateUnit = getActiveRangerUnit(state);
  if (state && candidateUnit && isUnitNearAnySettlement(state, candidateUnit)) {
    cancelEncounterTimer();
    return;
  }
  ensurePendingEncounter(pickNextSceneKey(sceneSelectionWeights));
  if (!pendingEncounter.sceneKey) return;
  const delaySeconds = sampleEncounterDelaySeconds();
  const delayMs = delaySeconds * 500;
  encounterOverlayState.encounterTimerEta = performance.now() + delayMs;
  encounterOverlayState.encounterTimerId = setTimeout(triggerEncounterFromTimer, delayMs);
}

function updateEncounterTimerFromMovement(isMoving) {
  if (isMoving) {
    startEncounterTimer();
  } else {
    cancelEncounterTimer();
  }
}

async function toggleEncounterOverlay(show, options = {}) {
  const preservePending = !!options.preservePending;
  if (!ensureEncounterOverlayElements()) return;
  const overlay = encounterOverlayState.overlayEl;
  const message = encounterOverlayState.messageEl;
  if (!overlay) return;
  if (!show) {
    encounterOverlayState.active = false;
    refreshEndTurnButtonAvailability();
    cancelEncounterEffect();
    overlay.classList.add("hidden");
    overlay.style.opacity = "0";
    if (message) {
      message.classList.remove("visible");
    }
    if (!preservePending) {
      clearPendingEncounter();
    }
    return;
  }
  const pending = ensurePendingEncounter();
  if (!activeEncounter.sceneKey || activeEncounter.sceneKey !== pending.sceneKey) {
    setActiveEncounter(pending);
  }
  if (mapSceneInstance?.clearEncounterPreview) {
    mapSceneInstance.clearEncounterPreview();
  }
  hideAllSceneOverlays();
  closeMapPanes(
    mapSceneInstance?.gameState || getGlobalGameState(),
    { keepSelection: true }
  );
  encounterOverlayState.active = true;
  refreshEndTurnButtonAvailability();
  overlay.classList.remove("hidden");
  overlay.style.opacity = "0";
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
  });
  if (message) {
    message.classList.remove("visible");
  }
  sizeEncounterCanvas();
  try {
    await loadEncounterImage();
  } catch (_) {
    // If the splash art is missing, still show the overlay with the vignette fill.
  }
  cancelEncounterEffect();
  const dims = sizeEncounterCanvas() || { width: window.innerWidth, height: window.innerHeight };
  const img = encounterOverlayState.image;
  const scaleData = img ? computeEncounterScale(dims.width, dims.height, img) : { scale: 1, dw: dims.width, dh: dims.height };
  const dw = scaleData.dw || dims.width;
  const maxDriftSpace = Math.max(0, (dims.width - dw) * 0.5);
  const driftAmplitude = Math.max(0, Math.min(maxDriftSpace, dw * 0.02));
  const maxPixel = Math.max(12, Math.ceil(Math.max(dims.width, dims.height) / 26));
  const fadeDuration = 250;
  const revealDuration = 500;
  const start = performance.now();
  const effect = {
    rafId: null,
    start,
    fadeDuration,
    revealDuration,
    lastPixelSize: maxPixel,
    lastVignetteAlpha: 0,
    driftAmplitude,
    driftDuration: 18000,
    flameSeeds: ENCOUNTER_FLAME_POINTS.map(() => Math.random() * 1000),
  };
  const step = (now) => {
    if (!encounterOverlayState.active) {
      cancelEncounterEffect();
      return;
    }
    const elapsed = now - start;
    const fadeT = Math.min(1, elapsed / fadeDuration);
    const revealT = elapsed <= fadeDuration ? 0 : Math.min(1, (elapsed - fadeDuration) / revealDuration);
    const pixelSize = elapsed <= fadeDuration
      ? maxPixel
      : Math.max(1, maxPixel - (maxPixel - 1) * revealT);
    const vignetteAlpha = Math.max(fadeT, revealT);
    drawEncounterFrame(pixelSize, vignetteAlpha, now);
    if (message && !message.classList.contains("visible") && elapsed >= fadeDuration + revealDuration) {
      message.classList.add("visible");
    }
    // Keep drifting even after reveal completes.
    effect.rafId = requestAnimationFrame(step);
  };
  encounterOverlayState.effect = effect;
  effect.rafId = requestAnimationFrame(step);
  if (message) {
    const delay = fadeDuration + revealDuration + 80;
    encounterOverlayState.messageTimeout = setTimeout(() => {
      if (encounterOverlayState.active) {
        message.classList.add("visible");
      }
    }, delay);
  }
}

function handleEncounterOverlayClick() {
  if (!encounterOverlayState.active) return;
  startPostEncounterScene();
}

function handleEncounterOverlayKeydown(event) {
  if (!encounterOverlayState.active) return;
  if (event.key !== " " && event.code !== "Space") return;
  // Ignore Space presses bubbling from buttons / inputs (they should activate their own control).
  const target = event.target;
  if (target && typeof target.closest === "function" && target.closest("button, input, textarea, select")) {
    return;
  }
  event.preventDefault();
  startPostEncounterScene();
}

const DICE_MAX_IDLE_SPINS = 3;
const DICE_BOX_ASSET_PATH = "./vendor/dice-box-threejs/public/";
const DICE_BOX_SCALE = 1.0;
const DICE_BOX_THEME_SURFACE = "taverntable";
const DICE_BOX_THEME_MATERIAL = "metal-bump";
const DICE_BOX_THEME_TEXTURE = "bronze03a";
const DICE_BOX_THEME_COLORSET = "xwing_green";
const DICE_BOX_CUSTOM_COLORSET = {
  name: "frtd_green",
  category: "FRTD",
  foreground: "#ffffff",
  background: ["#2E6E2A", "#3D9238", "#4A9F44", "#5EAC56"],
  outline: "#0e2a0a",
  texture: "stars",
  description: "From Rust 'Til Dawn dice palette",
};
const DICE_BOX_LIGHT_INTENSITY = 0.9;
const DICE_BOX_BASE_COLOR = "#182214";
function getSfxVolume01() {
  const v = (typeof musicState !== "undefined" && musicState && Number.isFinite(musicState.volume))
    ? musicState.volume
    : DEFAULT_MUSIC_VOLUME;
  return Math.min(1, Math.max(0, v));
}
function getDiceSfxVolume() {
  return Math.round(getSfxVolume01() * 100);
}
const DICE_BOX_THROW_STRENGTH = 1.15;
const DICE_AUDIO_CACHE = new Map();
const DICE_WARMUP_LABEL = "[DiceWarmup]";
const DICE_WARMUP_OFFSCREEN_SIZE = 8;

const diceWarmupState = {
  coordinatorStarted: false,
  encounterQueued: false,
  settlementQueued: false,
  encounterDone: false,
  settlementDone: false,
};

function logDiceWarmup(message, durationMs = null) {
  if (Number.isFinite(durationMs)) {
    console.info(`${DICE_WARMUP_LABEL} ${message} (${Math.round(durationMs)}ms)`);
    return;
  }
  console.info(`${DICE_WARMUP_LABEL} ${message}`);
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function scheduleDiceWarmupTask(task, delay = 0) {
  const run = () => {
    Promise.resolve()
      .then(task)
      .catch((err) => {
        console.warn(`${DICE_WARMUP_LABEL} task failed`, err);
      });
  };
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const startIdleTask = () => {
      window.requestIdleCallback(run, { timeout: Math.max(250, delay + 250) });
    };
    if (delay > 0) {
      setTimeout(startIdleTask, delay);
    } else {
      startIdleTask();
    }
    return;
  }
  setTimeout(run, delay);
}

function ensureDiceWarmupHostStyle(host) {
  if (!host || host.__diceWarmupHostStyled) return;
  host.__diceWarmupHostStyled = true;
  host.dataset.diceWarmupHost = "true";
  host.style.minWidth = `${DICE_WARMUP_OFFSCREEN_SIZE}px`;
  host.style.minHeight = `${DICE_WARMUP_OFFSCREEN_SIZE}px`;
}

async function performDiceBoxWarmup(box, {
  label = "dice box",
  getRestoreVolume = null,
  setRestoreVolume = null,
} = {}) {
  if (!box || box.__warmupInFlight) {
    return box?.__warmupPromise || Promise.resolve(false);
  }
  if (box.__warmupComplete) return true;
  box.__warmupInFlight = true;
  const start = nowMs();
  box.__warmupPromise = (async () => {
    const previousSounds = box.sounds;
    const previousVolume = typeof getRestoreVolume === "function"
      ? getRestoreVolume()
      : (typeof box.volume === "number" ? box.volume : null);
    const canvas = box.renderer?.domElement || null;
    const previousCanvasVisibility = canvas ? canvas.style.visibility : null;
    try {
      if (canvas) canvas.style.visibility = "hidden";
      if (typeof setRestoreVolume === "function") {
        setRestoreVolume(0);
      } else {
        box.volume = 0;
        if (typeof box.setVolume === "function") box.setVolume(0);
      }
      box.sounds = false;
      if (typeof box.setDimensions === "function") {
        try {
          box.setDimensions({ x: DICE_WARMUP_OFFSCREEN_SIZE, y: DICE_WARMUP_OFFSCREEN_SIZE });
        } catch (_) {
          // Ignore layout failures during hidden warmup.
        }
      }
      if (typeof box.clearDice === "function") box.clearDice();
      // Safety net: if the warmup roll gets preempted (e.g. user opens a scene
      // mid-warmup and triggers a real roll on the same box), vendor's
      // animateThrow callback never fires. Without the timeout, the await
      // below would hang and the `finally` block — which restores canvas
      // visibility — would never run.
      const WARMUP_ROLL_TIMEOUT_MS = 4000;
      if (box.startClickThrow && box.rollDice) {
        box.notationVectors = box.startClickThrow("1d20");
        if (box.notationVectors) {
          box.notationVectors.result = [20];
        }
        await new Promise((resolve) => {
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          const t = setTimeout(finish, WARMUP_ROLL_TIMEOUT_MS);
          try {
            box.rollDice(() => { clearTimeout(t); finish(); });
          } catch (err) {
            console.warn(`${DICE_WARMUP_LABEL} ${label} warmup rollDice failed`, err);
            clearTimeout(t);
            finish();
          }
        });
      } else if (typeof box.roll === "function") {
        try {
          await Promise.race([
            box.roll("1d20"),
            new Promise((resolve) => setTimeout(resolve, WARMUP_ROLL_TIMEOUT_MS)),
          ]);
        } catch (err) {
          console.warn(`${DICE_WARMUP_LABEL} ${label} warmup roll failed`, err);
        }
      }
      if (typeof box.clearDice === "function") box.clearDice();
      box.__warmupComplete = true;
      logDiceWarmup(`${label} warmup roll complete`, nowMs() - start);
      return true;
    } finally {
      box.sounds = previousSounds;
      if (typeof setRestoreVolume === "function") {
        setRestoreVolume(previousVolume);
      } else if (previousVolume !== null) {
        box.volume = previousVolume;
        if (typeof box.setVolume === "function") box.setVolume(previousVolume);
      }
      if (canvas) canvas.style.visibility = previousCanvasVisibility || "";
      box.__warmupInFlight = false;
    }
  })();
  return box.__warmupPromise;
}

function attachDiceAudioLoader(box) {
  if (!box || typeof box.loadAudio !== "function" || box._audioDebugPatched) return;
  box.loadAudio = (url) => {
    const resolvedUrl = (typeof window !== "undefined" && window.location)
      ? new URL(url, window.location.href).toString()
      : url;
    if (DICE_AUDIO_CACHE.has(resolvedUrl)) {
      return DICE_AUDIO_CACHE.get(resolvedUrl);
    }
    const loadPromise = new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = "auto";
      const finalize = (result) => resolve(result || null);
      const handleError = async (err) => {
        try {
          const response = await fetch(resolvedUrl, { cache: "force-cache" });
          if (!response.ok) return finalize(null);
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          audio.oncanplaythrough = () => finalize(audio);
          audio.onerror = () => finalize(null);
          audio.src = objectUrl;
          audio.load();
        } catch {
          finalize(null);
        }
      };
      audio.oncanplaythrough = () => finalize(audio);
      audio.onerror = handleError;
      audio.src = resolvedUrl;
      audio.load();
    });
    DICE_AUDIO_CACHE.set(resolvedUrl, loadPromise);
    return loadPromise;
  };
  box._audioDebugPatched = true;
}

class DiceBoxRenderer {
  constructor() {
    this.box = null;
    this.host = null;
    this.readyPromise = null;
    this.rollCount = 0;
    this.themeMaterial = DICE_BOX_THEME_MATERIAL;
    this.themeTexture = DICE_BOX_THEME_TEXTURE;
    this.themeColorset = DICE_BOX_THEME_COLORSET;
    this.initDurationMs = null;
    this.firstVisibleRollLogged = false;
    this.soundsAttempted = false;
  }

  async init(host) {
    if (!host) return null;
    const DiceBoxCtor = (
      window.DiceBox
      || window["dice-box-threejs"]
      || window.DiceBoxThreeJS
      || window.dicebox
      || window["@3d-dice/dice-box-threejs"]
    ) || null;
    if (!DiceBoxCtor) {
      console.warn("DiceBoxThreeJS library not loaded; dice will be disabled.");
      return null;
    }
    this.host = host;
    ensureDiceWarmupHostStyle(host);
    const hostId = host.id && host.id.trim().length ? host.id : `dice-host-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    if (!host.id) host.id = hostId;
    const selector = `#${host.id}`;
    this.box = new DiceBoxCtor(selector, {
      assetPath: DICE_BOX_ASSET_PATH,
      theme: "default",
      theme_surface: DICE_BOX_THEME_SURFACE,
      scale: DICE_BOX_SCALE,
      gravity: 12,
      light_intensity: DICE_BOX_LIGHT_INTENSITY,
      shadows: false,
      throwForce: 2.5,
      baseColor: DICE_BOX_BASE_COLOR,
      startingHeight: 10,
      theme_material: this.themeMaterial,
      theme_texture: this.themeTexture,
      theme_customColorset: DICE_BOX_CUSTOM_COLORSET,
      sounds: true,
      volume: getDiceSfxVolume(),
        sound_dieMaterial: this.themeMaterial && this.themeMaterial.includes("metal")
          ? "metal"
          : "plastic",
        strength: DICE_BOX_THROW_STRENGTH,
    });
    attachDiceAudioLoader(this.box);
    const initFn = (typeof this.box?.initialize === "function"
      ? this.box.initialize
      : (typeof this.box?.init === "function" ? this.box.init : null));
    const initStart = nowMs();
    try {
      if (!initFn) {
        console.warn("DiceBox instance missing init/initialize; available keys:", Object.keys(this.box || {}));
        return null;
      }
      await initFn.call(this.box);
      this.initDurationMs = nowMs() - initStart;
      logDiceWarmup(`encounter dice init`, this.initDurationMs);
      await this.ensureSoundsLoaded();
    } catch (err) {
      console.warn("DiceBox init failed", err);
      return null;
    }
    this.readyPromise = Promise.resolve(this);
    return this;
  }

  refreshLayout() {
    const box = this.box;
    const host = this.host;
    if (!box || !host || typeof box.setDimensions !== "function") return false;
    const rect = typeof host.getBoundingClientRect === "function" ? host.getBoundingClientRect() : null;
    const width = Math.max(0, Math.floor(rect?.width || host.clientWidth || host.offsetWidth || 0));
    const height = Math.max(0, Math.floor(rect?.height || host.clientHeight || host.offsetHeight || 0));
    if (width <= 0 || height <= 0) return false;
    try {
      box.setDimensions({ x: width, y: height });
      if (box.renderer && box.scene && box.camera && typeof box.renderer.render === "function") {
        box.renderer.render(box.scene, box.camera);
      }
      return true;
    } catch (err) {
      console.warn("DiceBox refreshLayout failed", err);
      return false;
    }
  }

  updateTheme({ material, texture, colorset, customColorset } = {}) {
    if (material) this.themeMaterial = material;
    if (texture) this.themeTexture = texture;
    if (colorset) this.themeColorset = colorset;
    if (customColorset) this.themeCustomColorset = customColorset;
    if (typeof this.box?.updateConfig === "function") {
      return this.box.updateConfig({
        theme_material: this.themeMaterial,
        theme_texture: this.themeTexture,
        ...(this.themeCustomColorset
          ? { theme_customColorset: this.themeCustomColorset }
          : { theme_colorset: this.themeColorset }),
      });
    }
    return null;
  }

  resetPose() {
    if (typeof this.box?.clearDice === "function") this.box.clearDice();
    this.rollCount = 0;
  }

  stopRolls() {
    if (typeof this.box?.clearDice === "function") this.box.clearDice();
  }

  async ensureSoundsLoaded() {
    if (!this.box || this.soundsAttempted || typeof this.box.loadSounds !== "function") return;
    this.soundsAttempted = true;
    try {
      await this.box.loadSounds();
    } catch (err) {
      console.warn("DiceBox sound preload failed", err);
    }
  }

  async ensureWarm() {
    if (!this.box) return false;
    return performDiceBoxWarmup(this.box, {
      label: "encounter dice",
      getRestoreVolume: () => (typeof this.box?.volume === "number" ? this.box.volume : 0),
      setRestoreVolume: (volume) => {
        const safeVolume = Number.isFinite(volume) ? volume : 0;
        this.box.volume = safeVolume;
        if (typeof this.box.setVolume === "function") this.box.setVolume(safeVolume);
      },
    });
  }

  rollDice(finalFace = 1) {
    if (!this.box) return Promise.resolve(finalFace);
    this.rollCount += 1;
    const clamped = Math.max(1, Math.min(20, Math.floor(finalFace)));
    const notation = "1d20";
    const rollStart = nowMs();
    // Prefer the full DiceBox flow so we can force the result.
    if (this.box.startClickThrow && this.box.rollDice) {
      this.box.notationVectors = this.box.startClickThrow(notation);
      if (this.box.notationVectors) {
        this.box.notationVectors.result = [clamped];
      }
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (!this.firstVisibleRollLogged) {
            this.firstVisibleRollLogged = true;
            logDiceWarmup("encounter first visible roll", nowMs() - rollStart);
          }
          resolve(clamped);
        };
        // Safety net: vendor's animateThrow loop will silently abandon its
        // callback if startClickThrow is called again on the same box (e.g.
        // window resize or rapid dev-panel scene switching). Without this
        // timeout, the await above would hang forever and state.rolling would
        // never reset, locking the UI on "rolling...".
        const timeout = setTimeout(finish, 6000);
        try {
          this.box.rollDice(() => {
            clearTimeout(timeout);
            finish();
          });
        } catch (err) {
          console.warn("DiceBox rollDice failed", err);
          clearTimeout(timeout);
          finish();
        }
      });
    }
    // Fallback: use roll if available, otherwise just resolve.
    if (typeof this.box.roll === "function") {
      const rollPromise = this.box.roll(notation)
        .then(() => {
          if (!this.firstVisibleRollLogged) {
            this.firstVisibleRollLogged = true;
            logDiceWarmup("encounter first visible roll", nowMs() - rollStart);
          }
          return clamped;
        })
        .catch(() => clamped);
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(clamped), 6000));
      return Promise.race([rollPromise, timeoutPromise]);
    }
    return Promise.resolve(clamped);
  }
}

function refreshStandaloneDiceBoxLayout(box, host) {
  if (!box || !host || typeof box.setDimensions !== "function") return false;
  const rect = typeof host.getBoundingClientRect === "function" ? host.getBoundingClientRect() : null;
  const width = Math.max(0, Math.floor(rect?.width || host.clientWidth || host.offsetWidth || 0));
  const height = Math.max(0, Math.floor(rect?.height || host.clientHeight || host.offsetHeight || 0));
  if (width <= 0 || height <= 0) return false;
  try {
    box.setDimensions({ x: width, y: height });
    if (box.renderer && box.scene && box.camera && typeof box.renderer.render === "function") {
      box.renderer.render(box.scene, box.camera);
    }
    return true;
  } catch (err) {
    console.warn("Standalone DiceBox refresh failed", err);
    return false;
  }
}

const TRI_DICE_STATE = {
  overlay: null,
  host: null,
  closeBtn: null,
  rollBtn: null,
  outcomeEl: null,
  game: null,
  scene: null,
  rolling: false,
  readyPromise: null,
  lastPick: null,
  mode: "default",
  onComplete: null,
  overlayClickHandler: null,
  overlayClickAttached: false,
  parentEl: null,
  choices: ["components", "gas", "wood"],
};

function ensureTriDiceOverlayElements() {
  if (TRI_DICE_STATE.overlay && TRI_DICE_STATE.host && TRI_DICE_STATE.closeBtn && TRI_DICE_STATE.rollBtn) {
    return true;
  }
  const overlay = document.getElementById("triDiceOverlay");
  const host = document.getElementById("triDiceHost");
  const closeBtn = document.getElementById("triDiceCloseBtn");
  const rollBtn = document.getElementById("triDiceRollBtn");
  const outcomeEl = document.getElementById("triDiceOutcome");
  if (!overlay || !host || !closeBtn || !rollBtn || !outcomeEl) return false;
  TRI_DICE_STATE.overlay = overlay;
  if (!TRI_DICE_STATE.parentEl) {
    TRI_DICE_STATE.parentEl = overlay.parentElement || null;
  }
  TRI_DICE_STATE.host = host;
  TRI_DICE_STATE.closeBtn = closeBtn;
  TRI_DICE_STATE.rollBtn = rollBtn;
  TRI_DICE_STATE.outcomeEl = outcomeEl;
  if (!TRI_DICE_STATE.closeListenerAttached) {
    TRI_DICE_STATE.closeListenerAttached = true;
    closeBtn.addEventListener("click", () => {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
      stopTriDiceSlotRoll();
      syncTriDiceLoopToVisibility();
    });
  }
  if (!TRI_DICE_STATE.rollListenerAttached) {
    TRI_DICE_STATE.rollListenerAttached = true;
    rollBtn.addEventListener("click", () => {
      if (TRI_DICE_STATE.mode === "neutral-large") {
        if (TRI_DICE_STATE.rolling) return;
        if (largeSettlementOverlayState.rollStage === "neutral-ready") {
          advanceNeutralSlotToResourceRoll();
          return;
        }
      }
      spinTriDiceSlot();
    });
  }
  return true;
}

function setTriDiceOverlayMode(mode = "default", { onComplete = null } = {}) {
  if (!ensureTriDiceOverlayElements()) return false;
  const overlay = TRI_DICE_STATE.overlay;
  const isNeutralMode = mode === "neutral-large";
  TRI_DICE_STATE.mode = mode;
  TRI_DICE_STATE.onComplete = typeof onComplete === "function" ? onComplete : null;
  overlay.classList.toggle("neutral-slot-mode", isNeutralMode);
  if (isNeutralMode) {
    const largeOverlay = document.getElementById("largeSettlementOverlay");
    if (largeOverlay && overlay.parentElement !== largeOverlay) {
      largeOverlay.appendChild(overlay);
    }
    // Reset the reel on every fresh entry. TriDiceSlotScene.create() only runs
    // once, so without this the second visit shows the last spun resource
    // instead of the "?" placeholder.
    TRI_DICE_STATE.lastPick = null;
    const slotScene = TRI_DICE_STATE.scene;
    if (slotScene && typeof slotScene.setReelLabel === "function") {
      slotScene.setReelLabel("?");
      slotScene.setReelNeighbors("", "");
    }
  } else if (TRI_DICE_STATE.parentEl && overlay.parentElement !== TRI_DICE_STATE.parentEl) {
    TRI_DICE_STATE.parentEl.appendChild(overlay);
  }
  if (TRI_DICE_STATE.closeBtn) {
    TRI_DICE_STATE.closeBtn.style.display = isNeutralMode ? "none" : "";
  }
  if (TRI_DICE_STATE.rollBtn) {
    TRI_DICE_STATE.rollBtn.style.display = isNeutralMode ? "none" : "";
    TRI_DICE_STATE.rollBtn.textContent = "Spin";
  }
  if (overlay) {
    overlay.style.pointerEvents = isNeutralMode ? "auto" : "";
  }
  if (TRI_DICE_STATE.outcomeEl) {
    TRI_DICE_STATE.outcomeEl.textContent = isNeutralMode ? "" : "Ready to spin.";
  }
  if (!TRI_DICE_STATE.overlayClickHandler) {
    TRI_DICE_STATE.overlayClickHandler = () => {
      if (TRI_DICE_STATE.mode !== "neutral-large") return;
      if (!TRI_DICE_STATE.overlay || TRI_DICE_STATE.overlay.classList.contains("hidden")) return;
      if (TRI_DICE_STATE.rolling) return;
      if (largeSettlementOverlayState.rollStage !== "neutral-slot") return;
      spinTriDiceSlot({ silentResult: true, onComplete: TRI_DICE_STATE.onComplete });
    };
  }
  if (isNeutralMode && !TRI_DICE_STATE.overlayClickAttached) {
    overlay.addEventListener("click", TRI_DICE_STATE.overlayClickHandler);
    TRI_DICE_STATE.overlayClickAttached = true;
  }
  if (!isNeutralMode && TRI_DICE_STATE.overlayClickAttached) {
    overlay.removeEventListener("click", TRI_DICE_STATE.overlayClickHandler);
    TRI_DICE_STATE.overlayClickAttached = false;
  }
  return true;
}

const SLOT_CLICK_SAMPLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
  (i) => `vendor/dice-box-threejs/public/sounds/dicehit/dicehit_metal${i}.mp3`,
);
const SLOT_CLICK_BUFFERS = [];
let slotAudioContext = null;
let slotClickBuffersPromise = null;
let lastSlotBufferIndex = -1;

function ensureSlotAudioContext() {
  if (slotAudioContext) return slotAudioContext;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    slotAudioContext = new Ctor();
  } catch (_) {
    slotAudioContext = null;
  }
  return slotAudioContext;
}

function ensureSlotClickPool() {
  if (slotClickBuffersPromise) return slotClickBuffersPromise;
  const ctx = ensureSlotAudioContext();
  if (!ctx) {
    slotClickBuffersPromise = Promise.resolve();
    return slotClickBuffersPromise;
  }
  slotClickBuffersPromise = (async () => {
    const tasks = SLOT_CLICK_SAMPLES.map(async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        return await ctx.decodeAudioData(arrayBuffer);
      } catch (_) {
        return null;
      }
    });
    const buffers = await Promise.all(tasks);
    for (const buf of buffers) {
      if (buf) SLOT_CLICK_BUFFERS.push(buf);
    }
  })();
  return slotClickBuffersPromise;
}

function scheduleSlotClick(when) {
  const ctx = slotAudioContext;
  if (!ctx || !SLOT_CLICK_BUFFERS.length) return;
  let pick = Math.floor(Math.random() * SLOT_CLICK_BUFFERS.length);
  if (SLOT_CLICK_BUFFERS.length > 1 && pick === lastSlotBufferIndex) {
    pick = (pick + 1) % SLOT_CLICK_BUFFERS.length;
  }
  lastSlotBufferIndex = pick;
  const buffer = SLOT_CLICK_BUFFERS[pick];
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.92 + Math.random() * 0.16;
    const gain = ctx.createGain();
    gain.gain.value = getSfxVolume01();
    src.connect(gain).connect(ctx.destination);
    src.start(Math.max(when, ctx.currentTime));
  } catch (_) { /* ignore */ }
}

class TriDiceSlotScene extends Phaser.Scene {
  constructor() {
    super({ key: "TriDiceSlotScene" });
    this.reelText = null;
    this.reelTop = null;
    this.reelBottom = null;
  }

  create() {
    this.buildReel();
    this.scale.on("resize", this.handleResize, this);
  }

  handleResize(gameSize) {
    this.positionReel(gameSize?.width, gameSize?.height);
  }

  buildReel() {
    const width = this.scale.width || 320;
    const height = this.scale.height || 240;
    const isNeutralMode = TRI_DICE_STATE.mode === "neutral-large";
    const style = {
      fontFamily: isNeutralMode
        ? "\"8bithud\", \"Share Tech Mono\", \"Pixel Times\", \"Times New Roman\", serif"
        : "\"Segoe UI Emoji\", \"Noto Color Emoji\", \"Apple Color Emoji\", \"Segoe UI Symbol\", \"Share Tech Mono\", \"8bithud\", \"Pixel Times\", \"Times New Roman\", serif",
      fontSize: `${Math.max(30, Math.floor(height * 0.28))}px`,
      color: "#f7f5e8",
      stroke: "#0b120a",
      strokeThickness: 6,
      align: "center",
    };
    this.reelText = this.add.text(width * 0.5, height * 0.5, isNeutralMode ? "?" : "READY", style).setOrigin(0.5);
    this.reelTop = this.add.text(width * 0.5, height * 0.2, "", style).setOrigin(0.5);
    this.reelBottom = this.add.text(width * 0.5, height * 0.8, "", style).setOrigin(0.5);
    this.reelTop.setAlpha(0.22);
    this.reelBottom.setAlpha(0.22);
  }

  positionReel(width, height) {
    if (!this.reelText) return;
    const w = width || this.scale.width || 320;
    const h = height || this.scale.height || 240;
    const fontSize = Math.max(30, Math.floor(h * 0.28));
    this.reelText.setFontSize(fontSize);
    this.reelTop.setFontSize(fontSize);
    this.reelBottom.setFontSize(fontSize);
    this.reelText.setPosition(w * 0.5, h * 0.5);
    this.reelTop.setPosition(w * 0.5, h * 0.2);
    this.reelBottom.setPosition(w * 0.5, h * 0.8);
  }

  setReelLabel(label) {
    if (!this.reelText) return;
    this.reelText.setText(label);
  }

  setReelNeighbors(prevLabel, nextLabel) {
    if (!this.reelTop || !this.reelBottom) return;
    this.reelTop.setText(prevLabel || "");
    this.reelBottom.setText(nextLabel || "");
  }
}

function ensureTriDiceSlotScene() {
  ensureSlotClickPool();
  if (TRI_DICE_STATE.game || TRI_DICE_STATE.readyPromise) {
    return TRI_DICE_STATE.readyPromise || Promise.resolve(TRI_DICE_STATE.scene);
  }
  if (!ensureTriDiceOverlayElements()) {
    TRI_DICE_STATE.readyPromise = Promise.resolve(null);
    return TRI_DICE_STATE.readyPromise;
  }
  const host = TRI_DICE_STATE.host;
  if (!host.id) host.id = `tri-dice-slot-${Date.now()}`;
  TRI_DICE_STATE.readyPromise = new Promise((resolve) => {
    TRI_DICE_STATE.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.id,
      transparent: true,
      backgroundColor: "#000000",
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: TriDiceSlotScene,
      callbacks: {
        postBoot: () => {
          const scene = TRI_DICE_STATE.game?.scene?.keys?.TriDiceSlotScene || null;
          TRI_DICE_STATE.scene = scene;
          resolve(scene);
        },
      },
    });
  });
  return TRI_DICE_STATE.readyPromise;
}

function stopTriDiceSlotRoll() {
  TRI_DICE_STATE.rolling = false;
  const scene = TRI_DICE_STATE.scene;
  if (scene?.tweens) {
    scene.tweens.killAll();
  }
  if (TRI_DICE_STATE.scheduledTimeouts && TRI_DICE_STATE.scheduledTimeouts.length) {
    for (const handle of TRI_DICE_STATE.scheduledTimeouts) {
      clearTimeout(handle);
    }
    TRI_DICE_STATE.scheduledTimeouts.length = 0;
  }
  if (TRI_DICE_STATE.rollBtn) {
    TRI_DICE_STATE.rollBtn.disabled = false;
  }
}

function updateTriDiceReel(scene, index) {
  const choices = TRI_DICE_STATE.choices;
  const total = choices.length;
  const currentKey = choices[index % total];
  const prevKey = choices[(index + total - 1) % total];
  const nextKey = choices[(index + 1) % total];
  scene.setReelLabel(iconForResource(currentKey));
  scene.setReelNeighbors(iconForResource(prevKey), iconForResource(nextKey));
}

async function spinTriDiceSlot({ silentResult = false, onComplete = null } = {}) {
  const scene = await ensureTriDiceSlotScene();
  if (!scene || TRI_DICE_STATE.rolling) return;
  TRI_DICE_STATE.rolling = true;
  refreshEndTurnButtonAvailability();
  if (TRI_DICE_STATE.rollBtn) TRI_DICE_STATE.rollBtn.disabled = true;
  if (TRI_DICE_STATE.outcomeEl) {
    TRI_DICE_STATE.outcomeEl.textContent = "Spinning...";
  }
  if (TRI_DICE_STATE.mode === "neutral-large") {
    const messageText = largeSettlementOverlayState.messageEl?.querySelector(".loading-text");
    if (messageText) messageText.textContent = "Spinning...";
    if (TRI_DICE_STATE.overlay) {
      TRI_DICE_STATE.overlay.style.pointerEvents = "auto";
    }
    const neutralBtn = ensureNeutralSlotActionButton();
    if (neutralBtn) neutralBtn.style.display = "none";
  }
  const choices = TRI_DICE_STATE.choices;
  const targetIndex = Phaser.Math.Between(0, choices.length - 1);
  const fastSpins = Phaser.Math.Between(16, 20);
  const midSpins = Phaser.Math.Between(10, 16);
  const slowSpins = Phaser.Math.Between(5, 10);
  const finalSpins = Phaser.Math.Between(2, 5);
  const baseFinal = fastSpins + midSpins + slowSpins + finalSpins;
  const offset = (targetIndex - (baseFinal % choices.length) + choices.length) % choices.length;
  const finalTarget = baseFinal + offset;

  const baseMs = Phaser.Math.Between(1200, 1500);
  const perSpinMs = Phaser.Math.Between(55, 70);
  const totalDuration = Math.round(baseMs + finalTarget * perSpinMs);

  const easeOut = Phaser.Math.Easing.SineOut
    || Phaser.Math.Easing.Sine?.Out
    || Phaser.Math.Easing.CubicOut
    || Phaser.Math.Easing.Cubic?.Out
    || ((t) => t);

  ensureSlotClickPool();
  const ctx = ensureSlotAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const tickTimes = [];
  const STEPS = Math.max(400, finalTarget * 12);
  let nextIdx = 1;
  for (let s = 1; s <= STEPS && nextIdx <= finalTarget; s++) {
    const tNorm = s / STEPS;
    const value = easeOut(tNorm) * finalTarget;
    while (value >= nextIdx && nextIdx <= finalTarget) {
      tickTimes.push(tNorm * totalDuration);
      nextIdx++;
    }
  }
  if (tickTimes.length) {
    tickTimes[tickTimes.length - 1] = totalDuration;
  }

  updateTriDiceReel(scene, 0);

  TRI_DICE_STATE.scheduledTimeouts = TRI_DICE_STATE.scheduledTimeouts || [];
  for (const handle of TRI_DICE_STATE.scheduledTimeouts) clearTimeout(handle);
  TRI_DICE_STATE.scheduledTimeouts.length = 0;

  const finishSpin = () => {
    const finalKey = choices[targetIndex];
    const finalLabel = iconForResource(finalKey);
    updateTriDiceReel(scene, finalTarget);
    TRI_DICE_STATE.lastPick = finalKey;
    if (!silentResult && TRI_DICE_STATE.outcomeEl) {
      TRI_DICE_STATE.outcomeEl.textContent = `Result: ${finalLabel}`;
    } else if (silentResult && TRI_DICE_STATE.outcomeEl) {
      TRI_DICE_STATE.outcomeEl.textContent = "";
    }
    if (!isReleaseMode() && typeof window !== "undefined") {
      window.gameStateRef = window.gameStateRef || {};
      window.gameStateRef.lastSlotResource = finalKey;
    }
    if (typeof onComplete === "function") {
      onComplete(finalKey);
    }
    if (TRI_DICE_STATE.mode === "neutral-large") {
      const messageText = largeSettlementOverlayState.messageEl?.querySelector(".loading-text");
      if (messageText) messageText.textContent = "";
      if (TRI_DICE_STATE.overlay) {
        TRI_DICE_STATE.overlay.style.pointerEvents = "none";
      }
      const neutralBtn = ensureNeutralSlotActionButton();
      if (neutralBtn) neutralBtn.style.display = "";
    }
    TRI_DICE_STATE.rolling = false;
    refreshEndTurnButtonAvailability();
    if (TRI_DICE_STATE.rollBtn) TRI_DICE_STATE.rollBtn.disabled = false;
  };

  const audioStart = ctx ? ctx.currentTime : 0;
  for (let i = 0; i < tickTimes.length; i++) {
    const tMs = tickTimes[i];
    const visualIdx = i + 1;
    if (ctx) {
      scheduleSlotClick(audioStart + tMs / 1000);
    }
    const isLast = i === tickTimes.length - 1;
    const handle = setTimeout(() => {
      if (!TRI_DICE_STATE.rolling) return;
      if (isLast) {
        finishSpin();
      } else {
        updateTriDiceReel(scene, visualIdx);
      }
    }, tMs);
    TRI_DICE_STATE.scheduledTimeouts.push(handle);
  }

  if (!tickTimes.length) {
    finishSpin();
  }
}

// The slot reel is its own Phaser game; its loop sleeps while the overlay is hidden.
function syncTriDiceLoopToVisibility() {
  const loop = TRI_DICE_STATE.game?.loop;
  const overlay = TRI_DICE_STATE.overlay;
  // Before the game has booted the loop has no callback yet; Phaser starts it itself.
  if (!loop || !loop.started || !overlay) return;
  const shown = !overlay.classList.contains("hidden");
  try {
    if (shown && !loop.running) loop.wake();
    else if (!shown && loop.running) loop.sleep();
  } catch (_) {
    // leave the loop as it is
  }
}

function hideTriDiceOverlay() {
  if (!ensureTriDiceOverlayElements()) return;
  TRI_DICE_STATE.overlay.classList.add("hidden");
  TRI_DICE_STATE.overlay.setAttribute("aria-hidden", "true");
  TRI_DICE_STATE.overlay.style.pointerEvents = "";
  setTriDiceOverlayMode("default");
  stopTriDiceSlotRoll();
  syncTriDiceLoopToVisibility();
}

function showTriDiceOverlay({ mode = "default", onComplete = null } = {}) {
  if (!ensureTriDiceOverlayElements()) return;
  setTriDiceOverlayMode(mode, { onComplete });
  TRI_DICE_STATE.overlay.classList.remove("hidden");
  TRI_DICE_STATE.overlay.setAttribute("aria-hidden", "false");
  ensureTriDiceSlotScene();
  syncTriDiceLoopToVisibility();
}

function buildSmallSettlementColorSets() {
  return [
    { id: "settle-chits", name: "settle-chits", background: "#f3c14b", foreground: "#1a1205", outline: "black", edge: "#f3c14b", texture: { name: "none" } },
    { id: "settle-food", name: "settle-food", background: "#3dbb5f", foreground: "#ffffff", outline: "black", edge: "#3dbb5f", texture: { name: "none" } },
    { id: "settle-water", name: "settle-water", background: "#3da5ff", foreground: "#ffffff", outline: "black", edge: "#3da5ff", texture: { name: "none" } },
  ];
}

const SMALL_SETTLEMENT_RESOURCE_KEYS = ["chits", "food", "water"];

function patchSmallSettlementDiceBox(box, colorSets) {
  if (!box || box.__settleDicePatched) return;
  const originalSpawn = box.spawnDice.bind(box);
  box.__settleDicePatched = true;
  box.__settleColors = colorSets;
  box.__settleResourceKeys = SMALL_SETTLEMENT_RESOURCE_KEYS;
  box.__settleD6Index = 0;
  if (box.DiceFactory?.get && !box.__settleGetPatched) {
    const originalGet = box.DiceFactory.get.bind(box.DiceFactory);
    box.DiceFactory.get = (type) => {
      if (type === "d6") {
        if (!box.__settleD6Def) {
          const base = originalGet(type);
          const mappedLabels = Array.isArray(base?.labels)
            ? base.labels.map((label) => {
                const num = Number.parseInt(label, 10);
                if (Number.isFinite(num)) return String(Math.max(0, num - 1));
                return label;
              })
            : ["", "", "0", "1", "2", "3", "4", "5"];
          const mappedValues = Array.isArray(base?.values)
            ? base.values.map((val) => (typeof val === "number" ? val - 1 : val))
            : [0, 1, 2, 3, 4, 5];
          box.__settleD6Def = {
            ...base,
            name: "Six-Sided Dice (0-5)",
            labels: mappedLabels,
            values: mappedValues,
          };
          if (box.DiceFactory?.materials_cache) {
            box.DiceFactory.materials_cache = {};
          }
        }
        return box.__settleD6Def;
      }
      return originalGet(type);
    };
    box.__settleGetPatched = true;
  }
  box.spawnDice = function spawnSmallSettlementDice(vec, existing) {
    const prev = this.colorData;
    const prevFactoryColor = this.DiceFactory?.colordata || null;
    let picked = null;
    let resourceKey = null;
    const resourceKeys = this.__settleResourceKeys || SMALL_SETTLEMENT_RESOURCE_KEYS;
    if (this.__settleColors?.length && vec?.type === "d6") {
      const idx = Number.isFinite(vec.index) ? Math.abs(vec.index) % this.__settleColors.length : null;
      if (idx !== null) {
        picked = this.__settleColors[idx];
        resourceKey = resourceKeys[idx] || null;
      } else {
        const altIdx = this.__settleD6Index % this.__settleColors.length;
        picked = this.__settleColors[altIdx];
        resourceKey = resourceKeys[altIdx] || null;
        this.__settleD6Index += 1;
      }
    }
    if (picked) {
      this.colorData = picked;
      if (this.DiceFactory?.applyColorSet) {
        this.DiceFactory.applyColorSet(this.colorData);
      }
    }
    const result = originalSpawn(vec, existing);
    const die = existing || this.diceList?.[this.diceList.length - 1] || null;
    if (die && resourceKey) {
      die.__settleResource = resourceKey;
    }
    this.colorData = prev;
    if (prevFactoryColor && this.DiceFactory?.applyColorSet) {
      this.DiceFactory.applyColorSet(prevFactoryColor);
    }
    return result;
  };
}

async function ensureSmallSettlementDiceBox() {
  if (settlementOverlayState.diceBox) {
    const box = settlementOverlayState.diceBox;
    if (typeof box.clearDice === "function") box.clearDice();
    refreshStandaloneDiceBoxLayout(box, settlementOverlayState.diceHost);
    return box;
  }
  if (settlementOverlayState.diceReadyPromise) {
    return settlementOverlayState.diceReadyPromise.then((box) => {
      if (box && typeof box.clearDice === "function") box.clearDice();
      refreshStandaloneDiceBoxLayout(box, settlementOverlayState.diceHost);
      return box;
    });
  }
  if (!ensureSettlementOverlayElements()) {
    settlementOverlayState.diceReadyPromise = Promise.resolve(null);
    return settlementOverlayState.diceReadyPromise;
  }
  const DiceBoxCtor = (
    window.DiceBox
    || window["dice-box-threejs"]
    || window.DiceBoxThreeJS
    || window.dicebox
    || window["@3d-dice/dice-box-threejs"]
  ) || null;
  if (!DiceBoxCtor) {
    settlementOverlayState.diceReadyPromise = Promise.resolve(null);
    return settlementOverlayState.diceReadyPromise;
  }
  const host = settlementOverlayState.diceHost;
  ensureDiceWarmupHostStyle(host);
  if (!host.id) host.id = `settlement-dice-host-${Date.now()}`;
  const selector = `#${host.id}`;
  const box = new DiceBoxCtor(selector, {
    assetPath: DICE_BOX_ASSET_PATH,
    theme: "default",
    theme_surface: DICE_BOX_THEME_SURFACE,
    scale: DICE_BOX_SCALE,
    gravity: 12,
    light_intensity: DICE_BOX_LIGHT_INTENSITY,
    throwForce: 2.5,
    baseColor: DICE_BOX_BASE_COLOR,
    startingHeight: 10,
    theme_material: DICE_BOX_THEME_MATERIAL,
    theme_texture: DICE_BOX_THEME_TEXTURE,
    theme_colorset: DICE_BOX_THEME_COLORSET,
    sounds: true,
    volume: getDiceSfxVolume(),
    sound_dieMaterial: DICE_BOX_THEME_MATERIAL && DICE_BOX_THEME_MATERIAL.includes("metal")
      ? "metal"
      : "plastic",
    strength: DICE_BOX_THROW_STRENGTH,
  });
  box.__soundsAttempted = false;
  box.__firstVisibleRollLogged = false;
  attachDiceAudioLoader(box);
  const initFn = (typeof box?.initialize === "function"
    ? box.initialize
    : (typeof box?.init === "function" ? box.init : null));
  settlementOverlayState.diceReadyPromise = (async () => {
    if (!initFn) return null;
    const initStart = nowMs();
    await initFn.call(box);
    logDiceWarmup("small settlement dice init", nowMs() - initStart);
    patchSmallSettlementDiceBox(box, buildSmallSettlementColorSets());
    refreshStandaloneDiceBoxLayout(box, host);
    settlementOverlayState.diceBox = box;
    return box;
  })();
  return settlementOverlayState.diceReadyPromise;
}

function resetSettlementDiceUI() {
  resetOverlayDiceUI(settlementOverlayState, "click to roll");
  settlementOverlayState.diceRolled = false;
  settlementOverlayState.rolling = false;
  setOverlayDiceVisibility(settlementOverlayState, true);
}

async function rollSmallSettlementDice() {
  if (!settlementOverlayState.active || settlementOverlayState.rolling) return;
  const gameState = getGlobalGameState();
  const settlement = getSmallSettlementById(gameState, settlementOverlayState.currentSettlementId);
  if (!settlement || settlement.joinedFaction) return;
  const messageText = settlementOverlayState.messageEl?.querySelector(".loading-text");
  if (messageText) messageText.textContent = "rolling...";
  settlementOverlayState.rolling = true;
  settlementOverlayState.rollId += 1;
  const rollId = settlementOverlayState.rollId;
  const settlementId = settlementOverlayState.currentSettlementId;
  setOverlayExitEnabled(settlementOverlayState, false);
  setOverlayDiceVisibility(settlementOverlayState, true);
  if (settlementOverlayState.diceWrapper) {
    settlementOverlayState.diceWrapper.classList.add("rolling");
  }
  let box = null;
  try {
    box = await ensureSmallSettlementDiceBox();
  } catch (err) {
    console.warn("Small settlement dice unavailable", err);
  }
  if (box) box.__settleD6Index = 0;
  const rollStart = nowMs();
  const rolled = await rollSettlementDiceBox(box, "3d6");
  if (
    !settlementOverlayState.active
    || settlementOverlayState.rollId !== rollId
    || settlementOverlayState.currentSettlementId !== settlementId
  ) {
    // Scene was closed or replaced (load, restart) while the dice were in the air.
    if (settlementOverlayState.rollId === rollId) settlementOverlayState.rolling = false;
    return;
  }
  if (rolled && !box.__firstVisibleRollLogged) {
    box.__firstVisibleRollLogged = true;
    logDiceWarmup("small settlement first visible roll", nowMs() - rollStart);
  }
  const income = { chits: 0, food: 0, water: 0 };
  if (rolled) {
    (box.diceList || []).forEach((die) => {
      if (!die?.__settleResource || die?.shape !== "d6") return;
      const entry = die.getLastValue ? die.getLastValue() : null;
      const val = parseLargeSettlementRollValue(entry);
      income[die.__settleResource] = val;
    });
  } else {
    Object.keys(income).forEach((key) => { income[key] = randomSettlementDieValue(); });
    setOverlayDiceVisibility(settlementOverlayState, false);
  }
  settlement.owner = "player";
  settlement.yields = income;
  settlement.joinedFaction = true;
  if (messageText) messageText.textContent = "";
  setSettlementNarrativeMessage(settlement.name);
  setSettlementIncomeOutcome(income);
  renderMap(gameState);
  settlementOverlayState.diceRolled = true;
  settlementOverlayState.rolling = false;
  if (settlementOverlayState.diceWrapper) {
    settlementOverlayState.diceWrapper.classList.remove("rolling");
  }
  setOverlayExitEnabled(settlementOverlayState, true);
}

function handleSettlementOverlayClick() {
  if (!settlementOverlayState.active) return;
  const gameState = getGlobalGameState();
  const settlement = getSmallSettlementById(gameState, settlementOverlayState.currentSettlementId);
  if (!settlement || settlement.joinedFaction) return;
  rollSmallSettlementDice();
}

function buildLargeSettlementColorSets() {
  return [
    { id: "large-gas", name: "large-gas", background: "#d84a3a", foreground: "#ffffff", outline: "black", edge: "#d84a3a", texture: { name: "none" } },
    { id: "large-components", name: "large-components", background: "#9aa3a8", foreground: "#1a1a1a", outline: "black", edge: "#9aa3a8", texture: { name: "none" } },
    { id: "large-wood", name: "large-wood", background: "#a56a3a", foreground: "#ffffff", outline: "black", edge: "#a56a3a", texture: { name: "none" } },
  ];
}

function setLargeSettlementDiceResourceMode(box, resourceKey = null) {
  if (!box) return;
  const baseColors = box.__largeSettlementBaseColors || box.__largeSettlementColors;
  if (!baseColors) return;
  if (!resourceKey) {
    box.__largeSettlementColors = baseColors;
    box.__largeSettlementResourceKeys = LARGE_SETTLEMENT_RESOURCE_KEYS;
    return;
  }
  const idx = LARGE_SETTLEMENT_RESOURCE_KEYS.indexOf(resourceKey);
  const color = idx >= 0 ? baseColors[idx] : null;
  if (color) {
    box.__largeSettlementColors = [color];
    box.__largeSettlementResourceKeys = [resourceKey];
  } else {
    box.__largeSettlementColors = baseColors;
    box.__largeSettlementResourceKeys = LARGE_SETTLEMENT_RESOURCE_KEYS;
  }
}

function patchLargeSettlementDiceBox(box, colorSets) {
  if (!box || box.__largeSettlementDicePatched) return;
  const originalSpawn = box.spawnDice.bind(box);
  box.__largeSettlementDicePatched = true;
  box.__largeSettlementColors = colorSets;
  box.__largeSettlementBaseColors = colorSets;
  box.__largeSettlementResourceKeys = LARGE_SETTLEMENT_RESOURCE_KEYS;
  box.__largeSettlementD6Index = 0;
  if (box.DiceFactory?.get && !box.__largeSettlementGetPatched) {
    const originalGet = box.DiceFactory.get.bind(box.DiceFactory);
    box.DiceFactory.get = (type) => {
      if (type === "d6") {
        if (!box.__largeSettlementD6Def) {
          const base = originalGet(type);
          const mappedLabels = Array.isArray(base?.labels)
            ? base.labels.map((label) => {
                const num = Number.parseInt(label, 10);
                if (Number.isFinite(num)) return String(Math.max(0, num - 1));
                return label;
              })
            : ["", "", "0", "1", "2", "3", "4", "5"];
          const mappedValues = Array.isArray(base?.values)
            ? base.values.map((val) => (typeof val === "number" ? val - 1 : val))
            : [0, 1, 2, 3, 4, 5];
          box.__largeSettlementD6Def = {
            ...base,
            name: "Six-Sided Dice (0-5)",
            labels: mappedLabels,
            values: mappedValues,
          };
          if (box.DiceFactory?.materials_cache) {
            box.DiceFactory.materials_cache = {};
          }
        }
        return box.__largeSettlementD6Def;
      }
      return originalGet(type);
    };
    box.__largeSettlementGetPatched = true;
  }
  box.spawnDice = function spawnLargeSettlementDice(vec, existing) {
    const prev = this.colorData;
    const prevFactoryColor = this.DiceFactory?.colordata || null;
    let picked = null;
    let resourceKey = null;
    const resourceKeys = this.__largeSettlementResourceKeys || LARGE_SETTLEMENT_RESOURCE_KEYS;
    if (this.__largeSettlementColors?.length && vec?.type === "d6") {
      const idx = Number.isFinite(vec.index) ? Math.abs(vec.index) % this.__largeSettlementColors.length : null;
      if (idx !== null) {
        picked = this.__largeSettlementColors[idx];
        resourceKey = resourceKeys[idx] || null;
      } else {
        const altIdx = this.__largeSettlementD6Index % this.__largeSettlementColors.length;
        picked = this.__largeSettlementColors[altIdx];
        resourceKey = resourceKeys[altIdx] || null;
        this.__largeSettlementD6Index += 1;
      }
    }
    if (picked) {
      this.colorData = picked;
      if (this.DiceFactory?.applyColorSet) {
        this.DiceFactory.applyColorSet(this.colorData);
      }
    }
    const result = originalSpawn(vec, existing);
    const die = existing || this.diceList?.[this.diceList.length - 1] || null;
    if (die && resourceKey) {
      die.__largeSettlementResource = resourceKey;
    }
    this.colorData = prev;
    if (prevFactoryColor && this.DiceFactory?.applyColorSet) {
      this.DiceFactory.applyColorSet(prevFactoryColor);
    }
    return result;
  };
}

async function ensureLargeSettlementDiceBox() {
  if (largeSettlementOverlayState.diceBox) {
    const box = largeSettlementOverlayState.diceBox;
    if (typeof box.clearDice === "function") box.clearDice();
    refreshStandaloneDiceBoxLayout(box, largeSettlementOverlayState.diceHost);
    return box;
  }
  if (largeSettlementOverlayState.diceReadyPromise) {
    return largeSettlementOverlayState.diceReadyPromise.then((box) => {
      if (box && typeof box.clearDice === "function") box.clearDice();
      refreshStandaloneDiceBoxLayout(box, largeSettlementOverlayState.diceHost);
      return box;
    });
  }
  if (!ensureLargeSettlementOverlayElements()) {
    largeSettlementOverlayState.diceReadyPromise = Promise.resolve(null);
    return largeSettlementOverlayState.diceReadyPromise;
  }
  const DiceBoxCtor = (
    window.DiceBox
    || window["dice-box-threejs"]
    || window.DiceBoxThreeJS
    || window.dicebox
    || window["@3d-dice/dice-box-threejs"]
  ) || null;
  if (!DiceBoxCtor) {
    largeSettlementOverlayState.diceReadyPromise = Promise.resolve(null);
    return largeSettlementOverlayState.diceReadyPromise;
  }
  const host = largeSettlementOverlayState.diceHost;
  ensureDiceWarmupHostStyle(host);
  if (!host.id) host.id = `large-settlement-dice-host-${Date.now()}`;
  const selector = `#${host.id}`;
  const box = new DiceBoxCtor(selector, {
    assetPath: DICE_BOX_ASSET_PATH,
    theme: "default",
    theme_surface: DICE_BOX_THEME_SURFACE,
    scale: DICE_BOX_SCALE,
    gravity: 12,
    light_intensity: DICE_BOX_LIGHT_INTENSITY,
    throwForce: 2.5,
    baseColor: DICE_BOX_BASE_COLOR,
    startingHeight: 10,
    theme_material: DICE_BOX_THEME_MATERIAL,
    theme_texture: DICE_BOX_THEME_TEXTURE,
    theme_colorset: DICE_BOX_THEME_COLORSET,
    sounds: true,
    volume: getDiceSfxVolume(),
    sound_dieMaterial: DICE_BOX_THEME_MATERIAL && DICE_BOX_THEME_MATERIAL.includes("metal")
      ? "metal"
      : "plastic",
    strength: DICE_BOX_THROW_STRENGTH,
  });
  box.__soundsAttempted = false;
  box.__firstVisibleRollLogged = false;
  attachDiceAudioLoader(box);
  const initFn = (typeof box?.initialize === "function"
    ? box.initialize
    : (typeof box?.init === "function" ? box.init : null));
  largeSettlementOverlayState.diceReadyPromise = (async () => {
    if (!initFn) return null;
    const initStart = nowMs();
    await initFn.call(box);
    logDiceWarmup("large settlement dice init", nowMs() - initStart);
    patchLargeSettlementDiceBox(box, buildLargeSettlementColorSets());
    refreshStandaloneDiceBoxLayout(box, host);
    largeSettlementOverlayState.diceBox = box;
    return box;
  })();
  return largeSettlementOverlayState.diceReadyPromise;
}

function resetLargeSettlementDiceUI(messageText = "click to roll") {
  resetOverlayDiceUI(largeSettlementOverlayState, messageText);
  largeSettlementOverlayState.diceRolled = false;
  largeSettlementOverlayState.rolling = false;
  setOverlayDiceVisibility(largeSettlementOverlayState, true);
}

function getLargeSettlementContentForRoll(roll) {
  const resolvedRoll = Number.isFinite(roll) ? roll : parseInt(roll, 10);
  if (!Number.isFinite(resolvedRoll)) return null;
  const host = typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : null);
  const library = host?.ContentLibrary?.LargeSettlementRolls;
  if (!Array.isArray(library)) return null;
  return library.find((entry) => entry?.roll === resolvedRoll) || null;
}

function displayLargeSettlementNarrative(narrative) {
  const messageEl = largeSettlementOverlayState.messageEl;
  if (!messageEl) return Promise.resolve();
  const narrativeEl = ensureSceneNarrativeElement("large-settlement", messageEl);
  if (!narrativeEl) return Promise.resolve();
  const text = (narrative ?? "").trim();
  if (!text) {
    narrativeEl.style.display = "none";
    narrativeEl.textContent = "";
    return Promise.resolve();
  }
  narrativeEl.style.display = "";
  const durationMs = Math.max(1, TEXT_FADE_IN_MS);
  return revealText(narrativeEl, text, { durationMs });
}

function displayLargeSettlementOutcomeText(outcome) {
  const messageEl = largeSettlementOverlayState.messageEl;
  if (!messageEl) return;
  const outcomeEl = ensureSceneOutcomeElement("large-settlement", messageEl);
  if (!outcomeEl) return;
  const trimmed = (outcome || "").trim();
  if (!trimmed) {
    outcomeEl.style.display = "none";
    outcomeEl.textContent = "";
    return;
  }
  const normalizedOutcomeContent = trimmed.toLowerCase() === "pass" || trimmed.toLowerCase() === "fail"
    ? trimmed.toUpperCase()
    : trimmed;
  const state = getGlobalGameState();
  const nodeId = largeSettlementOverlayState.currentSettlementId;
  const node = nodeId ? state?.nodeMap?.get?.(nodeId) : null;
  const label = node?.owner === "enemy"
    ? `Ownership outcome: ${normalizedOutcomeContent}`
    : (trimmed.toLowerCase() === "pass" || trimmed.toLowerCase() === "fail"
      ? `Outcome: ${normalizedOutcomeContent}`
      : normalizedOutcomeContent);
  outcomeEl.style.display = "";
  outcomeEl.textContent = label;
}

function setLargeSettlementBonusLine(text) {
  const messageEl = largeSettlementOverlayState.messageEl;
  if (!messageEl) return;
  const bonusEl = ensureSceneBonusElement("large-settlement", messageEl);
  if (!bonusEl) return;
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    bonusEl.style.display = "none";
    bonusEl.textContent = "";
    return;
  }
  bonusEl.style.display = "";
  bonusEl.textContent = trimmed;
}

function resetLargeSettlementSceneUI() {
  setLargeSettlementShopVisibility(false);
  setLargeSettlementShopToggleVisibility(false);
  if (largeSettlementOverlayState.shopList) {
    largeSettlementOverlayState.shopList.innerHTML = "";
  }
  if (largeSettlementOverlayState.shopSummary) {
    largeSettlementOverlayState.shopSummary.textContent = "";
  }
  const statusEl = document.getElementById("largeSettlementShopStatus");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.classList.remove("is-warning");
  }
  displayLargeSettlementNarrative("");
  displayLargeSettlementOutcomeText("");
  setLargeSettlementBonusLine("");
  clearLargeSettlementDiceValue();
  const messageText = largeSettlementOverlayState.messageEl?.querySelector(".loading-text");
  if (messageText) messageText.textContent = "";
}

function clearLargeSettlementDiceValue() {
  clearOverlayDiceValueFx(largeSettlementOverlayState);
  largeSettlementOverlayState.diceFace = null;
  if (largeSettlementOverlayState.diceValueEl) {
    largeSettlementOverlayState.diceValueEl.textContent = "";
  }
  applyOverlayDiceGlow(largeSettlementOverlayState, false);
}

function setLargeSettlementShopToggleVisibility(visible) {
  const toggle = largeSettlementOverlayState.shopToggleBtn;
  if (!toggle) return;
  toggle.style.display = visible ? "" : "none";
  toggle.disabled = !visible;
}

function ensureNeutralSlotActionButton() {
  const messageEl = largeSettlementOverlayState.messageEl;
  if (!messageEl) return null;
  if (largeSettlementOverlayState.neutralActionBtn) {
    return largeSettlementOverlayState.neutralActionBtn;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "primary neutral-slot-action-btn";
  btn.textContent = "Roll for resource amount";
  btn.style.display = "none";
  btn.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (largeSettlementOverlayState.rollStage === "neutral-ready") {
      advanceNeutralSlotToResourceRoll();
      return;
    }
    if (largeSettlementOverlayState.rollStage === "enemy-ready") {
      advanceEnemyLargeSettlementToResourceRoll();
    }
  });
  messageEl.appendChild(btn);
  largeSettlementOverlayState.neutralActionBtn = btn;
  return btn;
}

function setLargeSettlementIncomeOutcome(income) {
  const messageEl = largeSettlementOverlayState.messageEl;
  if (!messageEl) return;
  const outcomeEl = ensureSceneOutcomeElement("large-settlement", messageEl);
  if (!outcomeEl) return;
  const parts = LARGE_SETTLEMENT_RESOURCE_KEYS.filter((key) => income?.[key]).map((key) => {
    const amount = income[key];
    const icon = iconForResource(key);
    return `<span class="res-pill"><span class="res-ic">${icon}</span>+${amount}</span>`;
  });
  outcomeEl.style.display = "";
  outcomeEl.innerHTML = parts.length
    ? `Income: ${parts.join(" ")}`
    : "Income: None";
}

function ensureLargeSettlementShopOffers(node) {
  if (!node) return [];
  const existing = Array.isArray(node.shopOffers) ? node.shopOffers.filter(Boolean) : [];
  if (existing.length) return existing.slice(0, LARGE_SETTLEMENT_SHOP_COUNT);
  const picks = shuffleArray(LARGE_SETTLEMENT_SHOP_POOL).slice(0, LARGE_SETTLEMENT_SHOP_COUNT);
  node.shopOffers = picks;
  return picks;
}

function ensureLargeSettlementShopPool(node) {
  if (!node) return { offers: [], pool: {} };
  const offers = ensureLargeSettlementShopOffers(node);
  const existingPool = node.shopPool && typeof node.shopPool === "object" ? node.shopPool : null;
  if (existingPool && Object.keys(existingPool).length) {
    return { offers, pool: existingPool };
  }
  const pool = {};
  offers.forEach((key) => {
    const amount = 15 + Math.floor(Math.random() * 16);
    pool[key] = amount;
  });
  node.shopPool = pool;
  return { offers, pool };
}

const LARGE_SETTLEMENT_SHOP_DRAG_EDGE_PX = 14;
const LARGE_SETTLEMENT_SHOP_DRAG_CLICK_SUPPRESS_MS = 180;

function isLargeSettlementShopEdgeHot(win, clientX, clientY, threshold = LARGE_SETTLEMENT_SHOP_DRAG_EDGE_PX) {
  if (!win) return false;
  const rect = win.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const inside = (
    clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top
    && clientY <= rect.bottom
  );
  if (!inside) return false;
  const nearLeft = (clientX - rect.left) <= threshold;
  const nearRight = (rect.right - clientX) <= threshold;
  const nearTop = (clientY - rect.top) <= threshold;
  const nearBottom = (rect.bottom - clientY) <= threshold;
  return nearLeft || nearRight || nearTop || nearBottom;
}

function clampLargeSettlementShopPosition(left, top) {
  const overlay = largeSettlementOverlayState.overlayEl;
  const win = largeSettlementOverlayState.shopWindow;
  if (!overlay || !win) return { left, top };
  const paneRect = win.getBoundingClientRect();
  const paneWidth = paneRect.width || win.offsetWidth || 0;
  const paneHeight = paneRect.height || win.offsetHeight || 0;
  const maxLeft = Math.max(0, overlay.clientWidth - paneWidth);
  const maxTop = Math.max(0, overlay.clientHeight - paneHeight);
  const clampedLeft = Math.min(Math.max(0, left), maxLeft);
  const clampedTop = Math.min(Math.max(0, top), maxTop);
  return { left: clampedLeft, top: clampedTop };
}

function applyLargeSettlementShopPosition({ forceDefault = false } = {}) {
  const win = largeSettlementOverlayState.shopWindow;
  if (!win) return;
  const hasCustom = largeSettlementOverlayState.shopHasCustomPosition && !forceDefault;
  if (!hasCustom) {
    win.style.left = "";
    win.style.top = "";
    win.style.transform = "";
    return;
  }
  win.style.transform = "none";
  const next = clampLargeSettlementShopPosition(
    Number(largeSettlementOverlayState.shopLeft) || 0,
    Number(largeSettlementOverlayState.shopTop) || 0
  );
  largeSettlementOverlayState.shopLeft = next.left;
  largeSettlementOverlayState.shopTop = next.top;
  win.style.left = `${next.left}px`;
  win.style.top = `${next.top}px`;
}

function bindLargeSettlementShopDragging() {
  const win = largeSettlementOverlayState.shopWindow;
  if (!win || largeSettlementOverlayState.shopDragBound) return;
  largeSettlementOverlayState.shopDragBound = true;

  const stopDrag = () => {
    if (!largeSettlementOverlayState.shopDragging) return;
    const activeWin = largeSettlementOverlayState.shopWindow;
    const moved = !!largeSettlementOverlayState.shopDragMoved;
    const pointerId = largeSettlementOverlayState.shopDragPointerId;
    largeSettlementOverlayState.shopDragging = false;
    largeSettlementOverlayState.shopDragPointerId = null;
    largeSettlementOverlayState.shopDragMoved = false;
    if (activeWin) {
      activeWin.classList.remove("is-dragging");
      if (pointerId != null && activeWin.hasPointerCapture?.(pointerId)) {
        try {
          activeWin.releasePointerCapture(pointerId);
        } catch (_) {
          // ignore pointer capture release errors
        }
      }
      if (!activeWin.classList.contains("is-edge-draggable")) {
        activeWin.style.cursor = "";
      }
    }
    if (moved) {
      largeSettlementOverlayState.shopSuppressClickUntil = performance.now() + LARGE_SETTLEMENT_SHOP_DRAG_CLICK_SUPPRESS_MS;
    }
  };

  win.addEventListener("pointermove", (event) => {
    const activeWin = largeSettlementOverlayState.shopWindow;
    if (!activeWin) return;
    if (largeSettlementOverlayState.shopDragging) {
      if (largeSettlementOverlayState.shopDragPointerId !== event.pointerId) return;
      const dx = event.clientX - largeSettlementOverlayState.shopDragStartX;
      const dy = event.clientY - largeSettlementOverlayState.shopDragStartY;
      if (!largeSettlementOverlayState.shopDragMoved) {
        largeSettlementOverlayState.shopDragMoved = Math.abs(dx) > 2 || Math.abs(dy) > 2;
      }
      const next = clampLargeSettlementShopPosition(
        largeSettlementOverlayState.shopDragStartLeft + dx,
        largeSettlementOverlayState.shopDragStartTop + dy
      );
      activeWin.style.left = `${next.left}px`;
      activeWin.style.top = `${next.top}px`;
      largeSettlementOverlayState.shopLeft = next.left;
      largeSettlementOverlayState.shopTop = next.top;
      largeSettlementOverlayState.shopHasCustomPosition = true;
      return;
    }
    const nearEdge = isLargeSettlementShopEdgeHot(activeWin, event.clientX, event.clientY);
    activeWin.classList.toggle("is-edge-draggable", nearEdge);
    activeWin.style.cursor = nearEdge ? "grab" : "";
  });

  win.addEventListener("pointerleave", () => {
    const activeWin = largeSettlementOverlayState.shopWindow;
    if (!activeWin || largeSettlementOverlayState.shopDragging) return;
    activeWin.classList.remove("is-edge-draggable");
    activeWin.style.cursor = "";
  });

  win.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const activeWin = largeSettlementOverlayState.shopWindow;
    const overlay = largeSettlementOverlayState.overlayEl;
    if (!activeWin || !overlay) return;
    const nearEdge = isLargeSettlementShopEdgeHot(activeWin, event.clientX, event.clientY);
    if (!nearEdge) return;
    event.preventDefault();
    event.stopPropagation();
    const winRect = activeWin.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const normalized = clampLargeSettlementShopPosition(
      winRect.left - overlayRect.left,
      winRect.top - overlayRect.top
    );
    largeSettlementOverlayState.shopHasCustomPosition = true;
    largeSettlementOverlayState.shopLeft = normalized.left;
    largeSettlementOverlayState.shopTop = normalized.top;
    activeWin.style.transform = "none";
    activeWin.style.left = `${normalized.left}px`;
    activeWin.style.top = `${normalized.top}px`;
    largeSettlementOverlayState.shopDragStartX = event.clientX;
    largeSettlementOverlayState.shopDragStartY = event.clientY;
    largeSettlementOverlayState.shopDragStartLeft = normalized.left;
    largeSettlementOverlayState.shopDragStartTop = normalized.top;
    largeSettlementOverlayState.shopDragPointerId = event.pointerId;
    largeSettlementOverlayState.shopDragMoved = false;
    largeSettlementOverlayState.shopDragging = true;
    activeWin.classList.add("is-dragging", "is-edge-draggable");
    activeWin.style.cursor = "grabbing";
    if (activeWin.setPointerCapture) {
      try {
        activeWin.setPointerCapture(event.pointerId);
      } catch (_) {
        // ignore pointer capture failures
      }
    }
  });

  win.addEventListener("pointerup", (event) => {
    if (
      !largeSettlementOverlayState.shopDragging
      || largeSettlementOverlayState.shopDragPointerId !== event.pointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    stopDrag();
  });

  win.addEventListener("pointercancel", stopDrag);
}

function setLargeSettlementShopVisibility(open) {
  const win = largeSettlementOverlayState.shopWindow;
  const toggle = largeSettlementOverlayState.shopToggleBtn;
  if (win) win.classList.toggle("hidden", !open);
  if (toggle) toggle.textContent = open ? "Close shop" : "Shop";
  if (win && open) {
    requestAnimationFrame(() => applyLargeSettlementShopPosition());
  }
  if (!open && win) {
    win.classList.remove("is-dragging", "is-edge-draggable");
    win.style.cursor = "";
    largeSettlementOverlayState.shopDragging = false;
    largeSettlementOverlayState.shopDragPointerId = null;
    largeSettlementOverlayState.shopDragMoved = false;
  }
  largeSettlementOverlayState.shopOpen = !!open;
}

function openLargeSettlementShop(state, node) {
  if (!state || !node) return;
  const list = largeSettlementOverlayState.shopList;
  const applyBtn = largeSettlementOverlayState.shopApplyBtn;
  const summaryEl = largeSettlementOverlayState.shopSummary;
  const ownedEl = document.getElementById("largeSettlementShopOwned");
  const spendingEl = document.getElementById("largeSettlementShopSpending");
  const statusEl = document.getElementById("largeSettlementShopStatus");
  const shopWindow = largeSettlementOverlayState.shopWindow;
  const title = largeSettlementOverlayState.shopTitle;
  if (!list || !applyBtn) return;
  const shopData = ensureLargeSettlementShopPool(node);
  const offers = shopData.offers;
  const unit = getActiveRangerUnit(state);
  const unitAtSettlement = (() => {
    if (!unit || !node) return false;
    if (unit.currentNodeId === node.id) return true;
    const pos = getUnitPositionPct(state, unit);
    if (pos && node.pos) {
      const dist = Math.hypot(pos.x - node.pos.x, pos.y - node.pos.y);
      return dist <= 1.4;
    }
    return false;
  })();
  const unitChits = unitAtSettlement && unit?.inventory
    ? Math.max(0, Number(unit.inventory.chits) || 0)
    : 0;
  const baseChits = unitChits;
  list.innerHTML = "";
  if (title) title.textContent = `${node.name || "Settlement"} Shop`;
  const pending = {};
  const selectionOrder = [];
  const rows = [];
  const showShopTooltip = (text) => {
    if (!shopWindow) return;
    let tip = shopWindow.querySelector(".shop-tooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "shop-tooltip";
      shopWindow.appendChild(tip);
    }
    tip.textContent = text;
    tip.classList.add("visible");
    if (largeSettlementOverlayState.shopTooltipTimeout) {
      clearTimeout(largeSettlementOverlayState.shopTooltipTimeout);
    }
    largeSettlementOverlayState.shopTooltipTimeout = setTimeout(() => {
      tip.classList.remove("visible");
    }, 2000);
  };
  const getPendingTotal = () => offers.reduce((sum, key) => sum + (pending[key] || 0), 0);
  const setShopStatus = (text = "", isWarning = false) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("is-warning", !!text && isWarning);
  };
  const describeShopLimit = (key, desired, { remainingChits = baseChits } = {}) => {
    const stock = Math.max(0, Number(shopData.pool?.[key]) || 0);
    const carryCapacity = Math.floor(getUnitRemainingCapacity(unit, key) / LARGE_SETTLEMENT_SHOP_RATE);
    if (remainingChits <= 0 || baseChits <= 0) {
      return "Unit is not carrying any chits.";
    }
    if (carryCapacity <= 0) {
      return `Unit cannot carry more ${fmtResourceKey(key)}.`;
    }
    if (stock <= 0) {
      return `${fmtResourceKey(key)} is sold out.`;
    }
    const maxForThis = Math.max(0, Math.min(stock, remainingChits, carryCapacity));
    if (desired > maxForThis || maxForThis <= 0) {
      if (remainingChits < stock && remainingChits <= carryCapacity) {
        return "Unit does not have enough chits for more supplies.";
      }
      if (carryCapacity < stock && carryCapacity <= remainingChits) {
        return `Unit has reached carrying capacity for ${fmtResourceKey(key)}.`;
      }
      if (stock < remainingChits && stock <= carryCapacity) {
        return `Only ${stock} ${fmtResourceKey(key)} available for trade.`;
      }
    }
    if (desired >= maxForThis && maxForThis > 0) {
      if (remainingChits < stock && remainingChits <= carryCapacity) {
        return "Unit has allocated all carried chits.";
      }
      if (carryCapacity < stock && carryCapacity <= remainingChits) {
        return `Unit is at carrying capacity for ${fmtResourceKey(key)}.`;
      }
      if (stock < remainingChits && stock <= carryCapacity) {
        return `Trade stock caps ${fmtResourceKey(key)} at ${stock}.`;
      }
    }
    return "";
  };
  const updateAll = () => {
    const pendingTotal = getPendingTotal();
    const overBudget = pendingTotal > baseChits;
    rows.forEach((row) => {
      const resourcePreview = Math.max(0, row.baseResource - (pending[row.key] || 0));
      const carryCapacity = Math.floor(getUnitRemainingCapacity(unit, row.key) / LARGE_SETTLEMENT_SHOP_RATE);
      setRollingCounterValue(row.resourceCounter, resourcePreview);
      row.slider.max = `${Math.max(0, Math.min(row.baseResource, baseChits, carryCapacity))}`;
      row.slider.disabled = row.baseResource <= 0 || carryCapacity <= 0;
    });
    applyBtn.disabled = pendingTotal <= 0;
    const isDisabled = overBudget || baseChits <= 0;
    applyBtn.classList.toggle("is-disabled", isDisabled);
    applyBtn.setAttribute("aria-disabled", isDisabled ? "true" : "false");
    if (summaryEl) {
      const activeKeys = selectionOrder
        .filter((key) => (pending[key] || 0) > 0)
        .concat(offers.filter((key) => (pending[key] || 0) > 0 && !selectionOrder.includes(key)));
      const summaryParts = activeKeys
        .map((key) => {
          const amount = pending[key] || 0;
          if (amount <= 0) return null;
          return `<span class="settlement-shop-summary-entry">${iconForResource(key)} ${amount}</span>`;
        })
        .filter(Boolean);
      summaryEl.innerHTML = summaryParts.length
        ? `Buying:<span class="settlement-shop-summary-lines">${summaryParts.join("")}</span>`
        : "Buying: --";
    }
    if (spendingEl) {
      spendingEl.innerHTML = `Spending: <span class="res-ic">${iconForResource("chits")}</span>${pendingTotal}`;
      spendingEl.classList.toggle("is-over", overBudget);
    }
    if (ownedEl) {
      ownedEl.innerHTML = `Carrying: <span class="res-ic">${iconForResource("chits")}</span>${baseChits}`;
    }
    if (!getPendingTotal()) {
      setShopStatus("");
    }
  };
  offers.forEach((key) => {
    const row = document.createElement("div");
    row.className = "home-loadout-row settlement-shop-row";
    const rowBody = document.createElement("div");
    rowBody.className = "home-loadout-body settlement-shop-body";
    const icon = document.createElement("div");
    icon.className = "home-loadout-icon";
    icon.textContent = `${iconForResource(key)}`;
    const baseResource = Math.max(0, shopData.pool?.[key] ?? 0);
    const resourceDigits = Math.max(2, `${baseResource}`.length);
    const resourceCounter = document.createElement("div");
    resourceCounter.className = "home-loadout-counter";
    const resourceCounterLabel = document.createElement("div");
    resourceCounterLabel.className = "home-loadout-counter-label";
    resourceCounterLabel.textContent = "FOR SALE";
    const resourceCounterValue = createRollingCounter(baseResource, resourceDigits);
    const resourceCounterValueWrap = document.createElement("div");
    resourceCounterValueWrap.className = "settlement-shop-counter-value";
    resourceCounterValueWrap.appendChild(resourceCounterValue);
    resourceCounter.appendChild(resourceCounterValueWrap);
    resourceCounter.appendChild(resourceCounterLabel);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "home-loadout-slider";
    slider.min = "0";
    slider.max = `${Math.min(baseChits, baseResource)}`;
    slider.step = "1";
    slider.value = "0";
    pending[key] = 0;
    const maxBtn = document.createElement("button");
    maxBtn.type = "button";
    maxBtn.className = "settlement-shop-max";
    maxBtn.textContent = "MAX";
    const updatePreview = (reason = "input") => {
      const rawDesired = parseInt(slider.value, 10);
      let desired = rawDesired;
      if (!Number.isFinite(desired)) desired = 0;
      const carryCapacity = Math.floor(getUnitRemainingCapacity(unit, key) / LARGE_SETTLEMENT_SHOP_RATE);
      const maxForThis = Math.max(0, Math.min(baseResource, baseChits, carryCapacity));
      desired = Math.max(0, Math.min(maxForThis, desired));
      if (`${desired}` !== slider.value) slider.value = `${desired}`;
      const prior = pending[key] || 0;
      pending[key] = desired;
      if (desired > 0 && prior <= 0 && !selectionOrder.includes(key)) {
        selectionOrder.push(key);
      } else if (desired <= 0 && prior > 0) {
        const orderIndex = selectionOrder.indexOf(key);
        if (orderIndex >= 0) selectionOrder.splice(orderIndex, 1);
      }
      updateAll();
      if (reason === "input" || reason === "max") {
        const attempted = Number.isFinite(rawDesired) ? rawDesired : desired;
        const pendingTotal = getPendingTotal();
        const remaining = Math.max(0, baseChits - (pendingTotal - desired));
        const status = describeShopLimit(key, attempted, { remainingChits: remaining });
        setShopStatus(status, !!status);
      }
    };
    slider.addEventListener("input", () => updatePreview("input"));
    slider.addEventListener("pointerdown", () => {
      if (baseChits <= 0) {
        setShopStatus("Unit is not carrying any chits.", true);
      }
    });
    maxBtn.addEventListener("click", () => {
      const pendingTotal = getPendingTotal();
      const withoutThis = pendingTotal - (pending[key] || 0);
      const remaining = Math.max(0, baseChits - withoutThis);
      const carryCapacity = Math.floor(getUnitRemainingCapacity(unit, key) / LARGE_SETTLEMENT_SHOP_RATE);
      const maxForThis = Math.max(0, Math.min(baseResource, remaining, carryCapacity));
      slider.value = `${maxForThis}`;
      updatePreview("max");
    });
    updatePreview("init");
    rowBody.appendChild(icon);
    rowBody.appendChild(slider);
    rowBody.appendChild(maxBtn);
    rowBody.appendChild(resourceCounter);
    row.appendChild(rowBody);
    list.appendChild(row);
    rows.push({
      key,
      slider,
      baseResource,
      resourceCounter: resourceCounterValue,
    });
  });
  applyBtn.onclick = () => {
    const pendingTotal = getPendingTotal();
    if (pendingTotal <= 0) return;
    if (baseChits <= 0) {
      setShopStatus("Unit is not carrying any chits.", true);
      showShopTooltip("Unit is not carrying any chits.");
      return;
    }
    if (pendingTotal > baseChits) {
      setShopStatus("Unit does not have enough chits for this trade.", true);
      showShopTooltip("Unit does not have enough chits.");
      return;
    }
    if (!unitAtSettlement || !unit?.inventory) return;
    ensureRangerHasResourceTypes(unit);
    const beforeChits = Math.max(0, Number(unit.inventory.chits) || 0);
    let totalPurchased = 0;
    offers.forEach((key) => {
      const amount = pending[key] || 0;
      if (amount > 0) {
        const stock = Math.max(0, Number(node.shopPool?.[key]) || 0);
        const capacity = Math.floor(getUnitRemainingCapacity(unit, key) / LARGE_SETTLEMENT_SHOP_RATE);
        const purchased = Math.min(amount, stock, Math.max(0, capacity));
        if (purchased <= 0) return;
        if (node.shopPool) {
          node.shopPool[key] = Math.max(0, stock - purchased);
        }
        if (unit.inventory[key] !== undefined) {
          unit.inventory[key] = (unit.inventory[key] || 0) + purchased * LARGE_SETTLEMENT_SHOP_RATE;
        }
        totalPurchased += purchased;
      }
    });
    if (totalPurchased <= 0) {
      setShopStatus("Unit has reached carrying capacity for the selected supplies.", true);
      showShopTooltip("Unit does not have room to carry those supplies.");
      return;
    }
    const spend = Math.min(totalPurchased, beforeChits);
    if (spend <= 0 || beforeChits < spend) return;
    unit.inventory.chits = beforeChits - spend;
    state.recordResourceLoss("settlement shop", "chits", spend);
    if (state.logger) {
      state.logger.log(`${node.name || "Settlement"} shop: Spent ${spend} chits on supplies.`);
    }
    if (typeof state.clampUnitInventory === "function") {
      state.clampUnitInventory(unit);
    }
    setShopStatus("");
    renderResources(state);
    refreshRangerPaneScene(state);
    openLargeSettlementShop(state, node);
  };
  updateAll();
}

// A dice box that fails to initialise, or a roll that never calls back, must not leave
// a settlement scene locked with its exit disabled. Resolves true only if the physical
// roll finished; callers fall back to plain random values otherwise.
const SETTLEMENT_DICE_TIMEOUT_MS = 6000;
async function rollSettlementDiceBox(box, notation) {
  if (!box?.roll) return false;
  let finished = false;
  try {
    await Promise.race([
      Promise.resolve(box.roll(notation)).then(() => { finished = true; }),
      wait(SETTLEMENT_DICE_TIMEOUT_MS),
    ]);
  } catch (err) {
    console.warn("Settlement dice roll failed", err);
  }
  return finished;
}

// Settlement resource dice read 0-5 (face label minus one).
function randomSettlementDieValue() {
  return Math.floor(Math.random() * 6);
}

function parseLargeSettlementRollValue(entry) {
  const labelVal = Number.parseInt(entry?.label, 10);
  if (Number.isFinite(labelVal)) return Math.max(0, labelVal - 1);
  const rawVal = entry?.value;
  return Number.isFinite(rawVal) ? Math.max(0, Math.trunc(rawVal) - 1) : 0;
}

async function rollLargeSettlementPersuasion() {
  if (!largeSettlementOverlayState.active || largeSettlementOverlayState.rolling) return;
  const state = getGlobalGameState();
  const nodeId = largeSettlementOverlayState.currentSettlementId;
  const node = nodeId ? state?.nodeMap?.get?.(nodeId) : null;
  if (!state || !node || node.id === "home") return;
  const messageText = largeSettlementOverlayState.messageEl?.querySelector(".loading-text");
  if (messageText) messageText.textContent = "rolling...";
  largeSettlementOverlayState.rolling = true;
  largeSettlementOverlayState.rollId += 1;
  const rollId = largeSettlementOverlayState.rollId;
  // `rolling` stays set until the outcome has been applied: clearing it when the die
  // lands would let a second click re-roll a check that is meant to be one attempt.
  const isStaleRoll = () => !largeSettlementOverlayState.active
    || largeSettlementOverlayState.rollId !== rollId
    || largeSettlementOverlayState.currentSettlementId !== nodeId;
  const releaseRoll = () => {
    if (largeSettlementOverlayState.rollId === rollId) largeSettlementOverlayState.rolling = false;
  };
  setOverlayExitEnabled(largeSettlementOverlayState, false);
  setOverlayDiceVisibility(largeSettlementOverlayState, true);
  if (largeSettlementOverlayState.diceWrapper) {
    largeSettlementOverlayState.diceWrapper.classList.add("rolling");
  }
  const unit = state ? getActiveRangerUnit(state) : null;
  const baseRoll = rollDeterministicDie(20);
  const rollInfo = applyRollModifiers(baseRoll, { state, unit, context: "settlement" });
  const naturalFace = rollInfo.baseRoll;
  const resolvedRoll = rollInfo.finalRoll;
  let box = null;
  try {
    box = await ensureLargeSettlementDiceBox();
  } catch (err) {
    console.warn("Large settlement dice unavailable", err);
  }
  const rollStart = nowMs();
  let dicePromise = null;
  if (box?.startClickThrow && box.rollDice) {
    try {
      box.notationVectors = box.startClickThrow("1d20");
      if (box.notationVectors) {
        box.notationVectors.result = [naturalFace];
      }
      dicePromise = new Promise((resolve) => {
        try {
          box.rollDice(() => resolve());
        } catch (err) {
          console.warn("Large settlement d20 rollDice failed", err);
          resolve();
        }
      });
    } catch (err) {
      console.warn("Large settlement d20 startClickThrow failed", err);
    }
  } else if (box?.roll) {
    try {
      dicePromise = box.roll("1d20");
    } catch (err) {
      console.warn("Large settlement d20 roll failed", err);
    }
  }
  await Promise.all([
    wait(900),
    Promise.race([
      Promise.resolve(dicePromise).catch(() => null),
      wait(SETTLEMENT_DICE_TIMEOUT_MS),
    ]),
  ]);
  if (box && !box.__firstVisibleRollLogged) {
    box.__firstVisibleRollLogged = true;
    logDiceWarmup("large settlement first visible roll", nowMs() - rollStart);
  }
  if (isStaleRoll()) {
    releaseRoll();
    return;
  }
  setOverlayDiceFace(largeSettlementOverlayState, naturalFace);
  if (largeSettlementOverlayState.diceWrapper) {
    largeSettlementOverlayState.diceWrapper.classList.remove("rolling");
  }
  if (messageText) {
    messageText.textContent = formatRollResultMessage("You rolled ", rollInfo);
  }
  applyOverlayDiceGlow(largeSettlementOverlayState, true);
  largeSettlementOverlayState.rollTimeout = setTimeout(() => applyOverlayDiceGlow(largeSettlementOverlayState, false), 1100);
  const content = getLargeSettlementContentForRoll(resolvedRoll);
  const narrative = content?.narrative || `You rolled ${resolvedRoll}.`;
  const outcome = content?.outcome || "";
  try {
    await wait(ROLL_TO_NARRATIVE_DELAY_MS);
    await displayLargeSettlementNarrative(narrative);
  } catch (err) {
    console.warn("Large settlement narrative failed", err);
  }
  if (isStaleRoll()) {
    releaseRoll();
    return;
  }
  displayLargeSettlementOutcomeText(outcome);
  setLargeSettlementBonusLine(rollInfo.bonusLine);
  largeSettlementOverlayState.diceRolled = true;
  releaseRoll();
  const passed = (outcome || "").trim().toLowerCase() === "pass";
  if (passed) {
    node.owner = "player";
    // The 3d6 resource roll that follows sets the real yields. Clearing the preset ones
    // means a scene left before that roll offers the roll again on re-entry.
    node.yields = null;
    largeSettlementOverlayState.rollStage = "enemy-ready";
    if (messageText) messageText.textContent = "";
    const neutralBtn = ensureNeutralSlotActionButton();
    if (neutralBtn) {
      neutralBtn.textContent = "Roll for resources";
      neutralBtn.style.display = "";
    }
    if (largeSettlementOverlayState.returnBtn) {
      largeSettlementOverlayState.returnBtn.style.display = "none";
    }
    setOverlayDiceVisibility(largeSettlementOverlayState, false);
  } else {
    node.conquestAttempted = true;
    largeSettlementOverlayState.rollStage = "failed";
    const neutralBtn = ensureNeutralSlotActionButton();
    if (neutralBtn) neutralBtn.style.display = "none";
    setOverlayExitEnabled(largeSettlementOverlayState, true);
  }
  renderMap(state);
}

  async function rollLargeSettlementResources() {
  if (!largeSettlementOverlayState.active || largeSettlementOverlayState.rolling) return;
  const state = getGlobalGameState();
  const nodeId = largeSettlementOverlayState.currentSettlementId;
  const node = nodeId ? state?.nodeMap?.get?.(nodeId) : null;
  if (!state || !node || node.id === "home") return;
  clearLargeSettlementDiceValue();
  const messageText = largeSettlementOverlayState.messageEl?.querySelector(".loading-text");
  if (messageText) messageText.textContent = "rolling...";
  largeSettlementOverlayState.rolling = true;
  largeSettlementOverlayState.rollId += 1;
  const rollId = largeSettlementOverlayState.rollId;
  const isStaleRoll = () => !largeSettlementOverlayState.active
    || largeSettlementOverlayState.rollId !== rollId
    || largeSettlementOverlayState.currentSettlementId !== nodeId;
  setOverlayExitEnabled(largeSettlementOverlayState, false);
  setOverlayDiceVisibility(largeSettlementOverlayState, true);
  if (largeSettlementOverlayState.diceWrapper) {
    largeSettlementOverlayState.diceWrapper.classList.add("rolling");
  }
  let box = null;
  try {
    box = await ensureLargeSettlementDiceBox();
  } catch (err) {
    console.warn("Large settlement dice unavailable", err);
  }
  if (box) box.__largeSettlementD6Index = 0;
  const rollStart = nowMs();
  const income = {
    gas: 0,
    components: 0,
    wood: 0,
  };
  const slotResource = largeSettlementOverlayState.neutralSlotResource;
  const isNeutralRoll = largeSettlementOverlayState.rollStage === "neutral-resources" && slotResource;
  let rolled = false;
  if (isNeutralRoll) {
    setLargeSettlementDiceResourceMode(box, slotResource);
    rolled = await rollSettlementDiceBox(box, "1d6");
    if (rolled) {
      const die = (box.diceList || []).find((entry) => entry?.shape === "d6") || null;
      const entry = die?.getLastValue ? die.getLastValue() : null;
      income[slotResource] = parseLargeSettlementRollValue(entry);
    } else {
      income[slotResource] = randomSettlementDieValue();
    }
    setLargeSettlementDiceResourceMode(box, null);
  } else {
    setLargeSettlementDiceResourceMode(box, null);
    rolled = await rollSettlementDiceBox(box, "3d6");
    if (rolled) {
      (box.diceList || []).forEach((die) => {
        if (!die?.__largeSettlementResource || die?.shape !== "d6") return;
        const entry = die.getLastValue ? die.getLastValue() : null;
        const val = parseLargeSettlementRollValue(entry);
        income[die.__largeSettlementResource] = val;
      });
    } else {
      Object.keys(income).forEach((key) => { income[key] = randomSettlementDieValue(); });
    }
  }
  if (isStaleRoll()) {
    // Scene was closed or replaced (load, restart) while the dice were in the air.
    if (largeSettlementOverlayState.rollId === rollId) largeSettlementOverlayState.rolling = false;
    return;
  }
  if (!rolled) setOverlayDiceVisibility(largeSettlementOverlayState, false);
  if (rolled && !box.__firstVisibleRollLogged) {
    box.__firstVisibleRollLogged = true;
    logDiceWarmup("large settlement first visible roll", nowMs() - rollStart);
  }
  largeSettlementOverlayState.neutralSlotResource = null;
    node.owner = "player";
    node.yields = income;
    node.shopOffers = null;
    node.shopPool = null;
    ensureLargeSettlementShopPool(node);
    setLargeSettlementShopToggleVisibility(true);
    if (messageText) messageText.textContent = "";
    const joinNarrative = hasResourceValues(income)
      ? `${node.name} joins your faction and commits steady supplies.`
      : `${node.name} joins your faction, although they have no spare supplies to provide.`;
    await displayLargeSettlementNarrative(joinNarrative);
    setLargeSettlementIncomeOutcome(income);
  largeSettlementOverlayState.diceRolled = true;
  largeSettlementOverlayState.rollStage = "complete";
  largeSettlementOverlayState.rolling = false;
  if (largeSettlementOverlayState.diceWrapper) {
    largeSettlementOverlayState.diceWrapper.classList.remove("rolling");
  }
  setOverlayExitEnabled(largeSettlementOverlayState, true);
  renderMap(state);
}

function handleLargeSettlementOverlayClick(event) {
  if (!largeSettlementOverlayState.active) return;
  if (performance.now() < (largeSettlementOverlayState.shopSuppressClickUntil || 0)) return;
  const target = event?.target;
  if (target?.closest?.("#largeSettlementShopWindow")) return;
  if (target?.closest?.("#largeSettlementShopToggle")) return;
  if (target?.closest?.("#largeSettlementReturnBtn")) return;
  if (largeSettlementOverlayState.rollStage === "persuasion") {
    rollLargeSettlementPersuasion();
    return;
  }
  if (largeSettlementOverlayState.rollStage === "neutral-ready") {
    return;
  }
  if (largeSettlementOverlayState.rollStage === "resources") {
    rollLargeSettlementResources();
    return;
  }
  if (largeSettlementOverlayState.rollStage === "neutral-resources") {
    rollLargeSettlementResources();
  }
}

function ensureCampDiceScene() {
  if (!ensureCampOverlayElements()) {
    campOverlayState.diceReadyPromise = campOverlayState.diceReadyPromise || Promise.resolve(null);
    return campOverlayState.diceReadyPromise;
  }
  return ensureDiceSceneForOverlay(campOverlayState, "campDiceHost");
}

function ensurePoiDiceScene() {
  if (!ensurePoiOverlayElements()) {
    poiOverlayState.diceReadyPromise = poiOverlayState.diceReadyPromise || Promise.resolve(null);
    return poiOverlayState.diceReadyPromise;
  }
  return ensureDiceSceneForOverlay(poiOverlayState, "poiDiceHost");
}

function ensureRandomDiceScene() {
  if (!ensureRandomOverlayElements()) {
    randomOverlayState.diceReadyPromise = randomOverlayState.diceReadyPromise || Promise.resolve(null);
    return randomOverlayState.diceReadyPromise;
  }
  return ensureDiceSceneForOverlay(randomOverlayState, "randomDiceHost");
}

function ensureBattleDiceScene() {
  if (!ensureBattleOverlayElements()) {
    battleOverlayState.diceReadyPromise = battleOverlayState.diceReadyPromise || Promise.resolve(null);
    return battleOverlayState.diceReadyPromise;
  }
  return ensureDiceSceneForOverlay(battleOverlayState, "battleDiceHost");
}

let dicePreloadStarted = false;
let diceSettlementPreloadStarted = false;

async function warmEncounterDiceScenes() {
  if (diceWarmupState.encounterDone) return;
  const warmups = [
    { label: "camp", ensure: ensureCampDiceScene, delay: 0 },
    { label: "poi", ensure: ensurePoiDiceScene, delay: 120 },
    { label: "random", ensure: ensureRandomDiceScene, delay: 240 },
    { label: "battle", ensure: ensureBattleDiceScene, delay: 360 },
  ];
  for (const entry of warmups) {
    await new Promise((resolve) => {
      scheduleDiceWarmupTask(async () => {
        const renderer = await entry.ensure();
        await renderer?.ensureWarm?.();
        resolve();
      }, entry.delay);
    });
  }
  diceWarmupState.encounterDone = true;
}

async function warmSettlementDiceScenes() {
  if (diceWarmupState.settlementDone) return;
  const warmups = [
    { label: "small settlement", ensure: ensureSmallSettlementDiceBox, delay: 0 },
    { label: "large settlement", ensure: ensureLargeSettlementDiceBox, delay: 180 },
  ];
  for (const entry of warmups) {
    await new Promise((resolve) => {
      scheduleDiceWarmupTask(async () => {
        const box = await entry.ensure();
        await performDiceBoxWarmup(box, {
          label: entry.label,
          getRestoreVolume: () => (typeof box?.volume === "number" ? box.volume : 0),
          setRestoreVolume: (volume) => {
            if (!box) return;
            const safeVolume = Number.isFinite(volume) ? volume : 0;
            box.volume = safeVolume;
            if (typeof box.setVolume === "function") box.setVolume(safeVolume);
          },
        });
        resolve();
      }, entry.delay);
    });
  }
  diceWarmupState.settlementDone = true;
}

function queueSettlementDiceWarmupOnce() {
  if (diceSettlementPreloadStarted) return;
  diceSettlementPreloadStarted = true;
  if (diceWarmupState.settlementQueued) return;
  diceWarmupState.settlementQueued = true;
  scheduleDiceWarmupTask(warmSettlementDiceScenes, 900);
}

function preloadAllDiceScenesOnce() {
  if (dicePreloadStarted) return;
  dicePreloadStarted = true;
  if (diceWarmupState.encounterQueued) return;
  diceWarmupState.encounterQueued = true;
  scheduleDiceWarmupTask(warmEncounterDiceScenes, 250);
  queueSettlementDiceWarmupOnce();
}

function ensureDiceSceneForOverlay(state, parentId) {
  if (!parentId) return null;
  const host = state.diceHost || document.getElementById(parentId);
  if (!host) {
    state.diceReadyPromise = Promise.resolve(null);
    return state.diceReadyPromise;
  }
  if (state.diceReadyPromise && state.diceRenderer) {
    return state.diceReadyPromise.then((renderer) => {
      renderer?.refreshLayout?.();
      return renderer;
    });
  }
  state.diceRenderer = new DiceBoxRenderer();
  state.diceScene = state.diceRenderer; // keep legacy references working (rollDice/resetPose/stopRolls)
  state.diceReadyPromise = state.diceRenderer.init(host).then((renderer) => {
    applySoundSettingsToDiceScenes();
    renderer?.refreshLayout?.();
    return renderer;
  });
  return state.diceReadyPromise;
}

  function ensureSceneOverlayElements(state, prefix, { onOverlayClick, onReturnClick, onResize } = {}) {
    if (
      state.overlayEl
      && state.canvas
      && state.ctx
      && state.messageEl
      && state.returnBtn
      && state.diceWrapper
      && state.diceHost
      && state.diceValueEl
    ) {
      if (!state.titleEl) {
        const title = document.getElementById(`${prefix}Title`);
        state.titleEl = title || null;
      }
      return true;
    }
    const overlay = document.getElementById(`${prefix}Overlay`);
    const canvas = document.getElementById(`${prefix}Canvas`);
    const message = document.getElementById(`${prefix}Message`);
    const title = document.getElementById(`${prefix}Title`);
    const returnBtn = document.getElementById(`${prefix}ReturnBtn`);
    const diceWrapper = document.getElementById(`${prefix}DiceWrapper`);
    const diceHost = document.getElementById(`${prefix}DiceHost`);
    const diceValueEl = document.getElementById(`${prefix}DiceValue`);
  const diceGlowEl = document.getElementById(`${prefix}DiceGlow`);
  if (!overlay || !canvas || !message || !returnBtn || !diceWrapper || !diceHost || !diceValueEl) return false;
    state.overlayEl = overlay;
    state.canvas = canvas;
    state.ctx = canvas.getContext("2d");
    state.messageEl = message;
    state.titleEl = title || null;
    state.returnBtn = returnBtn;
  state.diceWrapper = diceWrapper;
  state.diceHost = diceHost;
  state.diceValueEl = diceValueEl;
  state.diceGlowEl = diceGlowEl;
  guardOverlayPointerEvents(state);
  if (!state.clickListenerAttached && onOverlayClick) {
    overlay.addEventListener("click", onOverlayClick);
    state.clickListenerAttached = true;
  }
  if (state.returnBtn && !state.returnListenerAttached && onReturnClick) {
    state.returnBtn.addEventListener("click", onReturnClick);
    state.returnListenerAttached = true;
  }
  if (!state.resizeListenerAttached && onResize) {
    state.resizeListenerAttached = true;
    window.addEventListener("resize", () => {
      if (!state.active) return;
      if (state.pendingResize) return;
      state.pendingResize = true;
      requestAnimationFrame(() => {
        state.pendingResize = false;
        onResize();
      });
    });
  }
  return true;
}
function ensureCampOverlayElements() {
  if (
    campOverlayState.overlayEl
    && campOverlayState.canvas
    && campOverlayState.ctx
    && campOverlayState.messageEl
    && campOverlayState.returnBtn
    && campOverlayState.diceWrapper
    && campOverlayState.diceHost
    && campOverlayState.diceValueEl
  ) {
    return true;
  }
  const overlay = document.getElementById("campOverlay");
  const canvas = document.getElementById("campCanvas");
  const message = document.getElementById("campMessage");
   const returnBtn = document.getElementById("campReturnBtn");
  const diceWrapper = document.getElementById("campDiceWrapper");
  const diceHost = document.getElementById("campDiceHost");
  const diceValueEl = document.getElementById("campDiceValue");
  const diceGlowEl = document.getElementById("campDiceGlow");
  if (!overlay || !canvas || !message || !returnBtn || !diceWrapper || !diceHost || !diceValueEl) return false;
  campOverlayState.overlayEl = overlay;
  campOverlayState.canvas = canvas;
  campOverlayState.ctx = canvas.getContext("2d");
  campOverlayState.messageEl = message;
  campOverlayState.returnBtn = returnBtn;
  campOverlayState.diceWrapper = diceWrapper;
  campOverlayState.diceHost = diceHost;
  campOverlayState.diceValueEl = diceValueEl;
  campOverlayState.diceGlowEl = diceGlowEl;
  campOverlayState.titleEl = document.getElementById("campTitle") || null;
  guardOverlayPointerEvents(campOverlayState);
  if (!campOverlayState.clickListenerAttached) {
    overlay.addEventListener("click", handleCampOverlayClick);
    campOverlayState.clickListenerAttached = true;
  }
  if (campOverlayState.returnBtn && !campOverlayState.returnListenerAttached) {
    campOverlayState.returnBtn.addEventListener("click", handleCampReturnClick);
    campOverlayState.returnListenerAttached = true;
  }
  if (!campOverlayState.resizeListenerAttached) {
    campOverlayState.resizeListenerAttached = true;
    window.addEventListener("resize", () => {
      if (!campOverlayState.active) return;
      if (campOverlayState.pendingResize) return;
      campOverlayState.pendingResize = true;
      requestAnimationFrame(() => {
        campOverlayState.pendingResize = false;
        sizeCampCanvas();
        const eff = campOverlayState.effect;
        const lastPixel = eff?.lastPixelSize || 1;
        const lastVignette = eff?.lastVignetteAlpha ?? 1;
        drawCampFrame(lastPixel, lastVignette, performance.now());
      });
    });
  }
  return true;
}

function sizeOverlayCanvasFor(state) {
  if (!state?.canvas || !state.overlayEl) return null;
  const rect = state.overlayEl.getBoundingClientRect
    ? state.overlayEl.getBoundingClientRect()
    : null;
  const width = Math.max(1, Math.floor(rect?.width || window.innerWidth || state.canvas.clientWidth || 1));
  const height = Math.max(1, Math.floor(rect?.height || window.innerHeight || state.canvas.clientHeight || 1));
  if (state.canvas.width !== width || state.canvas.height !== height) {
    state.canvas.width = width;
    state.canvas.height = height;
  }
  return { width, height };
}

function sizeCampCanvas() {
  return sizeOverlayCanvasFor(campOverlayState);
}

function sizePoiCanvas() {
  return sizeOverlayCanvasFor(poiOverlayState);
}

function sizeRandomCanvas() {
  return sizeOverlayCanvasFor(randomOverlayState);
}

function sizeBattleCanvas() {
  return sizeOverlayCanvasFor(battleOverlayState);
}

function sizeSettlementCanvas() {
  return sizeOverlayCanvasFor(settlementOverlayState);
}

function sizeLargeSettlementCanvas() {
  return sizeOverlayCanvasFor(largeSettlementOverlayState);
}

function loadCampImage() {
  if (campOverlayState.ready && campOverlayState.image) return Promise.resolve(campOverlayState.image);
  if (!campOverlayState.loadPromise) {
    campOverlayState.loadPromise = loadImageElement("assets/camp.jpg")
      .then((img) => {
        campOverlayState.image = img;
        campOverlayState.ready = true;
        return img;
      })
      .catch((err) => {
        campOverlayState.ready = false;
        campOverlayState.image = null;
        campOverlayState.loadPromise = null;
        console.warn("Camp splash failed to load", err);
        throw err;
      });
  }
  return campOverlayState.loadPromise;
}

function loadPoiImage() {
  if (poiOverlayState.ready && poiOverlayState.image) return Promise.resolve(poiOverlayState.image);
  if (!poiOverlayState.loadPromise) {
    poiOverlayState.loadPromise = loadImageElement("assets/poi.jpg")
      .then((img) => {
        poiOverlayState.image = img;
        poiOverlayState.ready = true;
        return img;
      })
      .catch((err) => {
        poiOverlayState.ready = false;
        poiOverlayState.image = null;
        poiOverlayState.loadPromise = null;
        console.warn("POI splash failed to load", err);
        throw err;
      });
  }
  return poiOverlayState.loadPromise;
}

function loadRandomImage() {
  if (randomOverlayState.ready && randomOverlayState.image) return Promise.resolve(randomOverlayState.image);
  if (!randomOverlayState.loadPromise) {
    randomOverlayState.loadPromise = loadImageElement("assets/random.jpg")
      .then((img) => {
        randomOverlayState.image = img;
        randomOverlayState.ready = true;
        return img;
      })
      .catch((err) => {
        randomOverlayState.ready = false;
        randomOverlayState.image = null;
        randomOverlayState.loadPromise = null;
        console.warn("Random splash failed to load", err);
        throw err;
      });
  }
  return randomOverlayState.loadPromise;
}

function loadBattleImage() {
  if (battleOverlayState.ready && battleOverlayState.image) return Promise.resolve(battleOverlayState.image);
  if (!battleOverlayState.loadPromise) {
    battleOverlayState.loadPromise = loadImageElement("assets/battle.jpg")
      .then((img) => {
        battleOverlayState.image = img;
        battleOverlayState.ready = true;
        return img;
      })
      .catch((err) => {
        battleOverlayState.ready = false;
        battleOverlayState.image = null;
        battleOverlayState.loadPromise = null;
        console.warn("Battle splash failed to load", err);
        throw err;
      });
  }
  return battleOverlayState.loadPromise;
}

function settlementImagePath(state, name) {
  if (state === settlementOverlayState) {
    return "assets/images/settlement.jpg";
  }
  if (!name) return "assets/settlement.jpg";
  const override = SETTLEMENT_IMAGE_OVERRIDES[name];
  if (override) return override;
  if (name === SETTLEMENT_NAMES.home) return "assets/images/home.jpg";
  return `assets/images/${encodeURIComponent(name)}.jpg`;
}

function loadSettlementSceneImage(state, settlementName) {
  if (!state) return Promise.resolve(null);
  const path = settlementImagePath(state, settlementName);
  if (!path) return Promise.resolve(null);
  if (state.imageKey === path && state.ready && state.image) {
    return Promise.resolve(state.image);
  }
  const cached = state.imageCache?.get(path);
  if (cached) {
    state.image = cached;
    state.imageKey = path;
    state.ready = true;
    return Promise.resolve(cached);
  }
  if (!state.loadPromise || state.loadPromiseKey !== path) {
    state.loadPromiseKey = path;
    state.loadPromise = loadImageElement(path)
      .then((img) => {
        state.image = img;
        state.imageKey = path;
        state.ready = true;
        if (state.imageCache) state.imageCache.set(path, img);
        state.loadPromise = null;
        return img;
      })
      .catch((err) => {
        state.ready = false;
        state.image = null;
        state.loadPromise = null;
        console.warn("Settlement splash failed to load", err);
        throw err;
      });
  }
  return state.loadPromise;
}

function cancelOverlayRollState(state) {
  const eff = state?.effect;
  if (eff?.rafId) {
    cancelAnimationFrame(eff.rafId);
  }
  state.effect = null;
  state.rollId = (state?.rollId || 0) + 1;
  if (state.messageTimeout) {
    clearTimeout(state.messageTimeout);
    state.messageTimeout = null;
  }
  if (state.rollRafId) {
    cancelAnimationFrame(state.rollRafId);
    state.rollRafId = null;
  }
  if (state.rollTimeout) {
    clearTimeout(state.rollTimeout);
    state.rollTimeout = null;
  }
  if (state.diceScene?.stopRolls) {
    state.diceScene.stopRolls();
  }
  state.rolling = false;
  if (state.diceWrapper) {
    state.diceWrapper.classList.remove("rolling");
  }
  applyOverlayDiceGlow(state, false);
  setOverlayExitEnabled(state, false);
}

function cancelCampEffect() {
  cancelOverlayRollState(campOverlayState);
  applyCampDiceGlow(false);
}

function cancelPoiEffect() {
  cancelOverlayRollState(poiOverlayState);
  applyPoiDiceGlow(false);
}

function cancelRandomEffect() {
  cancelOverlayRollState(randomOverlayState);
  applyRandomDiceGlow(false);
}

function cancelBattleEffect() {
  cancelOverlayRollState(battleOverlayState);
  applyBattleDiceGlow(false);
}

function getEncounterBadgeAlpha(state) {
  if (state?.badgeHiddenUntilRoll) return 0;
  if (!state?.badgeFadeStart) return 1;
  const duration = state.badgeFadeDuration || ENCOUNTER_BADGE_FADE_MS;
  const elapsed = performance.now() - state.badgeFadeStart;
  if (elapsed <= 0) return 0;
  if (elapsed >= duration) {
    state.badgeFadeStart = null;
    return 1;
  }
  return Math.max(0, Math.min(1, elapsed / duration));
}

function stopEncounterBadgeFade(state) {
  if (!state) return;
  if (state.badgeFadeRafId) {
    cancelAnimationFrame(state.badgeFadeRafId);
  }
  state.badgeFadeRafId = null;
  state.badgeFadeStart = null;
  state.badgeFadeDuration = 0;
}

function startEncounterBadgeFade(state, drawFrame) {
  if (!state || typeof drawFrame !== "function") return;
  if (state.badgeFadeRafId) {
    cancelAnimationFrame(state.badgeFadeRafId);
  }
  const start = (typeof state.badgeFadeStart === "number" && state.badgeFadeStart > 0)
    ? state.badgeFadeStart
    : performance.now();
  state.badgeFadeStart = start;
  state.badgeFadeDuration = ENCOUNTER_BADGE_FADE_MS;
  const step = (now) => {
    if (!state.active) {
      stopEncounterBadgeFade(state);
      return;
    }
    drawFrame();
    if (now - start < ENCOUNTER_BADGE_FADE_MS) {
      state.badgeFadeRafId = requestAnimationFrame(step);
    } else {
      state.badgeFadeRafId = null;
    }
  };
  state.badgeFadeRafId = requestAnimationFrame(step);
}

function getPendingEncounterFrameData(sceneKey = null) {
  const selection = ensureActiveEncounter(sceneKey);
  const hasCached = currentEncounterBadge.image && currentEncounterBadge.sw > 0 && currentEncounterBadge.sh > 0;
  const matches = hasCached
    && currentEncounterBadge.textureKey === selection.textureKey
    && currentEncounterBadge.frameKey === selection.frameKey;
  if (matches) {
    return { ...currentEncounterBadge };
  }
  const refreshed = syncEncounterBadgeFromSelection(selection);
  if (refreshed && refreshed.image && refreshed.sw > 0 && refreshed.sh > 0) {
    return refreshed;
  }
  return null;
}

function drawEncounterBadge(ctx, width, height, {
  pad = 14,
  maxFraction = 0.7,
  sceneKey = null,
  alpha = 1,
  glow = false,
} = {}) {
  if (!ctx || !width || !height) return;
  const frame = getPendingEncounterFrameData(sceneKey);
  if (!frame) return;
  const maxW = Math.max(12, width * maxFraction - pad * 2);
  const maxH = Math.max(12, height * maxFraction - pad * 2);
  if (maxW <= 0 || maxH <= 0) return;
  const scale = Math.min(maxW / frame.sw, maxH / frame.sh);
  const dw = frame.sw * scale;
  const dh = frame.sh * scale;
  const dx = width - dw - pad;
  const dy = pad;
  const badgeAlpha = Math.max(0, Math.min(1, typeof alpha === "number" ? alpha : 1));
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.97 * badgeAlpha;
 // ctx.fillStyle = "rgba(5, 8, 5, 0.45)";
 // ctx.fillRect(dx - pad * 0.35, dy - pad * 0.35, dw + pad * 0.7, dh + pad * 0.7);
  if (glow) {
    const blur = Math.max(6, Math.round(Math.max(dw, dh) * 0.08));
    ctx.save();
    if ("filter" in ctx) {
      ctx.filter = `drop-shadow(0 0 ${blur}px ${ENCOUNTER_BADGE_GLOW_COLOR})`;
    } else {
      ctx.shadowColor = ENCOUNTER_BADGE_GLOW_COLOR;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
    ctx.restore();
  }
  ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
  ctx.restore();
}

function drawPoiPrizeBadge(ctx, width, height, state, {
  pad = 16,
  maxFraction = ENCOUNTER_BADGE_MAX_FRACTION,
  alpha = 1,
  now = 0,
} = {}) {
  if (!ctx || !width || !height || !state?.prizeBadge?.image) return;
  const frame = state.prizeBadge;
  const maxW = Math.max(12, width * maxFraction - pad * 2);
  const maxH = Math.max(12, height * maxFraction - pad * 2);
  if (maxW <= 0 || maxH <= 0) return;
  const scale = Math.min(maxW / frame.sw, maxH / frame.sh) * POI_PRIZE_BADGE_SCALE_MULTIPLIER;
  const dw = frame.sw * scale;
  const dh = frame.sh * scale;
  const dx = width - dw - pad;
  const dy = pad;
  const badgeAlpha = Math.max(0, Math.min(1, typeof alpha === "number" ? alpha : 1));
  if (badgeAlpha <= 0.001) return;
  const pulse = 0.9 + 0.1 * Math.sin((now || performance.now()) * (Math.PI * 2) / 2000);
  const cx = dx + dw * 0.5;
  const cy = dy + dh * 0.5;
  const auraRadius = Math.max(dw, dh) * 0.42 * pulse;
  ctx.save();
  ctx.globalAlpha = badgeAlpha;
  const aura = ctx.createRadialGradient(cx, cy, Math.max(1, auraRadius * 0.08), cx, cy, auraRadius);
  aura.addColorStop(0, "rgba(255, 246, 206, 0.65)");
  aura.addColorStop(0.5, "rgba(255, 210, 140, 0.35)");
  aura.addColorStop(1, "rgba(255, 166, 86, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(dx - auraRadius, dy - auraRadius, dw + auraRadius * 2, dh + auraRadius * 2);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = badgeAlpha;
  ctx.imageSmoothingEnabled = true;
  const glowScale = Math.max(dw, dh);
  const blur1 = Math.max(4, Math.round(glowScale * 0.01 * pulse));
  const blur2 = Math.max(7, Math.round(glowScale * 0.02 * pulse));
  const blur3 = Math.max(11, Math.round(glowScale * 0.04 * pulse));
  if ("filter" in ctx) {
    ctx.filter = `drop-shadow(0 0 ${blur3}px ${POI_PRIZE_GLOW_COLORS[2]}) drop-shadow(0 0 ${blur2}px ${POI_PRIZE_GLOW_COLORS[1]}) drop-shadow(0 0 ${blur1}px ${POI_PRIZE_GLOW_COLORS[0]})`;
    ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
    ctx.filter = "none";
  } else {
    ctx.shadowColor = POI_PRIZE_GLOW_COLORS[1];
    ctx.shadowBlur = blur2;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = badgeAlpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
  ctx.restore();
}

function drawStaticOverlayFrame(state, {
  scaleFactor = CAMP_SCALE,
  vignetteStrength = 1,
  fillColor = "rgba(5, 8, 5, 0.9)",
  sceneKey = null,
  drawBadge = true,
} = {}) {
  if (!state?.ctx) return;
  const dims = sizeOverlayCanvasFor(state);
  const ctx = state.ctx;
  if (!dims || !ctx) return;
  const { width, height } = dims;
  const img = state.image;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, width, height);
  if (img) {
    const scaleData = computeEncounterScale(width, height, img, scaleFactor);
    const dw = scaleData.dw || width;
    const dh = scaleData.dh || height;
    const dx = (width - dw) * 0.5;
    const dy = (height - dh) * 0.5;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  const strength = Math.min(1, Math.max(0, vignetteStrength));
  ctx.save();
  const maxDim = Math.max(width, height);
  const radiusInner = maxDim * 0.24;
  const radiusOuter = maxDim * 0.4;
  const vignette = ctx.createRadialGradient(width / 2, height / 2, radiusInner, width / 2, height / 2, radiusOuter);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.7, `rgba(0,0,0,${0.12 * strength})`);
  vignette.addColorStop(1, `rgba(0,0,0,${0.9 * strength})`);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  if (drawBadge) {
    drawEncounterBadge(ctx, width, height, {
      pad: 16,
      maxFraction: ENCOUNTER_BADGE_MAX_FRACTION,
      sceneKey,
      alpha: getEncounterBadgeAlpha(state),
      glow: true,
    });
  }
  ctx.restore();
  state.effect = { ...(state.effect || {}), lastVignetteAlpha: strength };
}

function drawCampFrame(pixelSize = 1, vignetteAlpha = 1, timestamp = null) {
  if (!ensureCampOverlayElements()) return;
  const dims = sizeCampCanvas();
  const ctx = campOverlayState.ctx;
  const img = campOverlayState.image;
  if (!dims || !ctx) return;
  const { width, height } = dims;
  const step = Math.max(1, Math.floor(pixelSize || 1));
  const eff = campOverlayState.effect || {};
  const now = typeof timestamp === "number" ? timestamp : performance.now();
  const rawDrift = 0;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(5, 8, 5, 0.92)";
  ctx.fillRect(0, 0, width, height);
  const scaleData = img ? computeEncounterScale(width, height, img, CAMP_SCALE) : { scale: 1, dw: width, dh: height };
  const dw = scaleData.dw || width;
  const dh = scaleData.dh || height;
  const dx = (width - dw) * 0.5;
  const dy = (height - dh) * 0.5;
  let driftedDx = dx;
  if (img) {
    const driftAmplitude = 0;
    const drift = rawDrift * driftAmplitude;
    driftedDx = dx + drift;
    if (step === 1) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, driftedDx, dy, dw, dh);
    } else {
      const offscreen = campOverlayState.offscreen || document.createElement("canvas");
      campOverlayState.offscreen = offscreen;
      offscreen.width = Math.max(1, Math.ceil(dw / step));
      offscreen.height = Math.max(1, Math.ceil(dh / step));
      const octx = offscreen.getContext("2d");
      octx.clearRect(0, 0, offscreen.width, offscreen.height);
      const miniScale = Math.min(offscreen.width / img.width, offscreen.height / img.height); 
      const miniDw = img.width * miniScale;
      const miniDh = img.height * miniScale;
      const miniDx = (offscreen.width - miniDw) * 0.5;
      const miniDy = (offscreen.height - miniDh) * 0.5;
      octx.drawImage(img, miniDx, miniDy, miniDw, miniDh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, 0, 0, offscreen.width, offscreen.height, driftedDx, dy, dw, dh);
    }
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.fillRect(0, 0, width, height);
  }
  drawFlames(ctx, eff, img, scaleData, driftedDx ?? dx, dy, now, CAMP_FLAME_POINTS, 0.48);
  const strength = Math.min(1, Math.max(0, vignetteAlpha || 0));
  ctx.save();
  const maxDim = Math.max(width, height);
  const radiusInner = maxDim * 0.22;
  const radiusOuter = maxDim * 0.38;
  const vignette = ctx.createRadialGradient(width / 2, height / 2, radiusInner, width / 2, height / 2, radiusOuter);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.7, `rgba(0,0,0,${0.1 * strength})`);
  vignette.addColorStop(1, `rgba(0,0,0,${0.9 * strength})`);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  drawEncounterBadge(ctx, width, height, { pad: 16, maxFraction: CAMP_BADGE_MAX_FRACTION });
  ctx.restore();
  eff.lastPixelSize = step;
  eff.lastVignetteAlpha = strength;
  campOverlayState.effect = eff;
}

function drawPoiFrame() {
  if (!ensurePoiOverlayElements()) return;
  drawStaticOverlayFrame(poiOverlayState, {
    vignetteStrength: 1,
    fillColor: "rgba(5, 8, 5, 0.88)",
    sceneKey: null,
    drawBadge: false,
  });
  const dims = sizeOverlayCanvasFor(poiOverlayState);
  if (!dims || !poiOverlayState.ctx) return;
  drawPoiPrizeBadge(poiOverlayState.ctx, dims.width, dims.height, poiOverlayState, {
    pad: 16,
    maxFraction: ENCOUNTER_BADGE_MAX_FRACTION,
    alpha: getEncounterBadgeAlpha(poiOverlayState),
    now: performance.now(),
  });
}

function drawRandomFrame() {
  if (!ensureRandomOverlayElements()) return;
  drawStaticOverlayFrame(randomOverlayState, { vignetteStrength: 1, fillColor: "rgba(5, 8, 5, 0.92)", sceneKey: "random" });
}

function drawBattleFrame() {
  if (!ensureBattleOverlayElements()) return;
  drawStaticOverlayFrame(battleOverlayState, { vignetteStrength: 1, fillColor: "rgba(5, 8, 5, 0.94)", sceneKey: "battle" });
}

function drawSettlementOverlayFrame(state, pixelSize = 1, vignetteAlpha = 1, timestamp = null) {
  if (!state?.ctx) return;
  const dims = sizeOverlayCanvasFor(state);
  const ctx = state.ctx;
  const img = state.image;
  if (!dims || !ctx) return;
  const { width, height } = dims;
  const step = Math.max(1, Math.floor(pixelSize || 1));
  const eff = state.effect || {};
  const now = typeof timestamp === "number" ? timestamp : performance.now();
  const isHomeScene = state === largeSettlementOverlayState && state.currentSettlementId === "home";
  let scaleData = null;
  let dx = 0;
  let dy = 0;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(4, 6, 4, 0.92)";
  ctx.fillRect(0, 0, width, height);
  if (img) {
    scaleData = computeEncounterScale(width, height, img, CAMP_SCALE);
    const dw = scaleData.dw || width;
    const dh = scaleData.dh || height;
    dx = (width - dw) * 0.5;
    dy = (height - dh) * 0.5;
    if (step === 1) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      const offscreen = state.offscreen || document.createElement("canvas");
      state.offscreen = offscreen;
      offscreen.width = Math.max(1, Math.ceil(dw / step));
      offscreen.height = Math.max(1, Math.ceil(dh / step));
      const octx = offscreen.getContext("2d");
      octx.clearRect(0, 0, offscreen.width, offscreen.height);
      const miniScale = Math.min(offscreen.width / img.width, offscreen.height / img.height);
      const miniDw = img.width * miniScale;
      const miniDh = img.height * miniScale;
      const miniDx = (offscreen.width - miniDw) * 0.5;
      const miniDy = (offscreen.height - miniDh) * 0.5;
      octx.drawImage(img, miniDx, miniDy, miniDw, miniDh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, 0, 0, offscreen.width, offscreen.height, dx, dy, dw, dh);
    }
    if (isHomeScene) {
      drawHomeSceneLights(ctx, eff, img, scaleData, dx, dy, now);
    }
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.fillRect(0, 0, width, height);
  }
  const strength = Math.min(1, Math.max(0, vignetteAlpha || 0));
  ctx.save();
  const maxDim = Math.max(width, height);
  const radiusInner = maxDim * 0.24;
  const radiusOuter = maxDim * 0.4;
  const vignette = ctx.createRadialGradient(width / 2, height / 2, radiusInner, width / 2, height / 2, radiusOuter);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.7, `rgba(0,0,0,${0.12 * strength})`);
  vignette.addColorStop(1, `rgba(0,0,0,${0.9 * strength})`);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  state.effect = { ...eff, lastPixelSize: step, lastVignetteAlpha: strength, lastDrawTime: now };
}

function drawSettlementFrame(pixelSize = 1, vignetteAlpha = 1, timestamp = null) {
  if (!ensureSettlementOverlayElements()) return;
  drawSettlementOverlayFrame(settlementOverlayState, pixelSize, vignetteAlpha, timestamp);
}

function drawLargeSettlementFrame(pixelSize = 1, vignetteAlpha = 1, timestamp = null) {
  if (!ensureLargeSettlementOverlayElements()) return;
  const isHome = largeSettlementOverlayState.currentSettlementId === "home";
  drawSettlementOverlayFrame(
    largeSettlementOverlayState,
    pixelSize,
    isHome ? 0 : vignetteAlpha,
    timestamp
  );
}

  async function toggleStaticOverlay(state, show, {
    ensureElements,
    loadImage,
    sizeCanvas,
    drawFrame,
  resetUI,
  cancelEffect,
  diceEnsure,
  messageDelay = 200,
  sceneKey = null,
} = {}) {
  if (!ensureElements || !drawFrame || !resetUI || !cancelEffect || !sizeCanvas) return;
  if (!ensureElements()) return;
  const overlay = state.overlayEl;
  const message = state.messageEl;
  if (!overlay) return;
    if (!show) {
      state.pendingOutcome = null;
      if (state.active && !state.exitEnabled) return;
      state.active = false;
      state.opening = false;
      resetEncounterRollGate();
      refreshEndTurnButtonAvailability();
      stopEncounterBadgeFade(state);
      cancelEffect();
      setOverlayExitEnabled(state, false);
      setOverlayDiceVisibility(state, false);
      if (state.titleEl) {
        state.titleEl.textContent = "";
        state.titleEl.classList.add("hidden");
      }
      overlay.classList.add("hidden");
      overlay.style.opacity = "0";
      if (message) {
        message.classList.remove("visible");
      }
    resetSceneMessageVisuals(sceneKey);
    return;
  }
    cancelEncounterTimer({ preservePending: true });
    if (isOtherSceneLocked(state)) return;
    hideAllSceneOverlays(state);
    closeMapPanes(
      mapSceneInstance?.gameState || getGlobalGameState(),
      { keepSelection: true }
    );
    if (state.titleEl) {
      const titleText = sceneKey ? STATIC_SCENE_TITLES[sceneKey] : "";
      if (titleText) {
        state.titleEl.textContent = titleText;
        state.titleEl.classList.remove("hidden");
      } else {
        state.titleEl.textContent = "";
        state.titleEl.classList.add("hidden");
      }
    }
  state.active = true;
  // The scene is clickable while its art is still loading. A roll started in that
  // window would be thrown away by cancelEffect() below with the one-roll gate already
  // spent, so rolls are refused until the scene has finished opening.
  state.opening = true;
  state.openingSince = performance.now();
  resetEncounterRollGate();
  refreshEndTurnButtonAvailability();
  resetUI();
  stopEncounterBadgeFade(state);
  state.badgeFadeStart = performance.now();
  state.badgeFadeDuration = ENCOUNTER_BADGE_FADE_MS;
  resetSceneMessageVisuals(sceneKey);
  setOverlayExitEnabled(state, false);
  overlay.classList.remove("hidden");
  overlay.style.opacity = "0";
  setOverlayDiceVisibility(state, false);
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
  });
  if (message) {
    message.classList.remove("visible");
  }
  if (state.returnBtn) {
    state.returnBtn.disabled = false;
  }
  sizeCanvas();
  if (loadImage) {
    try {
      await loadImage();
    } catch (_) {
      // Missing art shouldn't block showing the scene.
    }
  }
  cancelEffect();
  state.opening = false;
  drawFrame();
  startEncounterBadgeFade(state, drawFrame);
  if (message) {
    state.messageTimeout = setTimeout(() => {
      if (state.active) {
        message.classList.add("visible");
      }
    }, messageDelay);
  }
}

async function toggleCampOverlay(show) {
  if (!ensureCampOverlayElements()) return;
  const overlay = campOverlayState.overlayEl;
  const message = campOverlayState.messageEl;
  if (!overlay) return;
  if (!show) {
    campOverlayState.pendingOutcome = null;
    if (campOverlayState.active && !campOverlayState.exitEnabled) return;
    campOverlayState.active = false;
    campOverlayState.opening = false;
    refreshEndTurnButtonAvailability();
    cancelCampEffect();
    setOverlayExitEnabled(campOverlayState, false);
    setOverlayDiceVisibility(campOverlayState, false);
    if (campOverlayState.titleEl) {
      campOverlayState.titleEl.textContent = "";
      campOverlayState.titleEl.classList.add("hidden");
    }
    overlay.classList.add("hidden");
    overlay.style.opacity = "0";
    if (message) {
      message.classList.remove("visible");
    }
    resetSceneMessageVisuals("camp");
    resetEncounterRollGate();
    return;
  }
  cancelEncounterTimer({ preservePending: true });
  if (isOtherSceneLocked(campOverlayState)) return;
  hideAllSceneOverlays(campOverlayState);
  closeMapPanes(
    mapSceneInstance?.gameState || getGlobalGameState(),
    { keepSelection: true }
  );
  campOverlayState.active = true;
  campOverlayState.opening = true;
  campOverlayState.openingSince = performance.now();
  refreshEndTurnButtonAvailability();
  resetCampDiceUI();
  resetEncounterRollGate();
  resetSceneMessageVisuals("camp");
  if (campOverlayState.titleEl) {
    const titleText = STATIC_SCENE_TITLES["camp"];
    if (titleText) {
      campOverlayState.titleEl.textContent = titleText;
      campOverlayState.titleEl.classList.remove("hidden");
    }
  }
  setOverlayExitEnabled(campOverlayState, false);
  overlay.classList.remove("hidden");
  overlay.style.opacity = "0";
  setOverlayDiceVisibility(campOverlayState, false);
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
  });
  if (message) {
    message.classList.remove("visible");
  }
  sizeCampCanvas();
  try {
    await loadCampImage();
  } catch (_) {
    // If camp art is missing, keep overlay visible with vignette.
  }
  cancelCampEffect();
  campOverlayState.opening = false;
  const dims = sizeCampCanvas() || { width: window.innerWidth, height: window.innerHeight };
  const img = campOverlayState.image;
  const scaleData = img ? computeEncounterScale(dims.width, dims.height, img, CAMP_SCALE) : { scale: 1, dw: dims.width, dh: dims.height };
  const dw = scaleData.dw || dims.width;
  const driftAmplitude = 0;
  const maxPixel = Math.max(14, Math.ceil(Math.max(dims.width, dims.height) / 24));
  const fadeDuration = 220;
  const revealDuration = 620;
  const start = performance.now();
  const effect = {
    rafId: null,
    start,
    fadeDuration,
    revealDuration,
    lastPixelSize: maxPixel,
    lastVignetteAlpha: 0,
    driftAmplitude,
    driftDuration: 0,
    flameSeeds: CAMP_FLAME_POINTS.map(() => Math.random() * 1000),
  };
  const step = (now) => {
    if (!campOverlayState.active) {
      cancelCampEffect();
      return;
    }
    const elapsed = now - start;
    const fadeT = Math.min(1, elapsed / fadeDuration);
    const revealT = elapsed <= fadeDuration ? 0 : Math.min(1, (elapsed - fadeDuration) / revealDuration);
    const pixelSize = elapsed <= fadeDuration
      ? maxPixel
      : Math.max(1, maxPixel - (maxPixel - 1) * revealT);
    const vignetteAlpha = Math.max(fadeT, revealT);
    drawCampFrame(pixelSize, vignetteAlpha, now);
    effect.rafId = requestAnimationFrame(step);
  };
  campOverlayState.effect = effect;
  effect.rafId = requestAnimationFrame(step);
  if (message) {
    const delay = fadeDuration + revealDuration + 60;
    campOverlayState.messageTimeout = setTimeout(() => {
      if (campOverlayState.active) {
        message.classList.add("visible");
      }
    }, delay);
  }
}

async function togglePoiOverlay(show) {
  await toggleStaticOverlay(poiOverlayState, show, {
    ensureElements: ensurePoiOverlayElements,
    loadImage: loadPoiImage,
    sizeCanvas: sizePoiCanvas,
    drawFrame: drawPoiFrame,
    resetUI: resetPoiDiceUI,
    cancelEffect: cancelPoiEffect,
    diceEnsure: ensurePoiDiceScene,
    messageDelay: 220,
    sceneKey: "poi",
  });
}

async function toggleRandomOverlay(show) {
  await toggleStaticOverlay(randomOverlayState, show, {
    ensureElements: ensureRandomOverlayElements,
    loadImage: loadRandomImage,
    sizeCanvas: sizeRandomCanvas,
    drawFrame: drawRandomFrame,
    resetUI: resetRandomDiceUI,
    cancelEffect: cancelRandomEffect,
    diceEnsure: ensureRandomDiceScene,
    messageDelay: 220,
    sceneKey: "random",
  });
}

async function toggleBattleOverlay(show) {
  await toggleStaticOverlay(battleOverlayState, show, {
    ensureElements: ensureBattleOverlayElements,
    loadImage: loadBattleImage,
    sizeCanvas: sizeBattleCanvas,
    drawFrame: drawBattleFrame,
    resetUI: resetBattleDiceUI,
    cancelEffect: cancelBattleEffect,
    diceEnsure: ensureBattleDiceScene,
    messageDelay: 220,
    sceneKey: "battle",
  });
}

function ensureSettlementOverlayElements() {
  if (
    settlementOverlayState.overlayEl
    && settlementOverlayState.canvas
    && settlementOverlayState.ctx
    && settlementOverlayState.titleEl
    && settlementOverlayState.returnBtn
    && settlementOverlayState.diceWrapper
    && settlementOverlayState.diceHost
    && settlementOverlayState.diceValueEl
  ) {
    return true;
  }
  const overlay = document.getElementById("settlementOverlay");
  const canvas = document.getElementById("settlementCanvas");
  const message = document.getElementById("settlementMessage");
  const title = document.getElementById("settlementTitle");
  const returnBtn = document.getElementById("settlementReturnBtn");
  const diceWrapper = document.getElementById("settlementDiceWrapper");
  const diceHost = document.getElementById("settlementDiceHost");
  const diceValueEl = document.getElementById("settlementDiceValue");
  const diceGlowEl = document.getElementById("settlementDiceGlow");
  if (!overlay || !canvas || !returnBtn || !message || !diceWrapper || !diceHost || !diceValueEl) return false;
  settlementOverlayState.overlayEl = overlay;
  settlementOverlayState.canvas = canvas;
  settlementOverlayState.ctx = canvas.getContext("2d");
  settlementOverlayState.messageEl = message;
  settlementOverlayState.titleEl = title;
  settlementOverlayState.returnBtn = returnBtn;
  settlementOverlayState.diceWrapper = diceWrapper;
  settlementOverlayState.diceHost = diceHost;
  settlementOverlayState.diceValueEl = diceValueEl;
  settlementOverlayState.diceGlowEl = diceGlowEl;
  guardOverlayPointerEvents(settlementOverlayState);
  if (!settlementOverlayState.returnListenerAttached) {
    settlementOverlayState.returnListenerAttached = true;
    returnBtn.addEventListener("click", handleSettlementReturnClick);
  }
  if (!settlementOverlayState.clickListenerAttached) {
    settlementOverlayState.clickListenerAttached = true;
    overlay.addEventListener("click", handleSettlementOverlayClick);
  }
  if (!settlementOverlayState.resizeListenerAttached) {
    settlementOverlayState.resizeListenerAttached = true;
    window.addEventListener("resize", () => {
      if (!settlementOverlayState.active) return;
      if (settlementOverlayState.pendingResize) return;
      settlementOverlayState.pendingResize = true;
      requestAnimationFrame(() => {
        settlementOverlayState.pendingResize = false;
        sizeSettlementCanvas();
        refreshStandaloneDiceBoxLayout(settlementOverlayState.diceBox, settlementOverlayState.diceHost);
        const eff = settlementOverlayState.effect;
        const lastPixel = eff?.lastPixelSize || 1;
        const lastVignette = eff?.lastVignetteAlpha ?? 1;
        drawSettlementFrame(lastPixel, lastVignette, performance.now());
      });
    });
  }
  return true;
}

function ensureLargeSettlementOverlayElements() {
  if (
    largeSettlementOverlayState.overlayEl
    && largeSettlementOverlayState.canvas
    && largeSettlementOverlayState.ctx
    && largeSettlementOverlayState.titleEl
    && largeSettlementOverlayState.returnBtn
    && largeSettlementOverlayState.diceWrapper
    && largeSettlementOverlayState.diceHost
    && largeSettlementOverlayState.diceValueEl
  ) {
    return true;
  }
  const overlay = document.getElementById("largeSettlementOverlay");
  const canvas = document.getElementById("largeSettlementCanvas");
  const message = document.getElementById("largeSettlementMessage");
  const title = document.getElementById("largeSettlementTitle");
    const returnBtn = document.getElementById("largeSettlementReturnBtn");
    const diceWrapper = document.getElementById("largeSettlementDiceWrapper");
    const diceHost = document.getElementById("largeSettlementDiceHost");
    const diceValueEl = document.getElementById("largeSettlementDiceValue");
    const diceGlowEl = document.getElementById("largeSettlementDiceGlow");
  const shopWindow = document.getElementById("largeSettlementShopWindow");
  const shopList = document.getElementById("largeSettlementShopList");
  const shopApplyBtn = document.getElementById("largeSettlementShopApplyBtn");
  const shopSummary = document.getElementById("largeSettlementShopSummary");
  const shopToggleBtn = document.getElementById("largeSettlementShopToggle");
  const shopTitle = document.getElementById("largeSettlementShopTitle");
    if (!overlay || !canvas || !returnBtn || !message || !diceWrapper || !diceHost || !diceValueEl) return false;
    largeSettlementOverlayState.overlayEl = overlay;
    largeSettlementOverlayState.canvas = canvas;
    largeSettlementOverlayState.ctx = canvas.getContext("2d");
    largeSettlementOverlayState.messageEl = message;
    largeSettlementOverlayState.titleEl = title;
    largeSettlementOverlayState.returnBtn = returnBtn;
    largeSettlementOverlayState.diceWrapper = diceWrapper;
    largeSettlementOverlayState.diceHost = diceHost;
    largeSettlementOverlayState.diceValueEl = diceValueEl;
    largeSettlementOverlayState.diceGlowEl = diceGlowEl;
    largeSettlementOverlayState.shopWindow = shopWindow;
    largeSettlementOverlayState.shopList = shopList;
    largeSettlementOverlayState.shopApplyBtn = shopApplyBtn;
    largeSettlementOverlayState.shopToggleBtn = shopToggleBtn;
    largeSettlementOverlayState.shopSummary = shopSummary;
    largeSettlementOverlayState.shopTitle = shopTitle;
    bindLargeSettlementShopDragging();
    guardOverlayPointerEvents(largeSettlementOverlayState);
    if (!largeSettlementOverlayState.returnListenerAttached) {
      largeSettlementOverlayState.returnListenerAttached = true;
      returnBtn.addEventListener("click", handleLargeSettlementReturnClick);
    }
    if (shopToggleBtn) {
      shopToggleBtn.onclick = () => {
        const state = getGlobalGameState();
        const nodeId = largeSettlementOverlayState.currentSettlementId;
        const node = nodeId ? state?.nodeMap?.get?.(nodeId) : null;
        const nextOpen = !largeSettlementOverlayState.shopOpen;
        setLargeSettlementShopVisibility(nextOpen);
        if (nextOpen && state && node) {
          openLargeSettlementShop(state, node);
        }
      };
    }
    if (!largeSettlementOverlayState.clickListenerAttached) {
      largeSettlementOverlayState.clickListenerAttached = true;
      overlay.addEventListener("click", handleLargeSettlementOverlayClick);
    }
  if (!largeSettlementOverlayState.resizeListenerAttached) {
    largeSettlementOverlayState.resizeListenerAttached = true;
    window.addEventListener("resize", () => {
      if (!largeSettlementOverlayState.active) return;
      if (largeSettlementOverlayState.pendingResize) return;
      largeSettlementOverlayState.pendingResize = true;
      requestAnimationFrame(() => {
        largeSettlementOverlayState.pendingResize = false;
        sizeLargeSettlementCanvas();
        refreshStandaloneDiceBoxLayout(largeSettlementOverlayState.diceBox, largeSettlementOverlayState.diceHost);
        applyLargeSettlementShopPosition();
        const eff = largeSettlementOverlayState.effect;
        const lastPixel = eff?.lastPixelSize || 1;
        const lastVignette = eff?.lastVignetteAlpha ?? 1;
        drawLargeSettlementFrame(lastPixel, lastVignette, performance.now());
      });
    });
  }
  return true;
}

function cancelSettlementEffect(state) {
  if (!state) return;
  const eff = state.effect;
  if (eff?.rafId) {
    cancelAnimationFrame(eff.rafId);
  }
  state.effect = null;
  if (state.messageTimeout) {
    clearTimeout(state.messageTimeout);
    state.messageTimeout = null;
  }
}

function forceHideSettlementOverlay(state, ensureElements) {
  if (!state) return;
  if (ensureElements && !ensureElements()) return;
  if (!state.overlayEl) return;
  state.active = false;
  cancelSettlementEffect(state);
  setOverlayExitEnabled(state, true);
  state.overlayEl.classList.add("hidden");
  state.overlayEl.style.opacity = "0";
  state.overlayEl.style.pointerEvents = "none";
  state.overlayEl.style.display = "none";
  if (state === largeSettlementOverlayState) {
    hideHomeBaseUi();
    setLargeSettlementShopVisibility(false);
  }
  if (state.messageEl) {
    state.messageEl.classList.remove("visible");
  }
}

async function toggleSettlementSceneOverlay(state, show, {
  ensureElements,
  sizeCanvas,
  drawFrame,
  settlementName = null,
} = {}) {
  if (!ensureElements || !drawFrame || !sizeCanvas) return;
  if (!ensureElements()) return;
  const overlay = state.overlayEl;
  const message = state.messageEl;
  if (!overlay) return;
  if (!show) {
    if (state.active && !state.exitEnabled) return;
    state.active = false;
    cancelSettlementEffect(state);
    setOverlayExitEnabled(state, false);
    if (state.titleEl) {
      state.titleEl.textContent = "";
      state.titleEl.classList.add("hidden");
    }
    overlay.classList.add("hidden");
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.display = "none";
    if (message) {
      message.classList.remove("visible");
    }
    return;
  }
  if (isOtherSceneLocked(state)) return;
  hideAllSceneOverlays(state);
  closeMapPanes(
    mapSceneInstance?.gameState || getGlobalGameState(),
    { keepSelection: true }
  );
  state.active = true;
  state.currentSettlementName = settlementName || null;
  cancelSettlementEffect(state);
  setOverlayExitEnabled(state, false);
  if (state.titleEl) {
    const isHomeScene = state === largeSettlementOverlayState && state.currentSettlementId === "home";
    if (isHomeScene || !state.currentSettlementName) {
      state.titleEl.textContent = "";
      state.titleEl.classList.add("hidden");
    } else {
      state.titleEl.textContent = state.currentSettlementName;
      state.titleEl.classList.remove("hidden");
    }
  }
  overlay.classList.remove("hidden");
  overlay.style.opacity = "0";
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
  });
  if (message) {
    message.classList.remove("visible");
  }
  sizeCanvas();
  try {
    await loadSettlementSceneImage(state, settlementName);
  } catch (_) {
    // allow fallback to plain fill
  }
  const dims = sizeCanvas() || { width: window.innerWidth, height: window.innerHeight };
  const maxPixel = Math.max(12, Math.ceil(Math.max(dims.width, dims.height) / 24));
  const fadeDuration = 180;
  const revealDuration = 520;
  const start = performance.now();
  const effect = {
    rafId: null,
    start,
    fadeDuration,
    revealDuration,
    lastPixelSize: maxPixel,
    lastVignetteAlpha: 0,
  };
  const step = (now) => {
    if (!state.active) {
      cancelSettlementEffect(state);
      return;
    }
    const elapsed = now - start;
    const fadeT = Math.min(1, elapsed / fadeDuration);
    const revealT = elapsed <= fadeDuration ? 0 : Math.min(1, (elapsed - fadeDuration) / revealDuration);
    const pixelSize = elapsed <= fadeDuration
      ? maxPixel
      : Math.max(1, maxPixel - (maxPixel - 1) * revealT);
    const vignetteAlpha = Math.max(fadeT, revealT);
    drawFrame(pixelSize, vignetteAlpha, now);
    effect.lastPixelSize = pixelSize;
    effect.lastVignetteAlpha = vignetteAlpha;
    const animated = state === largeSettlementOverlayState && state.currentSettlementId === "home";
    if (revealT >= 1 && !animated) {
      // Reveal done and nothing in this frame depends on time: the canvas keeps it.
      effect.rafId = null;
      return;
    }
    effect.rafId = requestAnimationFrame(step);
  };
  state.effect = effect;
  effect.rafId = requestAnimationFrame(step);
  setOverlayExitEnabled(state, true);
  overlay.classList.remove("hidden");
  overlay.style.display = "";
  overlay.style.pointerEvents = "";
  requestAnimationFrame(() => {
    if (!state.active) return;
    if (state.diceBox && state.diceHost) {
      refreshStandaloneDiceBoxLayout(state.diceBox, state.diceHost);
    }
  });
  if (message) {
    const delay = fadeDuration + revealDuration + 60;
    state.messageTimeout = setTimeout(() => {
      if (state.active) {
        message.classList.add("visible");
      }
    }, delay);
  }
}

async function toggleSettlementOverlay(show, settlementName = null) {
  if (show) {
    forceHideSettlementOverlay(largeSettlementOverlayState, ensureLargeSettlementOverlayElements);
  }
  await toggleSettlementSceneOverlay(settlementOverlayState, show, {
    ensureElements: ensureSettlementOverlayElements,
    sizeCanvas: sizeSettlementCanvas,
    drawFrame: drawSettlementFrame,
    settlementName,
  });
}

async function toggleLargeSettlementOverlay(show, settlementName = null) {
    if (!show) {
      // A locked scene (roll still pending) refuses to close further down; bail before
      // wiping currentSettlementId, otherwise the scene stays up with nothing left to roll.
      if (largeSettlementOverlayState.active && !largeSettlementOverlayState.exitEnabled) return;
      if (largeSettlementOverlayState.neutralSlotActive) {
        hideTriDiceOverlay();
        largeSettlementOverlayState.neutralSlotActive = false;
      }
      const state = getGlobalGameState();
      const wasHomeBase = largeSettlementOverlayState.currentSettlementId === "home";
      const suppressId = largeSettlementOverlayState.currentSettlementId;
    if (state && suppressId) {
      const unit = getActiveRangerUnit(state);
      const pos = getUnitPositionPct(state, unit);
      const settlePos = pos || state.nodeMap?.get?.(suppressId)?.pos || null;
      if (settlePos) {
        state.largeSettlementSceneSuppressedId = suppressId;
        state.largeSettlementSceneSuppressPos = { x: settlePos.x, y: settlePos.y };
      }
      state.largeSettlementSceneSuppressUntil = performance.now() + 1500;
    }
      hideHomeBaseUi();
      if (mapSceneInstance && wasHomeBase) {
        mapSceneInstance.userAdjustedCamera = true;
      }
      if (state && wasHomeBase) {
        closeMapPanes(state, { keepSelection: true });
        closeUnitUpgradePicker();
    }
    largeSettlementOverlayState.currentSettlementId = null;
    largeSettlementOverlayState.neutralSlotResource = null;
    largeSettlementOverlayState.neutralSlotActive = false;
    largeSettlementOverlayState.rollStage = null;
    if (largeSettlementOverlayState.neutralActionBtn) {
      largeSettlementOverlayState.neutralActionBtn.style.display = "none";
    }
  }
  if (show) {
    forceHideSettlementOverlay(settlementOverlayState, ensureSettlementOverlayElements);
  }
  await toggleSettlementSceneOverlay(largeSettlementOverlayState, show, {
    ensureElements: ensureLargeSettlementOverlayElements,
    sizeCanvas: sizeLargeSettlementCanvas,
    drawFrame: drawLargeSettlementFrame,
    settlementName,
  });
}

function handleSettlementReturnClick(evt) {
  if (evt) {
    evt.preventDefault();
    evt.stopPropagation();
  }
  if (!settlementOverlayState.exitEnabled) return;
  const state = getGlobalGameState();
  if (settlementOverlayState.currentSettlementId) {
    snapUnitToSettlement(state, settlementOverlayState.currentSettlementId, "small");
  }
  settlementOverlayState.currentSettlementId = null;
  setOverlayExitEnabled(settlementOverlayState, true);
  toggleSettlementOverlay(false);
  setOverlayExitEnabled(largeSettlementOverlayState, true);
  toggleLargeSettlementOverlay(false);
  if (mapSceneInstance) {
    mapSceneInstance.userAdjustedCamera = true;
  }
  openSquadPaneForReturn(state);
}

function handleLargeSettlementReturnClick(evt) {
  if (evt) {
    evt.preventDefault();
    evt.stopPropagation();
  }
  const state = getGlobalGameState();
  if (largeSettlementOverlayState.currentSettlementId && largeSettlementOverlayState.enteredByCollision) {
    // Snap only when the scene was opened by collision (walk-up). This leaves the unit centered
    // on the settlement so currentNodeId == settlementId and isUnitAtHome reads true, enabling
    // loadout/resource transfer UI. Click-from-afar entries must not teleport the unit.
    snapUnitToSettlement(state, largeSettlementOverlayState.currentSettlementId, "large");
  }
  largeSettlementOverlayState.enteredByCollision = false;
  setOverlayExitEnabled(largeSettlementOverlayState, true);
  toggleLargeSettlementOverlay(false);
  setOverlayExitEnabled(settlementOverlayState, true);
  toggleSettlementOverlay(false);
  if (mapSceneInstance) {
    mapSceneInstance.userAdjustedCamera = true;
  }
  openSquadPaneForReturn(state);
}

function setCampDiceFace(face = 1) {
  setOverlayDiceFace(campOverlayState, face);
}

function applyCampDiceGlow(enabled) {
  applyOverlayDiceGlow(campOverlayState, enabled);
}

function resetCampDiceUI() {
  resetOverlayDiceUI(campOverlayState, "click to roll");
}

function setPoiDiceFace(face = 1) {
  setOverlayDiceFace(poiOverlayState, face);
}

function applyPoiDiceGlow(enabled) {
  applyOverlayDiceGlow(poiOverlayState, enabled);
}

function resetPoiDiceUI() {
  resetOverlayDiceUI(poiOverlayState, "click to roll");
  poiOverlayState.badgeHiddenUntilRoll = true;
  stopEncounterBadgeFade(poiOverlayState);
  poiOverlayState.prizeBadge = null;
  if (poiOverlayState.badgePulseRafId) {
    cancelAnimationFrame(poiOverlayState.badgePulseRafId);
    poiOverlayState.badgePulseRafId = null;
  }
  if (poiOverlayState.prizeTimeout) {
    clearTimeout(poiOverlayState.prizeTimeout);
    poiOverlayState.prizeTimeout = null;
  }
}

function rollPoiDice() {
  rollOverlayDice(poiOverlayState, {
    sceneKey: "poi",
    messageRolling: "rolling...",
    messageResultPrefix: "You rolled ",
    onResult: (roll) => handleSceneRollResult("poi", roll),
  });
}

function handlePoiOverlayClick() {
  if (!poiOverlayState.active) return;
  rollPoiDice();
}

function handlePoiReturnClick(evt) {
  if (evt) {
    evt.stopPropagation();
    evt.preventDefault();
  }
  if (!poiOverlayState.exitEnabled) return;
  applyPendingOutcome(poiOverlayState);
  suppressHomeSceneAfterEncounter();
  resolveEncounterLog("poi");
  togglePoiOverlay(false);
  hideHomeBaseUi();
  clearPendingEncounter();
  setEncounterTransitionActive(false);
  startEncounterTimer();
  openSquadPaneForReturn(getGlobalGameState());
}

function setRandomDiceFace(face = 1) {
  setOverlayDiceFace(randomOverlayState, face);
}

function applyRandomDiceGlow(enabled) {
  applyOverlayDiceGlow(randomOverlayState, enabled);
}

function resetRandomDiceUI() {
  resetOverlayDiceUI(randomOverlayState, "click to roll");
}

function rollRandomDice() {
  rollOverlayDice(randomOverlayState, {
    sceneKey: "random",
    messageRolling: "rolling...",
    messageResultPrefix: "You rolled ",
    onResult: (roll) => handleSceneRollResult("random", roll),
  });
}

function handleRandomOverlayClick() {
  if (!randomOverlayState.active) return;
  rollRandomDice();
}

function handleRandomReturnClick(evt) {
  if (evt) {
    evt.stopPropagation();
    evt.preventDefault();
  }
  if (!randomOverlayState.exitEnabled) return;
  applyPendingOutcome(randomOverlayState);
  suppressHomeSceneAfterEncounter();
  resolveEncounterLog("random");
  toggleRandomOverlay(false);
  clearPendingEncounter();
  setEncounterTransitionActive(false);
  startEncounterTimer();
  openSquadPaneForReturn(getGlobalGameState());
}

function setBattleDiceFace(face = 1) {
  setOverlayDiceFace(battleOverlayState, face);
}

function applyBattleDiceGlow(enabled) {
  applyOverlayDiceGlow(battleOverlayState, enabled);
}

function resetBattleDiceUI() {
  resetOverlayDiceUI(battleOverlayState, "click to roll");
}

// Enhanced battle dice rolling with content display
function rollBattleDice() {
  rollOverlayDice(battleOverlayState, {
    sceneKey: "battle",
    messageRolling: "rolling...",
    messageResultPrefix: "You rolled ",
    onResult: (roll) => handleSceneRollResult("battle", roll)
  });
}

// Enhanced battle dice rolling with content display
function handleBattleOverlayClick() {
  if (!battleOverlayState.active) return;
  rollBattleDice();
}

function handleBattleReturnClick(evt) {
  if (evt) {
    evt.stopPropagation();
    evt.preventDefault();
  }
  if (!battleOverlayState.exitEnabled) return;
  applyPendingOutcome(battleOverlayState);
  suppressHomeSceneAfterEncounter();
  resolveEncounterLog("battle");
  toggleBattleOverlay(false);
  hideHomeBaseUi();
  clearPendingEncounter();
  setEncounterTransitionActive(false);
  startEncounterTimer();
  openSquadPaneForReturn(getGlobalGameState());
}

// Resource icon conversion
function iconForResource(key) {
  return RESOURCE_ICONS[key] || "?";
}

// Parse outcome string to resource object
function parseOutcomeString(outcomeStr) {
  if (!outcomeStr || outcomeStr.trim() === "") return {};
  const parts = outcomeStr.split(";").map((p) => p.trim()).filter(Boolean);
  const result = {};
  parts.forEach((part) => {
    const [resource, amount] = part.split(",").map((s) => s.trim());
    if (resource && amount) {
      const key = resource.toLowerCase();
      const token = amount.toLowerCase();
      if (token === "max" || token === "min") {
        result[key] = token;
        return;
      }
      const parsed = parseInt(amount, 10);
      if (Number.isFinite(parsed)) {
        result[key] = parsed;
      }
    }
  });
  return result;
}

// Ensure ranger unit has all required resource types
function ensureRangerHasResourceTypes(unit) {
  if (!unit?.inventory) return;
  const requiredResources = ["gas", "water", "food", "components", "chits", "wood", "ap"];
  requiredResources.forEach((resource) => {
    if (!(resource in unit.inventory)) {
      unit.inventory[resource] = 0;
    }
  });
}

// Apply battle outcome to ranger unit inventory
function applyBattleOutcome(outcomeStr) {
  if (!outcomeStr || outcomeStr.trim() === "") return;

  const gameState = getGlobalGameState();
  if (!gameState) return;

  const unit = getActiveRangerUnit(gameState);
  if (!unit) return;

  ensureRangerHasResourceTypes(unit);

  const outcomeObj = parseOutcomeString(outcomeStr);
  if (!Object.keys(outcomeObj).length) return;

  const inventoryBefore = { ...(unit.inventory || {}) };
  const totalChanges = {};
  Object.entries(outcomeObj).forEach(([resource, amount]) => {
    if (resource === "ap") {
      const before = typeof unit.inventory.ap === "number" ? unit.inventory.ap : 0;
      const maxAp = getUnitMaxAp(unit);
      if (amount === "max") {
        unit.inventory.ap = maxAp;
        totalChanges.ap = (totalChanges.ap || 0) + (unit.inventory.ap - before);
      } else if (amount === "min") {
        unit.inventory.ap = 0;
        totalChanges.ap = (totalChanges.ap || 0) + (unit.inventory.ap - before);
      } else if (Number.isFinite(amount)) {
        unit.inventory.ap = Math.max(0, Math.min(maxAp, before + amount));
        totalChanges.ap = (totalChanges.ap || 0) + (unit.inventory.ap - before);
      }
      return;
    }
    if (!Number.isFinite(amount)) return;
    if (amount < 0) {
      if (unit.inventory[resource] !== undefined) {
        const before = unit.inventory[resource] || 0;
        const after = Math.max(0, before - Math.abs(amount));
        unit.inventory[resource] = after;
        totalChanges[resource] = (totalChanges[resource] || 0) + (after - before);
      }
    } else if (amount > 0) {
      totalChanges[resource] = (totalChanges[resource] || 0) + amount;
      if (unit.inventory[resource] !== undefined) {
        unit.inventory[resource] = (unit.inventory[resource] || 0) + amount;
      }
    }
  });

  if (typeof gameState.clampUnitInventory === "function") {
    gameState.clampUnitInventory(unit);
  }
  // Report what the unit actually ended up with: gains are capped by carry limits.
  Object.keys(totalChanges).forEach((resource) => {
    if (unit.inventory[resource] === undefined) return;
    totalChanges[resource] = (Number(unit.inventory[resource]) || 0) - (Number(inventoryBefore[resource]) || 0);
  });

  if (gameState.logger && Object.keys(totalChanges).length > 0) {
    const formatBattleOutcomeAmount = (resource, amount) => {
      if (resource === "ap") return Math.trunc(amount);
      return amount;
    };
    const changesText = Object.entries(totalChanges)
      .map(([r, a]) => `${iconForResource(r)} ${formatBattleOutcomeAmount(r, a)} ${r}`)
      .join(", ");
    gameState.logger.log(`Battle outcome: ${changesText}`);
  }

  renderResources(gameState);
  refreshRangerPaneScene(gameState);
}

function applyPendingOutcome(state) {
  if (!state) return;
  const pending = state.pendingOutcome;
  if (!pending) return;
  applyBattleOutcome(pending);
  state.pendingOutcome = null;
}

function resolvePhaserEase() {
  if (typeof Phaser !== "undefined" && Phaser.Math?.Easing?.Sine?.Out) {
    return Phaser.Math.Easing.Sine.Out;
  }
  return (t) => t;
}

function fadeElementWithPhaser(element, duration = OUTCOME_FADE_MS, easeFn = resolvePhaserEase()) {
  if (!element) return Promise.resolve();
  const start = performance.now();
  const initialOpacity = parseFloat(getComputedStyle(element).opacity) || 0;
  element.style.opacity = "0";
  return new Promise((resolve) => {
    const step = (now) => {
      const t = Math.min(1, (now - start) / Math.max(1, duration));
      element.style.opacity = easeFn(t).toString();
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

function buildOutcomeText(outcomeStr) {
  const trimmed = (outcomeStr || "").trim();
  if (!trimmed) return "";
  const outcomeObj = parseOutcomeString(outcomeStr);
  if (!Object.keys(outcomeObj).length) return "";
  const resourceDisplay = Object.entries(outcomeObj).map(([resource, amount]) => {
    const icon = iconForResource(resource);
    if (amount === "max" || amount === "min") {
      return `${icon} ${amount} ${resource}`;
    }
    const sign = amount >= 0 ? "+" : "";
    return `${icon} ${sign}${amount} ${resource}`;
  }).join(" | ");
  return `Resources: ${resourceDisplay}`;
}

async function displaySceneNarrative(sceneKey, narrative) {
  const messageEl = getSceneMessageElement(sceneKey);
  if (!messageEl) return;
  const narrativeEl = ensureSceneNarrativeElement(sceneKey, messageEl);
  if (!narrativeEl) return;
  const text = (narrative ?? "").trim();
  if (!text) {
    narrativeEl.style.display = "none";
    narrativeEl.textContent = "";
    return;
  }
  narrativeEl.style.display = "";
  const durationMs = Math.max(1, TEXT_FADE_IN_MS);
  await revealText(narrativeEl, text, { durationMs });
}

async function displaySceneOutcome(sceneKey, outcomeStr) {
  const messageEl = getSceneMessageElement(sceneKey);
  if (!messageEl) return;
  const outcomeEl = ensureSceneOutcomeElement(sceneKey, messageEl);
  if (!outcomeEl) return;
  const text = buildOutcomeText(outcomeStr);
  if (!text) {
    outcomeEl.style.display = "none";
    outcomeEl.textContent = "";
    return;
  }
  outcomeEl.style.display = "";
  outcomeEl.textContent = text;
  return fadeElementWithPhaser(outcomeEl, OUTCOME_FADE_MS);
}

function getSceneSpriteLabelForRoll(sceneKey) {
  if (!sceneKey) return null;
  const normalized = sceneKey.toLowerCase();
  const selection = ensureActiveEncounter(normalized);
  if (selection?.frameKey) {
    syncSceneSpriteLabel(selection.sceneKey, selection.frameKey);
    return selection.frameKey;
  }
  const stored = getSceneSpriteLabelFromState(normalized);
  if (stored) return stored;
  if (normalized === "battle") {
    return defaultBattleFrameKey(resolveBattleTextureKey());
  }
  return normalized;
}

function getSceneContent(sceneKey, spritelabel, roll) {
  if (!sceneKey) return null;
  const resolvedRoll = Number.isFinite(roll) ? roll : parseInt(roll, 10);
  if (!Number.isFinite(resolvedRoll)) return null;
  const key = CONTENT_LIBRARY_KEYS[sceneKey];
  if (!key) return null;
  const host = typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : null);
  const library = host?.ContentLibrary?.[key];
  if (!Array.isArray(library)) return null;
  const label = spritelabel || sceneKey;
  const entrySet = library.find((entry) => entry?.spritelabel === label);
  if (!entrySet || !Array.isArray(entrySet.entries)) return null;
  return entrySet.entries.find((entry) => entry.roll === resolvedRoll) || null;
}

function getPoiContentForRoll(roll) {
  const resolvedRoll = Number.isFinite(roll) ? roll : parseInt(roll, 10);
  if (!Number.isFinite(resolvedRoll)) return null;
  const host = typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : null);
  const library = host?.ContentLibrary?.Pois;
  if (!Array.isArray(library)) return null;
  for (const entrySet of library) {
    if (!entrySet?.entries) continue;
    const found = entrySet.entries.find((entry) => entry.roll === resolvedRoll);
    if (found) {
      return { content: found, spritelabel: entrySet.spritelabel };
    }
  }
  return null;
}

function getCampContentForRoll(roll) {
  const resolvedRoll = Number.isFinite(roll) ? roll : parseInt(roll, 10);
  if (!Number.isFinite(resolvedRoll)) return null;
  const host = typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : null);
  const library = host?.ContentLibrary?.Camps;
  if (!Array.isArray(library)) return null;
  for (const entrySet of library) {
    if (!entrySet) continue;
    if (Array.isArray(entrySet)) {
      const found = entrySet.find((entry) => entry?.roll === resolvedRoll);
      if (found) return { content: found, spritelabel: "camp" };
      continue;
    }
    if (Array.isArray(entrySet.entries)) {
      const found = entrySet.entries.find((entry) => entry?.roll === resolvedRoll);
      if (found) return { content: found, spritelabel: entrySet.spritelabel || "camp" };
      continue;
    }
    if (entrySet.roll === resolvedRoll) {
      return { content: entrySet, spritelabel: entrySet.spritelabel || "camp" };
    }
  }
  return null;
}

function syncPoiPrizeBadgeFrame(frameKey) {
  if (!frameKey) return null;
  const scene = typeof mapSceneInstance !== "undefined" ? mapSceneInstance : null;
  const textureKey = ENCOUNTER_TEXTURE_KEYS.poi || "poi";
  const texture = scene?.textures?.get?.(textureKey);
  if (!texture) return null;
  let frame = texture.get?.(frameKey);
  if (!frame) {
    const match = `${frameKey}`.match(/-(\d+)$/);
    if (match && scene) {
      const idx = parseInt(match[1], 10);
      const fallback = atlasFrame(scene, textureKey, idx);
      frame = texture.get?.(fallback) || scene.textures?.getFrame?.(textureKey, fallback);
    }
  }
  if (!frame?.source?.image) return null;
  const sx = typeof frame.cutX === "number" ? frame.cutX : (typeof frame.x === "number" ? frame.x : 0);
  const sy = typeof frame.cutY === "number" ? frame.cutY : (typeof frame.y === "number" ? frame.y : 0);
  const sw = typeof frame.cutWidth === "number" ? frame.cutWidth : (typeof frame.width === "number" ? frame.width : 0);
  const sh = typeof frame.cutHeight === "number" ? frame.cutHeight : (typeof frame.height === "number" ? frame.height : 0);
  if (!sw || !sh) return null;
  return { image: frame.source.image, sx, sy, sw, sh, frameKey, textureKey };
}

function showPoiPrizeBadge(frameKey) {
  if (!frameKey) return;
  if (!ensurePoiOverlayElements()) return;
  const frame = syncPoiPrizeBadgeFrame(frameKey);
  if (!frame) return;
  poiOverlayState.prizeBadge = frame;
  poiOverlayState.badgeHiddenUntilRoll = false;
  poiOverlayState.badgeFadeStart = performance.now();
  startEncounterBadgeFade(poiOverlayState, drawPoiFrame);
  if (poiOverlayState.badgePulseRafId) {
    cancelAnimationFrame(poiOverlayState.badgePulseRafId);
  }
  const pulseStep = () => {
    if (!poiOverlayState.active || !poiOverlayState.prizeBadge) {
      poiOverlayState.badgePulseRafId = null;
      return;
    }
    drawPoiFrame();
    poiOverlayState.badgePulseRafId = requestAnimationFrame(pulseStep);
  };
  poiOverlayState.badgePulseRafId = requestAnimationFrame(pulseStep);
  drawPoiFrame();
}

async function handleSceneRollResult(sceneKey, roll) {
  const state = overlayStateByScene(sceneKey);
  if (!state) return;
  const rollInfo = (roll && typeof roll === "object")
    ? roll
    : {
      baseRoll: roll,
      finalRoll: roll,
      bonusTotal: 0,
      bonusLine: "",
      hasBonus: false,
    };
  const resolvedRoll = Number.isFinite(rollInfo.finalRoll)
    ? rollInfo.finalRoll
    : Number.isFinite(rollInfo.baseRoll)
      ? rollInfo.baseRoll
      : parseInt(rollInfo.finalRoll, 10);
  if (!Number.isFinite(resolvedRoll)) return;
  if (sceneKey === "battle") {
    const gameState = getGlobalGameState();
    const unitCount = gameState?.rangerUnits?.length || 0;
    if (resolvedRoll === 1 && unitCount > 1) {
      gameState.forceFullApNextTurn = true;
    }
  }
  let label = getSceneSpriteLabelForRoll(sceneKey);
  if (sceneKey === "battle") {
    console.log("=== BATTLE ROLL RESULT CALLED ===");
    console.log("Battle sprite label:", label);
  }
  let content = getSceneContent(sceneKey, label, resolvedRoll);
  let poiBadgeLabel = null;
  if (sceneKey === "poi") {
    const poiMatch = getPoiContentForRoll(resolvedRoll);
    if (poiMatch) {
      content = poiMatch.content;
      label = poiMatch.spritelabel;
      syncSceneSpriteLabel("poi", label);
      poiOverlayState.badgeHiddenUntilRoll = false;
      poiBadgeLabel = label;
    }
  }
  if (sceneKey === "camp") {
    const campMatch = getCampContentForRoll(resolvedRoll);
    if (campMatch) {
      content = campMatch.content;
      label = campMatch.spritelabel;
      syncSceneSpriteLabel("camp", label);
    }
  }
  if (sceneKey === "battle") {
    console.log("Battle content found:", !!content);
    if (!content) {
      console.log("No battle content found for sprite label:", label, "and roll:", resolvedRoll);
    }
  }
  const narrative = content?.narrative || `You rolled ${resolvedRoll}.`;
  const outcome = content?.outcome || "";
  const trimmedOutcome = (outcome || "").trim();
  if (trimmedOutcome) {
    applyBattleOutcome(outcome);
  }
  await wait(ROLL_TO_NARRATIVE_DELAY_MS);
  await displaySceneNarrative(sceneKey, narrative);
  if (sceneKey === "poi" && poiBadgeLabel) {
    showPoiPrizeBadge(poiBadgeLabel);
  }
  await displaySceneOutcome(sceneKey, outcome);
  setSceneBonusLine(sceneKey, rollInfo.bonusLine);
  if (state) {
    state.pendingOutcome = null;
  }
  if (rollInfo.hasBonus && Number.isFinite(rollInfo.baseRoll) && rollInfo.baseRoll !== resolvedRoll) {
    await animateOverlayDiceBonusTransition(
      state,
      rollInfo.baseRoll,
      resolvedRoll,
      state.rollId,
      rollInfo.bonusTotal
    );
  } else {
    setSceneDiceFace(sceneKey, resolvedRoll);
  }
  applySceneDiceGlow(sceneKey, true);
  if (state.rollTimeout) {
    clearTimeout(state.rollTimeout);
  }
  state.rollTimeout = setTimeout(() => applySceneDiceGlow(sceneKey, false), 1100);
  setOverlayExitEnabled(state, true);
}

function resetOverlayDiceUI(state, messageText = "click to roll") {
  state.rollId = (state?.rollId || 0) + 1;
  state.diceFace = null;
  clearOverlayDiceValueFx(state);
  if (state.diceValueEl) {
    state.diceValueEl.textContent = "";
  }
  state.rolling = false;
  applyOverlayDiceGlow(state, false);
  setOverlayDiceVisibility(state, false);
  if (state.diceWrapper) {
    state.diceWrapper.classList.remove("rolling");
  }
  const msg = state.messageEl?.querySelector(".loading-text");
  if (msg) {
    msg.textContent = messageText;
  }
  if (state.diceScene?.resetPose) {
    state.diceScene.resetPose();
  }
  setOverlayExitEnabled(state, false);
}

function ensureDiceSceneForState(state) {
  if (state === campOverlayState) return ensureCampDiceScene();
  if (state === poiOverlayState) return ensurePoiDiceScene();
  if (state === randomOverlayState) return ensureRandomDiceScene();
  if (state === battleOverlayState) return ensureBattleDiceScene();
  return null;
}

function rollOverlayDice(state, { sceneKey = null, messageRolling = "rolling...", messageResultPrefix = "You rolled ", onResult } = {}) {
  if (!state.active || state.rolling) return;
  // `opening` is cleared when the scene art has loaded. The time limit is a backstop so
  // an error on the way there can never leave the roll refused for good.
  if (state.opening && performance.now() - (state.openingSince || 0) < 8000) return;
  if (isEncounterRollLocked()) return;
  const rollId = (state.rollId = (state?.rollId || 0) + 1);
  markEncounterRollUsed();
  const messageText = state.messageEl?.querySelector(".loading-text") || null;
  if (messageText) messageText.textContent = messageRolling;
  setOverlayExitEnabled(state, false);
  state.rolling = true;
  refreshEndTurnButtonAvailability();
  applyOverlayDiceGlow(state, false);
  setOverlayDiceVisibility(state, true);
  if (state.diceWrapper) {
    state.diceWrapper.classList.add("rolling");
  }
  const gameState = mapSceneInstance?.gameState || getGlobalGameState();
  const unit = gameState ? getActiveRangerUnit(gameState) : null;
  const baseRoll = rollDeterministicDie(20);
  const rollInfo = applyRollModifiers(baseRoll, { state: gameState, unit, context: sceneKey });
  const naturalFace = rollInfo.baseRoll;
  const finalFace = rollInfo.finalRoll;
  setSceneBonusLine(sceneKey, "");
  const runRoll = async () => {
    try {
      await waitForAnimationFrame();
      // A dice scene that never finishes initialising must not hold the roll forever.
      const scene = await Promise.race([
        ensureDiceSceneForState(state),
        wait(4000).then(() => null),
      ]);
      scene?.refreshLayout?.();
      if (scene?.rollDice) {
        await scene.rollDice(naturalFace);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    if (!state.active || state.rollId !== rollId) {
      state.rolling = false;
      refreshEndTurnButtonAvailability();
      return;
    }
    setOverlayDiceFace(state, naturalFace);
    if (state.diceWrapper) {
      state.diceWrapper.classList.remove("rolling");
    }
    state.rollRafId = null;
    state.rolling = false;
    refreshEndTurnButtonAvailability();
    if (messageText) {
      messageText.textContent = formatRollResultMessage(messageResultPrefix, rollInfo);
    }
    applyOverlayDiceGlow(state, true);
    state.rollTimeout = setTimeout(() => applyOverlayDiceGlow(state, false), 1100);
    // Call the result callback if provided
    if (typeof onResult === "function") {
      onResult(rollInfo);
    }
    setOverlayExitEnabled(state, true);
  };
  runRoll();
}

function rollCampDice() {
  rollOverlayDice(campOverlayState, {
    sceneKey: "camp",
    messageRolling: "rolling...",
    messageResultPrefix: "You rolled ",
    onResult: (roll) => handleSceneRollResult("camp", roll),
  });
}

function handleCampOverlayClick() {
  if (!campOverlayState.active) return;
  rollCampDice();
}

function handleCampReturnClick(evt) {
  if (evt) {
    evt.stopPropagation();
    evt.preventDefault();
  }
  if (!campOverlayState.exitEnabled) return;
  applyPendingOutcome(campOverlayState);
  suppressHomeSceneAfterEncounter();
  resolveEncounterLog("camp");
  toggleCampOverlay(false);
  const devCampToggle = document.getElementById("devCampToggle");
  if (devCampToggle) devCampToggle.checked = false;
  clearPendingEncounter();
  setEncounterTransitionActive(false);
  startEncounterTimer();
  openSquadPaneForReturn(getGlobalGameState());
}

function pickNextSceneKey(weights = sceneSelectionWeights) {
  const weighted = [
    ["camp", clampSceneWeight(weights?.camp, 0)],
    ["poi", clampSceneWeight(weights?.poi, 0)],
    ["random", clampSceneWeight(weights?.random, 0)],
    ["battle", clampSceneWeight(weights?.battle, 0)],
  ].filter(([, weight]) => weight > 0);
  if (!weighted.length) return null;
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of weighted) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return weighted[weighted.length - 1][0];
}

async function startSceneByKey(key = "camp") {
  const devEncounterToggle = document.getElementById("devEncounterToggle");
  const devCampToggle = document.getElementById("devCampToggle");
  const desiredKey = (key || "camp").toLowerCase();
  const hadEncounterOverlay = encounterOverlayState.active;
  if (!hadEncounterOverlay) {
    hideAllSceneOverlays();
  }
  logEncounterStart(desiredKey);
  ensureActiveEncounter(desiredKey);
  let showPromise = null;
  switch (desiredKey) {
    case "poi":
      showPromise = togglePoiOverlay(true);
      break;
    case "random":
      showPromise = toggleRandomOverlay(true);
      break;
    case "battle":
      showPromise = toggleBattleOverlay(true);
      break;
    case "camp":
    default:
      showPromise = toggleCampOverlay(true);
      break;
  }
  if (hadEncounterOverlay) {
    toggleEncounterOverlay(false, { preservePending: true });
    if (devEncounterToggle) devEncounterToggle.checked = false;
  }
  await showPromise;
  if (devCampToggle) {
    devCampToggle.checked = campOverlayState.active;
  }
}

async function startPostEncounterScene() {
  const next = activeEncounter.sceneKey || pendingEncounter.sceneKey || pickNextSceneKey(sceneSelectionWeights);
  if (!next) return;
  await startSceneByKey(next);
}

async function startCampScene() {
  await startSceneByKey("camp");
}

async function startPoiScene() {
  await startSceneByKey("poi");
}

async function startRandomScene() {
  await startSceneByKey("random");
}

async function startBattleScene() {
  // Use the encounter's chosen battle sprite label
  const gameState = getGlobalGameState();
  if (gameState) {
    // Ensure active encounter is properly set up with the correct frame
    const selection = ensureActiveEncounter("battle");

    // Use the frame key from the active encounter
    const frameKey = selection.frameKey || defaultBattleFrameKey(selection.textureKey);
    syncBattleSpriteLabel(frameKey);
    console.log("Selected battle sprite label from encounter:", frameKey);
  }
  await startSceneByKey("battle");
}

function findSmallSettlementName(state, settlementId) {
  if (!state?.smallSettlements?.length || !settlementId) return null;
  const found = state.smallSettlements.find((settlement) => settlement.id === settlementId);
  return found?.name || null;
}

function getSmallSettlementById(state, settlementId) {
  if (!state?.smallSettlements?.length || !settlementId) return null;
  return state.smallSettlements.find((settlement) => settlement.id === settlementId) || null;
}

function hasSettlementIncome(settlement) {
  return !!settlement?.yields && hasResourceValues(settlement.yields);
}

function setSettlementNarrativeMessage(settlementName) {
  const name = settlementName || "This settlement";
  const narrative = `For promise of a better life, ${name} joins your faction and promises to keep you supplied.`;
  displaySceneNarrative("settlement", narrative);
}

function setSettlementIncomeOutcome(income) {
  const messageEl = getSceneMessageElement("settlement");
  if (!messageEl) return;
  const outcomeEl = ensureSceneOutcomeElement("settlement", messageEl);
  if (!outcomeEl) return;
  const parts = RESOURCE_KEYS.filter((key) => income?.[key]).map((key) => {
    const amount = income[key];
    const icon = iconForResource(key);
    return `<span class="res-pill"><span class="res-ic">${icon}</span>+${amount}</span>`;
  });
  outcomeEl.style.display = "";
  outcomeEl.innerHTML = parts.length
    ? `Income: ${parts.join(" ")}`
    : "Income: None";
}

function snapUnitToSettlement(state, settlementId, kind = "small") {
  if (!state || !settlementId) return;
  const unit = getActiveRangerUnit(state);
  if (!unit || unit.isDead) return;
  let pos = null;
  if (kind === "large") {
    pos = state.nodeMap?.get?.(settlementId)?.pos || null;
  } else {
    const found = state.smallSettlements?.find((settlement) => settlement.id === settlementId);
    pos = found?.pos || null;
  }
  if (!pos) return;
  const offset = getSettlementSnapOffset(kind);
  const snapped = {
    x: Phaser.Math.Clamp(pos.x + (offset?.x || 0), 0, 100),
    y: Phaser.Math.Clamp(pos.y + (offset?.y || 0), 0, 100),
  };
  unit.positionPct = snapped;
  unit.moveTargetPct = null;
  unit.isMoving = false;
  if (kind === "large") {
    unit.currentNodeId = settlementId;
  }
  if (mapSceneInstance) {
    mapSceneInstance.marchUiDirty = true;
    if (typeof mapSceneInstance.syncMarkersToUnits === "function") {
      mapSceneInstance.syncMarkersToUnits();
    }
  }
  renderMap(state);
}

async function startSettlementScene(settlementId = null) {
  cancelEncounterTimer({ preservePending: true });
  const state = getGlobalGameState();
  let settlementName = null;
  if (state) {
    if (settlementId === null) {
      state.settlementSceneSuppressedId = null;
    } else if (!state.settlementSceneSuppressedId) {
      state.settlementSceneSuppressedId = settlementId;
    }
    settlementName = findSmallSettlementName(state, settlementId);
  }
  settlementOverlayState.currentSettlementId = settlementId;
  haltSquadMovementForEncounter();
  await toggleSettlementOverlay(true, settlementName);
  const settlement = getSmallSettlementById(state, settlementId);
  if (!settlement) return;
  if (settlement.joinedFaction) {
    setOverlayDiceVisibility(settlementOverlayState, false);
    setSettlementNarrativeMessage(settlement.name);
    setSettlementIncomeOutcome(settlement.yields);
    const messageText = settlementOverlayState.messageEl?.querySelector(".loading-text");
    if (messageText) messageText.textContent = "";
    setOverlayExitEnabled(settlementOverlayState, true);
  } else {
    resetSettlementDiceUI();
    displaySceneNarrative("settlement", "");
    const outcomeEl = settlementOverlayState.messageEl?.querySelector(".scene-outcome");
    if (outcomeEl) {
      outcomeEl.style.display = "none";
      outcomeEl.textContent = "";
    }
    ensureSmallSettlementDiceBox();
    setOverlayExitEnabled(settlementOverlayState, false);
  }
}

function isNeutralLargeSettlementNode(node) {
  if (!node) return false;
  if (node.id === "home") return false;
  return node.owner !== "player" && node.owner !== "enemy";
}

function advanceNeutralSlotToResourceRoll() {
  hideTriDiceOverlay();
  largeSettlementOverlayState.neutralSlotActive = false;
  largeSettlementOverlayState.rollStage = "neutral-resources";
  setLargeSettlementShopToggleVisibility(false);
  const neutralBtn = ensureNeutralSlotActionButton();
  if (neutralBtn) neutralBtn.style.display = "none";
  if (largeSettlementOverlayState.returnBtn) {
    largeSettlementOverlayState.returnBtn.style.display = "";
  }
  const messageText = largeSettlementOverlayState.messageEl?.querySelector(".loading-text");
  if (messageText) messageText.textContent = "Click to roll...";
  setOverlayDiceVisibility(largeSettlementOverlayState, true);
  setOverlayExitEnabled(largeSettlementOverlayState, false);
  ensureLargeSettlementDiceBox();
  rollLargeSettlementResources();
}

function advanceEnemyLargeSettlementToResourceRoll() {
  largeSettlementOverlayState.rollStage = "resources";
  setLargeSettlementShopToggleVisibility(false);
  const neutralBtn = ensureNeutralSlotActionButton();
  if (neutralBtn) neutralBtn.style.display = "none";
  if (largeSettlementOverlayState.returnBtn) {
    largeSettlementOverlayState.returnBtn.style.display = "";
  }
  const messageText = largeSettlementOverlayState.messageEl?.querySelector(".loading-text");
  if (messageText) messageText.textContent = "Click to roll...";
  setOverlayDiceVisibility(largeSettlementOverlayState, true);
  setOverlayExitEnabled(largeSettlementOverlayState, false);
  ensureLargeSettlementDiceBox();
  rollLargeSettlementResources();
}

async function startNeutralLargeSettlementSlot(settlementId, settlementName = null) {
  largeSettlementOverlayState.rolling = false;
  if (largeSettlementOverlayState.neutralSlotActive) return;
  largeSettlementOverlayState.neutralSlotActive = true;
  largeSettlementOverlayState.neutralSlotResource = null;
  largeSettlementOverlayState.rollStage = "neutral-slot";
  setLargeSettlementShopToggleVisibility(false);
  const messageText = largeSettlementOverlayState.messageEl?.querySelector(".loading-text");
  if (messageText) messageText.textContent = "Spin for resource";
  const neutralBtn = ensureNeutralSlotActionButton();
  if (neutralBtn) neutralBtn.style.display = "none";
  if (largeSettlementOverlayState.returnBtn) {
    largeSettlementOverlayState.returnBtn.style.display = "none";
  }
  setOverlayDiceVisibility(largeSettlementOverlayState, false);
  setOverlayExitEnabled(largeSettlementOverlayState, false);
  showTriDiceOverlay({
    mode: "neutral-large",
    onComplete: (resourceKey) => {
      largeSettlementOverlayState.neutralSlotResource = resourceKey || null;
      largeSettlementOverlayState.rollStage = "neutral-ready";
      if (messageText) messageText.textContent = "";
      const neutralBtn = ensureNeutralSlotActionButton();
      if (neutralBtn) {
        neutralBtn.textContent = "Roll for resource amount";
        neutralBtn.style.display = "";
      }
      // Stay locked until the amount is rolled; leaving here would allow a re-spin.
      setOverlayExitEnabled(largeSettlementOverlayState, false);
    },
  });
  if (TRI_DICE_STATE.overlay) {
    TRI_DICE_STATE.overlay.style.pointerEvents = "auto";
  }
}

async function startLargeSettlementScene(settlementId = null, options = {}) {
  cancelEncounterTimer({ preservePending: true });
  const state = getGlobalGameState();
  let settlementName = null;
  const { skipNeutralSlot = false, settlementName: overrideName = null, enteredByCollision = false } = options || {};
  if (state) {
    if (settlementId === null) {
      state.largeSettlementSceneSuppressedId = null;
    } else if (!state.largeSettlementSceneSuppressedId) {
      state.largeSettlementSceneSuppressedId = settlementId;
    }
    settlementName = overrideName || state.nodeMap?.get?.(settlementId)?.name || null;
  }
  largeSettlementOverlayState.currentSettlementId = settlementId;
  // Track entry mode so handleLargeSettlementReturnClick only snaps the unit on close when
  // the scene was opened by collision (walk-up). Clicking the icon from afar must not teleport.
  largeSettlementOverlayState.enteredByCollision = !!enteredByCollision;
  haltSquadMovementForEncounter();
  const node = settlementId ? state?.nodeMap?.get?.(settlementId) : null;
  await toggleLargeSettlementOverlay(true, settlementName);
  resetLargeSettlementSceneUI();
  if (largeSettlementOverlayState.returnBtn) {
    largeSettlementOverlayState.returnBtn.style.display = "";
  }
  if (!skipNeutralSlot && isNeutralLargeSettlementNode(node)) {
    largeSettlementOverlayState.rollStage = null;
    setTimeout(() => {
      if (!largeSettlementOverlayState.active) return;
      if (largeSettlementOverlayState.currentSettlementId !== settlementId) return;
      if (largeSettlementOverlayState.rollStage !== "neutral-slot" && largeSettlementOverlayState.rollStage !== null) return;
      startNeutralLargeSettlementSlot(settlementId, settlementName);
    }, 780);
    return;
  }
    if (settlementId === "home") {
      showHomeBaseUi(state);
      setOverlayDiceVisibility(largeSettlementOverlayState, false);
      largeSettlementOverlayState.rollStage = null;
      const messageText = largeSettlementOverlayState.messageEl?.querySelector(".loading-text");
      if (messageText) messageText.textContent = "";
      setLargeSettlementShopToggleVisibility(false);
    } else {
      hideHomeBaseUi();
      if (!node) return;
      setLargeSettlementShopToggleVisibility(node.owner === "player");
      setLargeSettlementShopVisibility(false);
      const messageText = largeSettlementOverlayState.messageEl?.querySelector(".loading-text");
      if (node.owner === "player" && node.yields != null) {
        ensureLargeSettlementShopOffers(node);
        setOverlayDiceVisibility(largeSettlementOverlayState, false);
        if (messageText) messageText.textContent = "";
        setLargeSettlementIncomeOutcome(node.yields);
        setOverlayExitEnabled(largeSettlementOverlayState, true);
        largeSettlementOverlayState.rollStage = null;
    } else {
      resetLargeSettlementDiceUI();
      const outcomeEl = largeSettlementOverlayState.messageEl?.querySelector(".scene-outcome");
      if (outcomeEl) {
        outcomeEl.style.display = "none";
        outcomeEl.textContent = "";
      }
      if (node.owner === "enemy") {
        const alreadyFailed = !!node.conquestAttempted;
        if (alreadyFailed) {
          largeSettlementOverlayState.rollStage = "failed";
          if (messageText) messageText.textContent = "";
          displayLargeSettlementOutcomeText("FAIL");
          setOverlayDiceVisibility(largeSettlementOverlayState, false);
          const neutralBtn = ensureNeutralSlotActionButton();
          if (neutralBtn) neutralBtn.style.display = "none";
          setOverlayExitEnabled(largeSettlementOverlayState, true);
        } else {
          largeSettlementOverlayState.rollStage = "persuasion";
          if (messageText) messageText.textContent = "click to roll";
          ensureLargeSettlementDiceBox();
          const neutralBtn = ensureNeutralSlotActionButton();
          if (neutralBtn) neutralBtn.style.display = "none";
          setOverlayExitEnabled(largeSettlementOverlayState, false);
        }
      } else {
        largeSettlementOverlayState.rollStage = skipNeutralSlot ? "neutral-resources" : "resources";
        if (messageText) messageText.textContent = "Click to roll...";
        ensureLargeSettlementDiceBox();
        setOverlayExitEnabled(largeSettlementOverlayState, false);
      }
    }
  }
}

function setupMapUIControls() {
  const homeBtn = document.getElementById("mapHomeBtn");
  const zoomInBtn = document.getElementById("mapZoomInBtn");
  const zoomOutBtn = document.getElementById("mapZoomOutBtn");
  const zoomModeToggle = document.getElementById("cursorLockZoomToggle");
  const zoomModeLabel = document.getElementById("zoomModeLabel");
  const zoomStep = 0.2;
  if (homeBtn) {
    homeBtn.onclick = () => {
      if (isMapEndTurnTransitionActive()) return;
      if (mapSceneInstance) {
        mapSceneInstance.userAdjustedCamera = false;
        mapSceneInstance.focusCameraOnHome({ setZoom: true });
      }
    };
  }
  const adjustZoom = (delta) => {
    if (isMapEndTurnTransitionActive()) return;
    if (!mapSceneInstance?.cameras?.main) return;
    const cam = mapSceneInstance.cameras.main;
    const target = cam.zoom + delta;
    const pointer = mapSceneInstance.pointerInsideMap ? mapSceneInstance.input?.activePointer : null;
    mapSceneInstance.zoomTo(target, pointer, { mode: mapSceneInstance.zoomMode, useCenterFallback: true });
  };
  if (zoomInBtn) zoomInBtn.onclick = () => adjustZoom(zoomStep);
  if (zoomOutBtn) zoomOutBtn.onclick = () => adjustZoom(-zoomStep);
  const applyZoomMode = (enabled) => {
    preferredZoomMode = enabled ? "anchored" : "phaser";
    if (mapSceneInstance) {
      mapSceneInstance.zoomMode = enabled ? "anchored" : "phaser";
    }
    if (zoomModeLabel) {
      zoomModeLabel.textContent = enabled ? "Cursor lock" : "Default zoom";
    }
  };
  if (zoomModeToggle) {
    zoomModeToggle.checked = false;
    applyZoomMode(false);
    zoomModeToggle.onchange = () => applyZoomMode(zoomModeToggle.checked);
  }
  setupMenuPauseObserver();
}

function setupMenuPauseObserver() {
  const win = document.getElementById("townWindow");
  if (!win || win.__menuPauseObserved) return;
  win.__menuPauseObserved = true;
  const sync = () => {
    const isOpen = !win.classList.contains("hidden");
    if (isOpen && !Number.isFinite(menuPauseStartedAt)) {
      menuPauseStartedAt = Date.now();
      pauseRunClock("menu");
      // Movement is held while paused; the encounter timer restarts with the march.
      cancelEncounterTimer({ preservePending: true });
      releaseAllMarchKeys();
      refreshEndTurnButtonAvailability();
    } else if (!isOpen && Number.isFinite(menuPauseStartedAt)) {
      menuPauseStartedAt = null;
      resumeRunClock("menu");
      refreshEndTurnButtonAvailability();
    }
  };
  const observer = new MutationObserver(sync);
  observer.observe(win, { attributes: true, attributeFilter: ["class"] });
  sync();
}

function resolveOnboardingTourSteps() {
  const steps = typeof window !== "undefined" ? window.ContentLibrary?.OnboardingTourSteps : null;
  return Array.isArray(steps) ? steps : [];
}

function getTourElements() {
  return {
    overlay: document.getElementById("tourOverlay"),
    scrim: document.getElementById("tourScrim"),
    spotlight: document.getElementById("tourSpotlight"),
    window: document.getElementById("tourWindow"),
    header: document.querySelector("#tourWindow .window-header"),
    title: document.getElementById("tourTitle"),
    body: document.getElementById("tourBody"),
    prevBtn: document.getElementById("tourPrevBtn"),
    nextBtn: document.getElementById("tourNextBtn"),
    closeBtn: document.getElementById("tourCloseBtn"),
    skipToggle: document.getElementById("tourDontShowToggle"),
  };
}

function setEndTurnUiLocked(locked) {
  const ids = [
    "endTurnBtn",
    "mapHomeBtn",
    "mapZoomInBtn",
    "mapZoomOutBtn",
    "cursorLockZoomToggle",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if ("disabled" in el) {
      el.disabled = !!locked;
    }
    el.setAttribute("aria-disabled", locked ? "true" : "false");
  });
}

function isEndTurnBlockedByEncounter() {
  if (encounterOverlayState?.active) return true;
  if (campOverlayState?.active) return true;
  if (poiOverlayState?.active) return true;
  if (randomOverlayState?.active) return true;
  if (battleOverlayState?.active) return true;
  if (TRI_DICE_STATE?.rolling) return true;
  if (isMenuPauseActive()) return true;
  if (isEncounterTransitionActive()) return true;
  if (settlementOverlayState?.active && !settlementOverlayState.exitEnabled) return true;
  if (largeSettlementOverlayState?.active && !largeSettlementOverlayState.exitEnabled) return true;
  return false;
}

function refreshEndTurnButtonAvailability() {
  const state = getGlobalGameState();
  const inFlight = !!(state && state.endTurnInFlight);
  setEndTurnUiLocked(isEndTurnBlockedByEncounter() || inFlight);
}

async function closeAllScreensForEndTurn() {
  try {
    if (settlementOverlayState?.active) await toggleSettlementOverlay(false);
    if (largeSettlementOverlayState?.active) await toggleLargeSettlementOverlay(false);
  } catch (err) {
    console.warn("closeAllScreensForEndTurn failed", err);
  }
}

function setTourDim(enabled) {
  const { scrim } = getTourElements();
  if (!scrim) return;
  scrim.classList.toggle("dim-off", !enabled);
  tourState.dimEnabled = !!enabled;
}

function hideTourSpotlight() {
  const { spotlight } = getTourElements();
  if (!spotlight) return;
  spotlight.classList.add("hidden");
}

function applyTourSpotlight(rect, radius = 16) {
  const { spotlight } = getTourElements();
  if (!spotlight || !rect) return;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  spotlight.style.setProperty("--tour-x", `${centerX}px`);
  spotlight.style.setProperty("--tour-y", `${centerY}px`);
  spotlight.style.setProperty("--tour-w", `${Math.max(8, rect.width)}px`);
  spotlight.style.setProperty("--tour-h", `${Math.max(8, rect.height)}px`);
  spotlight.style.setProperty("--tour-radius", `${Math.max(4, radius)}px`);
  spotlight.classList.remove("hidden");
}

function resolvePhaserNodeRect(nodeId) {
  if (!nodeId || !mapSceneInstance?.nodeSprites || !mapSceneInstance?.cameras?.main) return null;
  const visual = mapSceneInstance.nodeSprites.get(nodeId);
  const icon = visual?.settlementIcon || visual?.icon;
  if (!icon || !icon.getBounds) return null;
  const bounds = icon.getBounds();
  const cam = mapSceneInstance.cameras.main;
  const container = document.getElementById("phaserContainer");
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  const scale = cam.zoom || 1;
  const x = (bounds.x - cam.worldView.x) * scale + rect.left;
  const y = (bounds.y - cam.worldView.y) * scale + rect.top;
  return {
    x,
    y,
    width: bounds.width * scale,
    height: bounds.height * scale,
  };
}

function resolveTourRect(step) {
  if (step?.phaserNodeId) {
    return resolvePhaserNodeRect(step.phaserNodeId);
  }
  if (!step?.target) return null;
  const target = document.querySelector(step.target);
  if (!target) return null;
  let rect = target.getBoundingClientRect();
  if (step.extraTarget) {
    const extra = document.querySelector(step.extraTarget);
    if (extra) {
      const extraRect = extra.getBoundingClientRect();
      const left = Math.min(rect.left, extraRect.left);
      const top = Math.min(rect.top, extraRect.top);
      const right = Math.max(rect.right, extraRect.right);
      const bottom = Math.max(rect.bottom, extraRect.bottom);
      rect = {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        x: left,
        y: top,
      };
    }
  }
  const padding = Number.isFinite(step.spotlightPadding) ? step.spotlightPadding : 10;
  return {
    x: rect.left - padding,
    y: rect.top - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function updateTourNavControls() {
  const { prevBtn, nextBtn } = getTourElements();
  if (!prevBtn || !nextBtn) return;
  const lastIndex = Math.max(0, tourState.steps.length - 1);
  const atEnd = tourState.index >= lastIndex;
  prevBtn.disabled = tourState.index <= 0;
  nextBtn.disabled = false;
  nextBtn.textContent = atEnd ? "Close" : "⇨";
  nextBtn.setAttribute("aria-label", atEnd ? "Close tour" : "Next step");
}

function isLoadingOverlayVisible() {
  const overlay = document.getElementById("loadingOverlay");
  if (!overlay) return false;
  return !overlay.classList.contains("hidden");
}

function clearTourPulse() {
  if (!tourState.pulseTargets.length) return;
  tourState.pulseTargets.forEach((el) => {
    if (el) el.classList.remove("tour-pulse-glow");
  });
  tourState.pulseTargets = [];
}

function addTourPulse(target) {
  if (!target) return;
  target.classList.add("tour-pulse-glow");
  tourState.pulseTargets.push(target);
}

function addTourPulseBySelector(selector) {
  if (!selector) return;
  const target = document.querySelector(selector);
  if (target) addTourPulse(target);
}

function openEndTurnTooltip(state) {
  const endTurnInfoBtn = document.getElementById("endTurnInfoBtn");
  const endTurnTooltip = document.getElementById("endTurnTooltip");
  if (!endTurnInfoBtn || !endTurnTooltip || !state) return;
  renderEndTurnTooltip(state);
  endTurnTooltip.classList.add("visible");
  endTurnInfoBtn.setAttribute("aria-expanded", "true");
  endTurnTooltip.setAttribute("aria-hidden", "false");
}

function closeEndTurnTooltip() {
  const endTurnInfoBtn = document.getElementById("endTurnInfoBtn");
  const endTurnTooltip = document.getElementById("endTurnTooltip");
  if (!endTurnInfoBtn || !endTurnTooltip) return;
  endTurnTooltip.classList.remove("visible");
  endTurnInfoBtn.setAttribute("aria-expanded", "false");
  endTurnTooltip.setAttribute("aria-hidden", "true");
}

function setHomeBaseTourGlow(state, enabled) {
  if (!mapSceneInstance || !mapSceneInstance.nodeSprites) return false;
  const visual = mapSceneInstance.nodeSprites.get("home");
  if (!visual) return false;
  if (enabled) {
    applyHomeBaseFx(mapSceneInstance, visual, 3);
  } else {
    const level = state?.baseLevel || 1;
    applyHomeBaseFx(mapSceneInstance, visual, level);
  }
  return true;
}

function applyTourStepBehavior(step, state) {
  if (!step) return;
  clearTourPulse();
  closeEndTurnTooltip();
  setHomeBaseTourGlow(state, false);
  const homeBaseSteps = new Set(["home-base-open", "home-units-tab", "home-loadout", "home-deploy", "home-build"]);
  if (homeBaseSteps.has(step.id)) {
    const needsHomeScene = !largeSettlementOverlayState.active
      || largeSettlementOverlayState.currentSettlementId !== "home";
    if (needsHomeScene) {
      startLargeSettlementScene("home", { skipNeutralSlot: true });
    }
  }
  if (step.id === "resources") {
    addTourPulseBySelector("#resourcePanel");
    return;
  }
  if (step.id === "ledger") {
    openEndTurnTooltip(state);
    addTourPulseBySelector("#endTurnInfoBtn");
    addTourPulseBySelector("#endTurnTooltip");
    return;
  }
  if (step.id === "turn-end") {
    addTourPulseBySelector("#endTurnBtn");
    return;
  }
  if (step.id === "home-base-map") {
    if (mapSceneInstance?.focusCameraOnHome) {
      mapSceneInstance.userAdjustedCamera = false;
      mapSceneInstance.focusCameraOnHome({ setZoom: true });
      mapSceneInstance.userAdjustedCamera = true;
    }
    const applied = setHomeBaseTourGlow(state, true);
    if (!applied) {
      setTimeout(() => {
        const currentId = tourState.steps[tourState.index]?.id;
        if (tourState.active && currentId === "home-base-map") {
          setHomeBaseTourGlow(state, true);
        }
      }, 300);
    }
    return;
  }
  if (step.id === "home-base-open") {
    if (largeSettlementOverlayState.currentSettlementId !== "home") {
      startLargeSettlementScene("home");
    }
    showHomeBaseUi(state);
    setHomeBaseTab(state, "units");
    return;
  }
  if (step.id === "home-units-tab") {
    showHomeBaseUi(state);
    setHomeBaseTab(state, "units");
    addTourPulseBySelector("#homeBaseTabUnits");
    return;
  }
  if (step.id === "home-loadout") {
    showHomeBaseUi(state);
    setHomeBaseTab(state, "units");
    const loadoutBtn = document.querySelector(".home-unit-actions .primary");
    if (loadoutBtn) addTourPulse(loadoutBtn);
    const units = state?.rangerUnits || [];
    const unit = units.find((entry) => entry && isUnitAtHome(entry, state) && isUnitIdle(entry) && !entry.isDead)
      || units.find((entry) => entry && !entry.isDead);
    if (unit?.id) {
      openLoadout(unit.id);
    }
    return;
  }
  if (step.id === "home-deploy") {
    showHomeBaseUi(state);
    setHomeBaseTab(state, "units");
    const loadoutWindow = document.getElementById("homeLoadoutWindow");
    if (loadoutWindow && loadoutWindow.classList.contains("hidden")) {
      const units = state?.rangerUnits || [];
      const activeId = state?.activeUnitId;
      let unit = units.find((entry) => entry && entry.id === activeId);
      if (!unit || unit.isDead) {
        unit = units.find((entry) => entry && isUnitAtHome(entry, state) && isUnitIdle(entry) && !entry.isDead)
          || units.find((entry) => entry && !entry.isDead);
      }
      if (unit?.id) {
        openLoadout(unit.id);
      }
    }
    const deployBtn = document.querySelector(".home-unit-actions .secondary");
    if (deployBtn) {
      addTourPulse(deployBtn);
    } else {
      addTourPulseBySelector("#homeBaseUnitsPanel");
    }
    return;
  }
  if (step.id === "home-build") {
    showHomeBaseUi(state);
    setHomeBaseTab(state, "build");
    addTourPulseBySelector("#homeBaseTabBuild");
    return;
  }
  if (step.id === "how-to") {
    toggleLargeSettlementOverlay(false);
    hideHomeBaseUi();
    addTourPulseBySelector("#howToBtn");
    return;
  }
}

function renderTourStep() {
  const step = tourState.steps[tourState.index];
  const { title, body } = getTourElements();
  if (!step) return;
  if (tourState.currentStepId && tourState.currentStepId !== step.id) {
    clearTourPulse();
    closeEndTurnTooltip();
    setHomeBaseTourGlow(tourState.gameState, false);
  }
  const homeBaseSteps = new Set(["home-base-open", "home-units-tab", "home-loadout", "home-deploy", "home-build"]);
  if (!homeBaseSteps.has(step.id)) {
    toggleLargeSettlementOverlay(false);
    hideHomeBaseUi();
  }
  if (title) title.textContent = step.title || step.titleKey || "";
  if (body) body.textContent = step.body || step.bodyKey || "";
  applyTourStepBehavior(step, tourState.gameState);
  const dimEnabled = step.dim !== false;
  const rect = resolveTourRect(step);
  const useSpotlight = !!(rect && dimEnabled);
  setTourDim(dimEnabled && !useSpotlight);
  if (useSpotlight) {
    const radius = Number.isFinite(step.spotlightRadius) ? step.spotlightRadius : 16;
    applyTourSpotlight(rect, radius);
  } else {
    hideTourSpotlight();
    if (step.phaserNodeId && tourState.active) {
      setTimeout(() => {
        const currentId = tourState.steps[tourState.index]?.id;
        if (tourState.active && currentId === step.id) {
          renderTourStep();
        }
      }, 120);
    }
  }
  tourState.currentStepId = step.id || null;
  updateTourNavControls();
}

function startOnboardingTour() {
  const { overlay, skipToggle } = getTourElements();
  if (!overlay) return;
  if (tourState.active) return;
  if (readStoredToggle(TOUR_SKIP_KEY, false)) return;
  if (!tourState.steps.length) return;
  tourState.active = true;
  tourState.index = 0;
  tourState.currentStepId = null;
  // Reading the tour should not cost score.
  pauseRunClock("tour");
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("tour-open");
  if (skipToggle) {
    skipToggle.checked = readStoredToggle(TOUR_SKIP_KEY, false);
  }
  renderTourStep();
}

function endOnboardingTour() {
  const { overlay } = getTourElements();
  if (!overlay) return;
  tourState.active = false;
  resumeRunClock("tour");
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tour-open");
  clearTourPulse();
  closeEndTurnTooltip();
  setHomeBaseTourGlow(tourState.gameState, false);
  hideTourSpotlight();
}

function setupOnboardingTour(state) {
  const els = getTourElements();
  if (!els.overlay) return;
  tourState.gameState = state || null;
  tourState.steps = resolveOnboardingTourSteps();
  if (!tourState.steps.length) return;
  if (els.prevBtn && !els.prevBtn.dataset.bound) {
    els.prevBtn.dataset.bound = "1";
    els.prevBtn.addEventListener("click", () => {
      if (!tourState.active) return;
      tourState.index = Math.max(0, tourState.index - 1);
      renderTourStep();
    });
  }
  if (els.nextBtn && !els.nextBtn.dataset.bound) {
    els.nextBtn.dataset.bound = "1";
    els.nextBtn.addEventListener("click", () => {
      if (!tourState.active) return;
      const lastIndex = Math.max(0, tourState.steps.length - 1);
      if (tourState.index >= lastIndex) {
        endOnboardingTour();
        return;
      }
      tourState.index = Math.min(lastIndex, tourState.index + 1);
      renderTourStep();
    });
  }
  if (els.closeBtn && !els.closeBtn.dataset.bound) {
    els.closeBtn.dataset.bound = "1";
    els.closeBtn.addEventListener("click", () => {
      if (!tourState.active) return;
      endOnboardingTour();
    });
  }
  if (els.skipToggle && !els.skipToggle.dataset.bound) {
    els.skipToggle.dataset.bound = "1";
    els.skipToggle.checked = readStoredToggle(TOUR_SKIP_KEY, false);
    els.skipToggle.addEventListener("change", (event) => {
      const enabled = !!event.target.checked;
      persistToggle(TOUR_SKIP_KEY, enabled);
    });
  }
  if (els.header && !els.header.dataset.bound) {
    els.header.dataset.bound = "1";
    const win = els.window;
    let dragState = null;
    const onMove = (event) => {
      if (!dragState || !win) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      const nextLeft = Math.min(Math.max(0, dragState.left + dx), window.innerWidth - dragState.width);
      const nextTop = Math.min(Math.max(0, dragState.top + dy), window.innerHeight - dragState.height);
      win.style.left = `${nextLeft}px`;
      win.style.top = `${nextTop}px`;
    };
    const stopDrag = () => {
      if (!dragState || !win) return;
      dragState = null;
      win.classList.remove("tour-window-dragging");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", stopDrag);
    };
    els.header.addEventListener("pointerdown", (event) => {
      if (!win) return;
      event.preventDefault();
      const rect = win.getBoundingClientRect();
      win.style.left = `${rect.left}px`;
      win.style.top = `${rect.top}px`;
      win.style.bottom = "auto";
      win.style.transform = "none";
      dragState = {
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
      win.classList.add("tour-window-dragging");
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", stopDrag);
    });
  }
  if (!tourState.keyHandlerBound) {
    const handleTourKeydown = (event) => {
      if (!tourState.active) return;
      const tourWindow = document.getElementById("tourWindow");
      const allow = tourWindow && tourWindow.contains(event.target);
      if (!allow) {
        event.preventDefault();
      }
      event.stopPropagation();
    };
    const handleTourResize = () => {
      if (!tourState.active) return;
      renderTourStep();
    };
    document.addEventListener("keydown", handleTourKeydown, true);
    window.addEventListener("resize", handleTourResize);
    window.addEventListener("scroll", handleTourResize);
    tourState.keyHandlerBound = true;
  }
  if (tourState.pendingStart) return;
  tourState.pendingStart = true;
  const waitForReady = () => {
    if (!tourState.pendingStart) return;
    if (tourState.active) return;
    if (readStoredToggle(TOUR_SKIP_KEY, false)) {
      tourState.pendingStart = false;
      return;
    }
    if (!mapSceneInstance?.ready || isLoadingOverlayVisible()) {
      requestAnimationFrame(waitForReady);
      return;
    }
    tourState.pendingStart = false;
    startOnboardingTour();
  };
  waitForReady();
}

function goToHomeBaseFromMap(state, event) {
  if (!canUseMapHotkeys(state, event, { allowWhileMoving: true })) return false;
  haltSquadMovementForEncounter();
  if (mapSceneInstance) {
    mapSceneInstance.userAdjustedCamera = false;
    mapSceneInstance.focusCameraOnHome({ setZoom: true });
  }
  startLargeSettlementScene("home");
  return true;
}

function clearSquadSelectionFromMap(state, event, options = {}) {
  if (options.checkHotkeys && !canUseMapHotkeys(state, event)) return false;
  if (!state?.squadSelected) return false;
  const unit = getActiveRangerUnit(state);
  const pos = getUnitPositionPct(state, unit);
  const nearby = findNearbyLargeSettlement(state, pos);
  const suppressId = nearby?.id || unit?.currentNodeId;
  const suppressPos = nearby?.pos || state.nodeMap?.get?.(suppressId)?.pos || null;
  if (suppressId && suppressPos) {
    state.largeSettlementSceneSuppressedId = suppressId;
    state.largeSettlementSceneSuppressPos = { x: suppressPos.x, y: suppressPos.y };
  }
  state.squadSelected = false;
  state.selectedNode = null;
  updateRegionModal(state, null);
  updateSquadWindow(state);
  renderMap(state);
  return true;
}

function focusHomeBaseViewportFromMap(state, event) {
  if (!canUseMapHotkeys(state, event)) return false;
  if (mapSceneInstance) {
    mapSceneInstance.userAdjustedCamera = false;
    mapSceneInstance.focusCameraOnHome({ setZoom: true });
  }
  return true;
}

function tryTriggerLargeSettlementRollHotkey(event) {
  if (event && isEditableTarget(event.target)) return false;
  if (!largeSettlementOverlayState.active) return false;
  const btn = largeSettlementOverlayState.neutralActionBtn;
  if (!btn || btn.disabled || btn.offsetParent === null) return false;
  const stage = largeSettlementOverlayState.rollStage;
  if (stage !== "neutral-ready" && stage !== "enemy-ready") return false;
  btn.click();
  return true;
}

function tryTriggerShopHotkey(event) {
  if (event && isEditableTarget(event.target)) return false;
  if (!largeSettlementOverlayState.active) return false;
  const toggle = largeSettlementOverlayState.shopToggleBtn;
  if (!toggle) return false;
  if (toggle.disabled || toggle.style.display === "none" || toggle.offsetParent === null) return false;
  toggle.click();
  return true;
}

function tryTriggerSceneRoll(event) {
  if (event && isEditableTarget(event.target)) return false;
  // Tri-dice slot (neutral large settlement "Spin for resource").
  const triOverlay = TRI_DICE_STATE.overlay;
  if (
    triOverlay
    && !triOverlay.classList.contains("hidden")
    && TRI_DICE_STATE.mode === "neutral-large"
    && !TRI_DICE_STATE.rolling
    && largeSettlementOverlayState.rollStage === "neutral-slot"
  ) {
    spinTriDiceSlot({ silentResult: true, onComplete: TRI_DICE_STATE.onComplete });
    return true;
  }
  // Large settlement persuasion / resources / neutral-resources roll.
  if (largeSettlementOverlayState.active && !largeSettlementOverlayState.rolling) {
    const stage = largeSettlementOverlayState.rollStage;
    if (stage === "persuasion" || stage === "resources" || stage === "neutral-resources") {
      handleLargeSettlementOverlayClick(null);
      return true;
    }
  }
  // Small settlement roll (only before joining).
  if (settlementOverlayState.active && !settlementOverlayState.rolling && !settlementOverlayState.exitEnabled) {
    const gameState = getGlobalGameState();
    const settlement = getSmallSettlementById(gameState, settlementOverlayState.currentSettlementId);
    if (settlement && !settlement.joinedFaction) {
      handleSettlementOverlayClick();
      return true;
    }
  }
  // Encounter scenes: roll dice if not yet rolled.
  const encounterScenes = [
    { state: campOverlayState, handler: handleCampOverlayClick },
    { state: poiOverlayState, handler: handlePoiOverlayClick },
    { state: randomOverlayState, handler: handleRandomOverlayClick },
    { state: battleOverlayState, handler: handleBattleOverlayClick },
  ];
  for (const { state, handler } of encounterScenes) {
    if (!state?.active) continue;
    if (state.rolling) continue;
    if (state.exitEnabled) continue;
    if (isEncounterRollLocked()) continue;
    handler();
    return true;
  }
  return false;
}

function tryTriggerBackToMap(event) {
  if (event && isEditableTarget(event.target)) return false;
  const scenes = [
    campOverlayState,
    poiOverlayState,
    randomOverlayState,
    battleOverlayState,
    settlementOverlayState,
    largeSettlementOverlayState,
  ];
  const active = scenes.find((state) => state?.active);
  if (!active || !active.exitEnabled) return false;
  const btn = active.returnBtn;
  if (!btn || btn.disabled || btn.offsetParent === null) return false;
  btn.click();
  return true;
}

function isHomeBaseSceneActive() {
  return !!(
    largeSettlementOverlayState.active
    && largeSettlementOverlayState.currentSettlementId === "home"
  );
}

function findFirstDeployableHomeUnit(state) {
  const units = state?.rangerUnits || [];
  return units.find((unit) => unit
    && !unit.isDead
    && !unit.deployed
    && isUnitAtHome(unit, state)
    && isUnitIdle(unit)) || null;
}

function findFirstLoadoutEligibleHomeUnit(state) {
  const units = state?.rangerUnits || [];
  return units.find((unit) => unit
    && !unit.isDead
    && isUnitAtHome(unit, state)
    && isUnitIdle(unit)) || null;
}

async function deployUnitFromHomeBaseHotkey(state, unit) {
  state.activeUnitId = unit.id;
  deploySquadToNode(state, "home");
  await toggleLargeSettlementOverlay(false);
  state.squadSelected = true;
  state.squadPaneClosed = false;
  updateSquadWindow(state);
  if (mapSceneInstance?.focusCameraOnHome) {
    mapSceneInstance.userAdjustedCamera = false;
    mapSceneInstance.focusCameraOnHome({ setZoom: true });
    mapSceneInstance.userAdjustedCamera = true;
  }
  if (mapSceneInstance?.setActiveUnitMarker) {
    mapSceneInstance.setActiveUnitMarker(unit.id);
  }
  hideHomeBaseUi();
}

function handleHomeBaseSceneHotkey(state, event) {
  if (!isHomeBaseSceneActive()) return false;
  if (event && isEditableTarget(event.target)) return false;
  const key = event?.key;
  if (!key) return false;
  const lowered = key.toLowerCase();
  if (lowered === "d") {
    const unit = findFirstDeployableHomeUnit(state);
    if (!unit) return false;
    deployUnitFromHomeBaseHotkey(state, unit);
    return true;
  }
  if (lowered === "b") {
    const ui = document.getElementById("homeBaseUi");
    const buildBtn = document.getElementById("homeBaseTabBuild");
    const buildPanel = document.getElementById("homeBaseBuildPanel");
    const alreadyOnBuild = !!(buildBtn?.classList.contains("active")
      && buildPanel && !buildPanel.classList.contains("hidden"));
    if (alreadyOnBuild) return false;
    if (ui && ui.classList.contains("hidden")) showHomeBaseUi(state);
    setHomeBaseTab(state, "build");
    return true;
  }
  if (lowered === "l") {
    const unit = findFirstLoadoutEligibleHomeUnit(state);
    if (!unit) return false;
    const ui = document.getElementById("homeBaseUi");
    if (ui && ui.classList.contains("hidden")) showHomeBaseUi(state);
    setHomeBaseTab(state, "units");
    openLoadout(unit.id);
    return true;
  }
  return false;
}

const WASD_KEYS = new Set(["w", "a", "s", "d"]);
const wasdState = { w: false, a: false, s: false, d: false };

function updateKeyboardMarchTarget(state, event) {
  if (!canUseMapHotkeys(state, event, { allowWhileMoving: true })) return false;
  if (!canIssueUnitMovementOrders()) return false;
  const unit = getActiveRangerUnit(state);
  if (!unit?.deployed || unit?.isDead || !state?.squadSelected) return false;
  const apLeft = typeof unit?.inventory?.ap === "number" ? unit.inventory.ap : 0;
  const gasLeft = typeof unit?.inventory?.gas === "number" ? unit.inventory.gas : 0;
  const usesGas = isVehicleUnit(unit);
  if (apLeft <= 0) {
    if (state?.logger) {
      state.logger.log("Rangers are out of action points and must rest until next turn.");
    }
    return false;
  }
  if (usesGas && gasLeft <= 0) {
    if (state?.logger) {
      state.logger.log("Rangers are out of gas and cannot march.");
    }
    return false;
  }
  const pos = getUnitPositionPct(state, unit);
  if (!pos) return false;
  const moveX = (wasdState.d ? 1 : 0) + (wasdState.a ? -1 : 0);
  const moveY = (wasdState.s ? 1 : 0) + (wasdState.w ? -1 : 0);
  if (!moveX && !moveY) return false;
  // Treat held keys as a direction vector in *screen/world* space (so W+D is
  // a visual 45° on screen even when the map is non-square), then convert that
  // direction into pct space and project from the unit's current position to
  // the map edge along it.
  const worldW = mapSceneInstance?.worldWidth || 1;
  const worldH = mapSceneInstance?.worldHeight || 1;
  const dirLen = Math.sqrt(moveX * moveX + moveY * moveY);
  const worldDx = moveX / dirLen;
  const worldDy = moveY / dirLen;
  const dx = (worldDx / worldW) * 100;
  const dy = (worldDy / worldH) * 100;
  let tEdge = Infinity;
  if (dx > 0) tEdge = Math.min(tEdge, (100 - pos.x) / dx);
  else if (dx < 0) tEdge = Math.min(tEdge, (0 - pos.x) / dx);
  if (dy > 0) tEdge = Math.min(tEdge, (100 - pos.y) / dy);
  else if (dy < 0) tEdge = Math.min(tEdge, (0 - pos.y) / dy);
  if (!Number.isFinite(tEdge) || tEdge <= 0) return false;
  const next = {
    x: Math.max(0, Math.min(100, pos.x + dx * tEdge)),
    y: Math.max(0, Math.min(100, pos.y + dy * tEdge)),
  };
  if (next.x === pos.x && next.y === pos.y) return false;
  const fromPct = { ...pos };
    unit.moveTargetPct = next;
  unit.isMoving = true;
  unit.keyboardMarching = true;
  if (mapSceneInstance?.pctToWorld && mapSceneInstance?.spawnMovePing) {
    const world = mapSceneInstance.pctToWorld(next);
    if (world) {
      mapSceneInstance.spawnMovePing(world.x, world.y);
    }
  }
  if (mapSceneInstance) {
    mapSceneInstance.marchUiDirty = true;
    mapSceneInstance.marchUiAccumulator = 0;
    mapSceneInstance.pendingSettlementOverlapCheck = true;
  }
  return true;
}

function stopKeyboardMarching(state) {
  // Covers every unit, not just the active one: the player may have switched units
  // while still holding a march key.
  let stopped = false;
  for (const unit of state?.rangerUnits || []) {
    if (!unit?.keyboardMarching) continue;
    unit.moveTargetPct = null;
    unit.isMoving = false;
    unit.keyboardMarching = false;
    stopped = true;
  }
  if (stopped && mapSceneInstance) {
    mapSceneInstance.marchUiDirty = true;
    mapSceneInstance.marchUiAccumulator = 0;
  }
  return stopped;
}

// The key-up for a held march key never arrives if focus leaves the window (Alt-Tab).
function releaseAllMarchKeys() {
  wasdState.w = false;
  wasdState.a = false;
  wasdState.s = false;
  wasdState.d = false;
  stopKeyboardMarching(getGlobalGameState());
}
  function deploySquadToNode(state, nodeId) {
    if (!state || !nodeId) return;
    const node = state.nodeMap?.get?.(nodeId);
    if (!node) return;
    const unit = getActiveRangerUnit(state);
  if (!unit) return;
  ensureUnitTravelState(state, unit);
  const townWin = document.getElementById("townWindow");
  const keepTownOpen = townWin && !townWin.classList.contains("hidden");
  unit.currentNodeId = nodeId;
  unit.deployed = true;
  unit.movePoints = CONFIG.movePointsPerTurn;
  unit.positionPct = node.pos ? { x: node.pos.x, y: node.pos.y } : null;
    unit.moveTargetPct = null;
    unit.isMoving = false;
    unit.justDeployed = true;
    preloadAllDiceScenesOnce(); // start dice asset load as soon as the squad is deployed
    state.squadVisionSource = null;
    state.squadPaneClosed = false;
    state.activeUnitId = unit.id;
    if (state.squad) state.squad.currentUnitId = unit.id;
    state.refreshVisibility();
    state.squadSelected = true;
    if (mapSceneInstance) {
      mapSceneInstance.pendingSettlementOverlapCheck = true;
      if (nodeId === "home" && mapSceneInstance.focusCameraOnHome) {
        mapSceneInstance.userAdjustedCamera = false;
        mapSceneInstance.focusCameraOnHome({ setZoom: true });
        mapSceneInstance.userAdjustedCamera = true;
      } else {
        mapSceneInstance.userAdjustedCamera = true;
      }
      if (mapSceneInstance.setActiveUnitMarker) {
        mapSceneInstance.setActiveUnitMarker(unit.id);
      }
    }
  renderMap(state);
  updateRegionModal(state, null);
  updateTownWindow(state);
  updateSquadWindow(state);
  if (mapSceneInstance?.syncMarkersToUnits) {
    mapSceneInstance.syncMarkersToUnits();
  }
  if (keepTownOpen && townWin) {
    townWin.classList.remove("hidden");
  }
  state.logger.log(`Rangers deployed to ${node.name}.`);
}

function updateRegionModal(state, nodeId) {
  const modal = document.getElementById("regionModal");
  if (modal) modal.classList.add("hidden");
  return;
  const title = document.getElementById("regionTitle");
  const details = document.getElementById("regionDetails");
  const deployBtn = document.getElementById("deployBtn");
  if (!modal || !title || !details || !deployBtn) return;
  deployBtn.disabled = true;

  if (!nodeId || !state?.visibleNodes?.has(nodeId)) {
    modal.classList.add("hidden");
    details.textContent = "Select a region.";
    return;
  }

  const node = state.nodeMap.get(nodeId);
  if (nodeId === "home") {
    modal.classList.add("hidden");
    details.textContent = "Select a region.";
    if (state.largeSettlementSceneSuppressedId === "home") {
      logHomeSceneDebug("Clearing home suppression from region selection.");
      state.largeSettlementSceneSuppressedId = null;
    }
    if (!largeSettlementOverlayState.active) {
      logHomeSceneDebug("Launching home scene from region selection.");
      startLargeSettlementScene("home");
    }
    return;
  }
  const yieldText = resourceListMarkup(node.yields || {});
  title.textContent = node.name;
  details.innerHTML = `
    <div><strong>Income:</strong> ${yieldText || "None"}</div>
    <div><strong>Stronghold:</strong> ${node.stronghold ? "Yes" : "No"}</div>
    <div><strong>Defense:</strong> ${node.defense}</div>
      `;
  modal.classList.remove("hidden");

  const activeUnit = getActiveRangerUnit(state);
  if (!activeUnit?.deployed && node.owner === "player") {
    deployBtn.disabled = false;
    deployBtn.onclick = () => {
      deploySquadToNode(state, nodeId);
    };
  }

}

function updateTownWindow(_state) {
  // Audio is controlled by the music widget; the Menu has no audio toggles.
}

function getHomeBuildCopy() {
  const copy = (typeof window !== "undefined" && window.ContentLibrary && window.ContentLibrary.HomeBaseBuild)
    ? window.ContentLibrary.HomeBaseBuild
    : {};
  return {
    assembleRecon: copy.assembleRecon || "",
    trainUnit: copy.trainUnit || "",
    levelUpUnit: copy.levelUpUnit || "",
    weaponUpgrade: copy.weaponUpgrade || "",
    baseLevelTwo: copy.baseLevelTwo || "",
    baseLevelThree: copy.baseLevelThree || "",
    solarPanel: copy.solarPanel || "",
    solarPanelOwned: copy.solarPanelOwned || "",
    binocs: copy.binocs || "",
    binocsOwned: copy.binocsOwned || "",
    luckyCharm: copy.luckyCharm || "",
    luckyCharmOwned: copy.luckyCharmOwned || "",
    firesale: copy.firesale || "",
    firesaleOwned: copy.firesaleOwned || "",
    waterConservation: copy.waterConservation || "",
    waterConservationOwned: copy.waterConservationOwned || "",
    foodRationing: copy.foodRationing || "",
    foodRationingOwned: copy.foodRationingOwned || "",
    rescueDrone: copy.rescueDrone || "",
    rescueDroneOwned: copy.rescueDroneOwned || "",
    gasDrone: copy.gasDrone || "",
    gasDroneOwned: copy.gasDroneOwned || "",
  };
}

function formatCostLabel(cost) {
  if (!cost) return "";
  if (typeof cost === "string") return cost;
  return RESOURCE_KEYS.filter((key) => cost[key]).map((key) => `${cost[key]} ${key}`).join(", ");
}

function canAffordCost(state, cost) {
  if (!cost || typeof cost === "string") return true;
  return !!state?.resources?.canAfford(cost);
}

function spendBuildCost(state, cost, reason = "home build") {
  if (!cost || typeof cost === "string") return true;
  if (!state?.resources?.spend) return false;
  return state.resources.spend(cost, (key, amount) => state.recordResourceLoss(reason, key, amount));
}

function ensureUpgradeState(state) {
  if (!state) return null;
  if (!state.purchasedUpgrades) {
    state.purchasedUpgrades = new Set();
  } else if (Array.isArray(state.purchasedUpgrades)) {
    state.purchasedUpgrades = new Set(state.purchasedUpgrades);
  }
  return state.purchasedUpgrades;
}

function hasPurchasedUpgrade(state, id) {
  const upgrades = ensureUpgradeState(state);
  return !!upgrades?.has(id);
}

function markUpgradePurchased(state, id) {
  const upgrades = ensureUpgradeState(state);
  if (!upgrades || upgrades.has(id)) return false;
  upgrades.add(id);
  return true;
}

function applySolarPanelBonusToUnit(state, unit) {
  if (!state || !unit) return;
  ensureRangerHasResourceTypes(unit);
  unit.solarBonus = Math.max(0, Math.trunc(unit.solarBonus || 0));
  state.clampUnitInventory(unit);
}

function applySolarPanelUpgrade(state) {
  if (!state || !markUpgradePurchased(state, HOME_BUILD_IDS.solarPanel)) return false;
  if (state.logger) {
    state.logger.log("Home base: Solar arrays installed. Gas reserves stabilized.");
  }
  return true;
}

function applyBinocsUpgrade(state) {
  if (!state || !markUpgradePurchased(state, HOME_BUILD_IDS.binocs)) return false;
  for (const unit of state.rangerUnits || []) {
    unit.visionBonus = Math.max(0, Math.trunc(unit.visionBonus || 0) + 2);
  }
  if (state.logger) {
    state.logger.log("Home base: Binocs issued. Patrol visibility improved.");
  }
  if (typeof computeVisibility === "function") {
    computeVisibility(state);
  }
  return true;
}

function applyWaterConservationUpgrade(state) {
  if (!state || !markUpgradePurchased(state, HOME_BUILD_IDS.waterConservation)) return false;
  state.tempUpkeepEffects = state.tempUpkeepEffects || { food: 0, water: 0 };
  state.tempUpkeepEffects.water = 2;
  state.logger?.log("Home base: Water conservation in effect for the next 2 turns.");
  return true;
}

function applyFoodRationingUpgrade(state) {
  if (!state || !markUpgradePurchased(state, HOME_BUILD_IDS.foodRationing)) return false;
  state.tempUpkeepEffects = state.tempUpkeepEffects || { food: 0, water: 0 };
  state.tempUpkeepEffects.food = 2;
  state.logger?.log("Home base: Food rationing in effect for the next 2 turns.");
  return true;
}

function getVehicleUpgradeCap(state) {
  const level = state?.baseLevel || 1;
  const maxLevel = VEHICLE_MAX_UPGRADE_LEVEL || 1;
  if (level >= 3) return maxLevel;
  return Math.min(BASE_LEVEL_UPGRADE_CAP, maxLevel);
}

function assembleReconUnit(state) {
  if (!state?.createRangerUnit) return null;
  const unit = state.createRangerUnit({ type: "soldier" });
  if (!unit) return null;
  state.activeUnitId = unit.id;
  if (state.logger) {
    state.logger.log(`Home base: ${unit.callsign} assembled.`);
  }
  refreshRangerPaneScene(state);
  if (mapSceneInstance?.setActiveUnitMarker) {
    mapSceneInstance.setActiveUnitMarker(unit.id);
  }
  return unit;
}

function assembleVehicleUnit(state) {
  if (!state?.createRangerUnit) return null;
  const unit = state.createRangerUnit({ type: "vehicle" });
  if (!unit) return null;
  state.activeUnitId = unit.id;
  if (state.logger) {
    state.logger.log(`Home base: ${unit.callsign} assembled (vehicle).`);
  }
  refreshRangerPaneScene(state);
  if (mapSceneInstance?.setActiveUnitMarker) {
    mapSceneInstance.setActiveUnitMarker(unit.id);
  }
  return unit;
}

function buildHomeBaseItems(state) {
  const copy = getHomeBuildCopy();
  const solarPurchased = hasPurchasedUpgrade(state, HOME_BUILD_IDS.solarPanel);
  const binocsPurchased = hasPurchasedUpgrade(state, HOME_BUILD_IDS.binocs);
  const luckyCharmPurchased = hasPurchasedUpgrade(state, HOME_BUILD_IDS.luckyCharm);
  const firesalePurchased = hasPurchasedUpgrade(state, HOME_BUILD_IDS.firesale);
  const waterConservationPurchased = hasPurchasedUpgrade(state, HOME_BUILD_IDS.waterConservation);
  const foodRationingPurchased = hasPurchasedUpgrade(state, HOME_BUILD_IDS.foodRationing);
  const rescueDronePurchased = hasPurchasedUpgrade(state, HOME_BUILD_IDS.rescueDrone);
  const gasDronePurchased = hasPurchasedUpgrade(state, HOME_BUILD_IDS.gasDrone);
  const reconCost = HOME_BUILD_COSTS.reconUnit;
  const vehicleCost = HOME_BUILD_COSTS.vehicleUnit;
  const trainCost = HOME_BUILD_COSTS.trainUnit;
  const levelUpSoldierCost = HOME_BUILD_COSTS.levelUpUnit;
  const levelUpVehicleCost = HOME_BUILD_COSTS.levelUpVehicle;
  const weaponCost = HOME_BUILD_COSTS.weaponUpgrade;
  const weaponVehicleCost = HOME_BUILD_COSTS.weaponUpgradeVehicle;
  const baseLevelCost = HOME_BUILD_COSTS.baseLevelTwo;
  const baseLevelThreeCost = HOME_BUILD_COSTS.baseLevelThree;
  const solarCost = HOME_BUILD_COSTS.solarPanel;
  const binocsCost = HOME_BUILD_COSTS.binocs;
  const luckyCharmCost = HOME_BUILD_COSTS.luckyCharm;
  const firesaleCost = HOME_BUILD_COSTS.firesale;
  const waterConservationCost = HOME_BUILD_COSTS.waterConservation;
  const foodRationingCost = HOME_BUILD_COSTS.foodRationing;
  const rescueDroneCost = HOME_BUILD_COSTS.rescueDrone;
  const gasDroneCost = HOME_BUILD_COSTS.gasDrone;
  const activeUnit = getActiveRangerUnit(state);
  const canTrain = !!(activeUnit && !activeUnit.isDead && isUnitIdle(activeUnit));
  const eligibleUnits = (state.rangerUnits || []).filter((unit) => !!(unit && !unit.isDead && isUnitIdle(unit)));
  const eligibleLevelUnits = eligibleUnits.filter((unit) => {
    const cap = getUnitUpgradeCap(unit, state);
    return getUnitLevel(unit) < cap;
  });
  const baseLevelLocksUpgrades = (state?.baseLevel || 1) < 3
    && eligibleUnits.some((unit) => getUnitLevel(unit) >= BASE_LEVEL_UPGRADE_CAP
      && getUnitLevel(unit) < getUnitMaxUpgradeLevel(unit));
  const canUpgradeUnit = eligibleLevelUnits.length > 0;
  const canUpgradeWeapon = eligibleUnits.some((unit) => isWeaponUpgradeAvailable(unit));
  const canAffordLevelUp = eligibleLevelUnits.some((unit) => {
    const cost = unit?.type === "vehicle" ? levelUpVehicleCost : levelUpSoldierCost;
    return canAffordCost(state, cost);
  });
  const canAffordWeapon = eligibleUnits.some((unit) => {
    if (!isWeaponUpgradeAvailable(unit)) return false;
    const cost = unit?.type === "vehicle" ? weaponVehicleCost : weaponCost;
    return canAffordCost(state, cost);
  });
  const unitCount = countLivingRangerUnits(state);
  const atUnitCap = unitCount >= (state.maxUnits || 0);
  const baseUpgradeOwned = (state.baseLevel || 1) >= 2;
  const baseUpgradeThreeOwned = (state.baseLevel || 1) >= 3;
  const canBuildVehicle = (state.baseLevel || 1) >= 2;
  return [
    {
      id: HOME_BUILD_IDS.reconUnit,
      label: "Assemble Recon Unit",
      category: "Personnel",
      cost: reconCost,
      subtitle: copy.assembleRecon,
      owned: false,
      disabled: atUnitCap || !canAffordCost(state, reconCost),
      cta: "Buy",
      onSelect: () => {
        if (atUnitCap || !canAffordCost(state, reconCost)) return;
        if (!spendBuildCost(state, reconCost)) return;
        assembleReconUnit(state);
        renderResources(state);
        renderHomeBaseUnits(state);
        updateUpgradeWindow(state, document.getElementById("homeBuildList"));
      },
    },
    ...(canBuildVehicle ? [{
      id: HOME_BUILD_IDS.vehicleUnit,
      label: "Assemble Vehicle Unit",
      category: "Personnel",
      cost: vehicleCost,
      subtitle: "Tear up the wasteland from the safety of a vehicle.",
      owned: false,
      disabled: !canBuildVehicle || atUnitCap || !canAffordCost(state, vehicleCost),
      cta: "Buy",
      onSelect: () => {
        if (!canBuildVehicle || atUnitCap || !canAffordCost(state, vehicleCost)) return;
        if (!spendBuildCost(state, vehicleCost)) return;
        assembleVehicleUnit(state);
        renderResources(state);
        renderHomeBaseUnits(state);
        updateUpgradeWindow(state, document.getElementById("homeBuildList"));
      },
    }] : []),
    {
      id: HOME_BUILD_IDS.levelUpUnit,
      label: "Level Up Unit",
      category: "Personnel",
      cost: levelUpSoldierCost,
      subtitle: copy.levelUpUnit,
      owned: false,
      disabled: !canUpgradeUnit || !canAffordLevelUp,
      disabledReason: !canUpgradeUnit && baseLevelLocksUpgrades
        ? "Requires base level 3 to upgrade units past level 10."
        : "",
      cta: "Buy",
      onSelect: () => {
        openUnitUpgradePicker({
          title: "Select a unit to level up",
          cost: levelUpSoldierCost,
          state,
          allowRemoteUnits: true,
          costForUnit: (unit) => (unit?.type === "vehicle" ? levelUpVehicleCost : levelUpSoldierCost),
          unitEligible: (unit, nextState) => {
            const cap = getUnitUpgradeCap(unit, nextState);
            return getUnitLevel(unit) < cap;
          },
          onApply: (selectedUnit) => {
            const levelCap = getUnitUpgradeCap(selectedUnit, state);
            if (getUnitLevel(selectedUnit) >= levelCap) return;
            const spriteCap = getUnitSpriteStageCap(selectedUnit, state);
            const nextStage = Math.min(spriteCap, Math.trunc(selectedUnit.spriteStage || 0) + 1);
            selectedUnit.spriteStage = nextStage;
            selectedUnit.apBonus = Math.trunc(selectedUnit.apBonus || 0) + 1;
            selectedUnit.inventory.ap = (selectedUnit.inventory.ap || 0) + 1;
            selectedUnit.level = getUnitLevel(selectedUnit) + 1;
            state.clampUnitInventory(selectedUnit);
          },
        });
      },
    },
    {
      id: HOME_BUILD_IDS.weaponUpgrade,
      label: "Level Up Weapon",
      category: "Personnel",
      cost: weaponCost,
      subtitle: copy.weaponUpgrade,
      owned: false,
      disabled: !canUpgradeWeapon || !canAffordWeapon,
      cta: "Buy",
      onSelect: () => {
        openUnitUpgradePicker({
          title: "Select a unit to upgrade weapon",
          cost: weaponCost,
          state,
          allowRemoteUnits: true,
          costForUnit: (unit) => (unit?.type === "vehicle" ? weaponVehicleCost : weaponCost),
          unitEligible: (unit) => isWeaponUpgradeAvailable(unit),
          labelForUnit: (unit) => `Weapon Lvl. ${getWeaponUpgradeIndex(unit?.weaponFrameIndex ?? 1)}`,
          onApply: (selectedUnit) => {
            selectedUnit.rollBonus = Math.trunc(selectedUnit.rollBonus || 0) + 1;
            selectedUnit.weaponFrameIndex = getWeaponUpgradeIndex((selectedUnit.weaponFrameIndex || 1) + 1);
          },
        });
      },
    },
    ...(baseUpgradeOwned ? [] : [{
      id: HOME_BUILD_IDS.baseLevelTwo,
      label: "Level Up Base (1→2)",
      category: "Facility",
      cost: baseLevelCost,
      subtitle: copy.baseLevelTwo,
      owned: baseUpgradeOwned,
      disabled: baseUpgradeOwned || !canAffordCost(state, baseLevelCost),
      cta: "Buy",
      onSelect: () => {
        if (baseUpgradeOwned || !canAffordCost(state, baseLevelCost)) return;
        if (!spendBuildCost(state, baseLevelCost)) return;
        state.baseLevel = 2;
        state.maxUnits = Math.max(state.maxUnits || 0, maxUnitsForBaseLevel(2));
        if (state.logger) {
          state.logger.log("Home base upgraded to level two. Vehicle units unlocked.");
        }
        renderResources(state);
        updateUpgradeWindow(state, document.getElementById("homeBuildList"));
        renderMap(state);
      },
    }]),
    ...(!baseUpgradeOwned || baseUpgradeThreeOwned ? [] : [{
      id: HOME_BUILD_IDS.baseLevelThree,
      label: "Level Up Base (2→3)",
      category: "Facility",
      cost: baseLevelThreeCost,
      subtitle: copy.baseLevelThree,
      owned: baseUpgradeThreeOwned,
      disabled: baseUpgradeThreeOwned || !canAffordCost(state, baseLevelThreeCost),
      cta: "Buy",
      onSelect: () => {
        if (baseUpgradeThreeOwned || !canAffordCost(state, baseLevelThreeCost)) return;
        if (!spendBuildCost(state, baseLevelThreeCost)) return;
        state.baseLevel = 3;
        state.maxUnits = Math.max(state.maxUnits || 0, maxUnitsForBaseLevel(3));
        if (state.logger) {
          state.logger.log("Home base upgraded to level three. Vehicle bays expanded.");
        }
        renderResources(state);
        updateUpgradeWindow(state, document.getElementById("homeBuildList"));
        renderMap(state);
      },
    }]),
    {
      id: HOME_BUILD_IDS.solarPanel,
      label: "Solar Panels",
      category: "Equipment",
      cost: solarCost,
      subtitle: solarPurchased ? copy.solarPanelOwned : copy.solarPanel,
      owned: solarPurchased,
      disabled: solarPurchased || !canAffordCost(state, solarCost),
      cta: solarPurchased ? "Owned" : "Buy",
      onSelect: () => {
        if (solarPurchased || !canAffordCost(state, solarCost)) return;
        if (!spendBuildCost(state, solarCost)) return;
        applySolarPanelUpgrade(state);
        renderResources(state);
        updateUpgradeWindow(state, document.getElementById("homeBuildList"));
      },
    },
    {
      id: HOME_BUILD_IDS.binocs,
      label: "Standard Issue Binocs",
      category: "Equipment",
      cost: binocsCost,
      subtitle: binocsPurchased ? copy.binocsOwned : copy.binocs,
      owned: binocsPurchased,
      disabled: binocsPurchased || !canAffordCost(state, binocsCost),
      cta: binocsPurchased ? "Owned" : "Buy",
      onSelect: () => {
        if (binocsPurchased || !canAffordCost(state, binocsCost)) return;
        if (!spendBuildCost(state, binocsCost)) return;
        applyBinocsUpgrade(state);
        renderResources(state);
        updateUpgradeWindow(state, document.getElementById("homeBuildList"));
      },
    },
    {
      id: HOME_BUILD_IDS.luckyCharm,
      label: "Lucky Charm",
      category: "Equipment",
      cost: luckyCharmCost,
      subtitle: luckyCharmPurchased ? copy.luckyCharmOwned : copy.luckyCharm,
      owned: luckyCharmPurchased,
      disabled: luckyCharmPurchased || !canAffordCost(state, luckyCharmCost),
      cta: luckyCharmPurchased ? "Owned" : "Buy",
      onSelect: () => {
        if (luckyCharmPurchased || !canAffordCost(state, luckyCharmCost)) return;
        if (!spendBuildCost(state, luckyCharmCost)) return;
        markUpgradePurchased(state, HOME_BUILD_IDS.luckyCharm);
        renderResources(state);
        updateUpgradeWindow(state, document.getElementById("homeBuildList"));
      },
    },
    {
      id: HOME_BUILD_IDS.firesale,
      label: "Firesale",
      category: "Equipment",
      cost: firesaleCost,
      subtitle: firesalePurchased ? copy.firesaleOwned : copy.firesale,
      owned: firesalePurchased,
      disabled: firesalePurchased || !canAffordCost(state, firesaleCost),
      cta: firesalePurchased ? "Owned" : "Buy",
      onSelect: () => {
        if (firesalePurchased || !canAffordCost(state, firesaleCost)) return;
        if (!spendBuildCost(state, firesaleCost)) return;
        markUpgradePurchased(state, HOME_BUILD_IDS.firesale);
        renderResources(state);
        updateUpgradeWindow(state, document.getElementById("homeBuildList"));
      },
    },
    {
      id: HOME_BUILD_IDS.waterConservation,
      label: "Water Conservation",
      category: "Equipment",
      cost: waterConservationCost,
      subtitle: waterConservationPurchased
        ? "A lot less showering, a lot more stink. Halve water use for 2 turns."
        : "A lot less showering, a lot more stink. Halve water use for 2 turns.",
      owned: waterConservationPurchased,
      disabled: waterConservationPurchased || !canAffordCost(state, waterConservationCost),
      cta: waterConservationPurchased ? "Owned" : "Buy",
      onSelect: () => {
        if (waterConservationPurchased || !canAffordCost(state, waterConservationCost)) return;
        if (!spendBuildCost(state, waterConservationCost)) return;
        applyWaterConservationUpgrade(state);
        renderResources(state);
        updateUpgradeWindow(state, document.getElementById("homeBuildList"));
      },
    },
    {
      id: HOME_BUILD_IDS.foodRationing,
      label: "Food Rationing",
      category: "Equipment",
      cost: foodRationingCost,
      subtitle: foodRationingPurchased
        ? "Starvation hates this one weird trick. Halve food use for 2 turns."
        : "Starvation hates this one weird trick. Halve food use for 2 turns.",
      owned: foodRationingPurchased,
      disabled: foodRationingPurchased || !canAffordCost(state, foodRationingCost),
      cta: foodRationingPurchased ? "Owned" : "Buy",
      onSelect: () => {
        if (foodRationingPurchased || !canAffordCost(state, foodRationingCost)) return;
        if (!spendBuildCost(state, foodRationingCost)) return;
        applyFoodRationingUpgrade(state);
        renderResources(state);
        updateUpgradeWindow(state, document.getElementById("homeBuildList"));
      },
    },
    {
      id: HOME_BUILD_IDS.rescueDrone,
      label: "Send Rescue Drone",
      category: "Equipment",
      cost: rescueDroneCost,
      subtitle: rescueDronePurchased
        ? "A buzzing little angel with snacks and a splash of hope. +2 water and food to a deployed unit."
        : "A buzzing little angel with snacks and a splash of hope. +2 water and food to a deployed unit.",
      owned: rescueDronePurchased,
      disabled: rescueDronePurchased || !canAffordCost(state, rescueDroneCost),
      cta: rescueDronePurchased ? "Owned" : "Buy",
      onSelect: () => {
        if (rescueDronePurchased || !canAffordCost(state, rescueDroneCost)) return;
        openUnitUpgradePicker({
          title: "Select a unit to rescue",
          cost: rescueDroneCost,
          state,
          allowRemoteUnits: true,
          unitEligible: (unit) => !!(
            unit
            && !unit.isDead
            && unit.deployed
            && (getUnitRemainingCapacity(unit, "food") > 0 || getUnitRemainingCapacity(unit, "water") > 0)
          ),
          labelHtmlForUnit: (unit) => buildRescueDroneStatusHtml(unit),
          closeOnApply: true,
          onApply: (selectedUnit) => {
            ensureRangerHasResourceTypes(selectedUnit);
            selectedUnit.inventory.food = (selectedUnit.inventory.food || 0) + 2;
            selectedUnit.inventory.water = (selectedUnit.inventory.water || 0) + 2;
            state.clampUnitInventory(selectedUnit);
            markUpgradePurchased(state, HOME_BUILD_IDS.rescueDrone);
            state.logger?.log(`Home base: Rescue drone dispatched to ${selectedUnit.callsign}. Fresh snacks and hydration delivered.`);
          },
        });
      },
    },
    {
      id: HOME_BUILD_IDS.gasDrone,
      label: "Send Gas Resupply Drone",
      category: "Equipment",
      cost: gasDroneCost,
      subtitle: gasDronePurchased
        ? "A rumbling little tanker drone hauling fuel across the wasteland. +5 gas to a deployed unit."
        : "A rumbling little tanker drone hauling fuel across the wasteland. +5 gas to a deployed unit.",
      owned: gasDronePurchased,
      disabled: gasDronePurchased || !canAffordCost(state, gasDroneCost),
      cta: gasDronePurchased ? "Owned" : "Buy",
      onSelect: () => {
        if (gasDronePurchased || !canAffordCost(state, gasDroneCost)) return;
        openUnitUpgradePicker({
          title: "Select a unit to resupply",
          cost: gasDroneCost,
          state,
          allowRemoteUnits: true,
          unitEligible: (unit) => !!(
            unit
            && !unit.isDead
            && unit.deployed
            && getUnitRemainingCapacity(unit, "gas") > 0
          ),
          labelHtmlForUnit: (unit) => buildGasDroneStatusHtml(unit),
          closeOnApply: true,
          onApply: (selectedUnit) => {
            ensureRangerHasResourceTypes(selectedUnit);
            selectedUnit.inventory.gas = (selectedUnit.inventory.gas || 0) + 5;
            state.clampUnitInventory(selectedUnit);
            markUpgradePurchased(state, HOME_BUILD_IDS.gasDrone);
            state.logger?.log(`Home base: Gas resupply drone dispatched to ${selectedUnit.callsign}. Fuel tanks topped off.`);
          },
        });
      },
    },
  ];
}

const HOME_BUILD_FILTERS = ["Personnel", "Equipment", "Facility"];

function normalizeHomeBuildCategory(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function getHomeBuildFilterCounts(items) {
  const counts = {
    all: items.length,
    personnel: 0,
    equipment: 0,
    facility: 0,
  };
  items.forEach((item) => {
    const key = normalizeHomeBuildCategory(item?.category);
    if (key && Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] += 1;
    }
  });
  return counts;
}

function updateHomeBuildFilterBar(state, list, items) {
  const bar = document.getElementById("homeBuildFilterBar");
  if (!bar || !list) return;
  const allowed = new Set(HOME_BUILD_FILTERS.map((label) => normalizeHomeBuildCategory(label)));
  const counts = getHomeBuildFilterCounts(items);
  const active = normalizeHomeBuildCategory(list.dataset?.buildFilter);
  if (active && !allowed.has(active)) {
    delete list.dataset.buildFilter;
  }
  const filterDefs = [
    { label: "All", filter: "", countKey: "all" },
    { label: "Personnel", filter: "Personnel", countKey: "personnel" },
    { label: "Equipment", filter: "Equipment", countKey: "equipment" },
    { label: "Facility", filter: "Facility", countKey: "facility" },
  ];
  filterDefs.forEach((entry) => {
    const selector = `.build-filter-btn[data-filter="${entry.filter}"]`;
    const btn = bar.querySelector(selector);
    if (!btn) return;
    const isActive = entry.filter
      ? normalizeHomeBuildCategory(list.dataset?.buildFilter) === normalizeHomeBuildCategory(entry.filter)
      : !normalizeHomeBuildCategory(list.dataset?.buildFilter);
    btn.textContent = `${entry.label} (${counts[entry.countKey] || 0})`;
    btn.classList.toggle("active", isActive);
    btn.onclick = () => {
      const current = normalizeHomeBuildCategory(list.dataset?.buildFilter);
      const target = normalizeHomeBuildCategory(entry.filter);
      if (!target || current === target) {
        delete list.dataset.buildFilter;
      } else {
        list.dataset.buildFilter = entry.filter;
      }
      updateUpgradeWindow(state, list);
    };
  });
}

function updateUpgradeWindow(state, listEl = null) {
  const list = listEl || document.getElementById("upgradeList");
  if (!list) return;
  list.innerHTML = "";
  const isHomeBuild = list.id === "homeBuildList" || list.dataset?.upgradeContext === "home-build";
  const items = isHomeBuild ? buildHomeBaseItems(state) : UPGRADE_ITEMS;
  let filteredItems = items;
  if (isHomeBuild) {
    updateHomeBuildFilterBar(state, list, items);
    const activeFilter = normalizeHomeBuildCategory(list.dataset?.buildFilter);
    if (activeFilter) {
      filteredItems = items.filter((item) => normalizeHomeBuildCategory(item?.category) === activeFilter);
    }
  }
  if (!filteredItems.length) {
    list.innerHTML = `<div class="empty">${isHomeBuild ? "No builds available." : "No upgrades available."}</div>`;
    return;
  }
  for (const item of filteredItems) {
    const entry = document.createElement("div");
    entry.className = isHomeBuild ? "upgrade-entry shop-entry" : "upgrade-entry";
    if (isHomeBuild) {
      const head = document.createElement("div");
      head.className = "shop-entry-head";
      const title = document.createElement("div");
      title.className = "shop-entry-title";
      title.textContent = item.label || "Build Item";
      const meta = document.createElement("div");
      meta.className = "shop-entry-meta";
      if (item.owned) {
        const status = document.createElement("div");
        status.className = "shop-entry-status";
        status.textContent = "Owned";
        status.classList.add("is-owned");
        meta.appendChild(status);
      }
      if (item.subtitle) {
        const hint = document.createElement("div");
        hint.className = "shop-entry-sub-inline";
        hint.textContent = item.subtitle;
        meta.appendChild(hint);
      }
      head.appendChild(title);
      if (meta.childNodes.length) {
        head.appendChild(meta);
      }
      entry.appendChild(head);
      const costRow = document.createElement("div");
      costRow.className = "shop-entry-costs";
      const actionRow = document.createElement("div");
      actionRow.className = "shop-entry-actions";
      if (!item.hideCost) {
        const cost = item.cost || {};
        const costKeys = RESOURCE_KEYS.filter((key) => cost && cost[key]);
        if (costKeys.length) {
          costKeys.forEach((key) => {
            const pill = document.createElement("div");
            pill.className = "shop-cost-pill";
            pill.textContent = `${iconForResource(key)} ${cost[key]}`;
            costRow.appendChild(pill);
          });
        } else {
          const free = document.createElement("div");
          free.className = "shop-cost-pill is-free";
          free.textContent = "No cost";
          costRow.appendChild(free);
        }
      }
      actionRow.appendChild(costRow);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "primary";
      btn.disabled = !!item.disabled;
      const cta = item.cta || (item.disabled ? "Unavailable" : "Buy");
      btn.textContent = cta;
      if (item.disabled && item.disabledReason) {
        btn.title = item.disabledReason;
      }
      btn.onclick = () => {
        if (item.disabled) return;
        if (typeof item.onSelect === "function") {
          item.onSelect();
          return;
        }
        const logger = state?.logger;
        if (logger && typeof logger.log === "function") {
          logger.log(`Upgrade shop: ${item.label} selected.`);
        }
      };
      actionRow.appendChild(btn);
      entry.appendChild(actionRow);
      list.appendChild(entry);
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "primary";
    btn.disabled = !!item.disabled;
    const costLabel = formatCostLabel(item.cost);
    btn.textContent = costLabel ? `${item.label} - ${costLabel}` : item.label;
    btn.onclick = () => {
      if (item.disabled) return;
      if (typeof item.onSelect === "function") {
        item.onSelect();
        return;
      }
      const logger = state?.logger;
      if (logger && typeof logger.log === "function") {
        logger.log(`Upgrade shop: ${item.label} selected.`);
      }
    };
    entry.appendChild(btn);
    if (item.subtitle) {
      const hint = document.createElement("div");
      hint.className = "panel-sub";
      hint.textContent = item.subtitle;
      entry.appendChild(hint);
    }
    list.appendChild(entry);
  }
}

function closeUnitUpgradePicker() {
  const win = document.getElementById("unitUpgradeWindow");
  if (win) win.classList.add("hidden");
}

function populateCostPills(container, cost) {
  if (!container) return false;
  container.innerHTML = "";
  if (!cost || typeof cost === "string") return false;
  let added = false;
  RESOURCE_KEYS.forEach((key) => {
    if (!cost[key]) return;
    const pill = document.createElement("div");
    pill.className = "shop-cost-pill";
    pill.textContent = `${iconForResource(key)} ${cost[key]}`;
    container.appendChild(pill);
    added = true;
  });
  return added;
}

function openUnitUpgradePicker({
  title,
  cost,
  costForUnit = null,
  state,
  onApply,
  unitFilter = null,
  unitEligible = null,
  labelForUnit = null,
  labelHtmlForUnit = null,
  allowRemoteUnits = false,
  closeOnApply = false,
} = {}) {
  const win = document.getElementById("unitUpgradeWindow");
  const list = document.getElementById("unitUpgradeList");
  const titleEl = document.getElementById("unitUpgradeTitle");
  const closeBtn = document.getElementById("closeUnitUpgradeBtn");
  const buildPanel = document.getElementById("homeBaseBuildPanel");
  const upgradeWin = document.getElementById("upgradeWindow");
  const phaserEl = document.getElementById("phaserContainer");
  if (!win || !list || !titleEl) return;
  if (closeBtn) closeBtn.onclick = closeUnitUpgradePicker;
  titleEl.textContent = title || "Select a unit";
  list.innerHTML = "";
  win.classList.remove("hidden");
  const isVisibleAnchor = (el) => {
    if (!el || el.classList?.contains?.("hidden")) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const anchorEl = isVisibleAnchor(buildPanel)
    ? buildPanel
    : (isVisibleAnchor(upgradeWin) ? upgradeWin : (isVisibleAnchor(phaserEl) ? phaserEl : null));
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const measured = win.getBoundingClientRect();
    const gap = 12;
    const maxRight = window.innerWidth - 12;
    const left = rect.right + gap;
    const availableWidth = Math.max(240, maxRight - left);
    const width = Math.min(availableWidth, measured.width || rect.width || 320);
    const height = measured.height || 260;
    const top = rect.top;
    const maxLeft = Math.max(10, window.innerWidth - width - 10);
    const maxTop = Math.max(10, window.innerHeight - height - 10);
    win.style.left = `${Math.max(10, Math.min(left, maxLeft))}px`;
    win.style.top = `${Math.max(10, Math.min(top, maxTop))}px`;
      win.style.width = `${Math.min(availableWidth, window.innerWidth - 20)}px`;
      win.style.maxWidth = "";
    win.style.transform = "none";
  } else {
    win.style.left = "50%";
    win.style.top = "50%";
    win.style.transform = "translate(-50%, -50%)";
  }
  const units = state?.rangerUnits || [];
  const candidates = typeof unitFilter === "function" ? units.filter(unitFilter) : units;
  if (!candidates.length) {
    list.innerHTML = '<div class="empty">No units available.</div>';
    return;
  }
  // Every row re-checks its own button after any purchase: one buy can use up the
  // resources another row needs, or take this unit to its cap.
  const rowRefreshers = [];
  for (const unit of candidates) {
    ensureUnitTravelState(state, unit);
    const row = document.createElement("div");
    row.className = "home-unit-row unit-upgrade-row";
    const identity = document.createElement("div");
    identity.className = "home-unit-identity";
    const icon = document.createElement("div");
    icon.className = "home-unit-icon";
    icon.dataset.unitId = unit.id;
    applyUnitListIcon(icon, unit);
    const name = document.createElement("div");
    name.className = "home-unit-name";
    name.textContent = unit.callsign || "Ranger";
    const level = document.createElement("div");
    level.className = "home-unit-level";
    if (typeof labelHtmlForUnit === "function") {
      level.classList.add("is-rich");
      level.innerHTML = labelHtmlForUnit(unit);
    } else {
      level.textContent = typeof labelForUnit === "function"
        ? labelForUnit(unit)
        : `Lvl. ${getUnitLevel(unit)}`;
    }
    identity.appendChild(icon);
    identity.appendChild(name);
    identity.appendChild(level);
    const weaponRow = document.createElement("div");
    weaponRow.className = "home-unit-weapon-row";
    const weaponIcon = document.createElement("div");
    weaponIcon.className = "home-unit-weapon";
    weaponIcon.dataset.unitId = unit.id;
    applyWeaponListIcon(weaponIcon, unit);
    const weaponLevel = document.createElement("div");
    weaponLevel.className = "home-unit-location";
    weaponLevel.textContent = `Lvl. ${getWeaponUpgradeIndex(unit?.weaponFrameIndex ?? 1)}`;
    const apPill = document.createElement("div");
    apPill.className = "home-unit-location unit-upgrade-ap";
    const apCurrent = Math.max(0, Math.trunc(unit?.inventory?.ap ?? 0));
    const apMax = getUnitMaxAp(unit);
    apPill.textContent = `${iconForResource("ap")} ${apCurrent}/${apMax}`;
    weaponRow.appendChild(weaponIcon);
    weaponRow.appendChild(weaponLevel);
    weaponRow.appendChild(apPill);
    const actions = document.createElement("div");
    actions.className = "home-unit-actions unit-upgrade-actions";
    const costWrap = document.createElement("div");
    costWrap.className = "unit-upgrade-costs";
    const unitCost = typeof costForUnit === "function" ? costForUnit(unit) : cost;
    populateCostPills(costWrap, unitCost);
    const action = document.createElement("button");
    action.type = "button";
    action.className = "primary";
    // Evaluated live, not once at open: the picker stays open across purchases.
    const isEligibleNow = () => {
      const baseEligible = allowRemoteUnits
        ? !!(unit && !unit.isDead)
        : !!(unit && !unit.isDead && isUnitAtHome(unit, state) && isUnitIdle(unit));
      return baseEligible && (typeof unitEligible === "function" ? !!unitEligible(unit, state) : true);
    };
    const refreshAction = () => {
      action.disabled = !isEligibleNow() || !(!unitCost || canAffordCost(state, unitCost));
    };
    rowRefreshers.push(refreshAction);
    refreshAction();
    action.textContent = "Select";
    action.onclick = () => {
      if (!isEligibleNow() || !canAffordCost(state, unitCost)) {
        refreshAction();
        return;
      }
      if (!spendBuildCost(state, unitCost)) return;
      if (typeof onApply === "function") {
        onApply(unit);
      }
      if (closeOnApply) {
        renderResources(state);
        renderHomeBaseUnits(state);
        updateUpgradeWindow(state, document.getElementById("homeBuildList"));
        refreshRangerPaneScene(state);
        closeUnitUpgradePicker();
        return;
      }
      if (typeof labelHtmlForUnit === "function") {
        level.innerHTML = labelHtmlForUnit(unit);
      } else {
        level.textContent = typeof labelForUnit === "function"
          ? labelForUnit(unit)
          : `Lvl. ${getUnitLevel(unit)}`;
      }
      weaponLevel.textContent = `Lvl. ${getWeaponUpgradeIndex(unit?.weaponFrameIndex ?? 1)}`;
      const refreshedAp = Math.max(0, Math.trunc(unit?.inventory?.ap ?? 0));
      apPill.textContent = `${iconForResource("ap")} ${refreshedAp}/${getUnitMaxAp(unit)}`;
      applyUnitListIcon(icon, unit);
      applyWeaponListIcon(weaponIcon, unit);
      renderResources(state);
      renderHomeBaseUnits(state);
      updateUpgradeWindow(state, document.getElementById("homeBuildList"));
      const ready = refreshHomeUnitIcons(state);
      if (!ready) scheduleHomeUnitIconRefresh(state);
      refreshRangerPaneScene(state);
      rowRefreshers.forEach((refresh) => refresh());
    };
    actions.appendChild(costWrap);
    actions.appendChild(action);
    row.appendChild(identity);
    row.appendChild(weaponRow);
    row.appendChild(actions);
    list.appendChild(row);
  }
  win.classList.remove("hidden");
}
function showHomeBaseUi(state) {
  const ui = document.getElementById("homeBaseUi");
  const largeSettlementOverlay = document.getElementById("largeSettlementOverlay");
  if (!ui || !state) return;
  ui.classList.remove("hidden");
  if (largeSettlementOverlay) largeSettlementOverlay.classList.add("home-base-active");
  const unitsBtn = document.getElementById("homeBaseTabUnits");
  const buildBtn = document.getElementById("homeBaseTabBuild");
  const unitsPanel = document.getElementById("homeBaseUnitsPanel");
  const buildPanel = document.getElementById("homeBaseBuildPanel");
  if (!state.homeBaseVisited) {
    state.homeBaseVisited = true;
    if (unitsBtn) unitsBtn.classList.remove("active");
    if (buildBtn) buildBtn.classList.remove("active");
    if (unitsPanel) unitsPanel.classList.add("hidden");
    if (buildPanel) buildPanel.classList.add("hidden");
    closeUnitUpgradePicker();
    document.getElementById("upgradeWindow")?.classList.add("hidden");
  } else {
    setHomeBaseTab(state, "units");
  }
  const buildList = document.getElementById("homeBuildList");
  if (buildList) updateUpgradeWindow(state, buildList);
  resetHomeLoadoutPanel();
}

function resetHomeLoadoutPanel() {
  const list = document.getElementById("homeLoadoutList");
  const title = document.getElementById("homeLoadoutTitle");
  const win = document.getElementById("homeLoadoutWindow");
  const applyBtn = document.getElementById("homeLoadoutApplyBtn");
  const unloadBtn = document.getElementById("homeLoadoutUnloadBtn");
  const unitsPanel = document.getElementById("homeBaseUnitsPanel");
  const largeSettlementOverlay = document.getElementById("largeSettlementOverlay");
  if (title) title.textContent = "Loadout";
  if (list) list.innerHTML = '<div class="empty">Select a unit to configure loadout.</div>';
  if (win) win.classList.add("hidden");
  if (unitsPanel) unitsPanel.classList.remove("loadout-open");
  if (largeSettlementOverlay) largeSettlementOverlay.classList.remove("loadout-open");
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.onclick = null;
  }
  if (unloadBtn) {
    unloadBtn.disabled = true;
    unloadBtn.onclick = null;
  }
}

function hideHomeBaseUi() {
  const ui = document.getElementById("homeBaseUi");
  const largeSettlementOverlay = document.getElementById("largeSettlementOverlay");
  if (ui) ui.classList.add("hidden");
  if (largeSettlementOverlay) largeSettlementOverlay.classList.remove("home-base-active");
  resetHomeLoadoutPanel();
}

function setHomeBaseTab(state, tab = "units") {
  const unitsBtn = document.getElementById("homeBaseTabUnits");
  const buildBtn = document.getElementById("homeBaseTabBuild");
  const unitsPanel = document.getElementById("homeBaseUnitsPanel");
  const buildPanel = document.getElementById("homeBaseBuildPanel");
  if (!unitsBtn || !buildBtn || !unitsPanel || !buildPanel) return;
  const isUnits = tab === "units";
  if (isUnits) {
    closeUnitUpgradePicker();
    document.getElementById("upgradeWindow")?.classList.add("hidden");
  }
  unitsBtn.classList.toggle("active", isUnits);
  buildBtn.classList.toggle("active", !isUnits);
  unitsPanel.classList.toggle("hidden", !isUnits);
  buildPanel.classList.toggle("hidden", isUnits);
  if (isUnits) {
    renderHomeBaseUnits(state);
  } else {
    updateUpgradeWindow(state, document.getElementById("homeBuildList"));
  }
}

function collapseHomeBaseTabs(state) {
  const unitsBtn = document.getElementById("homeBaseTabUnits");
  const buildBtn = document.getElementById("homeBaseTabBuild");
  const unitsPanel = document.getElementById("homeBaseUnitsPanel");
  const buildPanel = document.getElementById("homeBaseBuildPanel");
  if (!unitsBtn || !buildBtn || !unitsPanel || !buildPanel) return;
  unitsBtn.classList.remove("active");
  buildBtn.classList.remove("active");
  unitsPanel.classList.add("hidden");
  buildPanel.classList.add("hidden");
  closeUnitUpgradePicker();
  document.getElementById("upgradeWindow")?.classList.add("hidden");
  resetHomeLoadoutPanel();
}

function toggleHomeBaseTab(state, tab = "units") {
  const unitsBtn = document.getElementById("homeBaseTabUnits");
  const buildBtn = document.getElementById("homeBaseTabBuild");
  const unitsPanel = document.getElementById("homeBaseUnitsPanel");
  const buildPanel = document.getElementById("homeBaseBuildPanel");
  if (!unitsBtn || !buildBtn || !unitsPanel || !buildPanel) return;
  const targetBtn = tab === "units" ? unitsBtn : buildBtn;
  const targetPanel = tab === "units" ? unitsPanel : buildPanel;
  const isActive = targetBtn.classList.contains("active");
  const panelVisible = targetPanel ? !targetPanel.classList.contains("hidden") : false;
  if (isActive && panelVisible) {
    collapseHomeBaseTabs(state);
    return;
  }
  setHomeBaseTab(state, tab);
}

function renderHomeBaseUnits(state) {
  const list = document.getElementById("homeBaseUnitsList");
  if (!list || !state) return;
  list.innerHTML = "";
  homeUnitIconRefreshAttempts = 0;
  const units = state.rangerUnits || [];
  if (!units.length) {
    list.innerHTML = '<div class="empty">No units available.</div>';
    return;
  }
  const showFirstDeployGlow = !units.some((unit) => {
    ensureUnitTravelState(state, unit);
    return !!(unit?.deployed || unit?.hasLeftHome);
  });
  for (const unit of units) {
    ensureUnitTravelState(state, unit);
    const unitInTown = isUnitAtHome(unit, state) && isUnitIdle(unit);
    const isDead = !!unit.isDead;
    const row = document.createElement("div");
    row.className = "home-unit-row";
    const identity = document.createElement("div");
    identity.className = "home-unit-identity";
    const icon = document.createElement("div");
    icon.className = "home-unit-icon";
    icon.dataset.unitId = unit.id;
    applyUnitListIcon(icon, unit);
    const name = document.createElement("div");
    name.className = "home-unit-name";
    if (isDead) {
      const skull = "💀";
      const skullSpan = document.createElement("span");
      skullSpan.className = "emoji";
      skullSpan.textContent = `${skull} `;
      name.appendChild(skullSpan);
      name.append(unit.callsign || "Ranger");
    } else {
      name.textContent = unit.callsign || "Ranger";
    }
    const level = document.createElement("div");
    level.className = "home-unit-level";
    level.textContent = `Lvl. ${getUnitLevel(unit)}`;
    identity.appendChild(icon);
    identity.appendChild(name);
    identity.appendChild(level);
    const weaponRow = document.createElement("div");
    weaponRow.className = "home-unit-weapon-row";
    const weaponIcon = document.createElement("div");
    weaponIcon.className = "home-unit-weapon";
    weaponIcon.dataset.unitId = unit.id;
    applyWeaponListIcon(weaponIcon, unit);
    const weaponLevel = document.createElement("div");
    weaponLevel.className = "home-unit-location";
    weaponLevel.textContent = `Lvl. ${getWeaponUpgradeIndex(unit?.weaponFrameIndex ?? 1)}`;
    weaponRow.appendChild(weaponIcon);
    weaponRow.appendChild(weaponLevel);
    const actions = document.createElement("div");
    actions.className = "home-unit-actions";
    const loadoutBtn = document.createElement("button");
    loadoutBtn.type = "button";
    loadoutBtn.className = "primary";
    loadoutBtn.textContent = "Loadout";
    const canLoadout = unitInTown && !isDead;
    loadoutBtn.disabled = !canLoadout;
    loadoutBtn.onclick = () => openLoadout(unit.id);
    const deployWrap = document.createElement("div");
    deployWrap.className = "home-unit-deploy-wrap";
    const deployBtn = document.createElement("button");
    deployBtn.type = "button";
    deployBtn.className = "secondary";
    deployBtn.textContent = "Deploy";
    const canDeploy = unitInTown && !unit.deployed && !isDead;
    if (unit.deployed || isDead) {
      deployBtn.classList.add("home-unit-action-hidden");
      deployBtn.disabled = true;
    } else {
      deployBtn.disabled = !canDeploy;
      deployBtn.classList.toggle("home-unit-deploy-glow", showFirstDeployGlow && canDeploy);
      deployBtn.onclick = async () => {
        state.activeUnitId = unit.id;
        deploySquadToNode(state, "home");
        await toggleLargeSettlementOverlay(false);
        state.squadSelected = true;
        state.squadPaneClosed = false;
        updateSquadWindow(state);
        if (mapSceneInstance?.focusCameraOnHome) {
          mapSceneInstance.userAdjustedCamera = false;
          mapSceneInstance.focusCameraOnHome({ setZoom: true });
          mapSceneInstance.userAdjustedCamera = true;
        }
        if (mapSceneInstance?.setActiveUnitMarker) {
          mapSceneInstance.setActiveUnitMarker(unit.id);
        }
        hideHomeBaseUi();
      };
    }
    actions.appendChild(loadoutBtn);
    deployWrap.appendChild(deployBtn);
    actions.appendChild(deployWrap);
    row.appendChild(identity);
    row.appendChild(weaponRow);
    row.appendChild(actions);
    list.appendChild(row);
  }
  if (!refreshHomeUnitIcons(state)) {
    scheduleHomeUnitIconRefresh(state);
  }
}

function resolveUnitSpriteFrame(scene, unit, pathKey = DEFAULT_TRAINING_PATH) {
  if (!scene) return null;
  if (unit?.type === "vehicle") {
    const names = scene.vehicleFrameNames || {};
    // vehicleFrameNames is only ever replaced wholesale, so cache the sorted keys per object.
    let vehicleKeys = scene.__vehicleKeysSource === names ? scene.__vehicleKeys : null;
    if (!vehicleKeys) {
      vehicleKeys = Object.keys(names)
        .filter((key) => key.startsWith("vehicle"))
        .sort((a, b) => parseInt(a.replace("vehicle", ""), 10) - parseInt(b.replace("vehicle", ""), 10));
      scene.__vehicleKeysSource = names;
      scene.__vehicleKeys = vehicleKeys;
    }
    if (vehicleKeys.length) {
      const stage = Math.floor(unit?.spriteStage ?? 0);
      const idx = Math.max(0, Math.min(vehicleKeys.length - 1, stage));
      return names[vehicleKeys[idx]];
    }
    return atlasFrame(scene, "unitsVehicles", 0);
  }
  const path = TRAINING_PATHS[pathKey] || [];
  const stage = Math.max(0, Math.min(path.length - 1, Math.floor(unit?.spriteStage ?? DEFAULT_SPRITE_STAGE)));
  const key = path[stage];
  if (key && scene.unitFrameNames?.[key]) return scene.unitFrameNames[key];
  return atlasFrame(scene, "unitsSoldiers", stage);
}

function getHomeUnitIconTargetHeight(targetEl) {
  if (!targetEl || typeof getComputedStyle !== "function") return 0;
  const styles = getComputedStyle(targetEl);
  const varHeight = parseFloat(styles.getPropertyValue("--home-unit-icon-height"));
  if (Number.isFinite(varHeight) && varHeight > 0) return varHeight;
  const row = targetEl.closest?.(".home-unit-row");
  if (row) {
    const rowStyles = getComputedStyle(row);
    const paddingTop = parseFloat(rowStyles.paddingTop) || 0;
    const paddingBottom = parseFloat(rowStyles.paddingBottom) || 0;
    const contentHeight = row.getBoundingClientRect().height - paddingTop - paddingBottom;
    if (Number.isFinite(contentHeight) && contentHeight > 0) return contentHeight;
  }
  return 32;
}

const HOME_UNIT_ICON_SOURCE_URLS = new WeakMap();
const HOME_UNIT_FRAME_URLS = new WeakMap();

function getFrameSourceUrl(frame) {
  const source = frame?.texture?.source?.[0]?.image || frame?.texture?.source?.[0];
  if (!source) return null;
  if (typeof source.src === "string" && source.src) return source.src;
  if (typeof source.toDataURL === "function") {
    if (HOME_UNIT_ICON_SOURCE_URLS.has(source)) {
      return HOME_UNIT_ICON_SOURCE_URLS.get(source);
    }
    try {
      const url = source.toDataURL("image/png");
      HOME_UNIT_ICON_SOURCE_URLS.set(source, url);
      return url;
    } catch (err) {
      return null;
    }
  }
  return null;
}

function getFrameCropUrl(frame) {
  if (!frame?.source?.image && !frame?.texture?.source?.[0]?.image && !frame?.texture?.source?.[0]) return null;
  if (HOME_UNIT_FRAME_URLS.has(frame)) {
    return HOME_UNIT_FRAME_URLS.get(frame);
  }
  const source = frame?.texture?.source?.[0]?.image || frame?.texture?.source?.[0];
  const sx = typeof frame.cutX === "number" ? frame.cutX : (typeof frame.x === "number" ? frame.x : 0);
  const sy = typeof frame.cutY === "number" ? frame.cutY : (typeof frame.y === "number" ? frame.y : 0);
  const sw = frame.cutWidth || frame.width || 0;
  const sh = frame.cutHeight || frame.height || 0;
  if (!source || !sw || !sh) return null;
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, sw, sh);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  try {
    const url = canvas.toDataURL("image/png");
    HOME_UNIT_FRAME_URLS.set(frame, url);
    return url;
  } catch (err) {
    return null;
  }
}

function applyUnitListIcon(targetEl, unit = null) {
  if (!targetEl) return false;
  const scene = typeof mapSceneInstance !== "undefined" ? mapSceneInstance : null;
  const spriteKey = unit?.type === "vehicle" ? "unitsVehicles" : "unitsSoldiers";
  const texture = scene?.textures?.get?.(spriteKey);
  if (!texture) return false;
  const fallback = spriteKey === "unitsVehicles"
    ? scene.vehicleFrameNames?.vehicle1
    : scene.unitFrameNames?.soldier2 || atlasFrame(scene, "unitsSoldiers", 0);
  const frameName = resolveUnitSpriteFrame(scene, unit) || fallback;
  const frame = texture.get?.(frameName) || scene.textures?.getFrame?.(spriteKey, frameName);
  const sourceUrl = getFrameCropUrl(frame);
  if (!frame || !sourceUrl) return false;
  const cutW = frame.cutWidth || frame.width || 0;
  const cutH = frame.cutHeight || frame.height || 0;
  if (!cutW || !cutH) return false;
  const targetHeight = getHomeUnitIconTargetHeight(targetEl);
  if (!targetHeight) return false;
  const height = Math.max(1, Math.round(targetHeight));
  const scale = height / cutH;
  const spriteW = Math.max(1, Math.round(cutW * scale));
  const width = Math.max(spriteW, height);
  targetEl.style.height = `${height}px`;
  targetEl.style.width = `${width}px`;
  targetEl.style.backgroundImage = `url("${sourceUrl}")`;
  targetEl.style.backgroundRepeat = "no-repeat";
  targetEl.style.backgroundSize = `${spriteW}px ${height}px`;
  targetEl.style.backgroundPosition = "center center";
  return true;
}

function applyWeaponListIcon(targetEl, unit = null) {
  if (!targetEl) return false;
  const scene = typeof mapSceneInstance !== "undefined" ? mapSceneInstance : null;
  if (!scene) return false;
  const upgradeEntry = getWeaponUpgradeEntry(unit?.weaponFrameIndex ?? 1, unit);
  const atlasKey = upgradeEntry?.atlas || "meleeweapons";
  ensureWeaponAtlas(scene, atlasKey);
  const texture = scene.textures?.get?.(atlasKey);
  if (!texture) return false;
  const frameIndex = Math.max(0, Math.trunc(upgradeEntry?.frameIndex ?? 0));
  const frameName = atlasFrame(scene, atlasKey, frameIndex);
  const frame = texture.get?.(frameName) || scene.textures?.getFrame?.(atlasKey, frameName);
  const sourceUrl = getFrameCropUrl(frame);
  if (!frame || !sourceUrl) return false;
  const cutW = frame.cutWidth || frame.width || 0;
  const cutH = frame.cutHeight || frame.height || 0;
  if (!cutW || !cutH) return false;
  const targetHeight = getHomeUnitIconTargetHeight(targetEl);
  if (!targetHeight) return false;
  const height = Math.max(1, Math.round(targetHeight));
  const scale = height / cutH;
  const spriteW = Math.max(1, Math.round(cutW * scale));
  const width = Math.max(spriteW, height);
  targetEl.style.height = `${height}px`;
  targetEl.style.width = `${width}px`;
  targetEl.style.backgroundImage = `url("${sourceUrl}")`;
  targetEl.style.backgroundRepeat = "no-repeat";
  targetEl.style.backgroundSize = `${spriteW}px ${height}px`;
  targetEl.style.backgroundPosition = "center center";
  return true;
}

let homeUnitIconRefreshTimer = null;
let homeUnitIconRefreshAttempts = 0;
const HOME_UNIT_ICON_REFRESH_MAX = 15;

function refreshHomeUnitIcons(state) {
  const scene = mapSceneInstance;
  if (!scene || !state?.rangerUnits?.length) return false;
  const unitLookup = new Map(state.rangerUnits.map((unit) => [unit.id, unit]));
  let allReady = true;
  const unitIcons = document.querySelectorAll(".home-unit-icon[data-unit-id]");
  unitIcons.forEach((el) => {
    const unit = unitLookup.get(el.dataset.unitId);
    if (!unit || !applyUnitListIcon(el, unit)) allReady = false;
  });
  const weaponIcons = document.querySelectorAll(".home-unit-weapon[data-unit-id]");
  weaponIcons.forEach((el) => {
    const unit = unitLookup.get(el.dataset.unitId);
    if (!unit || !applyWeaponListIcon(el, unit)) allReady = false;
  });
  return allReady;
}

function scheduleHomeUnitIconRefresh(state) {
  if (homeUnitIconRefreshTimer || homeUnitIconRefreshAttempts >= HOME_UNIT_ICON_REFRESH_MAX) return;
  homeUnitIconRefreshTimer = setTimeout(() => {
    homeUnitIconRefreshTimer = null;
    homeUnitIconRefreshAttempts += 1;
    const ready = refreshHomeUnitIcons(state);
    if (!ready) {
      scheduleHomeUnitIconRefresh(state);
    } else {
      homeUnitIconRefreshAttempts = 0;
    }
  }, 120);
}

function createRollingCounter(value, digits) {
  const host = document.createElement("div");
  host.className = "rolling-counter";
  host._rollingStacks = [];
  const columns = Math.max(1, digits || 1);
  for (let i = 0; i < columns; i += 1) {
    const col = document.createElement("div");
    col.className = "rolling-counter-digit";
    const stack = document.createElement("div");
    stack.className = "rolling-counter-stack";
    for (let d = 0; d < 10; d += 1) {
      const digit = document.createElement("span");
      digit.textContent = `${d}`;
      stack.appendChild(digit);
    }
    col.appendChild(stack);
    host.appendChild(col);
    host._rollingStacks.push(stack);
  }
  setRollingCounterValue(host, value);
  return host;
}

function setRollingCounterValue(host, value) {
  if (!host?._rollingStacks?.length) return;
  const safe = Math.max(0, Math.floor(Number(value) || 0));
  const digits = host._rollingStacks.length;
  const text = `${safe}`;
  const leading = Math.max(0, digits - text.length);
  host._rollingStacks.forEach((stack, index) => {
    const col = stack.parentElement;
    if (index < leading) {
      if (col?.dataset.hidden !== "1") col.dataset.hidden = "1";
      stack.style.transform = "translateY(0)";
      stack.dataset.digit = "0";
      return;
    }
    if (col?.dataset.hidden) delete col.dataset.hidden;
    const nextDigit = Number(text[index - leading]) || 0;
    if (stack.dataset.digit === `${nextDigit}`) return;
    stack.dataset.digit = `${nextDigit}`;
    stack.style.transform = `translateY(${nextDigit * -1}em)`;
  });
}

function openLoadout(unitId) {
  const state = getGlobalGameState();
  if (!state || !unitId) return;
  const unit = (state.rangerUnits || []).find((entry) => entry.id === unitId);
  if (!unit) return;
  ensureRangerHasResourceTypes(unit);
  const win = document.getElementById("homeLoadoutWindow");
  const list = document.getElementById("homeLoadoutList");
  const title = document.getElementById("homeLoadoutTitle");
  const applyBtn = document.getElementById("homeLoadoutApplyBtn");
  const unloadBtn = document.getElementById("homeLoadoutUnloadBtn");
  const unitsPanel = document.getElementById("homeBaseUnitsPanel");
  const largeSettlementOverlay = document.getElementById("largeSettlementOverlay");
  if (!win || !list || !title || !applyBtn || !unloadBtn) return;
  list.innerHTML = "";
  const header = document.createElement("div");
  header.className = "home-loadout-header";
  header.innerHTML = `
    <span></span>
    <span class="home-loadout-header-label">Unit</span>
    <span></span>
    <span class="home-loadout-header-label">Base</span>
  `;
  list.appendChild(header);
  title.textContent = `${unit.callsign || "Ranger"} Loadout`;
  win.classList.remove("hidden");
  if (unitsPanel) unitsPanel.classList.add("loadout-open");
  if (largeSettlementOverlay) largeSettlementOverlay.classList.add("loadout-open");
  applyBtn.disabled = false;
  unloadBtn.disabled = false;
  if (!unloadBtn.dataset.tooltipBound) {
    const showTipOnce = () => showUnloadTooltipOnce(unloadBtn);
    unloadBtn.addEventListener("mouseenter", showTipOnce);
    unloadBtn.addEventListener("focus", showTipOnce);
    unloadBtn.dataset.tooltipBound = "true";
  }
  const pending = {};
  for (const key of RESOURCE_KEYS) {
    const row = document.createElement("div");
    row.className = "home-loadout-row loadout-row";
    const unitVal = Math.max(0, unit.inventory?.[key] || 0);
    const townVal = Math.max(0, state.resources.get(key));
    const totalVal = unitVal + townVal;
    const min = -townVal;
    const max = unitVal;
    const rowBody = document.createElement("div");
    rowBody.className = "home-loadout-body loadout-body";
    const icon = document.createElement("div");
    icon.className = "home-loadout-icon";
    icon.textContent = `${iconForResource(key)}`;
    const digits = Math.max(2, `${Math.floor(totalVal)}`.length);
    const unitCounter = document.createElement("div");
    unitCounter.className = "home-loadout-counter";
    const unitCounterValue = createRollingCounter(unitVal, digits);
    unitCounter.appendChild(unitCounterValue);
    const capacityTooltip = document.createElement("div");
    capacityTooltip.className = "shop-tooltip loadout-capacity-tooltip";
    capacityTooltip.textContent = "MAX";
    const townCounter = document.createElement("div");
    townCounter.className = "home-loadout-counter";
    const townCounterValue = createRollingCounter(townVal, digits);
    townCounter.appendChild(townCounterValue);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "home-loadout-slider";
    slider.min = `${-Math.floor(unitVal)}`;
    slider.max = `${Math.floor(townVal)}`;
    slider.step = "1";
    slider.value = "0";
    const updatePreview = () => {
      const rawDelta = parseInt(slider.value, 10);
      let delta = rawDelta;
      if (!Number.isFinite(delta)) delta = 0;
      const minDelta = -unitVal;
      const remainingCapacity = getUnitRemainingCapacity(unit, key);
      // Whole units only: a fraction left by march drain stays with the unit.
      const maxDelta = Math.floor(Math.min(townVal, remainingCapacity));
      delta = Math.max(minDelta, Math.min(maxDelta, delta));
      if (`${delta}` !== slider.value) slider.value = `${delta}`;
      pending[key] = delta;
      const unitPreview = Math.max(0, unitVal + delta);
      const townPreview = Math.max(0, townVal - delta);
      setRollingCounterValue(unitCounterValue, unitPreview);
      setRollingCounterValue(townCounterValue, townPreview);
      const showCapacityTooltip = Number.isFinite(rawDelta)
        && rawDelta > maxDelta
        && remainingCapacity >= 0
        && maxDelta === Math.floor(remainingCapacity)
        && remainingCapacity < townVal;
      capacityTooltip.classList.toggle("visible", showCapacityTooltip);
    };
    slider.addEventListener("input", updatePreview);
    updatePreview();
    rowBody.appendChild(icon);
    rowBody.appendChild(unitCounter);
    rowBody.appendChild(capacityTooltip);
    rowBody.appendChild(slider);
    rowBody.appendChild(townCounter);
    row.appendChild(rowBody);
    list.appendChild(row);
  }
  applyBtn.onclick = () => {
    let changed = false;
    for (const key of RESOURCE_KEYS) {
      const delta = pending[key] || 0;
      if (!delta) continue;
      if (delta > 0) {
        const available = Math.max(0, state.resources.get(key));
        const capacity = getUnitRemainingCapacity(unit, key);
        const amount = Math.floor(Math.min(delta, available, capacity));
        if (amount > 0 && state.resources.spend({ [key]: amount })) {
          unit.inventory[key] = (unit.inventory[key] || 0) + amount;
          changed = true;
        }
      } else {
        const available = Math.max(0, unit.inventory?.[key] || 0);
        const amount = Math.min(Math.abs(delta), available);
        if (amount > 0) {
          unit.inventory[key] = available - amount;
          state.resources.add({ [key]: amount });
          changed = true;
        }
      }
    }
    ensureRangerHasResourceTypes(unit);
    state.clampUnitInventory(unit);
    renderResources(state);
    renderHomeBaseUnits(state);
    resetHomeLoadoutPanel();
  };
  unloadBtn.onclick = () => {
    const payload = {};
    let moved = 0;
    for (const key of ["gas", "wood", "components"]) {
      // Whole units only, so the stockpile stays integral; the fraction stays in the unit.
      const held = Math.max(0, Number(unit.inventory?.[key]) || 0);
      const amount = Math.floor(held);
      if (amount <= 0) continue;
      payload[key] = amount;
      unit.inventory[key] = held - amount;
      moved += amount;
    }
    if (!moved) return;
    state.resources.add(payload);
    ensureRangerHasResourceTypes(unit);
    state.clampUnitInventory(unit);
    renderResources(state);
    renderHomeBaseUnits(state);
    if (state.logger) {
      state.logger.log(`${unit.callsign || "Ranger"} unloaded scavenged resources to base.`);
    }
    openLoadout(unit.id);
  };
}

function renderFastTravelTooltip(targetEl) {
  if (!targetEl) return;
  const text = "Fast travel teleports the unit and drains all remaining AP.";
  let tip = document.getElementById("fastTravelTooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "fastTravelTooltip";
    tip.className = "fast-travel-tooltip";
    document.body.appendChild(tip);
  }
  tip.textContent = text;
  tip.classList.add("visible");
  const rect = targetEl.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 12, Math.max(12, rect.left + rect.width * 0.5));
  const top = Math.max(12, rect.top - 10);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.transform = "translate(-50%, -100%)";
  if (tip._hideTimer) window.clearTimeout(tip._hideTimer);
  tip._hideTimer = window.setTimeout(() => {
    tip.classList.remove("visible");
    tip._hideTimer = null;
  }, 4400);
}

function showFastTravelTooltip(state, targetEl) {
  if (!state || !targetEl) return;
  if (state.fastTravelTooltipSeen) return;
  state.fastTravelTooltipSeen = true;
  renderFastTravelTooltip(targetEl);
}

const FAST_TRAVEL_HOVER_REPEAT_MS = 4000;

function bindFastTravelHoverRepeat(btn) {
  let timer = null;
  const clear = () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
  btn.addEventListener("mouseenter", () => {
    clear();
    timer = window.setTimeout(() => {
      if (btn.isConnected) renderFastTravelTooltip(btn);
      timer = null;
    }, FAST_TRAVEL_HOVER_REPEAT_MS);
  });
  btn.addEventListener("mouseleave", clear);
}

const UNLOAD_TOOLTIP_SESSION_KEY = "frtd.unloadTooltipSeen.v1";

function hasSeenUnloadTooltip() {
  if (typeof window === "undefined" || !window.sessionStorage) return false;
  return window.sessionStorage.getItem(UNLOAD_TOOLTIP_SESSION_KEY) === "true";
}

function markUnloadTooltipSeen() {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  window.sessionStorage.setItem(UNLOAD_TOOLTIP_SESSION_KEY, "true");
}

function showUnloadTooltipOnce(targetEl) {
  if (!targetEl || hasSeenUnloadTooltip()) return;
  markUnloadTooltipSeen();
  const text = targetEl.getAttribute("data-tooltip") || "Transfer scavenged resources to base (gas, wood, components).";
  let tip = document.getElementById("homeLoadoutUnloadTooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "homeLoadoutUnloadTooltip";
    tip.className = "fast-travel-tooltip visible";
    document.body.appendChild(tip);
  }
  tip.textContent = text;
  tip.style.maxWidth = "420px";
  tip.style.width = "420px";
  tip.classList.add("visible");
  const rect = targetEl.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 16, Math.max(16, rect.left + rect.width * 0.5));
  const top = Math.max(12, rect.top - 10);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.transform = "translate(-50%, -100%)";
  window.setTimeout(() => {
    tip.classList.remove("visible");
  }, 2600);
}

function updateSquadWindow(state) {
  const win = document.getElementById("squadWindow");
  const status = document.getElementById("squadStatus");
  const list = document.getElementById("squadMoveList");
  const titleEl = document.getElementById("squadTitle");
  const moveSection = list?.closest?.(".squad-moves");
  if (!win || !status || !list) return;
  const setSquadStatus = (message = "", showHost = false) => {
    const existingHost = document.getElementById("rangerPaneHost");
    status.textContent = message;
    if (existingHost) {
      existingHost.style.display = showHost ? "" : "none";
      status.appendChild(existingHost);
    }
  };
  const activeUnit = getActiveRangerUnit(state);
  queueRangerPaneWarmup(state);
  if (titleEl) {
    const isDead = !!activeUnit?.isDead;
    const skull = "💀";
    if (isDead) {
      titleEl.textContent = "";
      const skullSpan = document.createElement("span");
      skullSpan.className = "emoji";
      skullSpan.textContent = `${skull} `;
      titleEl.appendChild(skullSpan);
      titleEl.append(activeUnit?.callsign || "Strike Team");
    } else {
      titleEl.textContent = activeUnit?.callsign || "Strike Team";
    }
  }
  if (!activeUnit?.deployed) {
    win.classList.add("hidden");
    state.squadPaneClosed = true;
    setSquadStatus("Deploy the Rangers to begin issuing orders.");
    list.innerHTML = '<div class="empty">No active squad.</div>';
    if (moveSection) moveSection.classList.remove("hidden");
    return;
  }
  const wasHidden = win.classList.contains("hidden");
  if (!state.squadSelected) {
    win.classList.add("hidden");
    setSquadStatus("Click the sheriff badge to issue orders.");
    list.innerHTML = "";
    if (moveSection) moveSection.classList.remove("hidden");
    return;
  }
  if (state.squadPaneClosed) {
    win.classList.add("hidden");
    return;
  }
  const current = activeUnit?.currentNodeId ? state.nodeMap.get(activeUnit.currentNodeId) : null;
  const range = state.getSquadRange();
  setSquadStatus("", true);
  ensureRangerPaneHost();
  refreshRangerPaneScene(state, { forceRebuild: wasHidden });
  const isDead = !!activeUnit?.isDead;
  if (moveSection) moveSection.classList.toggle("hidden", isDead);
  if (isDead) {
    const skull = "💀";
    setSquadStatus();
    const empty = document.createElement("div");
    empty.className = "empty";
    const leftSkull = document.createElement("span");
    leftSkull.className = "emoji";
    leftSkull.textContent = `${skull} `;
    const rightSkull = document.createElement("span");
    rightSkull.className = "emoji";
    rightSkull.textContent = ` ${skull}`;
    const deathReason = activeUnit?.deathReason ? ` (${activeUnit.deathReason})` : "";
    empty.append(leftSkull, `Unit has perished${deathReason}.`, rightSkull);
    status.appendChild(empty);
    list.innerHTML = "";
    win.classList.remove("hidden");
    return;
  }
  const options = getReachableNodes(state);
  const fastTravelTargets = getFastTravelDestinations(state, activeUnit);
  const fastTravelIds = new Set(fastTravelTargets.map((t) => t.id));
  const usesGas = isVehicleUnit(activeUnit);
  list.innerHTML = "";
  if (!options.length && !fastTravelTargets.length) {
    list.innerHTML = usesGas
      ? '<div class="empty">No towns in range. Gather more gas.</div>'
      : '<div class="empty">No towns in range.</div>';
  } else {
    for (const option of options) {
      if (fastTravelIds.has(option.id)) continue;
      const btn = document.createElement("button");
      if (usesGas) {
        const costText = option.cost.toFixed(1).replace(/\.0$/, "");
        btn.textContent = `${option.node.name} - ${costText} Gas`;
      } else {
        btn.textContent = option.node.name;
      }
      btn.onclick = () => issueMarchOrderToNode(state, option.node);
      list.appendChild(btn);
    }
    for (const target of fastTravelTargets) {
      const btn = document.createElement("button");
      btn.className = "fast-travel";
      btn.textContent = `⚡ ${target.name || "Settlement"}`;
      btn.onmouseenter = () => showFastTravelTooltip(state, btn);
      bindFastTravelHoverRepeat(btn);
      btn.onclick = () => issueFastTravelOrder(state, target);
      list.appendChild(btn);
    }
  }
  win.classList.remove("hidden");
  if (win._encounterFadeTimer) {
    clearTimeout(win._encounterFadeTimer);
    win._encounterFadeTimer = null;
  }
  win.classList.remove("encounter-fading-out");
  if (wasHidden) {
    let placed = positionSquadWindowAtMapControls(win);
    if (!placed) placed = placeWindowNearNode(win, current, { x: 18, y: -20 });
    if (!placed) centerWindowOnMap(win);
    clearTextSelection();
  }
}

const SCENE_WEIGHT_INPUT_IDS = {
  camp: "sceneWeightCamp",
  poi: "sceneWeightPoi",
  random: "sceneWeightRandom",
  battle: "sceneWeightBattle",
};

function clampSceneWeight(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, num);
}

function refreshSceneWeightInputs() {
  Object.entries(SCENE_WEIGHT_INPUT_IDS).forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (!input) return;
    const val = clampSceneWeight(sceneSelectionWeights[key], 0);
    sceneSelectionWeights[key] = val;
    input.value = `${val}`;
  });
}

function setupSceneWeightInputs() {
  Object.entries(SCENE_WEIGHT_INPUT_IDS).forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (!input) return;
    const next = clampSceneWeight(sceneSelectionWeights[key], 0);
    sceneSelectionWeights[key] = next;
    input.value = `${next}`;
    input.addEventListener("change", () => {
      const val = clampSceneWeight(input.value, sceneSelectionWeights[key]);
      sceneSelectionWeights[key] = val;
      input.value = `${val}`;
    });
  });
}

function updateDevPanel(state) {
  if (isReleaseMode()) return;
  const toggle = document.getElementById("devClickProbeToggle");
  const fogToggle = document.getElementById("devFogToggle");
  const encounterToggle = document.getElementById("devEncounterToggle");
  const campToggle = document.getElementById("devCampToggle");
  const storyToggle = document.getElementById("devStoryToggle");
  const difficultyInput = document.getElementById("devDifficultyInput");
  const readout = document.getElementById("devClickCoords");
  const teleportReadout = document.getElementById("devTeleportReadout");
  const teleportBtn = document.getElementById("devTeleportBtn");
  const activeUnit = getActiveRangerUnit(state);
  const enabled = !!state?.dev?.clickProbeEnabled;
  if (toggle) {
    toggle.checked = enabled;
  }
  if (fogToggle) {
    fogToggle.checked = !!isFogEnabled(state);
  }
  if (encounterToggle) {
    encounterToggle.checked = !!encounterOverlayState.active;
  }
  if (campToggle) {
    campToggle.checked = !!campOverlayState.active;
  }
  if (storyToggle) {
    storyToggle.checked = !!storyOverlayState.active;
  }
  if (difficultyInput) {
    const next = Number.isFinite(state?.difficulty) ? Math.trunc(state.difficulty) : DEFAULT_ROLL_DIFFICULTY;
    difficultyInput.value = `${next}`;
  }
  if (readout) {
    const last = state?.dev?.lastMapClick;
    const visLabel = last
      ? last.visible
        ? "visible"
        : last.explored
          ? "seen"
          : "unknown"
      : "";
    const cellLabel = last?.cell ? ` | cell ${last.cell.cx},${last.cell.cy}` : "";
    readout.textContent = !enabled
      ? "Map click logging is off."
       : last
         ? `Last map click: ${last.x.toFixed(2)}%, ${last.y.toFixed(2)}% | ${visLabel}${cellLabel}`
         : "Click the map to sample coords.";
  }
  refreshSceneWeightInputs();
  refreshSpriteCleanupUI();
}

function boostStockpile(state, amount = 100) {
  if (!state?.resources) return;
  const payload = {};
  RESOURCE_KEYS.forEach((key) => {
    payload[key] = amount;
  });
  state.resources.add(payload);
  renderResources(state);
  updateTownWindow(state);
  updateSquadWindow(state);
  state.logger?.log(`Dev: +${amount} to all stockpile resources.`);
}

function refreshSpriteCleanupUI() {
  const select = document.getElementById("spriteCleanupSelect");
  const tolSlider = document.getElementById("spriteTolerance");
  const softSlider = document.getElementById("spriteSoftness");
  const erodeSlider = document.getElementById("spriteErode");
  const settleScale = document.getElementById("settlementScale");
  const unitScale = document.getElementById("unitScale");
  const tolValue = document.getElementById("spriteToleranceValue");
  const softValue = document.getElementById("spriteSoftnessValue");
  const erodeValue = document.getElementById("spriteErodeValue");
  const settleVal = document.getElementById("settlementScaleValue");
  const unitVal = document.getElementById("unitScaleValue");
  const readout = document.getElementById("spriteCleanupReadout");
  if (!select || !tolSlider || !softSlider || !erodeSlider || !settleScale || !unitScale) return;
  if (!select.options.length) {
    SPRITE_SHEET_KEYS.forEach((key) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = spriteSheetLabel(key);
      select.appendChild(opt);
    });
    select.value = SPRITE_SHEET_KEYS[0];
  }
  const key = select.value || SPRITE_SHEET_KEYS[0];
  const profile = spriteCleanupProfileFor(key);
  const tol = Math.round(profile.tolerance ?? 0);
  const soft = Math.round(profile.softness ?? profile.tolerance ?? 0);
  const erode = Math.round(profile.erode ?? 0);
  const settle = Number((window.devSpriteScales?.settlementScale ?? DEV_SPRITE_TUNABLES.settlementScale ?? SETTLEMENT_ICON_SCALE).toFixed(2));
  const unit = Number((window.devSpriteScales?.unitScale ?? DEV_SPRITE_TUNABLES.unitScale ?? UNIT_ICON_SCALE).toFixed(2));
  tolSlider.value = tol;
  softSlider.value = soft;
  erodeSlider.value = erode;
  settleScale.value = settle;
  unitScale.value = unit;
  if (tolValue) tolValue.textContent = `${tol}`;
  if (softValue) softValue.textContent = `${soft}`;
  if (erodeValue) erodeValue.textContent = `${erode}`;
  if (settleVal) settleVal.textContent = settle.toFixed(2);
  if (unitVal) unitVal.textContent = unit.toFixed(2);
  if (readout) {
    readout.textContent = `${spriteSheetLabel(key)} | tolerance ${tol} | feather ${soft} | erode ${erode}`;
  }
  if (teleportReadout) {
    const armed = !!state?.dev?.teleportArmed;
    const unitLabel = activeUnit?.callsign || "selected unit";
    teleportReadout.textContent = armed
      ? `Teleport armed for ${unitLabel}. Click the map to move it.`
      : "Teleport idle.";
  }
  if (teleportBtn) {
    teleportBtn.textContent = state?.dev?.teleportArmed ? "Cancel teleport" : "Teleport selected unit";
  }
}

function setupSpriteCleanupDevControls(state) {
  const select = document.getElementById("spriteCleanupSelect");
  const tolSlider = document.getElementById("spriteTolerance");
  const softSlider = document.getElementById("spriteSoftness");
  const erodeSlider = document.getElementById("spriteErode");
  const settleScale = document.getElementById("settlementScale");
  const unitScale = document.getElementById("unitScale");
  const exportBtn = document.getElementById("exportAtlasBtn");
  const applyBtn = document.getElementById("applySpriteCleanupBtn");
  const resetBtn = document.getElementById("resetSpriteCleanupBtn");
  if (!select || !tolSlider || !softSlider || !erodeSlider || !settleScale || !unitScale) return;
  if (select.dataset.bound === "true") {
    refreshSpriteCleanupUI();
    return;
  }
  select.dataset.bound = "true";
  if (!select.options.length) {
    SPRITE_SHEET_KEYS.forEach((key) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = spriteSheetLabel(key);
      select.appendChild(opt);
    });
    select.value = SPRITE_SHEET_KEYS[0];
  }
  const persist = () => {
    const key = select.value;
    const overrides = { ...(spriteCleanupOverrides || {}) };
    overrides[key] = {
      ...(overrides[key] || {}),
      tolerance: Number(tolSlider.value),
      softness: Number(softSlider.value),
      mode: spriteCleanupProfileFor(key)?.mode,
      erode: Number(erodeSlider.value),
    };
    spriteCleanupOverrides = overrides;
    saveSpriteCleanupOverrides(spriteCleanupOverrides);
    refreshSpriteCleanupUI();
  };
  const updateScales = () => {
    window.devSpriteScales = window.devSpriteScales || { ...DEV_SPRITE_TUNABLES };
    window.devSpriteScales.settlementScale = Number(settleScale.value);
    window.devSpriteScales.unitScale = Number(unitScale.value);
    refreshSpriteCleanupUI();
    if (mapSceneInstance?.unitMarkers?.size) {
      const unitScaleVal = getUnitScale();
      mapSceneInstance.unitMarkerStyle = {
        unitScale: unitScaleVal,
        haloStyle: mapSceneInstance.unitMarkerStyle?.haloStyle || UNIT_HALO_STYLE,
        shadowStyle: mapSceneInstance.unitMarkerStyle?.shadowStyle || mapSceneInstance.spriteShadowStyle || {},
      };
      mapSceneInstance.unitMarkers.forEach((entry) => {
        if (!entry?.sprite) return;
        // Pixel-perfect hit testing samples local texture coords + sprite scale, so setScale is sufficient —
        // no need to rebuild the interactive area when only the unit scale changes.
        entry.sprite.setScale(unitScaleVal);
      });
    }
    if (mapSceneInstance?.rebuildSpriteAtlases) {
      mapSceneInstance.rebuildSpriteAtlases();
      if (state) {
        renderPhaserMap(state, mapSceneInstance);
      }
    }
  };
  const resetCurrent = () => {
    const key = select.value;
    const overrides = { ...(spriteCleanupOverrides || {}) };
    delete overrides[key];
    spriteCleanupOverrides = overrides;
    saveSpriteCleanupOverrides(spriteCleanupOverrides);
    refreshSpriteCleanupUI();
  };
  select.addEventListener("change", refreshSpriteCleanupUI);
  tolSlider.addEventListener("input", persist);
  softSlider.addEventListener("input", persist);
  erodeSlider.addEventListener("input", persist);
  settleScale.addEventListener("input", updateScales);
  unitScale.addEventListener("input", updateScales);
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      if (mapSceneInstance) exportRuntimeAtlasIndexes(mapSceneInstance);
    });
  }
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      if (mapSceneInstance?.rebuildSpriteAtlases) {
        mapSceneInstance.rebuildSpriteAtlases();
        if (state) {
          renderPhaserMap(state, mapSceneInstance);
        }
      }
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetCurrent();
      if (mapSceneInstance?.rebuildSpriteAtlases) {
        mapSceneInstance.rebuildSpriteAtlases();
        if (state) {
          renderPhaserMap(state, mapSceneInstance);
        }
      }
    });
  }
  refreshSpriteCleanupUI();
}

function init() {
  setLoadingOverlay(false);
  if (window.location.protocol === "file:") {
    const warn = document.createElement("div");
    warn.className = "file-warning";
    warn.textContent = "Browser file:// blocked images. Run `node server.js` then open http://localhost:8000";
    document.body.appendChild(warn);
  }
  const restartPayload = consumeRestartPayload();
  const storedTitleEnabled = readStoredToggle("titleScreenEnabled", true);
  titleScreenState.enabled = restartPayload ? false : true;
  setupTitleScreen();
  setupMusicWidgetControls();
  if (restartPayload) {
    titleScreenState.enabled = false;
    document.documentElement.classList.remove("title-boot");
    restoreMusicWidgetFromTitle();
    startGameSession({
      difficultyKey: restartPayload.difficultyKey || TITLE_SCREEN_DEFAULT_DIFFICULTY,
      advancedDifficulty: restartPayload.advancedDifficulty || null,
    });
    return;
  }
  if (!storedTitleEnabled) {
    persistToggle("titleScreenEnabled", true);
  }
  if (titleScreenState.enabled) {
    showTitleScreen();
    return;
  }
  document.documentElement.classList.remove("title-boot");
  restoreMusicWidgetFromTitle();
  startGameSession({ difficultyKey: TITLE_SCREEN_DEFAULT_DIFFICULTY });
}

function createFreshGameState(options = {}) {
  if (isDemoDifficultyLocked()) {
    options.difficultyKey = "low";
  }
  const resolvedAdvancedSettings = clampAdvancedDifficultySettings(
    options.advancedDifficulty || titleScreenState.advancedSettings || readStoredAdvancedDifficultySettings()
  );
  const appliedAdvancedSettings = applyAdvancedDifficultySettings(resolvedAdvancedSettings);
  titleScreenState.advancedSettings = resolvedAdvancedSettings;
  persistAdvancedDifficultySettings(resolvedAdvancedSettings);
  const preset = resolveDifficultyPreset(options.difficultyKey);
  const initialResources = resolveInitialResources(preset.resourceMultiplier);
  const baseRollDifficulty = preset.baseRollDifficulty;
  resetTransitionMetrics({
    fromTitle: !!options.fromTitle,
    newGameClickAt: options.fromTitle ? nowMs() : null,
  });
  if (options.fromTitle) {
    startTransitionProfiler({
      fromTitle: true,
      newGameClickAt: getTransitionMetrics()?.newGameClickAt || nowMs(),
    });
    recordTransitionEvent("newGame:click");
  }
  window.devFogEnabled = readStoredToggle("fogEnabled", fogSetting("enabled") === 1);
  const state = new GameState({
    initialResources,
    baseRollDifficulty,
    difficultyKey: options.difficultyKey || TITLE_SCREEN_DEFAULT_DIFFICULTY,
    advancedDifficulty: appliedAdvancedSettings,
    runStartedAt: Date.now(),
  });
  state.hardcore = !!appliedAdvancedSettings.hardcore;
  return state;
}

async function shutdownGameSession(options = {}) {
  const state = getGlobalGameState();
  const scene = mapSceneInstance;
  const preserveTransitionOverlay = options.preserveTransitionOverlay === true;
  const preservePhaserGame = options.preservePhaserGame === true;
  teardownScenesForStateSwap();
  stopKeyboardMarching(state);
  clearTourPulse();
  closeEndTurnTooltip();
  if (tourState.active) {
    endOnboardingTour();
  }
  tourState.pendingStart = false;
  tourState.currentStepId = null;
  closeMapPanes(state);
  ["gameOverOverlay", "missionOverlay"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("hidden");
    el.classList.remove("is-visible");
    el.setAttribute("aria-hidden", "true");
  });
  const howToBtn = document.getElementById("howToBtn");
  if (howToBtn) howToBtn.setAttribute("aria-expanded", "false");
  if (!preserveTransitionOverlay && scene?.endTurnTransitionShaderGame) {
    try {
      scene.endTurnTransitionShaderGame.destroy(true);
    } catch (err) {
      console.warn("Failed to destroy transition shader game", err);
    }
    scene.endTurnTransitionShaderGame = null;
  }
  scene?.stopEndTurnTransitionTweens?.();
  const mapContainer = document.getElementById("mapContainer");
  if (mapContainer) {
    mapContainer.classList.remove("basemap-pending");
    if (!preserveTransitionOverlay && options.removeTransitionOverlay !== false) {
      mapContainer.querySelectorAll("#endTurnTransitionOverlay").forEach((el) => el.remove());
    }
  }
  if (mainPhaserGame && preservePhaserGame) {
    try {
      mainPhaserGame.scene.stop("mapScene");
    } catch (err) {
      console.warn("Failed to stop active map scene", err);
    }
    try {
      mainPhaserGame.scene.remove("mapScene");
    } catch (err) {
      console.warn("Failed to remove active map scene", err);
    }
  } else if (mainPhaserGame) {
    try {
      mainPhaserGame.destroy(true);
    } catch (err) {
      console.warn("Failed to destroy active Phaser game", err);
    }
  }
  if (!preservePhaserGame) {
    mainPhaserGame = null;
  }
  mapSceneInstance = null;
  const phaserContainer = document.getElementById("phaserContainer");
  if (phaserContainer && !preservePhaserGame) {
    phaserContainer.innerHTML = "";
  }
  titleScreenState.gameStarted = false;
  titleScreenState.startingGame = false;
}

async function startGameSession(options = {}) {
  if (titleScreenState.gameStarted || titleScreenState.startingGame) return null;
  titleScreenState.startingGame = true;
  try {
    if (options.fromTitle) {
      titleScreenState.pendingStart = true;
      setTitleLoadingVisible(true);
      setLoadingOverlay(true);
      setupLoadingArt();
      try {
        recordTransitionEvent("warmup:await:start");
        await ensureTitleBasemapWarmup();
        recordTransitionEvent("warmup:await:ready");
      } catch (err) {
        console.warn("Title startup warmup failed", err);
        recordTransitionEvent("warmup:await:error", { message: err?.message || String(err) });
      }
      patchTransitionMetrics({
        warmupReadyAt: titleScreenState.basemapWarmupComplete ? nowMs() : getTransitionMetrics()?.warmupReadyAt || null,
      });
    }
    const freshState = createFreshGameState(options);
    const liveState = getGlobalGameState();
    const activeState = liveState ? replaceGameStateData(liveState, freshState) : freshState;
    setGlobalGameState(activeState);
    return await bootGameSession(activeState, options);
  } finally {
    if (!titleScreenState.gameStarted) {
      titleScreenState.startingGame = false;
    }
  }
}

function setLoadingOverlayMessage(text, options = {}) {
  const overlay = document.getElementById("loadingOverlay");
  const textEl = document.getElementById("loadingText");
  if (!overlay || !textEl) return;
  const centered = options.centered !== false;
  overlay.style.alignItems = centered ? "center" : "flex-end";
  overlay.style.padding = centered ? "16px" : "20px 16px";
  textEl.textContent = text || "L O A D I N G";
  if (!textEl.querySelector(".loading-dots")) {
    const dots = document.createElement("span");
    dots.className = "loading-dots";
    for (let i = 0; i < 3; i++) dots.appendChild(document.createElement("i"));
    textEl.appendChild(dots);
  }
}

function setLoadingOverlayMode(mode = "art") {
  const overlay = document.getElementById("loadingOverlay");
  const canvas = document.getElementById("loadingArtCanvas");
  if (!overlay) return;
  const textOnly = mode === "text-only";
  overlay.dataset.mode = textOnly ? "text-only" : "art";
  overlay.classList.toggle("text-only", textOnly);
  if (canvas) {
    canvas.style.display = textOnly ? "none" : (overlay.classList.contains("hidden") ? "none" : "block");
  }
}

function resetLoadingOverlayMessage() {
  setLoadingOverlayMode("art");
  setLoadingOverlayMessage("L O A D I N G", { centered: false });
}

async function restartGameSession(options = {}) {
  if (sessionRestartPromise) {
    return sessionRestartPromise;
  }
  const currentState = getGlobalGameState();
  const difficultyKey =
    options.difficultyKey
    || currentState?.difficultyKey
    || titleScreenState.difficultyKey
    || TITLE_SCREEN_DEFAULT_DIFFICULTY;
  const advancedDifficulty = clampAdvancedDifficultySettings(
    options.advancedDifficulty
    || currentState?.advancedDifficulty
    || titleScreenState.advancedSettings
  );
  const townWindow = document.getElementById("townWindow");
  if (townWindow) townWindow.classList.add("hidden");
  const coverScene = mapSceneInstance;
  sessionRestartPromise = (async () => {
    setLoadingOverlayMode("text-only");
    setLoadingOverlayMessage("N E W   G A M E   L O A D I N G");
    setLoadingOverlay(true);
    if (coverScene?.coverScreenTransition) {
      try {
        await coverScene.coverScreenTransition();
      } catch (err) {
        console.warn("Restart cover transition failed", err);
      }
    }
    try {
      await shutdownGameSession({
        preserveTransitionOverlay: true,
        preservePhaserGame: true,
      });
      const freshState = createFreshGameState({
        difficultyKey,
        advancedDifficulty,
        fromTitle: false,
      });
      const activeState = currentState ? replaceGameStateData(currentState, freshState) : freshState;
      setGlobalGameState(activeState);
      await bootGameSession(activeState, {
        difficultyKey,
        advancedDifficulty,
        fromTitle: false,
        fromRestart: true,
      });
    } finally {
      if (coverScene?.clearScreenTransition) {
        await Promise.all([
          playLoadingOverlayOutro({ durationMs: END_TURN_TRANSITION_CLEAR_MS }),
          coverScene.clearScreenTransition(),
        ]);
      } else {
        await playLoadingOverlayOutro({ durationMs: END_TURN_TRANSITION_CLEAR_MS });
        if (coverScene?.releaseScreenTransition) {
          coverScene.releaseScreenTransition();
        }
      }
      // The old scene's transition overlay was kept alive to cover the restart. The new
      // scene builds its own, so release the old WebGL game and its DOM node now.
      if (coverScene && coverScene !== mapSceneInstance) {
        const staleGame = coverScene.endTurnTransitionShaderGame;
        if (staleGame) {
          const staleGl = staleGame.renderer?.gl || null;
          try {
            // destroy() only flags the game; the teardown itself runs in the next step,
            // and that step never comes while the loop is asleep. wake() steps once.
            staleGame.destroy(true);
            staleGame.loop?.wake();
          } catch (err) {
            console.warn("Failed to destroy previous transition shader game", err);
          }
          try {
            // Hand the WebGL context back now instead of waiting for garbage collection;
            // browsers cap live contexts and evict the oldest, which would be the map.
            staleGl?.getExtension("WEBGL_lose_context")?.loseContext();
          } catch (_) {
            // context already gone
          }
        }
        coverScene.endTurnTransitionShaderGame = null;
        const staleOverlay = coverScene.endTurnTransitionOverlayEl;
        if (staleOverlay && staleOverlay !== mapSceneInstance?.endTurnTransitionOverlayEl) {
          staleOverlay.remove();
        }
        coverScene.endTurnTransitionOverlayEl = null;
      }
      sessionRestartPromise = null;
    }
  })();
  return sessionRestartPromise;
}

async function requestFullPageRestart(options = {}) {
  if (sessionRestartPromise) {
    return sessionRestartPromise;
  }
  const currentState = getGlobalGameState();
  const difficultyKey =
    options.difficultyKey
    || currentState?.difficultyKey
    || titleScreenState.difficultyKey
    || TITLE_SCREEN_DEFAULT_DIFFICULTY;
  const advancedDifficulty = clampAdvancedDifficultySettings(
    options.advancedDifficulty
    || currentState?.advancedDifficulty
    || titleScreenState.advancedSettings
  );
  const townWindow = document.getElementById("townWindow");
  if (townWindow) townWindow.classList.add("hidden");
  const coverScene = mapSceneInstance;
  sessionRestartPromise = (async () => {
    setLoadingOverlayMode("text-only");
    setLoadingOverlayMessage("N E W   G A M E         L O A D I N G");
    setLoadingOverlay(true);
    if (coverScene?.coverScreenTransition) {
      await coverScene.coverScreenTransition();
    }
    setRestartPayload({ difficultyKey, advancedDifficulty });
    window.location.reload();
  })();
  return sessionRestartPromise;
}

async function bootGameSession(state, options = {}) {
  if (!state) return null;
  try {
  setGlobalGameState(state);
  titleScreenState.gameStarted = true;
  titleScreenState.startingGame = false;
  window.devSpriteScales = window.devSpriteScales || { ...DEV_SPRITE_TUNABLES };
  setupMapUIControls();
  preloadAllDiceScenesOnce();
  recordTransitionEvent("gameSession:stateReady");
  const mapContainer = document.getElementById("mapContainer");
  const phaserContainer = document.getElementById("phaserContainer");
  if (mapContainer && options.fromTitle) {
    mapContainer.classList.add("basemap-pending");
  }
  const clearSquadSelection = () => clearSquadSelectionFromMap(state);
  const blockRightClick = (evt) => {
    if (evt?.button === 2) {
      evt.preventDefault();
      evt.stopPropagation();
    }
  };
  if (mapContainer) {
    mapContainer.oncontextmenu = (e) => {
      e.preventDefault();
      clearSquadSelection();
    };
    mapContainer.onpointerdown = blockRightClick;
    mapContainer.onmousedown = blockRightClick;
  }
  if (phaserContainer) {
    phaserContainer.oncontextmenu = (e) => {
      e.preventDefault();
      clearSquadSelection();
    };
    phaserContainer.onpointerdown = blockRightClick;
    phaserContainer.onmousedown = blockRightClick;
  }
  recordTransitionEvent("bootPhaser:start");
  const sessionSerial = ++gameSessionSerial;
  const { scene } = bootPhaser(state);
  recordTransitionEvent("bootPhaser:queued");
  const ensureInitialFogRender = () => {
    if (sessionSerial !== gameSessionSerial) return;
    const scene = mapSceneInstance;
    if (!scene?.ready) {
      requestAnimationFrame(ensureInitialFogRender);
      return;
    }
    scene.fogNeedsRedraw = true;
    if (state.visibility) state.visibility.dirty = true;
    renderPhaserMap(state, scene);
  };
  ensureInitialFogRender();
  renderResources(state);
  renderMap(state);
  updateRegionModal(state, null);
  updateTownWindow(state);
  updateSquadWindow(state);
  updateTurnLabel(state);
  startLiveScoreTicker(state);
  if (rangerPaneScene) {
    rangerPaneScene.setGameState(state);
    refreshRangerPaneScene(state, { forceRebuild: true });
  }
  if (options.fromTitle) {
    setupOnboardingTour(state);
  }
  const regionModal = document.getElementById("regionModal");
  const gameOverRestartBtn = document.getElementById("gameOverRestartBtn");
  const gameOverQuitMenuBtn = document.getElementById("gameOverQuitMenuBtn");
  const gameOverQuitOsBtn = document.getElementById("gameOverQuitOsBtn");
  const missionRestartBtn = document.getElementById("missionRestartBtn");
  const missionQuitMenuBtn = document.getElementById("missionQuitMenuBtn");
  const missionQuitOsBtn = document.getElementById("missionQuitOsBtn");
  const devPanel = document.getElementById("devPanel");
  const toggleDevPanel = () => {
    if (!isDevPanelAllowed() || !devPanel) return;
    devPanel.classList.toggle("hidden");
  };
  if (isReleaseMode()) {
    if (devPanel) devPanel.remove();
  } else {
    if (!isDevPanelAllowed() && devPanel) {
      devPanel.classList.add("hidden");
    }
    const devClickProbeToggle = document.getElementById("devClickProbeToggle");
    const devFogToggle = document.getElementById("devFogToggle");
    const devEncounterToggle = document.getElementById("devEncounterToggle");
    const devCampToggle = document.getElementById("devCampToggle");
    const devDifficultyInput = document.getElementById("devDifficultyInput");
    const devShowEncounterBtn = document.getElementById("devShowEncounterBtn");
    const devShowCampBtn = document.getElementById("devShowCampBtn");
    const devShowPoiBtn = document.getElementById("devShowPoiBtn");
    const devShowRandomBtn = document.getElementById("devShowRandomBtn");
    const devShowBattleBtn = document.getElementById("devShowBattleBtn");
    const devShowSettlementBtn = document.getElementById("devShowSettlementBtn");
    const devStoryToggle = document.getElementById("devStoryToggle");
    const devTitleScreenToggle = document.getElementById("devTitleScreenToggle");
    const devTourResetToggle = document.getElementById("devTourResetToggle");
    const devTeleportBtn = document.getElementById("devTeleportBtn");
    const devStockpileBoostBtn = document.getElementById("devStockpileBoostBtn");
    window.sceneSelectionWeights = sceneSelectionWeights;
    setupSceneWeightInputs();
    if (devClickProbeToggle) {
      devClickProbeToggle.onchange = (e) => {
        state.dev.clickProbeEnabled = !!e.target.checked;
        updateDevPanel(state);
      };
    }
    if (devFogToggle) {
      devFogToggle.onchange = (e) => {
        setFogMode(state, e.target.checked ? 1 : 0);
      };
    }
    if (devEncounterToggle) {
      devEncounterToggle.onchange = (e) => {
        const enabled = !!e.target.checked;
        if (enabled) {
          ensurePendingEncounter(pickNextSceneKey(sceneSelectionWeights));
          triggerEncounterFromTimer();
          if (devCampToggle) {
            devCampToggle.checked = false;
          }
        } else {
          toggleEncounterOverlay(false);
          hideAllSceneOverlays();
          setEncounterTransitionActive(false);
          startEncounterTimer();
        }
      };
    }
    if (devCampToggle) {
      devCampToggle.onchange = (e) => {
        const enabled = !!e.target.checked;
        toggleCampOverlay(enabled);
        if (enabled && devEncounterToggle) {
          devEncounterToggle.checked = false;
        }
        if (!enabled) {
          cancelEncounterTimer();
          startEncounterTimer();
        }
        devCampToggle.checked = !!campOverlayState.active;
      };
    }
    if (devDifficultyInput) {
      devDifficultyInput.value = `${state.difficulty}`;
      devDifficultyInput.onchange = () => {
        const next = Number(devDifficultyInput.value);
        if (!Number.isFinite(next)) {
          devDifficultyInput.value = `${state.difficulty}`;
          return;
        }
        state.difficulty = Math.trunc(next);
        devDifficultyInput.value = `${state.difficulty}`;
      };
    }
    if (devShowEncounterBtn) {
      devShowEncounterBtn.onclick = () => {
        ensurePendingEncounter(pickNextSceneKey(sceneSelectionWeights));
        triggerEncounterFromTimer();
        if (devEncounterToggle) devEncounterToggle.checked = true;
        if (devCampToggle) devCampToggle.checked = false;
      };
    }
    if (devShowCampBtn) {
      devShowCampBtn.onclick = () => {
        startCampScene();
        if (devEncounterToggle) devEncounterToggle.checked = false;
        if (devCampToggle) devCampToggle.checked = true;
      };
    }
    if (devShowPoiBtn) {
      devShowPoiBtn.onclick = () => {
        startPoiScene();
        if (devEncounterToggle) devEncounterToggle.checked = false;
        if (devCampToggle) devCampToggle.checked = false;
      };
    }
    if (devShowRandomBtn) {
      devShowRandomBtn.onclick = () => {
        startRandomScene();
        if (devEncounterToggle) devEncounterToggle.checked = false;
        if (devCampToggle) devCampToggle.checked = false;
      };
    }
    if (devShowBattleBtn) {
      devShowBattleBtn.onclick = () => {
        startBattleScene();
        if (devEncounterToggle) devEncounterToggle.checked = false;
        if (devCampToggle) devCampToggle.checked = false;
      };
    }
    if (devShowSettlementBtn) {
      devShowSettlementBtn.onclick = () => {
        const state = getGlobalGameState();
        const settlement = state?.smallSettlements?.[0] || null;
        if (settlement) {
          settlement.joinedFaction = false;
          settlement.yields = null;
          settlement.owner = "neutral";
          startSettlementScene(settlement.id);
        } else {
          startSettlementScene();
        }
        if (devEncounterToggle) devEncounterToggle.checked = false;
        if (devCampToggle) devCampToggle.checked = false;
      };
    }
    if (devStoryToggle) {
      devStoryToggle.checked = !!window.devStoryEnabled;
      devStoryToggle.onchange = (e) => {
        const enabled = !!e.target.checked;
        window.devStoryEnabled = enabled;
        if (enabled) {
          startIntroStory({ restart: true });
        } else {
          stopIntroStory();
        }
      };
    }
    if (devTitleScreenToggle) {
      devTitleScreenToggle.checked = !!titleScreenState.enabled;
      devTitleScreenToggle.onchange = (e) => {
        const enabled = !!e.target.checked;
        titleScreenState.enabled = enabled;
        persistToggle("titleScreenEnabled", enabled);
        if (enabled) {
          showTitleScreen();
        } else {
          hideTitleScreen();
        }
      };
    }
    if (devTourResetToggle) {
      devTourResetToggle.checked = false;
      devTourResetToggle.onchange = (e) => {
        if (!e.target.checked) return;
        persistToggle(TOUR_SKIP_KEY, false);
        if (tourState.active) {
          endOnboardingTour();
        }
        setupOnboardingTour(state);
        startOnboardingTour();
        e.target.checked = false;
      };
    }
    if (devTeleportBtn) {
      devTeleportBtn.onclick = () => {
        if (state.dev.teleportArmed) {
          state.dev.teleportArmed = false;
          updateDevPanel(state);
          return;
        }
        const activeUnit = getActiveRangerUnit(state);
        if (!activeUnit || !activeUnit.deployed || activeUnit.isDead) {
          state.dev.teleportArmed = false;
          if (state.logger) {
            state.logger.log("Teleport requires an active deployed unit.");
          }
          updateDevPanel(state);
          return;
        }
        state.dev.teleportArmed = true;
        if (state.logger) {
          const label = activeUnit.callsign || "selected unit";
          state.logger.log(`Teleport armed for ${label}. Click the map to move it.`);
        }
        updateDevPanel(state);
      };
    }
    if (devStockpileBoostBtn) {
      devStockpileBoostBtn.onclick = () => {
        boostStockpile(state, 100);
      };
    }
    const devShowSpinBtn = document.getElementById("devShowSpinBtn");
    if (devShowSpinBtn) {
      devShowSpinBtn.onclick = () => {
        const node = state?.nodeMap?.get?.("santaCruz");
        if (node) {
          node.owner = "neutral";
          node.yields = null;
          node.conquestAttempted = false;
          node.joinedFaction = false;
        }
        startLargeSettlementScene("santaCruz");
        if (devEncounterToggle) devEncounterToggle.checked = false;
        if (devCampToggle) devCampToggle.checked = false;
      };
    }
    const devTriDiceBtn = document.getElementById("devTriDiceBtn");
    if (devTriDiceBtn) {
      devTriDiceBtn.onclick = () => {
        showTriDiceOverlay();
      };
    }
    updateDevPanel(state);
    setupSpriteCleanupDevControls(state);
  }
  if (gameOverRestartBtn) {
    gameOverRestartBtn.onclick = () => {
      void restartGameSession({ source: "game-over" });
    };
  }
  if (gameOverQuitMenuBtn) {
    gameOverQuitMenuBtn.onclick = () => {
      returnToTitleScreen();
    };
  }
  if (gameOverQuitOsBtn) {
    gameOverQuitOsBtn.onclick = () => {
      requestAppQuit();
    };
  }
  if (missionRestartBtn) {
    missionRestartBtn.onclick = () => {
      void restartGameSession({ source: "mission" });
    };
  }
  if (missionQuitMenuBtn) {
    missionQuitMenuBtn.onclick = () => {
      returnToTitleScreen();
    };
  }
  if (missionQuitOsBtn) {
    missionQuitOsBtn.onclick = () => {
      requestAppQuit();
    };
  }
  const endTurnBtn = document.getElementById("endTurnBtn");
  if (endTurnBtn) {
    endTurnBtn.onclick = () => {
      if (isEndTurnBlockedByEncounter()) return;
      void state.endTurn();
    };
  }
  const endTurnInfoBtn = document.getElementById("endTurnInfoBtn");
  const endTurnTooltip = document.getElementById("endTurnTooltip");
  if (endTurnInfoBtn && endTurnTooltip) {
    let pinned = false;
    const showTooltip = () => {
      renderEndTurnTooltip(state);
      endTurnTooltip.classList.add("visible");
      endTurnInfoBtn.setAttribute("aria-expanded", "true");
      endTurnTooltip.setAttribute("aria-hidden", "false");
    };
    const hideTooltip = () => {
      if (pinned) return;
      endTurnTooltip.classList.remove("visible");
      endTurnInfoBtn.setAttribute("aria-expanded", "false");
      endTurnTooltip.setAttribute("aria-hidden", "true");
    };
    endTurnInfoBtn.onmouseenter = showTooltip;
    endTurnInfoBtn.onmouseleave = hideTooltip;
    endTurnInfoBtn.onfocus = showTooltip;
    endTurnInfoBtn.onblur = hideTooltip;
    endTurnInfoBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pinned) {
        pinned = false;
        hideTooltip();
      } else {
        pinned = true;
        showTooltip();
      }
    };
  }
  const closeRegionBtn = document.getElementById("closeRegionBtn");
  if (closeRegionBtn) {
    closeRegionBtn.onclick = () => {
      state.selectedNode = null;
      updateRegionModal(state, null);
    };
  }
  if (regionModal) {
    regionModal.onclick = (e) => {
      if (e.target === regionModal) {
        state.selectedNode = null;
        updateRegionModal(state, null);
      }
    };
  }
  const howToBody = document.getElementById("howToBody");
  if (howToBody) {
    const howToText = typeof window !== "undefined" ? window.ContentLibrary?.HowToPlayText : null;
    if (typeof howToText === "string") {
      howToBody.textContent = howToText;
    }
  }
  const howToBtn = document.getElementById("howToBtn");
    if (howToBtn) {
      howToBtn.onclick = () => {
        const win = document.getElementById("howToWindow");
        if (!win) return;
        const willShow = win.classList.contains("hidden");
        win.classList.toggle("hidden");
        win.setAttribute("aria-hidden", willShow ? "false" : "true");
        howToBtn.setAttribute("aria-expanded", willShow ? "true" : "false");
        if (willShow) {
          win.style.left = "50%";
          win.style.top = "50%";
          win.style.transform = "";
          clearTextSelection();
        }
        document.body.classList.toggle("howto-open", willShow);
      };
    }
  const townBtn = document.getElementById("townBtn");
  if (townBtn) {
    townBtn.onclick = () => {
      const win = document.getElementById("townWindow");
      if (!win) return;
      const willShow = win.classList.contains("hidden");
      win.classList.toggle("hidden");
      updateTownWindow(state);
      if (willShow) {
        const toggleEl = document.getElementById("liveScoreToggle");
        if (toggleEl) toggleEl.checked = isLiveScoreVisiblePref();
        centerWindowOnMap(win);
        clearTextSelection();
      }
    };
  }
  const liveScoreToggle = document.getElementById("liveScoreToggle");
  if (liveScoreToggle) {
    liveScoreToggle.checked = isLiveScoreVisiblePref();
    liveScoreToggle.onchange = (e) => {
      const visible = !!e.target.checked;
      setLiveScoreVisiblePref(visible);
      applyLiveScoreVisibility(visible);
    };
  }
  const quitToMenuBtn = document.getElementById("quitToMenuBtn");
  if (quitToMenuBtn) {
    quitToMenuBtn.onclick = () => {
      returnToTitleScreen();
    };
  }
  const restartRunBtn = document.getElementById("restartRunBtn");
  if (restartRunBtn) {
    restartRunBtn.onclick = () => {
      const state = getGlobalGameState();
      const difficultyKey =
        state?.difficultyKey || titleScreenState.difficultyKey || TITLE_SCREEN_DEFAULT_DIFFICULTY;
      const advancedDifficulty = clampAdvancedDifficultySettings(
        state?.advancedDifficulty || titleScreenState.advancedSettings
      );
      void restartGameSession({ difficultyKey, advancedDifficulty, source: "pause-menu" });
    };
  }
  const quitToOsBtn = document.getElementById("quitToOsBtn");
  if (quitToOsBtn) {
    quitToOsBtn.onclick = () => {
      requestAppQuit();
    };
  }
  updateMusicEnablement();
  applySoundSettingsToDiceScenes(true);
  setupMusicWidgetControls();
  setupSaveWidget(state);
  const closeTownBtn = document.getElementById("closeTownBtn");
  if (closeTownBtn) {
    closeTownBtn.onclick = () => {
      const win = document.getElementById("townWindow");
      if (win) win.classList.add("hidden");
    };
  }
    const closeHowTo = () => {
      const win = document.getElementById("howToWindow");
      if (!win) return;
      win.classList.add("hidden");
      win.setAttribute("aria-hidden", "true");
      if (howToBtn) howToBtn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("howto-open");
    };
  const closeHowToBtn = document.getElementById("closeHowToBtn");
  if (closeHowToBtn) closeHowToBtn.onclick = closeHowTo;
  const closeHowToFooterBtn = document.getElementById("closeHowToFooterBtn");
  if (closeHowToFooterBtn) closeHowToFooterBtn.onclick = closeHowTo;
  const upgradeBtn = document.getElementById("upgradeBtn");
  if (upgradeBtn) {
    upgradeBtn.onclick = () => {
      const win = document.getElementById("upgradeWindow");
      if (!win) return;
      const willShow = win.classList.contains("hidden");
      win.classList.toggle("hidden");
      if (willShow) {
        updateUpgradeWindow(state);
        positionUpgradeWindow(win);
        clearTextSelection();
      }
    };
  }
  const closeUpgradeBtn = document.getElementById("closeUpgradeBtn");
  if (closeUpgradeBtn) {
    closeUpgradeBtn.onclick = () => {
      const win = document.getElementById("upgradeWindow");
      if (win) win.classList.add("hidden");
    };
  }
  const homeBaseTabUnits = document.getElementById("homeBaseTabUnits");
  if (homeBaseTabUnits) {
    homeBaseTabUnits.onclick = () => toggleHomeBaseTab(state, "units");
  }
  const homeBaseTabBuild = document.getElementById("homeBaseTabBuild");
  if (homeBaseTabBuild) {
    homeBaseTabBuild.onclick = () => toggleHomeBaseTab(state, "build");
  }
  const closeSquadBtn = document.getElementById("closeSquadBtn");
  if (closeSquadBtn) {
    closeSquadBtn.onclick = () => {
      const win = document.getElementById("squadWindow");
      if (win) win.classList.add("hidden");
      state.squadPaneClosed = true;
    };
  }
  document.onkeydown = (e) => {
    const state = getGlobalGameState();
    if (!state) return;
    if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"))) {
      return;
    }
    // Nothing should act on the run from behind the game-over / mission screens.
    if (isRunOver(state)) return;
    if (!e.repeat && (e.ctrlKey || e.metaKey) && !e.altKey && e.key === " ") {
      if (!isEditableTarget(e.target) && !isAnySceneOverlayActive() && !tourState.active) {
        const endTurnBtn = document.getElementById("endTurnBtn");
        if (endTurnBtn && !endTurnBtn.disabled && endTurnBtn.offsetParent !== null && !isEndTurnBlockedByEncounter()) {
          e.preventDefault();
          endTurnBtn.click();
          return;
        }
      }
    }
    if (!e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const key = e.key;
      if (key === " ") {
        if (tryTriggerLargeSettlementRollHotkey(e)) {
          e.preventDefault();
          return;
        }
        if (tryTriggerSceneRoll(e)) {
          e.preventDefault();
          return;
        }
        if (tryTriggerBackToMap(e)) {
          e.preventDefault();
          return;
        }
      }
      if (handleHomeBaseSceneHotkey(state, e)) {
        e.preventDefault();
        return;
      }
      if (key >= "1" && key <= "9") {
        if (canUseMapHotkeys(state, e, { allowWhileMoving: true })) {
          const idx = Number(key) - 1;
          const units = (state.rangerUnits || []).filter((unit) => unit?.deployed);
          const unit = units[idx];
          if (unit) {
            e.preventDefault();
            const keepViewport = !state.squadSelected;
            activateUnitShortcut(state, unit, { keepViewport });
            return;
          }
        }
      } else if (key === "h" || key === "H") {
        if (goToHomeBaseFromMap(state, e)) {
          e.preventDefault();
          return;
        }
      } else if (key === "q" || key === "Q") {
        if (clearSquadSelectionFromMap(state, e, { checkHotkeys: true })) {
          e.preventDefault();
          return;
        }
      } else if (key === "`") {
        if (focusHomeBaseViewportFromMap(state, e)) {
          e.preventDefault();
          return;
        }
      } else if ((key === "s" || key === "S") && tryTriggerShopHotkey(e)) {
        e.preventDefault();
        return;
      } else if (WASD_KEYS.has(key.toLowerCase())) {
        const lowered = key.toLowerCase();
        wasdState[lowered] = true;
        if (updateKeyboardMarchTarget(state, e)) {
          e.preventDefault();
          return;
        }
      }
    }
    if (e.key === "F9" && e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey) {
      if (!isDevPanelAllowed()) {
        return;
      }
      e.preventDefault();
      toggleDevPanel();
      return;
    }
    if (e.key === "Escape") {
      // Browser inside any iframe (e.g. itch.io embed): the browser natively
      // handles Escape→exit fullscreen for parent-owned fullscreens, and JS
      // inside the iframe cannot trigger that exit any other way (see
      // WHATWG Fullscreen spec: exitFullscreen no-ops when the iframe's own
      // fullscreenElement is null, which it always is when the parent calls
      // requestFullscreen on the iframe element). We just need to NOT open
      // the menu here — otherwise the menu pops on top of the post-exit
      // iframe view. Deliberately omit preventDefault so the browser's
      // native fullscreen exit fires.
      if (!isElectronApp() && window.top !== window.self) {
        return;
      }
      if (isEditableTarget(e.target) || isAnySceneOverlayActive() || tourState.active) return;
      const endTurnBtn = document.getElementById("endTurnBtn");
      // An open Menu holds End Turn itself, so it must still be closable with Escape.
      const menuOpen = isMenuPauseActive();
      if (!menuOpen && (!endTurnBtn || endTurnBtn.disabled || endTurnBtn.offsetParent === null || isEndTurnBlockedByEncounter())) return;
      const menuBtn = document.getElementById("townBtn");
      if (menuBtn && menuBtn.offsetParent !== null && !menuBtn.disabled) {
        e.preventDefault();
        menuBtn.click();
      }
    }
  };
  document.onkeyup = (e) => {
    const state = getGlobalGameState();
    if (!state) return;
    const lowered = (e.key || "").toLowerCase();
    if (!WASD_KEYS.has(lowered)) return;
    // Release the key even with a modifier held (e.g. W let go while Ctrl is still down
    // after Ctrl+Space), otherwise the march never stops.
    wasdState[lowered] = false;
    if (isEditableTarget(e.target)) return;
    if (wasdState.w || wasdState.a || wasdState.s || wasdState.d) {
      updateKeyboardMarchTarget(state, e);
      return;
    }
    if (stopKeyboardMarching(state)) {
      e.preventDefault();
    }
  };
  if (!window.__frtdMarchKeyBlurBound) {
    // A listener, not window.onblur: Phaser assigns that property for each of its games.
    window.__frtdMarchKeyBlurBound = true;
    window.addEventListener("blur", releaseAllMarchKeys);
  }
  makeDraggable(document.getElementById("townWindow"), document.getElementById("townWindowHandle"));
  makeDraggable(document.getElementById("howToWindow"), document.getElementById("howToWindowHandle"));
  makeDraggable(document.getElementById("squadWindow"), document.getElementById("squadWindowHandle"));
  const sessionTimedOut = await Promise.race([
    scene.whenSessionReady().then(() => false),
    wait(SESSION_READY_TIMEOUT_MS).then(() => true),
  ]);
  if (!options.fromLoad && Number.isFinite(state?.runStartedAt)) {
    state.runStartedAt = Date.now();
    // If something already paused the clock, that pause starts from here too.
    if (Number.isFinite(runClockPausedAt)) runClockPausedAt = state.runStartedAt;
    refreshLiveScoreHud(state, { animate: false });
  }
  if (sessionTimedOut) {
    console.warn("Map session did not report ready in time; continuing.");
    if (typeof scene.markSessionReady === "function") scene.markSessionReady();
    const mapContainer = document.getElementById("mapContainer");
    if (mapContainer) mapContainer.classList.remove("basemap-pending");
    playLoadingOverlayOutro();
  }
  return state;
  } finally {
    if (!titleScreenState.gameStarted) {
      titleScreenState.startingGame = false;
    }
  }
}
let musicAutoplayUnlockAttached = false;
function startInitialMusicBeforeLoad() {
  if (typeof window === "undefined") return;
  loadMusicTrackList().then(() => {
    if (resumeMusicFromStorage()) return;
    preloadFirstMusicTrack();
  });
  window.addEventListener("beforeunload", persistMusicState);
  window.addEventListener("pagehide", persistMusicState);
  if (musicAutoplayUnlockAttached) return;
  musicAutoplayUnlockAttached = true;
  const unlock = () => {
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
    updateMusicEnablement();
  };
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}
startInitialMusicBeforeLoad();

function setupDemoFullscreenExitHandlers() {
  if (!isDemoMode()) return;
  const handleExit = () => {
    if (isFullscreenActive()) return;
    stopMusic();
    if (storyOverlayState.active) stopIntroStory();
  };
  document.addEventListener("fullscreenchange", handleExit);
  document.addEventListener("webkitfullscreenchange", handleExit);
  document.addEventListener("mozfullscreenchange", handleExit);
  document.addEventListener("MSFullscreenChange", handleExit);
}
setupDemoFullscreenExitHandlers();
relabelQuitButtonsForBrowserBuild();
window.addEventListener("load", init);

function makeDraggable(el, handle) {
  if (!el || !handle) return;
  if (handle.dataset.dragBound === "true") return;
  handle.dataset.dragBound = "true";
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.left = `${startLeft + dx}px`;
    el.style.top = `${startTop + dy}px`;
  };

  const onUp = () => {
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  handle.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON") return;
    if (dragging) onUp();
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    // A window centred with a CSS transform (How to Play) would jump by half its size
    // on the first pixel of movement; pin it to its on-screen position first.
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.transform = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function clearTextSelection() {
  if (!window.getSelection) return;
  const selection = window.getSelection();
  if (selection && selection.rangeCount) {
    selection.removeAllRanges();
  }
}

function centerWindowOnMap(win) {
  if (!win) return;
  const map = document.getElementById("mapContainer");
  if (!map) return;
  const mapRect = map.getBoundingClientRect();
  if (!mapRect.width || !mapRect.height) return;
  const width = win.offsetWidth;
  const height = win.offsetHeight;
  if (!width || !height) return;
  const targetLeft = mapRect.left + mapRect.width / 2 - width / 2;
  const targetTop = mapRect.top + mapRect.height / 2 - height / 2;
  const margin = 12;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const maxLeft = Math.max(window.innerWidth - width - margin, margin);
  const maxTop = Math.max(window.innerHeight - height - margin, margin);
  win.style.left = `${clamp(targetLeft, margin, maxLeft)}px`;
  win.style.top = `${clamp(targetTop, margin, maxTop)}px`;
}

function positionUpgradeWindow(win) {
  if (!win) return;
  const anchor = document.getElementById("homeBaseBuildPanel");
  if (!anchor || anchor.classList.contains("hidden")) {
    centerWindowOnMap(win);
    return;
  }
  const rect = anchor.getBoundingClientRect();
  const gap = 16;
  const margin = 12;
  const left = rect.right + gap;
  const maxLeft = window.innerWidth - margin;
  const safeLeft = Math.min(Math.max(left, margin), maxLeft);
  const availableWidth = Math.max(240, window.innerWidth - safeLeft - 40);
  win.style.left = `${safeLeft}px`;
  win.style.right = "40px";
  win.style.width = `${availableWidth}px`;
  win.style.maxWidth = "none";
  win.style.top = `${Math.max(margin, rect.top)}px`;
  win.style.transform = "none";
}

function positionSquadWindowAtMapControls(win) {
  if (!win) return false;
  const anchor = document.getElementById("mapHomeBtn");
  const map = document.getElementById("mapContainer");
  if (!anchor || !map) return false;
  const anchorRect = anchor.getBoundingClientRect();
  const mapRect = map.getBoundingClientRect();
  const rect = win.getBoundingClientRect();
  let width = rect.width;
  let height = rect.height;
  if (!width || !height) {
    const styles = window.getComputedStyle(win);
    width = parseFloat(styles.width) || 320;
    height = parseFloat(styles.height) || 240;
  }
  if (!width || !height) return false;
  const gap = 12;
  const margin = 12;
  const targetLeft = anchorRect.right + gap;
  const targetTop = anchorRect.top;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const maxLeft = Math.max(mapRect.right - width - margin, margin);
  const maxTop = Math.max(mapRect.bottom - height - margin, margin);
  win.style.left = `${clamp(targetLeft, mapRect.left + margin, maxLeft)}px`;
  win.style.top = `${clamp(targetTop, mapRect.top + margin, maxTop)}px`;
  return true;
}

function placeWindowNearNode(win, node, offset = { x: 16, y: -10 }) {
  if (!win || !node || !mapSceneInstance?.cameras?.main) return false;
  const cam = mapSceneInstance.cameras.main;
  const phaserEl = document.getElementById("phaserContainer");
  const mapEl = document.getElementById("mapContainer");
  if (!phaserEl || !mapEl) return false;
  const rect = phaserEl.getBoundingClientRect();
  const mapRect = mapEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const worldX = (node.pos.x / 100) * mapSceneInstance.worldWidth;
  const worldY = (node.pos.y / 100) * mapSceneInstance.worldHeight;
  const screenX = (worldX - cam.worldView.x) * cam.zoom + rect.left + (cam.viewport?.x || 0);
  const screenY = (worldY - cam.worldView.y) * cam.zoom + rect.top + (cam.viewport?.y || 0);
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const margin = 12;
  const width = win.offsetWidth;
  const height = win.offsetHeight;
  const prefOffset = { x: offset.x ?? 18, y: offset.y ?? -20 };

  // Default left bias: center window between unit and map's left edge (clamped to map container).
  const mapLeft = Math.max(rect.left, mapRect.left) + margin;
  const mapRight = Math.min(rect.right, mapRect.right) - margin;
  const targetCenterX = screenX + (mapLeft - screenX) * 0.5 + (prefOffset.x || 0);
  let targetLeft = targetCenterX - width / 2;
  const maxLeft = mapRight - width;
  const minLeft = mapLeft;
  targetLeft = clamp(targetLeft, minLeft, Math.max(minLeft, maxLeft));

  // Vertically center on the unit with a small offset.
  let targetTop = screenY - height / 2 + (prefOffset.y || 0);
  const minTop = Math.max(rect.top, mapRect.top) + margin;
  const maxTop = Math.min(rect.bottom, mapRect.bottom) - margin - height;
  targetTop = clamp(targetTop, minTop, Math.max(minTop, maxTop));

  win.style.left = `${targetLeft}px`;
  win.style.top = `${targetTop}px`;
  return true;
}

function positionCommandPane(scene) {
  if (!scene?.commandPane) return;
  const pane = scene.commandPane;
  const margin = 14;
  const bounds = pane.getBounds();
  const width = bounds.width;
  const height = bounds.height;
  const targetX = (scene.scale?.width || window.innerWidth) - width - margin;
  const targetY = margin + (scene.scale?.height ? scene.scale.height * 0.05 : 0);
  pane.setPosition(targetX, targetY);
}



function getCell(node) {
  return {
    cx: Math.round(node.pos.x / 10),
    cy: Math.round(node.pos.y / 10),
  };
}

// ---------------------------------------------------------------------------
// Ranger command pane (Phaser UI embedded inside #squadStatus)
// ---------------------------------------------------------------------------

class RangerPaneScene extends Phaser.Scene {
  constructor() {
    super({ key: "rangerPaneScene" });
    this.state = null;
    this.commandPane = null;
    this.commandPaneRows = [];
    this.atlasFrames = {};
    this.weaponAtlasReady = {};
    this.weaponAtlasBuilding = {};
    this.preseededTextureEntries = [];
  }
  setGameState(state) {
    this.state = state;
  }
  queuePreseededTexture(key, src) {
    if (!key || !src) return false;
    if (!STATIC_IMAGE_WARM_CACHE.has(src)) return false;
    this.preseededTextureEntries.push({ key, src });
    return true;
  }
  installPreseededTextures() {
    if (!this.preseededTextureEntries.length) return;
    this.preseededTextureEntries.forEach((entry) => {
      const cached = STATIC_IMAGE_WARM_CACHE.get(entry.src);
      const img = cached && typeof cached.then !== "function" ? cached : null;
      if (!img || this.textures.exists(entry.key)) return;
      this.textures.addImage(entry.key, img);
    });
  }
  preload() {
    this.preseededTextureEntries = [];
    [
      { key: "meleeweapons", src: "sprites/meleeweapons.png" },
      { key: "gunweapons", src: "sprites/gunweapons.png" },
      { key: "energyweapons", src: "sprites/energyweapons.png" },
      { key: "rangedweapons", src: "sprites/rangedweapons.png" },
    ].forEach(({ key, src }) => {
      if (this.queuePreseededTexture(key, src)) return;
      this.load.image(key, src);
    });
  }
  create() {
    recordTransitionEvent("rangerPane:create:start");
    this.installPreseededTextures();
    this.commandPaneRows = [];
    buildRangerPane(this, this.state);
    rangerPaneReady = true;
    rangerPaneWarmupRunning = false;
    // Booted while its window is still hidden: let the loop rest until it is shown.
    setTimeout(() => {
      watchRangerPaneVisibility();
      syncRangerPaneLoopToVisibility();
    }, 0);
    queueRangerPaneWeaponAtlasWarmup(this);
    recordTransitionEvent("rangerPane:create:ready");
  }
  refreshUI(state, options = {}) {
    if (state) this.state = state;
    const force = !!options.forceRebuild;
    if (force || !this.commandPane) {
      buildRangerPane(this, this.state);
    } else {
      updateRangerPane(this, this.state);
    }
  }
}

function ensureRangerPaneHost() {
  const status = document.getElementById("squadStatus");
  if (!status) return;
  let host = document.getElementById("rangerPaneHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "rangerPaneHost";
    host.style.width = "100%";
    host.style.height = "260px";
    status.appendChild(host);
  }
}

function queueRangerPaneWeaponAtlasWarmup(scene) {
  if (!scene || scene.weaponAtlasWarmupQueued) return;
  scene.weaponAtlasWarmupQueued = true;
  const pending = ["meleeweapons", "gunweapons", "energyweapons", "rangedweapons"];
  const schedule = (cb, delay = 0) => {
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(cb, { timeout: Math.max(250, delay || 250) });
      return;
    }
    window.setTimeout(cb, Math.max(0, delay));
  };
  const warmNext = () => {
    if (!scene?.textures) {
      scene.weaponAtlasWarmupQueued = false;
      return;
    }
    const nextKey = pending.find((key) => scene.textures.exists(key) && !scene.weaponAtlasReady?.[key]);
    if (!nextKey) {
      scene.weaponAtlasWarmupQueued = false;
      return;
    }
    ensureWeaponAtlas(scene, nextKey);
    schedule(warmNext, 150);
  };
  schedule(warmNext, 300);
}

function queueRangerPaneWarmup(state) {
  if (!state || rangerPaneGame || rangerPaneScene || rangerPaneWarmupQueued || rangerPaneWarmupRunning) return;
  rangerPaneWarmupQueued = true;
  const schedule = (cb, delay = 0) => {
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(cb, { timeout: Math.max(800, delay || 800) });
      return;
    }
    window.setTimeout(cb, Math.max(0, delay));
  };
  schedule(() => {
    rangerPaneWarmupQueued = false;
    if (!state || rangerPaneGame || rangerPaneScene || rangerPaneWarmupRunning) return;
    if (isLoadingOverlayActive()) {
      queueRangerPaneWarmup(state);
      return;
    }
    ensureRangerPaneHost();
    const host = document.getElementById("rangerPaneHost");
    if (!host) return;
    rangerPaneWarmupRunning = true;
    host.style.display = "none";
    bootRangerPane(state);
  }, 900);
}

function bootRangerPane(state) {
  const host = document.getElementById("rangerPaneHost");
  if (!host) return;
  const w = host.clientWidth || 260;
  const h = host.clientHeight || 240;
  rangerPaneReady = false;
  rangerPaneWarmupRunning = true;
  rangerPaneScene = new RangerPaneScene();
  rangerPaneScene.setGameState(state);
  rangerPaneGame = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: "rangerPaneHost",
    width: w,
    height: h,
    backgroundColor: "rgba(0,0,0,0)",
    transparent: true,
    fps: {
      target: 60,
      min: 10,
    },
    scene: rangerPaneScene,
  });
}

// The squad pane is its own Phaser game. Its content only changes through refreshUI, so
// while the pane is not displayed its render loop sleeps instead of redrawing unseen.
function syncRangerPaneLoopToVisibility() {
  const loop = rangerPaneGame?.loop;
  if (!loop) return;
  const host = document.getElementById("rangerPaneHost");
  const displayed = !!host && host.getClientRects().length > 0;
  const mustRun = !rangerPaneReady || rangerPaneWarmupRunning || displayed;
  try {
    if (mustRun && !loop.running) loop.wake();
    else if (!mustRun && loop.running) loop.sleep();
  } catch (_) {
    // leave the loop as it is
  }
}
function watchRangerPaneVisibility() {
  if (typeof MutationObserver === "undefined" || watchRangerPaneVisibility.observer) return;
  const squadWindow = document.getElementById("squadWindow");
  if (!squadWindow) return;
  const observer = new MutationObserver(syncRangerPaneLoopToVisibility);
  observer.observe(squadWindow, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
  watchRangerPaneVisibility.observer = observer;
}

function refreshRangerPaneScene(state, options = {}) {
  const host = document.getElementById("rangerPaneHost");
  if (!host) return;
  if (!rangerPaneGame || !rangerPaneScene) {
    bootRangerPane(state);
    return;
  }
  // If the Phaser scene hasn't finished booting, skip this tick; it will be built on the next refresh.
  if (!rangerPaneScene.add?.container) return;
  rangerPaneScene.refreshUI(state, options);
  watchRangerPaneVisibility();
  syncRangerPaneLoopToVisibility();
}

function syncRangerPaneSize(scene, targetHeight) {
  if (!scene?.scale || !scene.scale.resize) return;
  const host = document.getElementById("rangerPaneHost");
  const hostHeight = host?.clientHeight || targetHeight || 0;
  const desiredHeight = Math.max(1, Math.max(targetHeight || 0, hostHeight || 0));
  if (host && host.style.height !== `${desiredHeight}px`) {
    host.style.height = `${desiredHeight}px`;
  }
  if (scene.scale.height !== desiredHeight) {
    scene.scale.resize(scene.scale.width, desiredHeight);
  }
}

function createTankMeter(scene, label, value = 5, max = 5) {
  const container = scene.add.container(0, 0);
  container.setScrollFactor(0);
  const tankWidth = Math.max(120, (scene.scale?.width || 220) - 150);
  const tankHeight = 12;
  const pad = 2;
  const segments = Math.max(1, max);
  const barY = -tankHeight * 0.5;
  const g = scene.add.graphics();
  const barX = 0;
  const labelGap = 12;
  const baseLabelColor = "#d6f5d0";
  const baseValueColor = "#b4c8b1";
  const alertLabelColor = "#ff6b6b";
  const alertValueColor = "#ffb3b3";
  const labelText = scene.add.text(tankWidth + labelGap, 0, label, {
    fontFamily: "Segoe UI Emoji, Noto Color Emoji, 'Apple Color Emoji', 'Segoe UI Symbol', 'Share Tech Mono', monospace",
    fontSize: "11px",
    color: baseLabelColor,
  }).setOrigin(0, 0.5);
  const valueTextPadding = 8;
  const valueText = scene.add.text(tankWidth + labelGap + labelText.width + valueTextPadding, 0, `${value}`, {
    fontFamily: "Segoe UI Emoji, Noto Color Emoji, 'Apple Color Emoji', 'Segoe UI Symbol', 'Share Tech Mono', monospace",
    fontSize: "10px",
    color: baseValueColor,
  }).setOrigin(0, 0.5);
  container.add([g, labelText, valueText]);
  const draw = (val) => {
    g.clear();
    g.lineStyle(1, 0x3a5040, 1);
    g.fillStyle(0x0b140d, 0.8);
    g.fillRoundedRect(barX, barY, tankWidth, tankHeight, 3);
    g.strokeRoundedRect(barX, barY, tankWidth, tankHeight, 3);
    const cellW = (tankWidth - pad * 2) / segments;
    for (let i = 0; i < segments; i++) {
      const filled = i < val;
      g.fillStyle(filled ? 0x74ff8d : 0x1f2a22, filled ? 0.9 : 0.7);
      g.fillRoundedRect(barX + pad + i * cellW + 0.5, barY + pad + 0.5, cellW - 1, tankHeight - pad * 2 - 1, 2);
      g.lineStyle(1, 0x2a3a2d, 0.8);
      g.strokeRoundedRect(barX + pad + i * cellW + 0.5, barY + pad + 0.5, cellW - 1, tankHeight - pad * 2 - 1, 2);
    }
  };
  const refreshLayout = (val) => {
    draw(val);
    valueText.setText(`${val}`);
    const totalWidth = tankWidth + labelGap + labelText.width + valueText.width + valueTextPadding;
    container.setSize(totalWidth, tankHeight + 8);
  };
  const initialValue = Phaser.Math.Clamp(Math.floor(value), 0, max);
  refreshLayout(initialValue);
  container.setValue = (val) => {
    const clamped = Phaser.Math.Clamp(Math.floor(val), 0, max);
    refreshLayout(clamped);
  };
  container.setAlert = (isAlert) => {
    labelText.setColor(isAlert ? alertLabelColor : baseLabelColor);
    valueText.setColor(isAlert ? alertValueColor : baseValueColor);
  };
  return container;
}

function ensureWeaponAtlas(scene, atlasKey) {
  if (!scene || !atlasKey) return [];
  scene.atlasFrames = scene.atlasFrames || {};
  scene.weaponAtlasReady = scene.weaponAtlasReady || {};
  scene.weaponAtlasBuilding = scene.weaponAtlasBuilding || {};
  if (scene.weaponAtlasBuilding[atlasKey]) {
    return scene.atlasFrames[atlasKey] || [];
  }
  if (scene.weaponAtlasReady[atlasKey] && scene.atlasFrames[atlasKey]?.length) {
    return scene.atlasFrames[atlasKey];
  }
  if (!scene.textures?.exists?.(atlasKey)) return [];
  const weaponTexture = scene.textures.get(atlasKey);
  const weaponSource = weaponTexture?.getSourceImage?.();
  if (!weaponSource || !weaponSource.width || !weaponSource.height) return [];
  scene.weaponAtlasBuilding[atlasKey] = true;
  const profile = spriteCleanupProfileFor(atlasKey);
  const cleanupProfile = {
    tolerance: profile.tolerance ?? 120,
    softness: profile.softness ?? profile.tolerance ?? 0,
    erode: profile.erode ?? 0,
    alphaCutoff: profile.alphaCutoff ?? 12,
    bgColors: profile.bgColors && profile.bgColors.length ? profile.bgColors : [CHROMA_BG],
  };
  stripTextureBackground(scene, atlasKey, cleanupProfile);
  const frames = buildAutoAtlas(scene, atlasKey, {
    padding: 4,
    minArea: 180,
    detectKey: atlasKey,
    alphaCutoff: cleanupProfile.alphaCutoff,
    tolerance: cleanupProfile.tolerance,
    bgColors: cleanupProfile.bgColors,
  });
  scene.atlasFrames[atlasKey] = frames;
  scene.weaponAtlasReady[atlasKey] = true;
  scene.weaponAtlasBuilding[atlasKey] = false;
  return frames;
}

function formatUnitBonusText(unit) {
  if (!unit) return "";
  const parts = [];
  const rollBonus = Math.trunc(unit.rollBonus || 0);
  const apLevel = Math.trunc(unit.apBonus || 0);
  const apSolar = Math.trunc(unit.solarBonus || 0);
  if (rollBonus) parts.push(`+${rollBonus} roll`);
  if (apLevel) parts.push(`+${apLevel} AP (Level)`);
  if (apSolar) parts.push(`+${apSolar} AP (Solar)`);
  return parts.length ? `Bonuses: ${parts.join(", ")}` : "Bonuses: none";
}

function buildRangerPane(scene, state) {
  if (!scene || !state) return;
  if (scene.commandPane) {
    scene.commandPane.destroy(true);
    scene.commandPane = null;
    scene.commandPaneRows = [];
  }
  const activeUnit = getActiveRangerUnit(state);
  scene.activeUnitId = activeUnit?.id || null;
  scene.activeUnitMaxAp = activeUnit ? getUnitMaxAp(activeUnit) : null;
  const pane = scene.add.container(0, 0);
  pane.setScrollFactor(0);
  pane.setDepth(1);
  const bg = scene.add.graphics();
  const width = Math.max(220, scene.scale?.width || 220);
  const headerHeight = 26;
  const margin = 10;
  const rowEstimate = 180;
  const unitCount = activeUnit ? 1 : 0;
  const totalHeight = Math.max(scene.scale?.height || 240, unitCount * rowEstimate + headerHeight + margin * 2);
  bg.fillStyle(0x0c140d, 0.92);
  bg.fillRoundedRect(0, 0, width, totalHeight, 10);
  bg.lineStyle(1, 0x2d3f2f, 1);
  bg.strokeRoundedRect(0, 0, width, totalHeight, 10);
  const titleText = "Inventory";
  const title = scene.add.text(margin, headerHeight * 0.5, titleText, {
    fontFamily: "Share Tech Mono, monospace",
    fontSize: "14px",
    color: "#aaf0b5",
  }).setOrigin(0, 0.5);
  const levelText = scene.add.text(width - margin, headerHeight * 0.5, `Lv. ${getUnitLevel(activeUnit)}`, {
    fontFamily: "Share Tech Mono, monospace",
    fontSize: "11px",
    color: "#7fb487",
  }).setOrigin(1, 0.5);
  pane.add([bg, title, levelText]);
  let y = headerHeight + 6;
  if (!activeUnit) {
    const empty = scene.add.text(margin, y + 8, "No active unit selected.", {
      fontFamily: "Share Tech Mono, monospace",
      fontSize: "12px",
      color: "#7fb487",
    }).setOrigin(0, 0);
    pane.add(empty);
    scene.commandPane = pane;
    const finalHeight = Math.max(headerHeight + margin, y + 34);
    bg.clear();
    bg.fillStyle(0x0c140d, 0.92);
    bg.fillRoundedRect(0, 0, width, finalHeight, 10);
    bg.lineStyle(1, 0x2d3f2f, 1);
    bg.strokeRoundedRect(0, 0, width, finalHeight, 10);
    syncRangerPaneSize(scene, finalHeight);
    return;
  }
  const unit = activeUnit;
  const row = scene.add.container(margin, y);
  const upgradeEntry = getWeaponUpgradeEntry(unit?.weaponFrameIndex ?? 1, unit);
  ensureWeaponAtlas(scene, upgradeEntry?.atlas);
  const labelFor = (key) => `${fmtResourceKey(key)} ${iconForResource(key)}`;
  const meterKeys = ["ap", "chits", "food", "water", "gas", "wood", "components"];
  const meterMax = {
    ap: getUnitMaxAp(unit),
    gas: 20,
    water: 20,
    food: 20,
    chits: 20,
    wood: 20,
    components: 20,
  };
  const meterY = 0;
  const spacingY = 18;
  const meters = {};
  meterKeys.forEach((key, idx) => {
    const meter = createTankMeter(scene, labelFor(key), unit.inventory?.[key] ?? 0, meterMax[key] || 5);
    meter.setPosition(0, meterY + spacingY * idx);
    meters[key] = meter;
  });
  if (meters.food?.setAlert) {
    meters.food.setAlert((unit.inventory?.food ?? 0) < 1);
  }
  if (meters.water?.setAlert) {
    meters.water.setAlert((unit.inventory?.water ?? 0) < 1);
  }
  const meterBlockHeight = spacingY * meterKeys.length;
  const dividerY = meterY + meterBlockHeight + 4;
  const weaponSectionTop = dividerY + 12;
  const rowWidth = width - margin * 2;
  const divider = scene.add.graphics();
  divider.lineStyle(1, 0x2a3a2d, 0.9);
  divider.strokeLineShape(new Phaser.Geom.Line(0, dividerY, rowWidth, dividerY));
  row.add(divider);
  const weaponThumbSize = 40;
  const weaponThumbRadius = 6;
  const weaponThumb = scene.add.graphics();
  weaponThumb.fillStyle(0x070c08, 0.55);
  weaponThumb.fillRoundedRect(0, 0, weaponThumbSize, weaponThumbSize, weaponThumbRadius);
  weaponThumb.lineStyle(1, 0x78ffa0, 0.2);
  weaponThumb.strokeRoundedRect(0, 0, weaponThumbSize, weaponThumbSize, weaponThumbRadius);
  weaponThumb.setPosition(0, weaponSectionTop);
  const weaponIndex = Math.max(0, Math.trunc(upgradeEntry?.frameIndex ?? 0));
  const weaponFrame = atlasFrame(scene, upgradeEntry?.atlas || "meleeweapons", weaponIndex);
  const weaponIcon = scene.add
    .sprite(weaponThumbSize * 0.5, weaponSectionTop + weaponThumbSize * 0.5, upgradeEntry?.atlas || "meleeweapons", weaponFrame)
    .setOrigin(0.5);
  if (scene?.renderer?.type === Phaser.WEBGL && weaponIcon.postFX?.addGlow) {
    weaponIcon.postFX.addGlow(0xaaf0b5, 1.6, 0.6, false, 0.5, 0.5);
  }
  const weaponFrameData = scene.textures?.getFrame?.(upgradeEntry?.atlas || "meleeweapons", weaponFrame);
  const targetHeight = weaponThumbSize - 8;
  const weaponScale = weaponFrameData?.height ? targetHeight / weaponFrameData.height : 0.4;
  weaponIcon.setScale(weaponScale);
  const bonusX = weaponThumbSize + 12;
  const weaponLevelText = scene.add.text(bonusX, weaponSectionTop + 2, `Weapon Lvl. ${getWeaponUpgradeIndex(unit?.weaponFrameIndex ?? 1)}`, {
    fontFamily: "Share Tech Mono, monospace",
    fontSize: "10px",
    color: "#7fb487",
  }).setOrigin(0, 0);
  const bonusBaseY = weaponLevelText.y + weaponLevelText.height + 2;
  const bonusWrapWidth = Math.max(40, rowWidth - bonusX);
  const bonusText = scene.add.text(bonusX, bonusBaseY, formatUnitBonusText(unit), {
    fontFamily: "Share Tech Mono, monospace",
    fontSize: "10px",
    color: "#7fb487",
    wordWrap: { width: bonusWrapWidth, useAdvancedWrap: true },
  }).setOrigin(0, 0);
  row.add([...Object.values(meters), weaponThumb, weaponIcon, weaponLevelText, bonusText]);
  const bonusHeight = Math.max(0, bonusText.height || 0);
  const weaponBlockHeight = Math.max(weaponThumbSize, weaponLevelText.height + 2 + bonusHeight);
  row.setSize(width - margin * 2, weaponSectionTop + weaponBlockHeight + 12);
  pane.add(row);
  scene.commandPaneRows.push({
    unitId: unit.id,
    row,
    bonusLayout: { rowWidth, baseY: bonusBaseY, padding: 12, bonusX },
    meters,
    weapon: {
      icon: weaponIcon,
      frame: weaponFrame,
      frameIndex: weaponIndex,
      atlas: upgradeEntry?.atlas || "meleeweapons",
      targetHeight,
      thumbSize: weaponThumbSize,
      sectionTop: weaponSectionTop,
    },
    bonusText,
    weaponLevelText,
    levelText,
  });
  y += row.height + 8;
  scene.commandPane = pane;
  // Trim the background to fit content snugly.
  const finalHeight = Math.max(headerHeight + margin, y + margin);
  bg.clear();
  bg.fillStyle(0x0c140d, 0.92);
  bg.fillRoundedRect(0, 0, width, finalHeight, 10);
  bg.lineStyle(1, 0x2d3f2f, 1);
  bg.strokeRoundedRect(0, 0, width, finalHeight, 10);
  syncRangerPaneSize(scene, finalHeight);
}
function updateRangerPane(scene, state) {
  if (!scene?.commandPane || !scene.commandPaneRows) return;
  const unit = getActiveRangerUnit(state);
  const nextId = unit?.id || null;
  const nextMaxAp = unit ? getUnitMaxAp(unit) : null;
  let needsRebuild = false;
  const expectedRows = unit ? 1 : 0;
  if (scene.commandPaneRows.length !== expectedRows) {
    needsRebuild = true;
  }
  if (scene.activeUnitId !== nextId || scene.activeUnitMaxAp !== nextMaxAp) {
    needsRebuild = true;
  }
  if (needsRebuild) {
    buildRangerPane(scene, state);
    return;
  }
  if (!unit) return;
  const row = scene.commandPaneRows[0];
  if (!row) return;
  const upgradeEntry = getWeaponUpgradeEntry(unit?.weaponFrameIndex ?? row.weapon?.frameIndex ?? 1, unit);
  ensureWeaponAtlas(scene, upgradeEntry?.atlas);
  const meterKeys = ["ap", "gas", "water", "food", "chits", "wood", "components"];
  meterKeys.forEach((key) => {
    if (row.meters?.[key]) {
      row.meters[key].setValue(unit.inventory?.[key] ?? 0);
    }
  });
  if (row.meters?.food?.setAlert) {
    row.meters.food.setAlert((unit.inventory?.food ?? 0) < 1);
  }
  if (row.meters?.water?.setAlert) {
    row.meters.water.setAlert((unit.inventory?.water ?? 0) < 1);
  }
  if (row.weapon?.icon) {
    const weaponIndex = Math.max(0, Math.trunc(upgradeEntry?.frameIndex ?? 0));
    const atlas = upgradeEntry?.atlas || "meleeweapons";
    const frame = atlasFrame(scene, atlas, weaponIndex);
    row.weapon.frame = frame;
    row.weapon.frameIndex = weaponIndex;
    row.weapon.atlas = atlas;
    row.weapon.icon.setTexture(atlas, frame);
    const frameData = scene.textures?.getFrame?.(atlas, frame);
    const targetHeight = row.weapon.targetHeight || Math.max(24, (row.weapon.thumbSize || 40) - 8);
    const scale = frameData?.height ? targetHeight / frameData.height : 0.4;
    row.weapon.icon.setScale(scale);
    row.weapon.icon.setVisible(true);
  }
  if (row.weaponLevelText?.setText) {
    row.weaponLevelText.setText(`Weapon Lvl. ${getWeaponUpgradeIndex(unit?.weaponFrameIndex ?? 1)}`);
    if (row.bonusLayout && row.weapon?.sectionTop) {
      row.weaponLevelText.setPosition(row.bonusLayout.bonusX || 0, row.weapon.sectionTop + 2);
    }
  }
  if (row.bonusText?.setText) {
    row.bonusText.setText(formatUnitBonusText(unit));
    if (row.bonusLayout && typeof row.bonusText.setWordWrapWidth === "function") {
      const wrapWidth = Math.max(40, row.bonusLayout.rowWidth - (row.bonusLayout.bonusX || 0));
      row.bonusText.setWordWrapWidth(wrapWidth, true);
      const bonusY = row.weaponLevelText?.y && row.weaponLevelText?.height
        ? row.weaponLevelText.y + row.weaponLevelText.height + 2
        : row.bonusLayout.baseY;
      row.bonusText.setPosition(row.bonusLayout.bonusX || 0, bonusY);
      const bonusHeight = Math.max(0, row.bonusText.height || 0);
      if (row.row?.setSize) {
        const thumbSize = row.weapon?.thumbSize || 40;
        const levelHeight = row.weaponLevelText?.height ? row.weaponLevelText.height + 2 : 0;
        const blockHeight = Math.max(thumbSize, levelHeight + bonusHeight);
        row.row.setSize(row.row.width || row.bonusLayout.rowWidth, row.weapon?.sectionTop + blockHeight + row.bonusLayout.padding);
      }
    }
  }
  if (row.levelText?.setText) {
    row.levelText.setText(`Lv. ${getUnitLevel(unit)}`);
  }
}



  function ensureUnitTravelState(state, unit) {
    if (!unit) return null;
  if (!unit.currentNodeId && unit.currentNode) unit.currentNodeId = unit.currentNode;
  const homePos = state?.nodeMap?.get?.("home")?.pos || null;
  const hasKnownFieldPosition = unit.positionPct && typeof unit.positionPct.x === "number" && typeof unit.positionPct.y === "number";
  const offHomePosition = hasKnownFieldPosition && homePos
    ? Math.hypot(unit.positionPct.x - homePos.x, unit.positionPct.y - homePos.y) > 0.01
    : false;
  const offHomeNode = !!(unit.currentNodeId && unit.currentNodeId !== "home");
  if (typeof unit.deployed !== "boolean") {
    unit.deployed = offHomeNode || offHomePosition;
  } else if (!unit.deployed && (offHomeNode || offHomePosition)) {
    unit.deployed = true;
  }
  if (!unit.currentNodeId) unit.currentNodeId = "home";
  if (!unit.positionPct && unit.currentNodeId && state?.nodeMap?.get) {
    const node = state.nodeMap.get(unit.currentNodeId);
    if (node?.pos) unit.positionPct = { x: node.pos.x, y: node.pos.y };
  }
  if (typeof unit.movePoints !== "number") unit.movePoints = 0;
  if (typeof unit.isMoving !== "boolean") unit.isMoving = false;
  if (!("moveTargetPct" in unit)) unit.moveTargetPct = null;
  if (typeof unit.justDeployed !== "boolean") unit.justDeployed = false;
  if (typeof unit.hasLeftHome !== "boolean") unit.hasLeftHome = false;
  if (typeof unit.lastVisibilityCellIdx !== "number") {
    unit.lastVisibilityCellIdx = getVisibilityCellIndexForPct(unit.positionPct, state);
  }
  if (typeof unit.spriteStage !== "number") {
    unit.spriteStage = unit?.type === "vehicle" ? 0 : DEFAULT_SPRITE_STAGE;
  }
  const stageCap = getUnitSpriteStageCap(unit, state);
  unit.spriteStage = Math.min(stageCap, Math.max(0, Math.trunc(unit.spriteStage || 0)));
  if (typeof unit.weaponFrameIndex !== "number") unit.weaponFrameIndex = 1;
  unit.weaponFrameIndex = getWeaponUpgradeIndex(unit.weaponFrameIndex);
  if (typeof unit.level !== "number") unit.level = 1;
  return unit;
}

function getUnitLevel(unit) {
  return Math.max(1, Math.trunc(unit?.level || 1));
}

  function getUnitSpriteStageCap(unit, state) {
    if (unit?.type === "vehicle") return Math.max(0, VEHICLE_SPRITE_END_STAGE);
    const path = TRAINING_PATHS[DEFAULT_TRAINING_PATH] || [];
    const maxSpriteIndex = path.lastIndexOf("soldier15");
    return Math.max(0, maxSpriteIndex >= 0 ? maxSpriteIndex : path.length - 1);
  }

  function getUnitMaxUpgradeLevel(unit) {
    if (unit?.type === "vehicle") return VEHICLE_MAX_UPGRADE_LEVEL || 1;
    return SOLDIER_MAX_UPGRADE_LEVEL || 1;
  }

  function getUnitUpgradeCap(unit, state) {
    if (unit?.type === "vehicle") return getVehicleUpgradeCap(state);
    const baseLevel = state?.baseLevel || 1;
    const maxLevel = getUnitMaxUpgradeLevel(unit);
    if (baseLevel >= 3) return maxLevel;
    return Math.min(BASE_LEVEL_UPGRADE_CAP, maxLevel);
  }

// The weapon path tops out at its last entry; past that an upgrade would only keep
// adding roll bonus with nothing shown for it.
function isWeaponUpgradeAvailable(unit) {
  const max = WEAPON_UPGRADE_PATH.length || 1;
  return Math.trunc(unit?.weaponFrameIndex || 1) < max;
}

function getWeaponUpgradeIndex(index, maxOverride = null) {
  const max = Number.isFinite(maxOverride) ? Math.max(1, Math.trunc(maxOverride)) : (WEAPON_UPGRADE_PATH.length || 1);
  return Math.min(max, Math.max(1, Math.trunc(index || 1)));
}

function getWeaponUpgradeEntry(index, unit = null) {
  const max = WEAPON_UPGRADE_PATH.length || 1;
  const safe = getWeaponUpgradeIndex(index, max);
  if (unit?.type === "vehicle") {
    return { atlas: "rangedweapons", frameIndex: Math.max(0, safe - 1) };
  }
  return WEAPON_UPGRADE_PATH[Math.min(max - 1, safe - 1)] || WEAPON_UPGRADE_PATH[0];
}

function getActiveRangerUnit(state) {
  if (!state?.rangerUnits?.length) return null;
  const activeId = state.activeUnitId || state.squad?.currentUnitId || state.rangerUnits[0]?.id;
  const unit = state.rangerUnits.find((entry) => entry.id === activeId) || state.rangerUnits[0];
  if (!state.activeUnitId && unit) state.activeUnitId = unit.id;
  if (state.squad && unit && state.squad.currentUnitId !== unit.id) {
    state.squad.currentUnitId = unit.id;
  }
  return ensureUnitTravelState(state, unit);
}

function getUnitPositionPct(state, unit) {
  if (!unit) return null;
  ensureUnitTravelState(state, unit);
  if (unit.positionPct && typeof unit.positionPct.x === "number" && typeof unit.positionPct.y === "number") {
    return unit.positionPct;
  }
  if (!unit.currentNodeId || !state?.nodeMap?.get) return null;
  const node = state.nodeMap.get(unit.currentNodeId);
  if (!node?.pos) return null;
  unit.positionPct = { x: node.pos.x, y: node.pos.y };
  return unit.positionPct;
}

function isUnitIdle(unit) {
  return !!unit && !unit.isMoving && !unit.moveTargetPct;
}

function isUnitAtHome(unit, state = null) {
  if (!unit) return false;
  const resolvedState = state || mapSceneInstance?.gameState || getGlobalGameState();
  const homePos = resolvedState?.nodeMap?.get?.("home")?.pos || null;
  if (!homePos) return unit.currentNodeId === "home";
  const pos = unit.positionPct
    || (unit.currentNodeId ? resolvedState?.nodeMap?.get?.(unit.currentNodeId)?.pos : null);
  if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
    return unit.currentNodeId === "home";
  }
  const dx = pos.x - homePos.x;
  const dy = pos.y - homePos.y;
  return (dx * dx + dy * dy) <= (HOME_BASE_NEAR_PCT * HOME_BASE_NEAR_PCT);
}

function isVehicleUnit(unit) {
  return unit?.type === "vehicle";
}

function getUnitBaseSpeed(unit) {
  if (unit?.type === "vehicle") return BALANCING.vehicleSpeed || 0;
  return BALANCING.soldierSpeed || 0;
}

function getDemMultiplierForUnit(unit) {
  const base = BALANCING.demSpeedMultiplier ?? 1;
  if (unit?.type === "vehicle") {
    return base * (BALANCING.vehicleDemMultiplier ?? 1);
  }
  return base;
}

function getNdviMultiplierForUnit(unit) {
  const base = BALANCING.ndviSpeedMultiplier ?? 1;
  if (unit?.type === "vehicle") {
    return base * (BALANCING.vehicleNdviMultiplier ?? 1);
  }
  return base;
}

function pctToWorldCoords(pct) {
  if (!pct) return null;
  const worldW = mapSceneInstance?.worldWidth || 100;
  const worldH = mapSceneInstance?.worldHeight || 100;
  return {
    x: (pct.x / 100) * worldW,
    y: (pct.y / 100) * worldH,
  };
}

function travelGasCost(state, targetNode) {
  const unit = getActiveRangerUnit(state);
  if (!unit) return { cost: Infinity, distance: Infinity };
  if (!isVehicleUnit(unit)) {
    const currentPct = getUnitPositionPct(state, unit)
      || (unit.currentNodeId ? state.nodeMap.get(unit.currentNodeId)?.pos : null);
    if (!currentPct || !targetNode?.pos) return { cost: Infinity, distance: Infinity };
    const from = pctToWorldCoords(currentPct);
    const to = pctToWorldCoords(targetNode.pos);
    if (!from || !to) return { cost: Infinity, distance: Infinity };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return { cost: 0, distance };
  }
  const gasRate = BALANCING.movementDrainPerSecond?.gas || 0;
  const speedSource = mapSceneInstance?.getMoveSpeedForUnitAtPct
    ? mapSceneInstance.getMoveSpeedForUnitAtPct(unit, getUnitPositionPct(state, unit))
    : mapSceneInstance?.getMoveSpeedAtPct
      ? mapSceneInstance.getMoveSpeedAtPct(getUnitPositionPct(state, unit))
      : null;
  const speed = Math.max(1, speedSource || getUnitBaseSpeed(unit) || 1);
  const currentPct = getUnitPositionPct(state, unit)
    || (unit.currentNodeId ? state.nodeMap.get(unit.currentNodeId)?.pos : null);
  if (!currentPct || !targetNode?.pos) return { cost: Infinity, distance: Infinity };
  const from = pctToWorldCoords(currentPct);
  const to = pctToWorldCoords(targetNode.pos);
  if (!from || !to) return { cost: Infinity, distance: Infinity };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance <= 0) return { cost: 0, distance: 0 };
  const travelTime = distance / speed;
  const cost = gasRate > 0 ? gasRate * travelTime : 0;
  return { cost, distance };
}

function travelSupplyCosts(state, targetNode) {
  const unit = getActiveRangerUnit(state);
  if (!unit) return { costs: null, distance: Infinity, travelTime: Infinity };
  const usesGas = isVehicleUnit(unit);
  const currentPct = getUnitPositionPct(state, unit)
    || (unit.currentNodeId ? state.nodeMap.get(unit.currentNodeId)?.pos : null);
  if (!currentPct || !targetNode?.pos) {
    return { costs: null, distance: Infinity, travelTime: Infinity };
  }
  const from = pctToWorldCoords(currentPct);
  const to = pctToWorldCoords(targetNode.pos);
  if (!from || !to) return { costs: null, distance: Infinity, travelTime: Infinity };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance <= 0) return { costs: {}, distance: 0, travelTime: 0 };
  const speedSource = mapSceneInstance?.getMoveSpeedForUnitAtPct
    ? mapSceneInstance.getMoveSpeedForUnitAtPct(unit, currentPct)
    : mapSceneInstance?.getMoveSpeedAtPct
      ? mapSceneInstance.getMoveSpeedAtPct(currentPct)
      : null;
  const speed = Math.max(1, speedSource || getUnitBaseSpeed(unit) || 1);
  const travelTime = distance / speed;
  const rates = BALANCING.movementDrainPerSecond || {};
  const costs = {};
  Object.entries(rates).forEach(([key, rate]) => {
    if (!usesGas && key === "gas") return;
    if (typeof rate !== "number" || rate <= 0) return;
    costs[key] = rate * travelTime;
  });
  return { costs, distance, travelTime };
}

function cardinalDirection(from, to) {
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return null;
  // Invert Y so decreasing y is "north" on screen.
  const angle = Math.atan2(-dy, dx);
  const deg = (angle * 180 / Math.PI + 360) % 360;
  const dirs = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

function manhattan(a, b) {
  return Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
}

function gasCostForMove(state, fromNode, toNode) {
  const unit = getActiveRangerUnit(state);
  if (!isVehicleUnit(unit)) return 0;
  const perCell = CONFIG.squad?.fuelPerCell || 1;
  const dist = Math.max(1, manhattan(getCell(fromNode), getCell(toNode)));
  const baseCost = Math.max(CONFIG.baseMoveGasCost, dist * perCell);
  return baseCost + (toNode.movePenaltyGas || 0);
}

function getReachableNodes(state) {
  const active = getActiveRangerUnit(state);
  if (active?.isDead) return [];
  if (!active?.deployed) return [];
  const usesGas = isVehicleUnit(active);
  const available = {
    ap: active?.inventory?.ap ?? 0,
    food: active?.inventory?.food ?? 0,
    water: active?.inventory?.water ?? 0,
    gas: active?.inventory?.gas ?? 0,
  };
  const currentPct = getUnitPositionPct(state, active)
    || (active.currentNodeId ? state.nodeMap.get(active.currentNodeId)?.pos : null);
  if (!currentPct) return [];
  const knownNodes = state.knownNodes || new Set();
  const options = [];
  const tryAdd = (entry, id) => {
    if (!entry?.pos) return;
    const { costs, distance } = travelSupplyCosts(state, entry);
    const gasCost = costs?.gas ?? 0;
    if (!costs || distance <= 0) return;
    if (Object.values(costs).some((cost) => !Number.isFinite(cost) || cost < 0)) return;
    if (usesGas && gasCost > available.gas) return;
    if ((costs.ap ?? 0) > available.ap) return;
    if ((costs.food ?? 0) > available.food) return;
    if ((costs.water ?? 0) > available.water) return;
    options.push({ id, node: entry, distance, cost: gasCost });
  };
  // Where the unit actually stands; currentNodeId goes stale once it walks away.
  const standingOnId = findNearbyLargeSettlement(state, currentPct)?.id || null;
  for (const node of state.nodes) {
    const isHome = node.id === "home";
    if (!knownNodes.has(node.id) && !(isHome && standingOnId !== "home")) continue;
    if (standingOnId && node.id === standingOnId) continue;
    tryAdd(node, node.id);
  }
  for (const settlement of state.smallSettlements || []) {
    if (!settlement?.pos) continue;
    if (!isPctExplored(settlement.pos, state)) continue;
    tryAdd(settlement, settlement.id);
  }
  options.sort((a, b) => a.cost - b.cost || a.distance - b.distance || (a.node.name || "").localeCompare(b.node.name || ""));
  return options;
}

function getFastTravelDestinations(state, unit) {
  if (!state || !unit) return [];
  if (!isUnitIdle(unit)) return [];
  if (!isUnitAtPlayerSettlement(state, unit)) return [];
  const pos = getUnitPositionPct(state, unit);
  const currentLarge = pos ? findNearbyLargeSettlement(state, pos) : null;
  const currentLargeId = currentLarge?.owner === "player" ? currentLarge.id : null;
  const currentSmall = pos ? findNearbySmallSettlement(state, pos) : null;
  const currentSmallId = currentSmall?.id || null;
  const entries = [];
  for (const node of state.nodes || []) {
    if (node?.owner !== "player") continue;
    if (currentLargeId && node.id === currentLargeId) continue;
    entries.push({ id: node.id, name: node.name, kind: "large", node });
  }
  for (const settlement of state.smallSettlements || []) {
    if (settlement?.owner !== "player") continue;
    if (currentSmallId && settlement.id === currentSmallId) continue;
    entries.push({ id: settlement.id, name: settlement.name, kind: "small", settlement });
  }
  entries.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return entries;
}
let mapSceneInstance = null;
let mainPhaserGame = null;
let sessionRestartPromise = null;
let gameSessionSerial = 0;
let preferredZoomMode = "phaser";

function buildAutoAtlas(scene, key, options = {}) {
  const detectKey = options.detectKey || key; // default to cleaned texture so alpha-based slicing works
  const targetTexture = scene.textures.get(key);
  const detectTexture = scene.textures.get(detectKey) || targetTexture;
  if (!targetTexture || !detectTexture) return [];
  const source = detectTexture.getSourceImage();
  if (!source || !source.width || !source.height) return [];
  const scaleGuess = Math.max(source.width / 1536, source.height / 1024, 1);
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const visited = new Uint8Array(canvas.width * canvas.height);
  const alphaCutoff = Math.max(1, options.alphaCutoff ?? 8);
  const minArea = options.minArea ?? Math.max(400, Math.round(1200 * scaleGuess * scaleGuess));
  const padding = options.padding ?? Math.max(2, Math.round(6 * scaleGuess));
  const tolerance = Math.max(0, options.tolerance ?? 120);

  const makeMask = (alphaOnly = true, bgSample = null) => {
    const mask = new Uint8Array(canvas.width * canvas.height);
    const [br, bg, bb, ba] = bgSample || [0, 0, 0, 0];
    for (let i = 0; i < canvas.width * canvas.height; i++) {
      const di = i * 4;
      const a = data[di + 3];
      if (alphaOnly) {
        mask[i] = a >= alphaCutoff ? 1 : 0;
      } else {
        const dr = Math.abs(data[di] - br);
        const dg = Math.abs(data[di + 1] - bg);
        const db = Math.abs(data[di + 2] - bb);
        const da = Math.abs((a ?? 255) - (ba ?? 255));
        mask[i] = dr + dg + db + da <= tolerance ? 0 : (a >= alphaCutoff ? 1 : 0);
      }
    }
    return mask;
  };

  let mask = makeMask(true);
  const opaqueRatio = mask.reduce((sum, v) => sum + v, 0) / Math.max(1, canvas.width * canvas.height);
  if (opaqueRatio > 0.95) {
    const fallbackBg = Array.isArray(options.bgColors) && options.bgColors.length
      ? options.bgColors[0]
      : [data[0], data[1], data[2], data[3]];
    mask = makeMask(false, fallbackBg);
  }

  const isSolid = (idx) => {
    if (visited[idx]) return false;
    return !!mask[idx];
  };

  const flood = (sx, sy) => {
    const stack = [[sx, sy]];
    let minX = sx;
    let maxX = sx;
    let minY = sy;
    let maxY = sy;
    visited[sy * canvas.width + sx] = 1;
    while (stack.length) {
      const [x, y] = stack.pop();
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const neighbors = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= canvas.width || ny >= canvas.height) continue;
        const nidx = ny * canvas.width + nx;
        if (!visited[nidx] && isSolid(nidx)) {
          visited[nidx] = 1;
          stack.push([nx, ny]);
        }
      }
    }
    return { minX, maxX, minY, maxY, area: (maxX - minX + 1) * (maxY - minY + 1) };
  };

  const frames = [];
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = y * canvas.width + x;
      if (!isSolid(idx)) continue;
      const box = flood(x, y);
      if (box.area >= minArea) {
        frames.push(box);
      }
    }
  }
  frames.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  const names = [];
  frames.forEach((box, i) => {
    const px = Math.max(0, box.minX - padding);
    const py = Math.max(0, box.minY - padding);
    const w = Math.min(canvas.width - px, box.maxX - box.minX + 1 + padding * 2);
    const h = Math.min(canvas.height - py, box.maxY - box.minY + 1 + padding * 2);
    const name = `${key}-${i}`;
    targetTexture.add(name, 0, px, py, w, h);
    names.push(name);
  });
  return names.length ? names : ["__BASE"];
}

function buildUnitAtlas(scene, key, options = {}) {
  const frames = buildAutoAtlas(scene, key, options);
  const texture = scene.textures.get(key);
  const getMaxIndex = (entries, prefix) => {
    let max = 0;
    (entries || []).forEach((entry) => {
      if (typeof entry !== "string") return;
      const match = entry.match(new RegExp(`^${prefix}(\\d+)$`));
      if (!match) return;
      const value = parseInt(match[1], 10);
      if (value > max) max = value;
    });
    return max;
  };
  const getPos = (frame) => {
    const f = texture?.frames?.[frame] || {};
    const x = typeof f.cutX === "number" ? f.cutX : f.x || 0;
    const y = typeof f.cutY === "number" ? f.cutY : f.y || 0;
    return { x, y };
  };
  const sorted = frames.slice().sort((a, b) => {
    const pa = getPos(a);
    const pb = getPos(b);
    if (pa.y !== pb.y) return pa.y - pb.y;
    return pa.x - pb.x;
  });
  const names = {};
  const trainingKeys = Object.values(TRAINING_PATHS || {}).flat();
  const maxSoldierIndex = getMaxIndex(trainingKeys, "soldier") || 12;
  const maxVehicleIndex = getMaxIndex(VEHICLE_FRAME_SEQUENCE || [], "vehicle") || 12;
  const isVehicles = key === "unitsVehicles";
  const isSoldiers = key === "unitsSoldiers";
  let soldierCount = maxSoldierIndex;
  let vehicleCount = maxVehicleIndex;
  if (isSoldiers) {
    soldierCount = Math.min(maxSoldierIndex, sorted.length);
    vehicleCount = 0;
  } else if (isVehicles) {
    vehicleCount = Math.min(maxVehicleIndex, sorted.length);
    soldierCount = 0;
  } else if (soldierCount + vehicleCount > sorted.length) {
    vehicleCount = Math.min(vehicleCount, sorted.length);
    soldierCount = Math.min(soldierCount, Math.max(0, sorted.length - vehicleCount));
  }
  if (!soldierCount && !vehicleCount && sorted.length) {
    soldierCount = Math.min(sorted.length, maxSoldierIndex);
  }
  // Force a deterministic left-to-right, top-to-bottom ordering so soldier1 is the top-left sprite.
  if (soldierCount) {
    const soldierFrames = sorted.slice(0, soldierCount);
    soldierFrames.forEach((frame, i) => {
      names[`soldier${i + 1}`] = frame;
    });
  }
  if (vehicleCount) {
    const vehicleFrames = sorted.slice(0, vehicleCount);
    vehicleFrames.forEach((frame, i) => {
      names[`vehicle${i + 1}`] = frame;
    });
  }
  return { frames, names };
}

function pickFrame(scene, key, token, fallback = "__BASE") {
  const frames = (scene?.atlasFrames && scene.atlasFrames[key]) || [];
  if (!frames.length) return fallback;
  const str = `${token ?? ""}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return frames[hash % frames.length];
}

function shuffleArray(arr = []) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function buildSmallSettlementNames(targetCount = SMALL_SETTLEMENT_COUNT) {
  if (window.ContentLibrary?.buildSmallSettlementNames) {
    return window.ContentLibrary.buildSmallSettlementNames(targetCount);
  }
  return [];
}

function atlasFrame(scene, key, index = 0) {
  const frames = (scene?.atlasFrames && scene.atlasFrames[key]) || [];
  if (!frames.length) return "__BASE";
  const safe = Math.abs(Math.floor(index)) % frames.length;
  return frames[safe];
}

function sampleBackgroundColors(data, w, h, mode = "edges", sampleSize = 8) {
  const coords = [];
  if (mode === "block") {
    const size = Math.max(2, Math.min(sampleSize || 8, Math.min(w, h)));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        coords.push([x, y]);
      }
    }
  } else if (mode === "single") {
    coords.push([0, 0]);
  } else {
    coords.push([0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]);
    coords.push([Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1]);
  }
  const colors = [];
  const seen = new Set();
  const pushColor = (r, g, b, a) => {
    const key = `${r},${g},${b},${a}`;
    if (!seen.has(key)) {
      seen.add(key);
      colors.push([r, g, b, a]);
    }
  };
  for (const [x, y] of coords) {
    const idx = (y * w + x) * 4;
    pushColor(data[idx], data[idx + 1], data[idx + 2], data[idx + 3]);
  }
  return colors.length ? colors : [[0, 0, 0, 255]];
}

function erodeMask(mask, w, h, radius = 1) {
  const r = Math.max(0, Math.floor(radius));
  if (r <= 0) return mask;
  const next = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx]) {
        next[idx] = 0;
        continue;
      }
      let keep = true;
      for (let dy = -r; dy <= r && keep; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (!mask[ny * w + nx]) {
            keep = false;
            break;
          }
        }
      }
      next[idx] = keep ? 1 : 0;
    }
  }
  return next;
}

function keepLargestComponent(mask, w, h) {
  const visited = new Uint8Array(mask.length);
  let bestArea = 0;
  let bestPixels = null;
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const startIdx = y * w + x;
      if (!mask[startIdx] || visited[startIdx]) continue;
      const stack = [startIdx];
      const pixels = [];
      visited[startIdx] = 1;
      while (stack.length) {
        const idx = stack.pop();
        pixels.push(idx);
        const cx = idx % w;
        const cy = (idx - cx) / w;
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nidx = ny * w + nx;
          if (!mask[nidx] || visited[nidx]) continue;
          visited[nidx] = 1;
          stack.push(nidx);
        }
      }
      if (pixels.length > bestArea) {
        bestArea = pixels.length;
        bestPixels = pixels;
      }
    }
  }
  const keep = new Uint8Array(mask.length);
  if (bestPixels) {
    for (const idx of bestPixels) {
      keep[idx] = 1;
    }
  }
  return keep;
}

function stripTextureBackground(scene, key, options = {}) {
  const texture = scene.textures.get(options.sourceKey || key);
  const source = texture?.getSourceImage();
  if (!source || !source.width || !source.height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const w = canvas.width;
  const h = canvas.height;
  // Chroma key: simple removal with tolerance, sampling a top-left block plus CHROMA_BG (export-style).
  const tolerance = Math.max(0, options.tolerance ?? 120);
  const sampled = sampleBackgroundColors(data, w, h, "block", 12) || [];
  const targets = (options.bgColors && options.bgColors.length ? options.bgColors : [CHROMA_BG]).concat(sampled);
  for (let idx = 0; idx < w * h; idx++) {
    const di = idx * 4;
    const r = data[di];
    const g = data[di + 1];
    const b = data[di + 2];
    const a = data[di + 3];
    let isBg = false;
    for (const ref of targets) {
      if (!ref) continue;
      const dr = Math.abs(r - ref[0]);
      const dg = Math.abs(g - ref[1]);
      const db = Math.abs(b - ref[2]);
      const da = Math.abs(a - (ref[3] ?? 255));
      if (dr + dg + db + da <= tolerance) {
        isBg = true;
        break;
      }
    }
    if (isBg) {
      data[di] = 0;
      data[di + 1] = 0;
      data[di + 2] = 0;
      data[di + 3] = 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  scene.textures.remove(key);
  return scene.textures.addImage(key, canvas);
}

function applyTextureFilter(scene, key, filters = {}) {
  const texture = scene.textures.get(key);
  const source = texture?.getSourceImage();
  if (!source || !source.width || !source.height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  const parts = [];
  if (typeof filters.saturate !== "undefined") parts.push(`saturate(${filters.saturate})`);
  if (typeof filters.hue !== "undefined") parts.push(`hue-rotate(${filters.hue}deg)`);
  if (typeof filters.brightness !== "undefined") parts.push(`brightness(${filters.brightness})`);
  if (typeof filters.contrast !== "undefined") parts.push(`contrast(${filters.contrast})`);
  ctx.filter = parts.join(" ") || "none";
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  scene.textures.remove(key);
  return scene.textures.addImage(key, canvas);
}

function applySpriteColorAdjust(scene, key, adjust = {}) {
  const texture = scene.textures.get(key);
  const source = texture?.getSourceImage();
  if (!source || !source.width || !source.height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  const filters = [];
  if (typeof adjust.saturation !== "undefined") filters.push(`saturate(${adjust.saturation})`);
  if (typeof adjust.hueShiftDeg !== "undefined") filters.push(`hue-rotate(${adjust.hueShiftDeg}deg)`);
  if (typeof adjust.brightness !== "undefined") filters.push(`brightness(${adjust.brightness})`);
  ctx.filter = filters.join(" ") || "none";
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  scene.textures.remove(key);
  return scene.textures.addImage(key, canvas);
}

function cloneTextureWithAdjust(scene, sourceKey, destKey, adjust = {}) {
  const texture = scene.textures.get(sourceKey);
  const source = texture?.getSourceImage();
  if (!source || !source.width || !source.height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  const filters = [];
  if (typeof adjust.saturation !== "undefined") filters.push(`saturate(${adjust.saturation})`);
  if (typeof adjust.hueShiftDeg !== "undefined") filters.push(`hue-rotate(${adjust.hueShiftDeg}deg)`);
  if (typeof adjust.brightness !== "undefined") filters.push(`brightness(${adjust.brightness})`);
  ctx.filter = filters.join(" ") || "none";
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  if (scene.textures.exists(destKey)) {
    scene.textures.remove(destKey);
  }
  return scene.textures.addImage(destKey, canvas);
}

function cloneTexture(scene, sourceKey, destKey) {
  const texture = scene.textures.get(sourceKey);
  const source = texture?.getSourceImage();
  if (!source || !source.width || !source.height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  if (scene.textures.exists(destKey)) {
    scene.textures.remove(destKey);
  }
  return scene.textures.addImage(destKey, canvas);
}

function exportRuntimeAtlasIndexes(scene) {
  const target = scene || mapSceneInstance;
  if (!target?.atlasFrames) return;
  const atlases = [
    { key: "settlementsPlayer", texKey: "settlementsLarge" },
    { key: "settlementsNeutral", texKey: "settlementsLarge" },
    { key: "settlementsEnemy", texKey: "settlementsLarge" },
    { key: "settlementsSmall" },
    { key: "landmarks" },
    { key: "poi" },
    { key: "natres" },
    { key: "unitsSoldiers" },
    { key: "unitsVehicles" },
  ];
  atlases.forEach((entry) => {
    const frames = target.atlasFrames[entry.key] || [];
    const texKey = entry.texKey || entry.key;
    const texture = target.textures.get(texKey);
    if (!frames.length || !texture) return;
    const frameObjs = frames
      .map((name) => texture.get(name))
      .filter(Boolean);
    if (!frameObjs.length) return;
    const maxW = Math.max(...frameObjs.map((f) => f.cutWidth || f.width || 0));
    const maxH = Math.max(...frameObjs.map((f) => f.cutHeight || f.height || 0));
    const cols = Math.max(1, Math.min(6, frameObjs.length));
    const gutter = 16;
    const margin = 16;
    const labelH = 18;
    const thumbPad = 8;
    const cardW = maxW + thumbPad * 2;
    const cardH = maxH + thumbPad * 2 + labelH;
    const rows = Math.ceil(frameObjs.length / cols);
    const canvas = document.createElement("canvas");
    canvas.width = margin * 2 + cols * cardW + (cols - 1) * gutter;
    canvas.height = margin * 2 + rows * cardH + Math.max(0, rows - 1) * gutter;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0b1324";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    frames.forEach((name, idx) => {
      const frame = texture.get(name);
      if (!frame) return;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cardX = margin + col * (cardW + gutter);
      const cardY = margin + row * (cardH + gutter);
      ctx.fillStyle = "#121826";
      ctx.fillRect(cardX, cardY, cardW, cardH);
      const dx = cardX + thumbPad + Math.floor((maxW - frame.cutWidth) / 2);
      const dy = cardY + thumbPad + Math.floor((maxH - frame.cutHeight) / 2);
      const source = frame.source?.image;
      if (source) {
        ctx.drawImage(
          source,
          frame.cutX,
          frame.cutY,
          frame.cutWidth,
          frame.cutHeight,
          dx,
          dy,
          frame.cutWidth,
          frame.cutHeight,
        );
      }
      ctx.fillStyle = "#e5e7eb";
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 1;
      const labelY = cardY + cardH - labelH / 2 - 2;
      ctx.strokeText(name, cardX + cardW / 2, labelY);
      ctx.fillText(name, cardX + cardW / 2, labelY);
    });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${entry.key}-index.png`;
    link.click();
  });
}

function ensureTextureMaxSize(scene, key, maxWidth, maxHeight) {
  const texture = scene.textures.get(key);
  const source = texture?.getSourceImage();
  if (!source || !source.width || !source.height) return null;
  if (source.width <= maxWidth && source.height <= maxHeight) return source;
  const scale = Math.max(source.width / maxWidth, source.height / maxHeight, 1);
  const newW = Math.max(1, Math.round(source.width / scale));
  const newH = Math.max(1, Math.round(source.height / scale));
  const canvas = document.createElement("canvas");
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, newW, newH);
  scene.textures.remove(key);
  scene.textures.addImage(key, canvas);
  return canvas;
}

function applyLabelHalo(text, options = {}) {
  if (!text) return;
  const baseSize = parseInt(text.style?.fontSize || 12, 10) || 12;
  const blur = options.blur ?? Math.max(3, Math.round(baseSize * (options.blurScale ?? 1.00)));
  const stroke = options.strokeThickness ?? Math.max(1, Math.round(baseSize * 0.05));
  const shadowColor = options.color || "rgba(46,24,70,0.7)";
  const strokeColor = options.strokeColor || "rgba(10,8,16,0.85)";
  text.setShadow(0, 0, shadowColor, blur, false, true);
  if (stroke > 0 && options.stroke !== false) {
    text.setStroke(strokeColor, stroke);
  }
}

function setTextFontFamily(text, fontFamily) {
  if (!text || !fontFamily) return;
  if (typeof text.setFontFamily === "function") {
    text.setFontFamily(fontFamily);
  } else if (typeof text.setStyle === "function") {
    text.setStyle({ fontFamily });
  }
}

let titleFontReadyPromise = null;
function loadTitleFont() {
  if (titleFontReadyPromise) return titleFontReadyPromise;
  if (typeof document === "undefined" || !document.fonts?.load) {
    titleFontReadyPromise = Promise.resolve(false);
    return titleFontReadyPromise;
  }
  titleFontReadyPromise = document.fonts.load('16px "Graffiti"').then(() => true, () => false);
  return titleFontReadyPromise;
}

function preloadTitleShaderSource() {
  if (titleGlowShaderSource) {
    if (!titleScreenState.shaderReadyPromise) {
      titleScreenState.shaderReadyPromise = Promise.resolve(titleGlowShaderSource);
    }
    return titleScreenState.shaderReadyPromise;
  }
  const capturedSource = captureTitleGlowShaderSourceFromScene(titleScreenState.scene);
  if (capturedSource) {
    titleScreenState.shaderReadyPromise = Promise.resolve(capturedSource);
    return titleScreenState.shaderReadyPromise;
  }
  if (titleScreenState.shaderReadyPromise) {
    return titleScreenState.shaderReadyPromise;
  }
  if (typeof fetch !== "function") {
    titleScreenState.shaderReadyPromise = Promise.resolve("");
    return titleScreenState.shaderReadyPromise;
  }
  titleScreenState.shaderReadyPromise = fetch("assets/shaders/title-glow.glsl", { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.text();
    })
    .then((source) => storeTitleGlowShaderSource(source || ""))
    .catch((err) => {
      console.warn("Title shader preload failed", err);
      return "";
    });
  return titleScreenState.shaderReadyPromise;
}

function enableTitleScreenMusic() {
  musicState.enabled = true;
  const hasPausedTrack = !!(musicState.audio?.src && musicState.audio.paused && !musicState.audio.ended);
  if (!musicState.playing && !musicState.userPaused && !hasPausedTrack) {
    startMusic();
  }
}

function setupMusicWidgetControls() {
  if (musicWidgetControlsAttached) return;
  const musicWidget = document.querySelector(".music-widget");
  const musicVolumeSlider = document.getElementById("musicVolumeSlider");
  const musicPlayPauseBtn = document.getElementById("musicPlayPauseBtn");
  const musicPrevBtn = document.getElementById("musicPrevBtn");
  const musicNextBtn = document.getElementById("musicNextBtn");
  const musicProgressSlider = document.getElementById("musicProgressSlider");
  if (!musicWidget) return;

  const refreshPlayPauseIcon = (isPlaying) => {
    if (!musicPlayPauseBtn) return;
    const playing = Boolean(isPlaying);
    musicPlayPauseBtn.textContent = playing ? "❚❚" : "▶";
    musicPlayPauseBtn.setAttribute("aria-label", playing ? "Pause music" : "Play music");
  };

  if (musicPrevBtn) {
    musicPrevBtn.addEventListener("click", () => {
      const track = pickPreviousTrack();
      if (!track) return;
      startMusic(track);
    });
  }
  if (musicNextBtn) {
    musicNextBtn.addEventListener("click", () => {
      const track = pickNextTrack();
      if (!track) return;
      startMusic(track);
    });
  }
  if (musicPlayPauseBtn) {
    musicPlayPauseBtn.addEventListener("click", () => {
      if (musicState.playing) {
        pauseMusic();
      } else {
        // Clicking play is an explicit user intent to resume; clear any
        // persisted pause so the new startMusic guard doesn't reject it.
        musicState.userPaused = false;
        startMusic();
      }
    });
  }
  if (musicVolumeSlider) {
    musicVolumeSlider.value = musicState.volume.toString();
    musicVolumeSlider.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const nextVolume = Math.min(1, Math.max(0, parseFloat(target.value) || 0));
      musicState.volume = nextVolume;
      if (musicState.audio) {
        musicState.audio.volume = nextVolume;
      }
      applySoundSettingsToDiceScenes(true);
      persistMusicVolume(nextVolume);
    });
  }
  if (musicProgressSlider) {
    musicProgressSlider.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const audio = musicState.audio;
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      musicState.userSeekingProgress = true;
      const next = Math.max(0, Math.min(audio.duration, parseFloat(target.value) || 0));
      try { audio.currentTime = next; } catch (_) { /* seek may throw before metadata ready */ }
      refreshMusicProgressUI();
    });
    musicProgressSlider.addEventListener("change", () => {
      musicState.userSeekingProgress = false;
      persistMusicState();
    });
  }
  musicUiHooks.onPlayStateChange = (isPlaying) => {
    refreshPlayPauseIcon(isPlaying);
  };
  refreshPlayPauseIcon(musicState.playing);
  refreshMusicTrackLabel();
  refreshMusicProgressUI();
  musicWidgetControlsAttached = true;
}

let gameFontsReadyPromise = null;
function loadGameFonts() {
  if (gameFontsReadyPromise) return gameFontsReadyPromise;
  if (typeof document === "undefined" || !document.fonts?.load) {
    gameFontsReadyPromise = Promise.resolve(false);
    return gameFontsReadyPromise;
  }
  recordTransitionEvent("fonts:load:start");
  const loads = [
    document.fonts.load('16px "EightBitHud"'),
    document.fonts.load('16px "8bithud"'),
    document.fonts.load('16px "TW-bold"'),
  ];
  gameFontsReadyPromise = Promise.allSettled(loads).then((results) => {
    recordTransitionEvent("fonts:load:ready", {
      settled: results.length,
      rejected: results.filter((entry) => entry.status === "rejected").length,
    });
    return true;
  });
  return gameFontsReadyPromise;
}

function isLoadingOverlayActive() {
  const overlay = document.getElementById("loadingOverlay");
  if (!overlay) return false;
  return !overlay.hidden && !overlay.classList.contains("hidden");
}

function refreshSettlementLabelFonts(scene) {
  if (!scene) return;
  const nameFamily = 'EightBitHud, "8bithud", monospace';
  const ownerFamily = 'TW-bold, "Pixel Times", serif';
  const applyFonts = (visual) => {
    if (!visual) return;
    if (visual.nameText) setTextFontFamily(visual.nameText, nameFamily);
    if (visual.ownerText) setTextFontFamily(visual.ownerText, ownerFamily);
  };
  if (scene.nodeSprites?.forEach) scene.nodeSprites.forEach(applyFonts);
  if (scene.smallSettlementVisuals?.forEach) scene.smallSettlementVisuals.forEach(applyFonts);
}

function intToRgba(intColor, alpha = 1) {
  const r = (intColor >> 16) & 0xff;
  const g = (intColor >> 8) & 0xff;
  const b = intColor & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isPointerOverUI(pointer) {
  const evt = pointer?.event;
  const x = typeof evt?.clientX === "number" ? evt.clientX : null;
  const y = typeof evt?.clientY === "number" ? evt.clientY : null;
  if (x === null || y === null) return false;
  const el = document.elementFromPoint(x, y);
  if (!el) return false;
  // Block map input when the top-most element is part of any overlay/panel (and not the Phaser container itself).
  const blocker = el.closest(
    ".floating-window:not(.hidden), .region-modal:not(.hidden), #logOverlay, #resourcePanel, .map-controls, #loadingOverlay"
    + ", .encounter-overlay:not(.hidden), .camp-overlay:not(.hidden), .gameover-overlay:not(.hidden)"
    + ", .story-overlay:not(.hidden), .dice-test-overlay:not(.hidden), .tour-overlay:not(.hidden)"
  );
  if (!blocker) return false;
  return !blocker.closest("#phaserContainer");
}

function buildUnitHaloTexture(scene, key = "unitHalo", style = {}) {
  const radius = Math.max(1, style.radius || 17);
  const feather = Math.max(0.2, Math.min(2.5, style.feather || 1.2));
  const size = Math.ceil(radius * 2 * (1 + feather));
  const canvasKey = key;
  if (scene.textures.exists(canvasKey)) {
    scene.textures.remove(canvasKey);
  }
  const canvas = scene.textures.createCanvas(canvasKey, size, size);
  const ctx = canvas?.getContext();
  if (!ctx) return canvasKey;
  const cx = size / 2;
  const cy = size / 2;
  const inner = radius * 0.2;
  const outer = radius;
  const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  const color = style.color || 0xfcd34d;
  const alpha = typeof style.alpha === "number" ? style.alpha : 0.32;
  grad.addColorStop(0, intToRgba(color, alpha));
  grad.addColorStop(0.5, intToRgba(color, alpha * 0.6));
  grad.addColorStop(1, intToRgba(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
  return canvasKey;
}

function addDropShadowFX(gameObject, shadowStyle = {}, options = {}) {
  if (!gameObject?.preFX) return null;
  const padding = typeof options.padding === "number" ? options.padding : 24;
  if (gameObject.preFX.setPadding) {
    gameObject.preFX.setPadding(Math.max(1, padding));
  }
  const x = (shadowStyle.offsetX || 0) + (options.offsetX || 0);
  const y = (shadowStyle.offsetY || 0) + (options.offsetY || 0);
  const decay = options.decay ?? 0.12; // lower decay smooths the falloff
  const power = options.power ?? (shadowStyle.scale || 1);
  const color = shadowStyle.color ?? 0x000000;
  const samples = Math.max(8, options.samples ?? 24); // more samples = smoother shadow
  const intensity = options.intensity ?? (typeof shadowStyle.alpha === "number" ? shadowStyle.alpha : 0.7);
  return gameObject.preFX.addShadow(x, y, decay, power, color, samples, intensity);
}

function attachHoverGlowFX(gameObject, options = {}) {
  if (!gameObject?.postFX || !gameObject?.on) {
    return { enable: () => {}, disable: () => {} };
  }
  const padding = typeof options.padding === "number" ? options.padding : 24;
  if (gameObject.postFX.setPadding) {
    gameObject.postFX.setPadding(Math.max(1, padding));
  }
  const minQuality = 0.01;
  const minDistance = 0.1;
  const baseLayers = Array.isArray(options.layers) && options.layers.length > 0
    ? options.layers
    : [{
        color: options.color ?? 0xffffff,
        outerStrength: options.outerStrength ?? 4,
        innerStrength: options.innerStrength ?? 0,
        knockout: options.knockout ?? false,
        quality: Math.max(minQuality, options.quality ?? 1),
        distance: Math.max(minDistance, options.distance ?? 6),
      }];
  const hoverDistance = options.hoverDistance ?? options.distance;
  const activeDistance = options.activeDistance ?? options.selectDistance ?? hoverDistance ?? options.distance;
  const pickDistance = (layer, mode = "hover") => {
    const desired = mode === "active" ? activeDistance : hoverDistance;
    if (typeof desired === "number") return desired;
    if (typeof layer.distance === "number") return layer.distance;
    if (typeof options.distance === "number") return options.distance;
    return 6;
  };
  const buildLayers = (mode = "hover") => baseLayers.map((layer) => ({
    ...layer,
    quality: Math.max(minQuality, layer.quality ?? options.quality ?? 1),
    distance: Math.max(minDistance, pickDistance(layer, mode)),
  }));
  let glowFx = [];
  let activeMode = null;
  const enable = (mode = "active") => {
    if (glowFx.length && activeMode === mode) return;
    if (glowFx.length) {
      glowFx.forEach((fx) => gameObject.postFX.remove(fx));
      glowFx = [];
    }
    const layers = buildLayers(mode);
    if (!glowFx.length) {
      glowFx = layers.map((layer) => gameObject.postFX.addGlow(
        layer.color,
        layer.outerStrength,
        layer.innerStrength,
        layer.knockout ?? false,
        Math.max(minQuality, layer.quality ?? 1),
        Math.max(minDistance, layer.distance ?? 6),
      ));
      activeMode = mode;
    }
  };
  const disable = () => {
    if (glowFx.length) {
      glowFx.forEach((fx) => gameObject.postFX.remove(fx));
      glowFx = [];
    }
    activeMode = null;
  };
  gameObject.on("pointerover", () => enable("hover"));
  gameObject.on("pointerout", disable);
  gameObject.on("pointerupoutside", disable);
  return { enable, disable };
}

// Phaser 3.60 runs every postFX glow as a full-screen pass whose per-pixel cost grows
// with the square of the glow distance, even while the glow strength is 0 or the sprite
// is off-screen. The pass's input only ever contains its own game object, so every pixel
// outside that object's on-screen bounds (plus the glow's reach) is transparent in and
// transparent out. Scissoring the pass to that box yields identical pixels for a small
// fraction of the fill cost. Set window.__frtdGlowScissorOff = true to disable.
let glowScissorBoundsRect = null;
// How far (screen px) this pass's output can extend beyond the sprite's own drawn area.
// Passes run in postPipelines order, each one widening the content by its glow distance,
// but only when it actually draws an outer glow: with outerStrength 0 a pass can only
// tint pixels that are already there. Returns null if any pass is not a known glow.
function computeGlowPassReach(pipeline, obj) {
  const passes = obj.postPipelines;
  if (!Array.isArray(passes)) return null;
  let reach = 0;
  for (const pass of passes) {
    if (!pass || !pass.active) {
      if (pass === pipeline) return null;
      continue;
    }
    const controller = pass.controller;
    const distance = Number(controller?.__frtdGlowDistance);
    if (!(distance > 0)) return null;
    if (Number(controller.outerStrength) > 0) reach += Math.ceil(distance) + 1;
    if (pass === pipeline) return reach;
  }
  return null;
}
function computeGlowScissorBox(pipeline) {
  const obj = pipeline?.gameObject;
  const renderer = pipeline?.renderer;
  const scene = obj?.scene;
  if (!obj || !renderer || !scene || typeof obj.getBounds !== "function") return null;
  const glowReach = computeGlowPassReach(pipeline, obj);
  if (glowReach === null) return null;
  if (obj.scrollFactorX !== 1 || obj.scrollFactorY !== 1) return null;
  const cameras = scene.cameras?.cameras;
  if (!Array.isArray(cameras) || cameras.length !== 1) return null;
  const cam = cameras[0];
  const view = cam?.worldView;
  const zoom = cam?.zoom;
  if (!view || !(zoom > 0) || cam.rotation) return null;
  if (!glowScissorBoundsRect) glowScissorBoundsRect = new Phaser.Geom.Rectangle();
  const bounds = obj.getBounds(glowScissorBoundsRect);
  if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) || !(bounds.width > 0) || !(bounds.height > 0)) return null;
  // preFX (e.g. the drop shadow) draws beyond the sprite's own bounds by its padding.
  const preFxPadding = Number(obj.preFX?.padding) || 0;
  const displayRatio = obj.width > 0 ? bounds.width / obj.width : 1;
  const reach = glowReach + Math.ceil(preFxPadding * displayRatio * zoom) + 2;
  let left = Math.floor((bounds.x - view.x) * zoom + cam.x) - reach;
  let top = Math.floor((bounds.y - view.y) * zoom + cam.y) - reach;
  let right = Math.ceil((bounds.x + bounds.width - view.x) * zoom + cam.x) + reach;
  let bottom = Math.ceil((bounds.y + bounds.height - view.y) * zoom + cam.y) + reach;
  let clipLeft = 0;
  let clipTop = 0;
  let clipRight = renderer.width;
  let clipBottom = renderer.height;
  const active = renderer.currentScissor;
  if (active && active[2] > 0 && active[3] > 0) {
    clipLeft = Math.max(clipLeft, active[0]);
    clipTop = Math.max(clipTop, active[1]);
    clipRight = Math.min(clipRight, active[0] + active[2]);
    clipBottom = Math.min(clipBottom, active[1] + active[3]);
  }
  left = Math.max(left, clipLeft);
  top = Math.max(top, clipTop);
  right = Math.min(right, clipRight);
  bottom = Math.min(bottom, clipBottom);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  // GL scissor rectangles are measured from the bottom-left corner.
  return { x: left, y: renderer.height - top - height, width, height };
}
function installGlowScissorOptimization() {
  if (typeof Phaser === "undefined") return;
  const proto = Phaser.Renderer?.WebGL?.Pipelines?.FX?.Glow?.prototype;
  const fxProto = Phaser.GameObjects?.Components?.FX?.prototype;
  if (!proto || typeof proto.onDraw !== "function" || proto.__frtdScissorPatched) return;
  if (!fxProto || typeof fxProto.addGlow !== "function") return;
  // The pipeline does not keep its glow distance, so remember it on the controller.
  const addGlow = fxProto.addGlow;
  fxProto.addGlow = function addGlowTracked(color, outerStrength, innerStrength, knockout, quality, distance) {
    const fx = addGlow.call(this, color, outerStrength, innerStrength, knockout, quality, distance);
    if (fx) fx.__frtdGlowDistance = Number.isFinite(distance) ? distance : 10;
    return fx;
  };
  const drawFullScreen = proto.onDraw;
  proto.__frtdScissorPatched = true;
  proto.onDraw = function onDrawScissored(target) {
    let box = null;
    if (!window.__frtdGlowScissorOff) {
      try {
        box = computeGlowScissorBox(this);
      } catch (_) {
        box = null;
      }
    }
    const gl = this.gl;
    if (!box || !gl) {
      drawFullScreen.call(this, target);
      return;
    }
    // A zero-area box (sprite off-screen) still has to run the draw so Phaser's
    // framebuffer stack stays balanced; the scissor just discards every pixel.
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(box.x, box.y, box.width, box.height);
    try {
      drawFullScreen.call(this, target);
    } finally {
      this.renderer.resetScissor();
    }
  };
}
installGlowScissorOptimization();

// ---------------------------------------------------------------------------
// FX output cache (home base icon)
//
// A sprite's postFX glow chain is recomputed from scratch every frame even when nothing
// about the sprite has changed. For the home base that chain starts with the wide hover
// glow, which is by far the most expensive thing on the map.
//
// The passes run in order, each reading the previous pass's output from its own render
// target. Those targets keep their contents between frames. So on a frame where every
// input to the chain is exactly what it was on the last full frame, the input to the
// FINAL pass is already sitting in that pass's render target: everything before it can
// be skipped and only the final (cheap) pass re-run. The pixels reaching the screen come
// from the same shader, reading the same data, blended the same way, as a full frame.
//
// "Every input" is compared value-for-value each frame (collectFxCacheKey): camera,
// transform, texture frame, alpha, tint, every effect parameter, renderer size. Anything
// else falls back to a full frame, and a full frame is forced at least once every
// FX_CACHE_REFRESH_MS as a backstop against an input this list does not know about
// (for example a texture whose pixels are replaced in place).
// Set window.__frtdGlowCacheOff = true to disable and always render the full chain.
// ---------------------------------------------------------------------------
const FX_CACHE_REFRESH_MS = 4000;
const fxCacheScratch = { nums: [], numCount: 0, refs: [], refCount: 0 };

function pushFxControllerState(controller, key) {
  if (!controller) return;
  for (const prop in controller) {
    const value = controller[prop];
    const type = typeof value;
    if (type === "number") {
      key.nums[key.numCount++] = value;
    } else if (type === "boolean") {
      key.nums[key.numCount++] = value ? 1 : 0;
    } else if (value && type === "object" && typeof value.length === "number" && value.length <= 16 && typeof value[0] === "number") {
      for (let i = 0; i < value.length; i++) key.nums[key.numCount++] = value[i];
    }
  }
}

function collectFxCacheKey(sprite, camera, parentMatrix, renderer, key) {
  key.numCount = 0;
  key.refCount = 0;
  const nums = key.nums;
  const refs = key.refs;
  const frame = sprite.frame;
  refs[key.refCount++] = frame;
  refs[key.refCount++] = frame?.glTexture || null;
  refs[key.refCount++] = sprite.pipeline || null;
  // Everything MultiPipeline.batchSprite reads to place and tint the quad.
  nums[key.numCount++] = frame.u0; nums[key.numCount++] = frame.v0;
  nums[key.numCount++] = frame.u1; nums[key.numCount++] = frame.v1;
  nums[key.numCount++] = frame.x; nums[key.numCount++] = frame.y;
  nums[key.numCount++] = frame.cutWidth; nums[key.numCount++] = frame.cutHeight;
  nums[key.numCount++] = frame.realWidth; nums[key.numCount++] = frame.realHeight;
  nums[key.numCount++] = sprite.displayOriginX; nums[key.numCount++] = sprite.displayOriginY;
  nums[key.numCount++] = sprite.flipX ? 1 : 0; nums[key.numCount++] = sprite.flipY ? 1 : 0;
  nums[key.numCount++] = sprite.x; nums[key.numCount++] = sprite.y;
  nums[key.numCount++] = sprite.rotation;
  nums[key.numCount++] = sprite.scaleX; nums[key.numCount++] = sprite.scaleY;
  nums[key.numCount++] = sprite.scrollFactorX; nums[key.numCount++] = sprite.scrollFactorY;
  nums[key.numCount++] = sprite.tintTopLeft; nums[key.numCount++] = sprite.tintTopRight;
  nums[key.numCount++] = sprite.tintBottomLeft; nums[key.numCount++] = sprite.tintBottomRight;
  nums[key.numCount++] = sprite.tintFill ? 1 : 0;
  nums[key.numCount++] = sprite._alphaTL; nums[key.numCount++] = sprite._alphaTR;
  nums[key.numCount++] = sprite._alphaBL; nums[key.numCount++] = sprite._alphaBR;
  nums[key.numCount++] = sprite.isCropped ? 1 : 0;
  if (sprite.isCropped && sprite._crop) {
    const crop = sprite._crop;
    nums[key.numCount++] = crop.u0; nums[key.numCount++] = crop.v0;
    nums[key.numCount++] = crop.u1; nums[key.numCount++] = crop.v1;
    nums[key.numCount++] = crop.x; nums[key.numCount++] = crop.y;
    nums[key.numCount++] = crop.width; nums[key.numCount++] = crop.height;
  }
  const camMatrix = camera.matrix;
  nums[key.numCount++] = camMatrix.a; nums[key.numCount++] = camMatrix.b;
  nums[key.numCount++] = camMatrix.c; nums[key.numCount++] = camMatrix.d;
  nums[key.numCount++] = camMatrix.e; nums[key.numCount++] = camMatrix.f;
  nums[key.numCount++] = camera.scrollX; nums[key.numCount++] = camera.scrollY;
  nums[key.numCount++] = camera.alpha;
  nums[key.numCount++] = camera.roundPixels ? 1 : 0;
  nums[key.numCount++] = camera.x; nums[key.numCount++] = camera.y;
  nums[key.numCount++] = camera.width; nums[key.numCount++] = camera.height;
  nums[key.numCount++] = parentMatrix ? 1 : 0;
  if (parentMatrix) {
    nums[key.numCount++] = parentMatrix.a; nums[key.numCount++] = parentMatrix.b;
    nums[key.numCount++] = parentMatrix.c; nums[key.numCount++] = parentMatrix.d;
    nums[key.numCount++] = parentMatrix.e; nums[key.numCount++] = parentMatrix.f;
  }
  nums[key.numCount++] = renderer.width; nums[key.numCount++] = renderer.height;
  // Effects drawn with the sprite itself (drop shadows).
  const preFx = sprite.preFX;
  const preList = preFx?.list || null;
  nums[key.numCount++] = preFx?.enabled ? 1 : 0;
  nums[key.numCount++] = Number(preFx?.padding) || 0;
  nums[key.numCount++] = preList ? preList.length : -1;
  if (preList) {
    for (let i = 0; i < preList.length; i++) {
      refs[key.refCount++] = preList[i];
      pushFxControllerState(preList[i], key);
    }
  }
  // The glow passes, in the order they run.
  const passes = sprite.postPipelines || [];
  nums[key.numCount++] = passes.length;
  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    const target = pass.currentRenderTarget || null;
    refs[key.refCount++] = pass;
    refs[key.refCount++] = pass.controller || null;
    refs[key.refCount++] = target;
    refs[key.refCount++] = target?.texture || null;
    refs[key.refCount++] = target?.framebuffer || null;
    nums[key.numCount++] = pass.active ? 1 : 0;
    pushFxControllerState(pass.controller, key);
  }
}

function fxCacheKeyMatches(cache, key) {
  if (cache.numCount !== key.numCount || cache.refCount !== key.refCount) return false;
  for (let i = 0; i < key.numCount; i++) {
    if (cache.nums[i] !== key.nums[i]) return false;
  }
  for (let i = 0; i < key.refCount; i++) {
    if (cache.refs[i] !== key.refs[i]) return false;
  }
  return true;
}

function storeFxCacheKey(cache, key) {
  cache.numCount = key.numCount;
  cache.refCount = key.refCount;
  for (let i = 0; i < key.numCount; i++) cache.nums[i] = key.nums[i];
  for (let i = 0; i < key.refCount; i++) cache.refs[i] = key.refs[i];
  cache.refs.length = key.refCount;
}

function enableFxOutputCache(sprite) {
  if (!sprite || sprite.__frtdFxCache || typeof sprite.renderWebGL !== "function") return;
  const renderFullChain = sprite.renderWebGL;
  const cache = {
    valid: false,
    nums: [],
    numCount: 0,
    refs: [],
    refCount: 0,
    renderedAt: 0,
    blendMode: null,
    fullFrames: 0,
    reusedFrames: 0,
  };
  sprite.__frtdFxCache = cache;
  sprite.renderWebGL = function renderWithFxCache(renderer, src, camera, parentMatrix) {
    const passes = src.postPipelines;
    let finalPass = null;
    if (Array.isArray(passes)) {
      for (let i = passes.length - 1; i >= 0; i--) {
        if (passes[i]?.active) {
          finalPass = passes[i];
          break;
        }
      }
    }
    const usable = !window.__frtdGlowCacheOff
      && !!renderer?.gl
      && !!finalPass
      && !!finalPass.currentRenderTarget
      && typeof finalPass.onDraw === "function"
      && !!src.frame;
    if (!usable) {
      cache.valid = false;
      renderFullChain.call(this, renderer, src, camera, parentMatrix);
      return;
    }
    const now = performance.now();
    let reuse = false;
    try {
      collectFxCacheKey(src, camera, parentMatrix, renderer, fxCacheScratch);
      reuse = cache.valid
        && now - cache.renderedAt < (window.__frtdFxCacheRefreshMs ?? FX_CACHE_REFRESH_MS)
        && fxCacheKeyMatches(cache, fxCacheScratch);
    } catch (_) {
      cache.valid = false;
      renderFullChain.call(this, renderer, src, camera, parentMatrix);
      return;
    }
    if (reuse) {
      // Same bookkeeping the normal sprite renderer does, then only the final pass.
      camera.addToRenderList(src);
      if (cache.blendMode !== null && renderer.currentBlendMode !== cache.blendMode) {
        renderer.setBlendMode(cache.blendMode);
      }
      const target = finalPass.currentRenderTarget;
      // The final pass pops one framebuffer before drawing, exactly as it does at the
      // end of a full frame, which leaves it drawing onto whatever was current here.
      renderer.pushFramebuffer(target.framebuffer, false, false);
      finalPass.onDraw(target);
      cache.reusedFrames += 1;
      return;
    }
    renderFullChain.call(this, renderer, src, camera, parentMatrix);
    storeFxCacheKey(cache, fxCacheScratch);
    cache.blendMode = renderer.currentBlendMode;
    cache.renderedAt = now;
    cache.valid = true;
    cache.fullFrames += 1;
  };
}

function applyHomeBaseFx(scene, visual, level = 1) {
  const target = visual?.settlementIcon;
  if (!scene || !target) return;
  const normalizedLevel = Math.trunc(level || 0);
  if (normalizedLevel <= 0) {
    if (visual.homeBaseShadowFx && target.preFX?.remove) {
      target.preFX.remove(visual.homeBaseShadowFx);
    }
    if (Array.isArray(visual.homeBaseGlowFx) && target.postFX?.remove) {
      visual.homeBaseGlowFx.forEach((fx) => target.postFX.remove(fx));
    }
    visual.homeBaseShadowFx = null;
    visual.homeBaseGlowFx = [];
    visual.homeBaseFxLevel = 0;
    return;
  }
  const clamped = Math.max(1, Math.min(3, normalizedLevel));
  if (visual.homeBaseFxLevel === clamped) return;
  if (visual.homeBaseShadowFx && target.preFX?.remove) {
    target.preFX.remove(visual.homeBaseShadowFx);
  }
  if (Array.isArray(visual.homeBaseGlowFx) && target.postFX?.remove) {
    visual.homeBaseGlowFx.forEach((fx) => target.postFX.remove(fx));
  }
  visual.homeBaseShadowFx = null;
  visual.homeBaseGlowFx = [];
  visual.homeBaseFxLevel = clamped;

  const shadowBase = { color: 0x000000, offsetX: 0, offsetY: 0, alpha: 0.9, scale: 1.1 };
  const levelShadow = [
    { power: 1.1, intensity: 0.88, decay: 0, samples: 28 },
    { power: 1.25, intensity: 0.95, decay: 0, samples: 32 },
    { power: 1.4, intensity: 1.05, decay: 0, samples: 36 },
  ];
  const levelGlow = [
    [{ color: 0x74ff8d, outer: 3.4, inner: 0.4, quality: 0.5, distance: 5 }],
    [
      { color: 0xffa54a, outer: 4.6, inner: 0.6, quality: 0.6, distance: 7 },
      { color: 0xffd7a1, outer: 1.8, inner: 0.2, quality: 0.45, distance: 3 },
    ],
    [
      { color: 0xffe36a, outer: 6.2, inner: 0.8, quality: 0.7, distance: 9 },
      { color: 0xffffff, outer: 2.4, inner: 0.3, quality: 0.6, distance: 3 },
      { color: 0xfff4b0, outer: 1.6, inner: 0.15, quality: 0.5, distance: 2 },
    ],
  ];
  const shadowConfig = levelShadow[clamped - 1];
  visual.homeBaseShadowFx = addDropShadowFX(target, shadowBase, shadowConfig);
  if (target.postFX?.setPadding) {
    target.postFX.setPadding(36);
  }
  const glowLayers = levelGlow[clamped - 1] || [];
  glowLayers.forEach((layer) => {
    if (!target.postFX?.addGlow) return;
    const fx = target.postFX.addGlow(
      layer.color,
      layer.outer,
      layer.inner,
      false,
      Math.max(0.01, layer.quality),
      Math.max(0.1, layer.distance),
    );
    visual.homeBaseGlowFx.push(fx);
  });
}

async function fetchBasemapManifest(url = "basemap-tiles/manifest.json") {
  if (BASEMAP_SESSION_CACHE.manifest) {
    if (!getTransitionMetrics()?.manifestReadyAt) {
      markTransitionTime("manifestReadyAt");
    }
    recordTransitionEvent("basemapManifest:cacheHit", { url });
    return BASEMAP_SESSION_CACHE.manifest;
  }
  if (!BASEMAP_SESSION_CACHE.manifestPromise) {
    BASEMAP_SESSION_CACHE.manifestPromise = (async () => {
      try {
        recordTransitionEvent("basemapManifest:fetch:start", { url });
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) return null;
        const json = await res.json();
        if (!json || !json.width || !json.height) return null;
        BASEMAP_SESSION_CACHE.manifest = json;
        if (!getTransitionMetrics()?.manifestReadyAt) {
          markTransitionTime("manifestReadyAt");
        }
        recordTransitionEvent("basemapManifest:fetch:ready", {
          url,
          width: json.width,
          height: json.height,
          rows: json.rows,
          cols: json.cols,
        });
        return json;
      } catch (err) {
        console.warn("No basemap manifest found; will generate tiles on the fly.", err);
        recordTransitionEvent("basemapManifest:fetch:error", { url, message: err?.message || String(err) });
        return null;
      }
    })();
  }
  return BASEMAP_SESSION_CACHE.manifestPromise;
}

function normalizeBasemapSrc(src) {
  if (!src) return src;
  // If a file:// or absolute path slipped into the manifest, strip everything
  // before the basemap-tiles folder so we always request from the HTTP server.
  if (src.startsWith("file://") || /^[a-zA-Z]:[\\/]/.test(src)) {
    try {
      const url = new URL(src, window.location.href);
      const parts = url.pathname.split(/[\\/]/).filter(Boolean);
      const idx = parts.findIndex((p) => p.toLowerCase() === "basemap-tiles");
      if (idx !== -1) {
        return parts.slice(idx).join("/");
      }
    } catch (_) {
      /* fall through */
    }
  }
  // Clean up leading ./ or ../
  // Strip leading ./ ../ and any leading slashes/backslashes.
  return src.replace(/^([.]{1,2}[\\/])+/, "").replace(/^[\\/]+/, "");
}

function buildBasemapTileLookup(manifest) {
  const layout = getBasemapTileLayout(manifest);
  if (!layout) return new Map();
  const rows = layout.rows;
  const cols = layout.cols;
  const tiles = (manifest.tiles && manifest.tiles.length
    ? manifest.tiles
    : (() => {
        const entries = [];
        const prefix = manifest.prefix || "basemap-tiles/basemap";
        const ext = manifest.ext || "jpg";
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            entries.push({
              row,
              col,
              src: `${prefix}_r${row}_c${col}.${ext}`,
            });
          }
        }
        return entries;
      })()
  ).map((tile) => ({
    ...tile,
    src: normalizeBasemapSrc(tile.src || ""),
  }));
  const lookup = new Map();
  tiles.forEach((tile) => {
    lookup.set(getBasemapTileKeyStatic(tile.row, tile.col), tile);
  });
  return lookup;
}

async function getCachedBasemapImage(tile, options = {}) {
  if (!tile?.src) return null;
  if (BASEMAP_SESSION_CACHE.images.has(tile.src)) {
    if (options.onWarmHit) options.onWarmHit(tile);
    return BASEMAP_SESSION_CACHE.images.get(tile.src);
  }
  let promise = BASEMAP_SESSION_CACHE.imagePromises.get(tile.src);
  if (!promise) {
    promise = loadImageElement(tile.src).then((img) => {
      BASEMAP_SESSION_CACHE.images.set(tile.src, img);
      return img;
    }, (err) => {
      // Forget the failure so the next viewport pass can retry the download.
      if (BASEMAP_SESSION_CACHE.imagePromises.get(tile.src) === promise) {
        BASEMAP_SESSION_CACHE.imagePromises.delete(tile.src);
      }
      throw err;
    });
    BASEMAP_SESSION_CACHE.imagePromises.set(tile.src, promise);
  } else if (options.onWarmHit) {
    options.onWarmHit(tile);
  }
  const img = await promise;
  if (options.markWarm) {
    BASEMAP_SESSION_CACHE.warmedKeys.add(getBasemapTileKeyStatic(tile.row, tile.col));
  }
  return img;
}

async function loadBasemapTileBatch(tiles, options = {}) {
  const safeTiles = Array.isArray(tiles) ? tiles.filter(Boolean) : [];
  if (!safeTiles.length) return [];
  const concurrency = Math.max(1, options.concurrency || BASEMAP_INITIAL_LOAD_CONCURRENCY);
  const results = new Array(safeTiles.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, safeTiles.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < safeTiles.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const tile = safeTiles[currentIndex];
      results[currentIndex] = await getCachedBasemapImage(tile, options);
    }
  });
  await Promise.all(workers);
  return results;
}

function getLayerWarmTileUrls(layerManifest, basemapRequirement) {
  if (!layerManifest?.tiles || !Array.isArray(layerManifest.tiles) || !basemapRequirement?.range) return [];
  const basemapTileSize = getBasemapTileLayout(BASEMAP_SESSION_CACHE.manifest)?.tileSize || 1024;
  const tileSizePx = layerManifest.tileSizePx || layerManifest.tileSize || basemapTileSize;
  const layerName = layerManifest.layer || layerManifest.id || layerManifest.name || "";
  const minX = basemapRequirement.range.minCol * basemapTileSize;
  const maxX = ((basemapRequirement.range.maxCol + 1) * basemapTileSize) - 1;
  const minY = basemapRequirement.range.minRow * basemapTileSize;
  const maxY = ((basemapRequirement.range.maxRow + 1) * basemapTileSize) - 1;
  const minCol = Phaser.Math.Clamp(Math.floor(minX / tileSizePx), 0, (layerManifest.cols || 1) - 1);
  const maxCol = Phaser.Math.Clamp(Math.floor(maxX / tileSizePx), 0, (layerManifest.cols || 1) - 1);
  const minRow = Phaser.Math.Clamp(Math.floor(minY / tileSizePx), 0, (layerManifest.rows || 1) - 1);
  const maxRow = Phaser.Math.Clamp(Math.floor(maxY / tileSizePx), 0, (layerManifest.rows || 1) - 1);
  const urls = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tile = layerManifest.tiles.find((entry) => entry?.row === row && entry?.col === col);
      const src = tile?.src || (layerName ? `json-tiles/${layerName}/${layerName}_r${row}_c${col}.json` : "");
      if (src) urls.push(src);
    }
  }
  return urls;
}

/*
  Sprite sheet grid assumptions (legacy reference only - runtime atlases are built automatically).
*/

class MapScene extends Phaser.Scene {
  constructor() {
    super({ key: "mapScene" });
    this.nodeSprites = new Map();
    this.linkGraphics = null;
    this.marker = null;
    this.markerShadowFx = null;
    this.markerGlowControl = null;
    this.unitMarkers = new Map();
    this.activeUnitId = null;
    this.ready = false;
    this.gameState = null;
    this.panActive = false;
    this.panStart = { x: 0, y: 0 };
    this.worldWidth = 2006;
    this.worldHeight = 1014;
    this.background = null;
    this.atlasFrames = {};
    this.panKey = null;
      this.spriteShadowStyle = { ...SPRITE_SHADOW_STYLE };
      this.initialZoom = 3.6;
      this.initialCameraPlaced = false;
      this.userAdjustedCamera = false;
      this.overlayOutroReady = false;
      this.minZoom = 0.12;
    this.maxZoom = 1;
    this.zoomMultiplier = 8.2; // how far to zoom in relative to a "fit" view
    this.zoomMode = preferredZoomMode || "anchored"; // anchored: keep cursor fixed; phaser: default center zoom
    this.backgroundTiles = [];
    this.basemapReady = false;
    this.basemapTileSize = null;
    this.basemapRows = null;
    this.basemapCols = null;
    this.basemapGlowSprites = new Map();
    this.didPan = false;
    this.marchUiAccumulator = 0;
    this.marchUiDirty = false;
    this.settlementOverlapAccumulator = 0;
    this.pendingSettlementOverlapCheck = false;
    this.markerHovering = false;
    this.waterMask = null;
    this.waterMaskReady = false;
    this.demGrid = null;
    this.demGridReady = false;
    this.ndviGrid = null;
    this.ndviGridReady = false;
    this.roadsGrid = null;
    this.roadsGridReady = false;
    this.roadsVectors = null;
    this.roadsVectorsReady = false;
    this.roadsVectorsWorld = null;
    this.roadsVectorsTileManifest = null;
    this.roadsVectorsTiles = new Map();
    this.roadsVectorsTilesVersion = 0;
    this.roadsVectorsWorldVersion = -1;
    this.pointerInsideMap = false;
    this.pointerOnUnit = false;
    this.squadSelectGuard = false;
    this.spriteSheets = [...SPRITE_SHEET_KEYS];
    this.rawTextureKeys = {};
    this.smallSettlements = [];
    this.smallSettlementVisuals = new Map();
    this.smallSettlementsPlaced = false;
    this.dams = [];
    this.damVisuals = new Map();
    this.damFrameMap = new Map();
    this.dams = [];
    this.damVisuals = new Map();
    this.waterMaskPromise = null;
    this.demGridPromise = null;
    this.ndviGridPromise = null;
    this.roadsGridPromise = null;
    this.roadsVectorsPromise = null;
    this.gridTileManifests = {};
    this.gridTileCaches = {};
    this.gridTileInFlight = {};
    this.gridTileCheckAccumulator = 0;
    this.basemapManifest = null;
    this.basemapTileList = [];
    this.basemapTileMetaByKey = new Map();
    this.basemapTilesByKey = new Map();
    this.basemapTileInFlight = new Set();
    this.basemapTilePromises = new Map();
    this.basemapViewportCheckAccumulator = 0;
    this.basemapStartupGate = null;
    this.basemapBackgroundWarmQueued = false;
    this.deferBasemapRenderRefresh = false;
    this.preseededTextureEntries = [];
    this.deferredTextureEntries = [];
    this.deferredTextureWarmInstallScheduled = false;
    this.fogGraphics = null;
    this.fogNeedsRedraw = true;
      this.encounterPreviewSprite = null;
      this.encounterPreviewTween = null;
      this.encounterPreviewCameraTween = null;
      this.encounterPreviewDwell = null;
    this.pingRingEmitter = null;
    this.pingEmberEmitter = null;
    this.endTurnTransitionState = {
      progress: 0,
      blackAlpha: 0,
    };
    this.endTurnTransitionPromise = null;
    this.endTurnTransitionAnimFrame = null;
    this.endTurnTransitionOverlayEl = null;
    this.endTurnTransitionShaderHostEl = null;
    this.endTurnTransitionBlackEl = null;
    this.endTurnTransitionShaderGame = null;
    this.endTurnTransitionLabelEl = null;
    this.endTurnTransitionPrewarmScheduled = false;
    this.endTurnTransitionPrewarmed = false;
    this.isEndTurnTransitionActive = false;
    this.sessionReady = false;
    this.sessionReadyPromise = new Promise((resolve) => {
      this.resolveSessionReady = resolve;
    });
    }
  setGameState(state) {
    this.gameState = state;
  }
  whenSessionReady() {
    return this.sessionReadyPromise;
  }
  markSessionReady() {
    if (this.sessionReady) return;
    this.sessionReady = true;
    if (typeof this.resolveSessionReady === "function") {
      this.resolveSessionReady(true);
      this.resolveSessionReady = null;
    }
  }
  queuePreseededTexture(key, src) {
    if (!key || !src) return false;
    if (!STATIC_IMAGE_WARM_CACHE.has(src)) return false;
    this.preseededTextureEntries.push({ key, src });
    return true;
  }
  installPreseededTextures() {
    if (!this.preseededTextureEntries.length) return;
    this.preseededTextureEntries.forEach((entry) => {
      const promise = STATIC_IMAGE_WARM_CACHE.get(entry.src);
      const img = promise && typeof promise.then !== "function" ? promise : null;
      if (!img) return;
      if (this.textures.exists(entry.key)) return;
      this.textures.addImage(entry.key, img);
    });
  }
  scheduleDeferredTextureWarmInstall() {
    if (this.deferredTextureWarmInstallScheduled || !this.deferredTextureEntries.length) return;
    this.deferredTextureWarmInstallScheduled = true;
    const schedule = (cb, delay = 0) => {
      if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(cb, { timeout: Math.max(500, delay || 500) });
        return;
      }
      window.setTimeout(cb, Math.max(0, delay));
    };
    const installNext = () => {
      if (!this.textures || !this.deferredTextureEntries.length) {
        this.deferredTextureWarmInstallScheduled = false;
        return;
      }
      const overlayVisible = isLoadingOverlayActive();
      if (overlayVisible) {
        schedule(installNext, 900);
        return;
      }
      const next = this.deferredTextureEntries.shift();
      if (!next) {
        this.deferredTextureWarmInstallScheduled = false;
        return;
      }
      if (!this.textures.exists(next.key)) {
        const cached = STATIC_IMAGE_WARM_CACHE.get(next.src);
        const img = cached && typeof cached.then !== "function" ? cached : null;
        if (img) {
          this.textures.addImage(next.key, img);
          recordTransitionEvent("mapScene:deferredTexture:installed", { key: next.key });
        } else {
          recordTransitionEvent("mapScene:deferredTexture:skipped", { key: next.key });
        }
      }
      if (this.deferredTextureEntries.length) {
        schedule(installNext, 120);
      } else {
        this.deferredTextureWarmInstallScheduled = false;
      }
    };
    schedule(installNext, 1200);
  }
  preload() {
    recordTransitionEvent("mapScene:preload:start");
    this.preseededTextureEntries = [];
    this.deferredTextureEntries = [];
    STARTUP_MAP_TEXTURES.forEach(({ key, src }) => {
      if (this.textures.exists(key)) {
        return;
      }
      if (!MAP_SCENE_CRITICAL_TEXTURE_KEYS.has(key)) {
        this.deferredTextureEntries.push({ key, src });
        return;
      }
      if (this.queuePreseededTexture(key, src)) return;
      this.load.image(key, src);
    });
    recordTransitionEvent("mapScene:preload:queued", {
      textureCount: this.preseededTextureEntries.length,
      deferredTextureCount: this.deferredTextureEntries.length,
    });
  }
  create() {
    recordTransitionEvent("mapScene:create:start");
    measureTransitionSpan("mapScene:create:installPreseededTextures", () => {
      this.installPreseededTextures();
    });
    // Normal boot uses precomputed atlas frames to avoid heavy per-pixel startup work.
    measureTransitionSpan("mapScene:create:sceneSetup", () => {
      if (this.cameras?.main) {
        this.cameras.main.roundPixels = true; // extra guard against subpixel seams
      }
      if (this.input?.setTopOnly) {
        this.input.setTopOnly(true);
      }
    });
    measureTransitionSpan("mapScene:create:atlasSetup", () => {
      if (!applyPrecomputedSpriteAtlases(this)) {
        this.rebuildSpriteAtlases();
      }
    });
    measureTransitionSpan("mapScene:create:pingTextures", () => {
      ensurePingTextures(this);
    });
    measureTransitionSpan("mapScene:create:fxSetup", () => {
      this.pingRingEmitter = this.add.particles(0, 0, PING_RING_TEX, {
        emitting: false,
        quantity: 1,
        lifespan: 450,
        scale: { start: PING_RING_BASE_SCALE_START, end: PING_RING_BASE_SCALE_END },
        alpha: { start: 0.5, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        tint: PING_GLOW_COLOR,
    });
    this.pingRingEmitter.setDepth(4.2);
    this.pingEmberEmitter = this.add.particles(0, 0, PING_DUST_TEX, {
        emitting: false,
        quantity: 6,
        lifespan: { min: 200, max: 420 },
        speed: { min: 8, max: 30 },
        angle: { min: 0, max: 360 },
        scale: { start: PING_EMBER_BASE_SCALE_START, end: PING_EMBER_BASE_SCALE_END },
        alpha: { start: 0.45, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        tint: PING_EMBER_COLOR,
      });
      this.pingEmberEmitter.setDepth(4.2);
      this.linkGraphics = this.add.graphics().setDepth(0);
      this.fogGraphics = this.add.graphics().setDepth(2.6);
      this.fogGraphics.setScrollFactor(1, 1);
      this.fogGraphics.setAlpha(1);
      if (typeof Phaser !== "undefined" && Phaser.BlendModes) {
        this.fogGraphics.setBlendMode(Phaser.BlendModes.NORMAL);
      }
      this.fogGraphics.setVisible(false);
      this.fogNeedsRedraw = true;
      this.createEndTurnTransitionFx();
    });
    measureTransitionSpan("mapScene:create:markerSetup", () => {
      const viewSize = this.getViewSize({ width: this.scale.width, height: this.scale.height });
      this.updateZoomSettings(viewSize.width, viewSize.height, { clampCamera: false });
      const unitScale = getUnitScale();
      const haloStyle = UNIT_HALO_STYLE;
      const shadowStyle = this.spriteShadowStyle;
      this.unitMarkerStyle = { unitScale, haloStyle, shadowStyle };
      this.syncMarkersToUnits();
      this.setActiveUnitMarker(this.gameState?.activeUnitId || this.gameState?.squad?.currentUnitId);
    });
    measureTransitionSpan("mapScene:create:cameraSetup", () => {
      this.cameras.main.setBackgroundColor("#050804");
      this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
      this.focusCameraOnHome({ setZoom: true });
      this.input.mouse.disableContextMenu();
      this.panKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.scale.on("resize", this.handleResize, this);
      // game.scale outlives this scene across in-page restarts; a stale handler would
      // throw inside Phaser's frame step and stop the loop for good.
      const offResize = () => this.scale?.off("resize", this.handleResize, this);
      this.events.once("shutdown", offResize);
      this.events.once("destroy", offResize);
      this.handleResize({ width: this.scale.width, height: this.scale.height });
    });
    recordTransitionEvent("mapScene:camera:initial");
    const basemapLoadPromise = this.loadBasemapTiled()
      .then(({ width, height }) => {
        recordTransitionEvent("mapScene:basemap:ready", { width, height });
        this.worldWidth = width;
          this.worldHeight = height;
          this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
          const updatedView = this.getViewSize({ width: this.scale.width, height: this.scale.height });
          this.updateZoomSettings(updatedView.width, updatedView.height, { clampCamera: true });
          if (!this.userAdjustedCamera) {
            this.focusCameraOnHome({ setZoom: true });
          }
          if (this.backgroundTiles.length) {
            this.backgroundTiles.forEach((tile) => tile.setInteractive());
          }
        this.basemapReady = true;
        if (this.gameState) {
          renderPhaserMap(this.gameState, this);
        }
        this.tryPlaceSmallSettlements();
        this.scheduleEndTurnTransitionPrewarm();
        const mapContainer = document.getElementById("mapContainer");
        if (mapContainer) {
      const rect = mapContainer.getBoundingClientRect();
      if (rect) {
        renderRangeOverlay(this.gameState, rect, this.cameras.main);
      }
    }
  })
  .catch((err) => {
        console.error("Failed to build basemap tiles", err);
        recordTransitionEvent("mapScene:basemap:error", { message: err?.message || String(err) });
        this.markSessionReady();
        playLoadingOverlayOutro();
      });
    this.ready = true;
    recordTransitionEvent("mapScene:create:ready");
    mapSceneInstance = this;
    if (this.gameState) {
      this.fogNeedsRedraw = true;
      if (this.gameState.visibility) {
        this.gameState.visibility.dirty = true;
      }
      measureTransitionSpan("mapScene:create:initialRender", () => {
        renderPhaserMap(this.gameState, this);
      });
      queueRangerPaneWarmup(this.gameState);
    }
    this.scheduleDeferredTextureWarmInstall();
    loadGameFonts().then(() => refreshSettlementLabelFonts(this));
    this.waterMaskPromise = this.loadWaterMaskGrid();
    if (this.waterMaskPromise?.finally) {
      this.waterMaskPromise.finally(() => this.tryPlaceSmallSettlements());
    }
    this.demGridPromise = this.loadDemGrid();
    this.ndviGridPromise = this.loadNdviGrid();
    if (ROADS_FEATURE_ENABLED) {
      this.roadsGridPromise = this.loadRoadsGrid();
      this.roadsVectorsPromise = this.loadRoadsVectors();
    } else {
      this.roadsGridPromise = Promise.resolve(null);
      this.roadsVectorsPromise = Promise.resolve(null);
    }
    void basemapLoadPromise;
    this.input.on("wheel", (pointer, __, ___, deltaY) => {
      if (this.isEndTurnTransitionActive) return;
      const cam = this.cameras.main;
      const targetZoom = cam.zoom - deltaY * 0.0010;
      this.zoomTo(targetZoom, pointer, { mode: this.zoomMode });
    });
      this.input.on("pointerdown", (pointer) => {
        if (this.isEndTurnTransitionActive) return;
        const overUi = isPointerOverUI(pointer);
        if (overUi) {
          return;
        }
        const targetEl = pointer?.event?.target;
        this.pointerInsideMap = !!targetEl?.closest?.("#phaserContainer");
        this.didPan = false;
        const allowPan = pointer.leftButtonDown() || pointer.rightButtonDown() || (this.panKey && this.panKey.isDown);
        if (allowPan) {
          this.panActive = true;
          this.panStart = { x: pointer.x, y: pointer.y };
        }
      });
      this.input.on("pointermove", (pointer) => {
        if (this.isEndTurnTransitionActive) {
          stopPanning();
          return;
        }
        if (!this.panActive) return;
        const panHeld = pointer.leftButtonDown() || pointer.rightButtonDown() || (this.panKey && this.panKey.isDown);
        if (!panHeld) {
          stopPanning();
          return;
        }
        if (isPointerOverUI(pointer)) {
          stopPanning();
          return;
        }
        if (!this.didPan) {
          // Ignore the first few pixels so a click with a slight wobble stays a click.
          const moved = Math.hypot(pointer.x - this.panStart.x, pointer.y - this.panStart.y);
          if (moved < MAP_DRAG_THRESHOLD_PX) return;
          this.panStart = { x: pointer.x, y: pointer.y };
          this.didPan = true;
          return;
        }
        const cam = this.cameras.main;
        const dx = (this.panStart.x - pointer.x) / cam.zoom;
        const dy = (this.panStart.y - pointer.y) / cam.zoom;
        cam.scrollX += dx;
        cam.scrollY += dy;
        this.userAdjustedCamera = true;
        this.panStart = { x: pointer.x, y: pointer.y };
        this.didPan = true;
      });
    const stopPanning = () => {
      this.panActive = false;
      this.didPan = false;
    };
      this.input.on("pointerup", (pointer) => {
        const dragged = this.didPan;
        stopPanning();
        if (this.isEndTurnTransitionActive) return;
        if (isPointerOverUI(pointer)) return;
        const wasInside = this.pointerInsideMap;
        const wasOnUnit = this.pointerOnUnit;
        this.pointerInsideMap = false;
        this.pointerOnUnit = false;
      const consumed = this.handleDevTeleport(pointer, dragged, wasInside, wasOnUnit);
      this.handleDevMapProbe(pointer, dragged);
      if (!consumed) {
        this.handleSquadMoveCommand(pointer, dragged, wasInside, wasOnUnit);
      }
    });
      this.input.on("pointerupoutside", (pointer) => {
        const dragged = this.didPan;
        stopPanning();
        if (this.isEndTurnTransitionActive) return;
        if (isPointerOverUI(pointer)) return;
        const wasInside = this.pointerInsideMap;
        const wasOnUnit = this.pointerOnUnit;
        this.pointerInsideMap = false;
        this.pointerOnUnit = false;
      const consumed = this.handleDevTeleport(pointer, dragged, wasInside, wasOnUnit);
      this.handleDevMapProbe(pointer, dragged);
      if (!consumed) {
        this.handleSquadMoveCommand(pointer, dragged, wasInside, wasOnUnit);
      }
    });
    // "gameout" is the pointer leaving the canvas. The scene's "pointerout" fires on leaving
    // any interactive object (tiles, icons), which used to cancel pans and drop clicks.
    this.input.on("gameout", () => {
      stopPanning();
      this.pointerInsideMap = false;
    });
  }
  createEndTurnTransitionFx() {
    this.ensureEndTurnTransitionOverlay();
  }
  ensureEndTurnTransitionOverlay() {
    const mapContainer = document.getElementById("mapContainer");
    if (!mapContainer || this.endTurnTransitionOverlayEl) return;
    const overlay = document.createElement("div");
    overlay.id = "endTurnTransitionOverlay";
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      zIndex: "40",
      pointerEvents: "none",
      overflow: "hidden",
      borderRadius: "14px",
      opacity: "0",
      visibility: "hidden",
    });
    const shaderHost = document.createElement("div");
    shaderHost.id = "endTurnCloudLayer";
    Object.assign(shaderHost.style, {
      position: "absolute",
      inset: "0",
      opacity: "0",
      transform: "translate3d(6%, 0, 0) scale(1.0)",
      contain: "paint",
      backfaceVisibility: "hidden",
      transformOrigin: "50% 50%",
      willChange: "transform, opacity",
    });
    const black = document.createElement("div");
    black.id = "endTurnBlackLayer";
    Object.assign(black.style, {
      position: "absolute",
      inset: "0",
      background: "rgba(0, 0, 0, 1)",
      opacity: "0",
      willChange: "opacity",
    });
    const label = document.createElement("div");
    label.id = "endTurnTurnLabel";
    overlay.appendChild(black);
    overlay.appendChild(shaderHost);
    overlay.appendChild(label);
    mapContainer.appendChild(overlay);
    this.endTurnTransitionOverlayEl = overlay;
    this.endTurnTransitionShaderHostEl = shaderHost;
    this.endTurnTransitionBlackEl = black;
    this.endTurnTransitionLabelEl = label;
  }
  layoutEndTurnTransitionFx() {
    return;
  }
  scheduleEndTurnTransitionPrewarm() {
    if (this.endTurnTransitionPrewarmScheduled || this.endTurnTransitionPrewarmed) return;
    const overlay = this.endTurnTransitionOverlayEl;
    const shaderHost = this.endTurnTransitionShaderHostEl;
    if (!overlay || !shaderHost || typeof window === "undefined") return;
    this.endTurnTransitionPrewarmScheduled = true;
    const schedule = (cb) => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(cb, { timeout: 1800 });
        return;
      }
      window.setTimeout(cb, 1200);
    };
    schedule(() => {
      if (this.endTurnTransitionPrewarmed || this.isEndTurnTransitionActive || !overlay.isConnected) {
        this.endTurnTransitionPrewarmScheduled = false;
        return;
      }
      this.buildEndTurnTransitionShaderGame()
        .catch((err) => {
          console.warn("End-turn transition prewarm failed", err);
        })
        .finally(() => {
          overlay.style.visibility = "visible";
          overlay.style.opacity = "0.001";
          shaderHost.style.opacity = "0.001";
          shaderHost.style.transform = "translate3d(0, 0, 0) scale(1)";
          void overlay.offsetHeight;
          const finish = () => {
            overlay.style.opacity = "0";
            overlay.style.visibility = "hidden";
            shaderHost.style.opacity = "0";
            shaderHost.style.transform = "translate3d(0, 0, 0) scale(1)";
            this.endTurnTransitionPrewarmScheduled = false;
            this.endTurnTransitionPrewarmed = true;
            if (!this.isEndTurnTransitionActive) this.sleepEndTurnTransitionShader();
          };
          if (typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
          } else {
            window.setTimeout(finish, 32);
          }
        });
    });
  }
  async buildEndTurnTransitionShaderGame() {
    if (this.endTurnTransitionShaderGame || !this.endTurnTransitionShaderHostEl) return;
    await preloadTitleShaderSource();
    const rect = this.endTurnTransitionShaderHostEl.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width || this.endTurnTransitionShaderHostEl.clientWidth || 1));
    const height = Math.max(1, Math.floor(rect.height || this.endTurnTransitionShaderHostEl.clientHeight || 1));
    try {
      this.endTurnTransitionShaderGame = new Phaser.Game({
        type: Phaser.WEBGL,
        width,
        height,
        parent: this.endTurnTransitionShaderHostEl,
        transparent: true,
        fps: {
          target: TITLE_SHADER_TARGET_FPS,
          min: 15,
        },
        scene: [MapTurnTransitionShaderScene],
      });
    } catch (err) {
      // No WebGL: the black layer alone still covers the turn change.
      console.warn("End-turn transition shader unavailable", err);
      this.endTurnTransitionShaderGame = null;
      return;
    }
    await new Promise((resolve) => {
      const startAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      const checkReady = () => {
        const shaderScene = this.endTurnTransitionShaderGame?.scene?.keys?.MapTurnTransitionShaderScene;
        if (shaderScene?.shader) {
          resolve();
          return;
        }
        const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
        if (now - startAt >= 1200) {
          resolve();
          return;
        }
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(checkReady);
        } else {
          window.setTimeout(checkReady, 16);
        }
      };
      checkReady();
    });
  }
  // The transition shader is only on screen for a few seconds per turn; keep its render
  // loop asleep the rest of the time instead of drawing a hidden full-size shader.
  sleepEndTurnTransitionShader() {
    try {
      this.endTurnTransitionShaderGame?.loop?.sleep();
    } catch (_) {
      // nothing to sleep
    }
  }
  wakeEndTurnTransitionShader() {
    try {
      this.endTurnTransitionShaderGame?.loop?.wake();
    } catch (_) {
      // nothing to wake
    }
  }
  async ensureEndTurnTransitionShaderAwake() {
    try {
      await this.buildEndTurnTransitionShaderGame();
    } catch (err) {
      console.warn("End-turn transition shader build failed", err);
    }
    this.wakeEndTurnTransitionShader();
  }
  applyEndTurnTransitionState() {
    const state = this.endTurnTransitionState || {};
    if (this.endTurnTransitionOverlayEl && this.endTurnTransitionShaderHostEl && this.endTurnTransitionBlackEl) {
      const progress = Phaser.Math.Clamp(Number(state.progress) || 0, 0, 1);
      const opacityEnvelope = Math.sin(progress * Math.PI);
      const cloudOpacity = Phaser.Math.Clamp(Math.pow(opacityEnvelope, 0.82) * 1.12, 0, 1);
      const peakBlackOverride = Phaser.Math.Clamp(Number(state.blackAlpha) || 0, 0, 1);
      const baseBlackOpacity = Phaser.Math.Clamp(
        Math.max(Math.pow(opacityEnvelope, 1.18) * 0.82, peakBlackOverride),
        0,
        1
      );
      this.endTurnTransitionOverlayEl.style.visibility = cloudOpacity > 0.001 ? "visible" : "hidden";
      this.endTurnTransitionOverlayEl.style.opacity = "1";
      this.endTurnTransitionShaderHostEl.style.opacity = `${cloudOpacity}`;
      this.endTurnTransitionShaderHostEl.style.transform = "translate3d(0, 0, 0) scale(1)";
      this.endTurnTransitionBlackEl.style.opacity = `${baseBlackOpacity}`;
    }
  }
  resetEndTurnTransitionFx() {
    this.endTurnTransitionState.progress = 0;
    this.endTurnTransitionState.blackAlpha = 0;
    if (this.endTurnTransitionOverlayEl) {
      this.endTurnTransitionOverlayEl.style.opacity = "0";
      this.endTurnTransitionOverlayEl.style.visibility = "hidden";
    }
    if (this.endTurnTransitionShaderHostEl) {
      this.endTurnTransitionShaderHostEl.style.opacity = "0";
      this.endTurnTransitionShaderHostEl.style.transform = "translate3d(0, 0, 0) scale(1)";
    }
    if (this.endTurnTransitionBlackEl) {
      this.endTurnTransitionBlackEl.style.opacity = "0";
    }
    if (this.endTurnTransitionLabelEl) {
      this.endTurnTransitionLabelEl.className = "";
      this.endTurnTransitionLabelEl.style.opacity = "0";
    }
    this.applyEndTurnTransitionState();
    this.sleepEndTurnTransitionShader();
  }
  stopEndTurnTransitionTweens() {
    if (this.endTurnTransitionAnimFrame) {
      if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(this.endTurnTransitionAnimFrame);
      }
      if (typeof clearTimeout === "function") {
        clearTimeout(this.endTurnTransitionAnimFrame);
      }
    }
    this.endTurnTransitionAnimFrame = null;
  }
  async tweenEndTurnTransitionState(targets, duration, ease = "Sine.easeInOut") {
    if (!targets || !duration) {
      Object.assign(this.endTurnTransitionState, targets || {});
      this.applyEndTurnTransitionState();
      return;
    }
    const easeMap = {
      "Linear": (t) => t,
      "Quad.easeIn": (t) => t * t,
      "Sine.easeIn": (t) => 1 - Math.cos((t * Math.PI) / 2),
      "Sine.easeOut": (t) => Math.sin((t * Math.PI) / 2),
      "Sine.easeInOut": (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    };
    const easing = easeMap[ease] || easeMap["Sine.easeInOut"];
    const startValues = {};
    Object.keys(targets).forEach((key) => {
      startValues[key] = Number(this.endTurnTransitionState[key]) || 0;
    });
    await new Promise((resolve) => {
      const startAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      const step = () => {
        const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
        const rawT = duration > 0 ? (now - startAt) / duration : 1;
        const t = Phaser.Math.Clamp(rawT, 0, 1);
        const eased = easing(t);
        Object.keys(targets).forEach((key) => {
          const from = startValues[key];
          const to = Number(targets[key]) || 0;
          this.endTurnTransitionState[key] = Phaser.Math.Linear(from, to, eased);
        });
        this.applyEndTurnTransitionState();
        if (t >= 1) {
          this.endTurnTransitionAnimFrame = null;
          resolve();
          return;
        }
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          this.endTurnTransitionAnimFrame = window.requestAnimationFrame(step);
        } else {
          this.endTurnTransitionAnimFrame = setTimeout(step, 16);
        }
      };
      step();
    });
    this.applyEndTurnTransitionState();
  }
  async playEndTurnTransition(runTurnAdvance, options = {}) {
    if (this.endTurnTransitionPromise) {
      return this.endTurnTransitionPromise;
    }
    this.endTurnTransitionPromise = (async () => {
      this.isEndTurnTransitionActive = true;
      this.panActive = false;
      this.didPan = false;
      this.pointerInsideMap = false;
      this.pointerOnUnit = false;
      const hiddenGlowSprites = [];
      if (this.basemapGlowSprites?.forEach) {
        this.basemapGlowSprites.forEach((sprite) => {
          if (sprite?.visible) {
            hiddenGlowSprites.push(sprite);
            sprite.setVisible(false);
          }
        });
      }
      this.stopEndTurnTransitionTweens();
      this.layoutEndTurnTransitionFx();
      await this.ensureEndTurnTransitionShaderAwake();
      if (this.endTurnTransitionOverlayEl) {
        this.endTurnTransitionOverlayEl.style.visibility = "visible";
      }
      this.applyEndTurnTransitionState();
      try {
        await this.tweenEndTurnTransitionState({
          progress: 0.5,
          blackAlpha: 1,
        }, END_TURN_TRANSITION_BUILD_MS, "Sine.easeIn");
        await this.tweenEndTurnTransitionState({
          progress: 0.5,
          blackAlpha: 1,
        }, END_TURN_TRANSITION_PEAK_HALF_HOLD_MS, "Linear");
        if (typeof runTurnAdvance === "function") {
          const result = runTurnAdvance();
          if (result && typeof result.then === "function") {
            await result;
          }
        }
        if (typeof options?.onPeakCovered === "function") {
          options.onPeakCovered();
        }
        if (this.endTurnTransitionLabelEl) {
          const turnNum = window.gameStateRef?.turn ?? "?";
          this.endTurnTransitionLabelEl.textContent = `TURN ${turnNum}`;
          this.endTurnTransitionLabelEl.className = "";
          void this.endTurnTransitionLabelEl.offsetWidth; // force reflow before animation
          this.endTurnTransitionLabelEl.className = "turn-label-appear";
        }
        await this.tweenEndTurnTransitionState({
          progress: 0.5,
          blackAlpha: 1,
        }, END_TURN_TRANSITION_PEAK_HALF_HOLD_MS, "Linear");
        if (this.endTurnTransitionLabelEl) {
          this.endTurnTransitionLabelEl.className = "turn-label-decompose";
        }
        await this.tweenEndTurnTransitionState({
          progress: 1,
          blackAlpha: 0,
        }, END_TURN_TRANSITION_CLEAR_MS, "Sine.easeOut");
      } finally {
        hiddenGlowSprites.forEach((sprite) => {
          if (sprite?.scene) sprite.setVisible(true);
        });
        this.stopEndTurnTransitionTweens();
        this.resetEndTurnTransitionFx();
        this.updateBasemapGlowEffects();
        this.isEndTurnTransitionActive = false;
        this.endTurnTransitionPromise = null;
      }
    })();
    return this.endTurnTransitionPromise;
  }
  async coverScreenTransition() {
    if (this.endTurnTransitionPromise) {
      return this.endTurnTransitionPromise;
    }
    this.endTurnTransitionPromise = (async () => {
      this.isEndTurnTransitionActive = true;
      this.panActive = false;
      this.didPan = false;
      this.pointerInsideMap = false;
      this.pointerOnUnit = false;
      this.stopEndTurnTransitionTweens();
      this.layoutEndTurnTransitionFx();
      await this.ensureEndTurnTransitionShaderAwake();
      if (this.endTurnTransitionOverlayEl) {
        this.endTurnTransitionOverlayEl.style.visibility = "visible";
      }
      this.applyEndTurnTransitionState();
      await this.tweenEndTurnTransitionState({
        progress: 0.5,
        blackAlpha: 1,
      }, END_TURN_TRANSITION_BUILD_MS, "Sine.easeIn");
      await this.tweenEndTurnTransitionState({
        progress: 0.5,
        blackAlpha: 1,
      }, END_TURN_TRANSITION_PEAK_HALF_HOLD_MS, "Linear");
    })().finally(() => {
      this.endTurnTransitionPromise = null;
    });
    return this.endTurnTransitionPromise;
  }
  async clearScreenTransition() {
    if (this.endTurnTransitionPromise) {
      return this.endTurnTransitionPromise;
    }
    this.endTurnTransitionPromise = (async () => {
      await this.tweenEndTurnTransitionState({
        progress: 0.5,
        blackAlpha: 1,
      }, END_TURN_TRANSITION_PEAK_HALF_HOLD_MS, "Linear");
      await this.tweenEndTurnTransitionState({
        progress: 1,
        blackAlpha: 0,
      }, END_TURN_TRANSITION_CLEAR_MS, "Sine.easeOut");
      this.stopEndTurnTransitionTweens();
      this.resetEndTurnTransitionFx();
      this.updateBasemapGlowEffects();
      this.isEndTurnTransitionActive = false;
    })().finally(() => {
      this.endTurnTransitionPromise = null;
    });
    return this.endTurnTransitionPromise;
  }
  releaseScreenTransition() {
    this.stopEndTurnTransitionTweens();
    this.resetEndTurnTransitionFx();
    this.isEndTurnTransitionActive = false;
    this.endTurnTransitionPromise = null;
  }
  createUnitMarker(unit) {
    const unitScale = this.unitMarkerStyle?.unitScale ?? getUnitScale();
    const haloStyle = this.unitMarkerStyle?.haloStyle || UNIT_HALO_STYLE;
    const shadowStyle = this.unitMarkerStyle?.shadowStyle || this.spriteShadowStyle || {};
    const spriteKey = unit?.type === "vehicle" ? "unitsVehicles" : "unitsSoldiers";
    const fallbackFrame = spriteKey === "unitsVehicles"
      ? this.vehicleFrameNames?.vehicle1 || atlasFrame(this, "unitsVehicles", 0)
      : this.unitFrameNames?.soldier2 || atlasFrame(this, "unitsSoldiers", 0);
    const frameKey = resolveUnitSpriteFrame(this, unit) || fallbackFrame;
    const frameData = this.textures?.getFrame?.(spriteKey, frameKey);
    const baseWidth = frameData?.width || 62;
    const baseHeight = frameData?.height || 62;
    const baseSize = Math.max(baseWidth, baseHeight);
    const sprite = this.add
      .sprite(0, 0, spriteKey, frameKey)
      .setOrigin(0.5, 1.0)
      .setScale(unitScale)
      .setVisible(false)
      .setDepth(5);
    // Pixel-perfect hit testing — only opaque sprite pixels register clicks/hover.
    // alphaTolerance=8 ignores near-transparent halo/edge pixels so the hitbox tracks the visible silhouette.
    sprite.setInteractive({ pixelPerfect: true, alphaTolerance: 8 });
    // Subtle pulsing ground shadow under the unit's feet. Marks the logical/center point
    // unambiguously without adding HUD-style markers. Pulse alpha is driven in updateUnitMarkerVitals.
    const shadowWidth = baseWidth * 0.62 * unitScale;
    const shadowHeight = baseHeight * 0.18 * unitScale;
    const groundShadow = this.add
      .ellipse(0, 0, shadowWidth, shadowHeight, 0x000000, 0.38)
      .setVisible(false)
      .setDepth(4.9);
    // Tiny crisp downward chevron whose tip sits exactly at the feet — pinpoints the click target.
    // Drawn with a dark halo stroke first, then a bright inner stroke for legibility on any terrain.
    const crosshairW = 4.5;
    const crosshairH = 5.5;
    const crosshair = this.add.graphics();
    crosshair.lineStyle(3.5, 0x000000, 0.78);
    crosshair.beginPath();
    crosshair.moveTo(-crosshairW, -crosshairH);
    crosshair.lineTo(0, 0);
    crosshair.lineTo(crosshairW, -crosshairH);
    crosshair.strokePath();
    crosshair.lineStyle(2, 0x74ff8d, 0.98);
    crosshair.beginPath();
    crosshair.moveTo(-crosshairW, -crosshairH);
    crosshair.lineTo(0, 0);
    crosshair.lineTo(crosshairW, -crosshairH);
    crosshair.strokePath();
    crosshair.setVisible(false);
    crosshair.setDepth(5.05);
    const shadowFx = null;
    const glowControl = attachHoverGlowFX(sprite, {
      hoverDistance: (GLOW_DISTANCE.unit.hover || 3) * unitScale,
      activeDistance: (GLOW_DISTANCE.unit.select || GLOW_DISTANCE.unit.hover || 3) * unitScale,
      layers: [
        {
          color: 0xf97316,
          outerStrength: 5 * unitScale * (haloStyle.scale || 1.25),
          innerStrength: 0,
          quality: 0.55,
          distance: (GLOW_DISTANCE.unit.hover || 3) * unitScale,
          padding: Math.round(28 * unitScale),
        },
        {
          color: haloStyle.color || 0xfcd34d,
          outerStrength: 2.4 * unitScale * (haloStyle.scale || 1.1),
          innerStrength: 0.8,
          quality: 0.75,
          distance: Math.max(1.5, (GLOW_DISTANCE.unit.hover || 3) * 0.8) * unitScale,
          padding: Math.round(28 * unitScale),
        },
      ],
    });
    const entry = { sprite, groundShadow, crosshair, shadowFx, glowControl, hovering: false };
    sprite.on("pointerdown", (pointer) => {
      if (this.isEndTurnTransitionActive) return;
      if (isEncounterTransitionActive()) return;
      if (isPointerOverUI(pointer)) return;
      if (pointer?.event?.stopPropagation) pointer.event.stopPropagation();
      if (!this.gameState) return;
      if (typeof pointer?.leftButtonDown === "function" && !pointer.leftButtonDown()) return;
      const targetUnit = (this.gameState.rangerUnits || []).find((u) => u.id === unit.id) || unit;
      ensureUnitTravelState(this.gameState, targetUnit);
      if (!targetUnit.deployed) return;
      const unitPos = getUnitPositionPct(this.gameState, targetUnit);
      const nearby = findNearbyLargeSettlement(this.gameState, unitPos);
      const suppressId = nearby?.id || targetUnit.currentNodeId;
      const suppressPos = nearby?.pos || this.gameState.nodeMap?.get?.(suppressId)?.pos || null;
      if (suppressId && suppressPos) {
        this.gameState.largeSettlementSceneSuppressedId = suppressId;
        this.gameState.largeSettlementSceneSuppressPos = { x: suppressPos.x, y: suppressPos.y };
      }
      if (targetUnit.isMoving) {
        targetUnit.isMoving = false;
        targetUnit.moveTargetPct = null;
        this.marchUiDirty = true;
        this.marchUiAccumulator = 0;
      }
      this.gameState.activeUnitId = targetUnit.id;
      if (this.gameState.squad) this.gameState.squad.currentUnitId = targetUnit.id;
      this.setActiveUnitMarker(targetUnit.id);
      this.gameState.squadSelected = true;
      this.gameState.squadPaneClosed = false;
      this.pointerOnUnit = true;
      updateSquadWindow(this.gameState);
      renderMapAdoptingSettlementOverlaps(this.gameState);
      this.syncMarkersToUnits();
      const now = performance.now();
      const lastClick = this.lastUnitClick || { id: null, time: 0 };
      const isDoubleClick = lastClick.id === targetUnit.id && now - lastClick.time < 320;
      this.lastUnitClick = { id: targetUnit.id, time: now };
      if (isDoubleClick && this.focusCameraOnUnit) {
        this.userAdjustedCamera = false;
        this.focusCameraOnUnit(targetUnit, { setZoom: true, zoom: this.initialZoom });
      }
    });
    sprite.on("pointerover", () => {
      entry.hovering = true;
      if (this.activeUnitId === unit.id) {
        this.markerHovering = true;
      }
    });
    sprite.on("pointerout", () => {
      entry.hovering = false;
      if (this.activeUnitId === unit.id) {
        this.markerHovering = false;
      }
      this.pointerOnUnit = false;
    });
    return entry;
  }
  ensureUnitMarker(unit) {
    if (!unit) return null;
    let entry = this.unitMarkers.get(unit.id);
    if (!entry) {
      entry = this.createUnitMarker(unit);
      this.unitMarkers.set(unit.id, entry);
    }
    return entry;
  }
  spawnMovePing(x, y) {
    if (!this.pingRingEmitter || !this.pingEmberEmitter) return;
    const cam = this.cameras?.main;
    const zoom = cam?.zoom || 1;
    const clamp = (typeof Phaser !== "undefined" && Phaser.Math && Phaser.Math.Clamp)
      ? Phaser.Math.Clamp
      : (val, min, max) => Math.min(max, Math.max(min, val));
    const zoomScale = clamp(1 / zoom, PING_ZOOM_SCALE_MIN, PING_ZOOM_SCALE_MAX);
    const ringEmitter = this.pingRingEmitter?.emitters?.list?.[0];
    const emberEmitter = this.pingEmberEmitter?.emitters?.list?.[0];
    const ringStart = PING_RING_BASE_SCALE_START * zoomScale;
    const ringEnd = PING_RING_BASE_SCALE_END * zoomScale;
    const emberStart = PING_EMBER_BASE_SCALE_START * zoomScale;
    const emberEnd = PING_EMBER_BASE_SCALE_END * zoomScale;
    if (ringEmitter?.setScale) ringEmitter.setScale(ringStart, ringEnd);
    if (emberEmitter?.setScale) emberEmitter.setScale(emberStart, emberEnd);
    this.pingRingEmitter.explode(1, x, y);
    this.pingEmberEmitter.explode(6, x, y);
  }
  setActiveUnitMarker(unitId) {
    if (!unitId) {
      if (this.activeUnitId) {
        const prevEntry = this.unitMarkers.get(this.activeUnitId);
        prevEntry?.glowControl?.disable();
      }
      this.activeUnitId = null;
      this.marker = null;
      this.markerShadowFx = null;
      this.markerGlowControl = null;
      this.markerHovering = false;
      refreshRangerPaneScene(this.gameState, { forceRebuild: true });
      return null;
    }
    if (this.activeUnitId === unitId) {
      return this.unitMarkers.get(unitId) || null;
    }
    const prevId = this.activeUnitId;
    this.activeUnitId = unitId;
    const entry = this.unitMarkers.get(unitId);
    this.marker = entry?.sprite || null;
    this.markerShadowFx = entry?.shadowFx || null;
    this.markerGlowControl = entry?.glowControl || null;
    this.markerHovering = !!entry?.hovering;
    if (prevId && prevId !== unitId) {
      const prevEntry = this.unitMarkers.get(prevId);
      prevEntry?.glowControl?.disable();
    }
    refreshRangerPaneScene(this.gameState, { forceRebuild: true });
    return this.unitMarkers.get(this.activeUnitId) || null;
  }
  getActiveMarkerEntry() {
    if (!this.activeUnitId) return null;
    return this.unitMarkers.get(this.activeUnitId) || null;
  }
  syncMarkersToUnits() {
    if (!this.gameState) return;
    const liveIds = new Set();
    for (const unit of this.gameState.rangerUnits || []) {
      ensureUnitTravelState(this.gameState, unit);
      liveIds.add(unit.id);
      const entry = this.ensureUnitMarker(unit);
      if (!entry) continue;
      const sprite = entry.sprite;
      const spriteKey = unit?.type === "vehicle" ? "unitsVehicles" : "unitsSoldiers";
      const frameKey = resolveUnitSpriteFrame(this, unit) || sprite.frame?.name;
      if (frameKey && (sprite.texture?.key !== spriteKey || sprite.frame?.name !== frameKey)) {
        sprite.setTexture(spriteKey, frameKey);
      }
      if (!unit.deployed) {
        sprite.setVisible(false);
        entry.groundShadow?.setVisible(false);
        entry.crosshair?.setVisible(false);
        entry.glowControl?.disable?.();
        continue;
      }
      const pos = getUnitPositionPct(this.gameState, unit);
      if (!pos || !this.worldWidth || !this.worldHeight) {
        sprite.setVisible(false);
        entry.groundShadow?.setVisible(false);
        entry.crosshair?.setVisible(false);
        continue;
      }
      const mx = (pos.x / 100) * this.worldWidth;
      const my = (pos.y / 100) * this.worldHeight;
      const dead = !!unit.isDead;
      sprite.setVisible(true);
      sprite.setPosition(mx, my);
      sprite.setAlpha(dead ? 0.7 : 1);
      sprite.setTint(dead ? 0x5a0a0a : 0xffffff);
      if (entry.groundShadow) {
        // Unit origin is (0.5, 1.0) — sprite position IS the feet — so the shadow sits directly at (mx, my).
        entry.groundShadow.setPosition(mx, my);
        entry.groundShadow.setVisible(!dead);
      }
      if (entry.crosshair) {
        // Chevron tip sits at (mx, my); strokes extend upward from there.
        entry.crosshair.setPosition(mx, my);
        entry.crosshair.setVisible(!dead);
      }
    }
    for (const [id, entry] of this.unitMarkers.entries()) {
      if (liveIds.has(id)) continue;
      entry.sprite?.destroy(true);
      entry.groundShadow?.destroy(true);
      entry.crosshair?.destroy(true);
      this.unitMarkers.delete(id);
    }
    const aliveFallbackId = (this.gameState.rangerUnits || []).find((unit) => !!unit && !unit.isDead)?.id || null;
    const activeId = this.gameState.activeUnitId
      || this.gameState.squad?.currentUnitId
      || aliveFallbackId
      || null;
    this.setActiveUnitMarker(activeId);
  }
  updateUnitMarkerVitals(now = null) {
    const state = this.gameState;
    if (!state || !this.unitMarkers) return;
    const time = Number.isFinite(now) ? now : (typeof performance !== "undefined" ? performance.now() : Date.now());
    const pulseT = (Math.sin((time * Math.PI * 2) / 1600) + 1) * 0.5;
    const alpha = 0.78 + 0.18 * pulseT;
    const base = { r: 255, g: 255, b: 255 };
    const death = { r: 0x5a, g: 0x0a, b: 0x0a };
    const tintT = 0.25 + 0.45 * pulseT;
    const r = Math.round(base.r + (death.r - base.r) * tintT);
    const g = Math.round(base.g + (death.g - base.g) * tintT);
    const b = Math.round(base.b + (death.b - base.b) * tintT);
    const pulseTint = (r << 16) | (g << 8) | b;
    // Slow, gentle pulse for the unit ground shadow (period ~2.4s, alpha 0.30–0.42).
    const shadowPulseT = (Math.sin((time * Math.PI * 2) / 2400) + 1) * 0.5;
    const shadowAlpha = 0.30 + 0.12 * shadowPulseT;
    for (const unit of state.rangerUnits || []) {
      if (!unit?.deployed) continue;
      const entry = this.unitMarkers.get(unit.id);
      const sprite = entry?.sprite;
      if (!sprite) continue;
      if (entry.groundShadow && entry.groundShadow.visible) {
        entry.groundShadow.setFillStyle(0x000000, unit.isDead ? 0.15 : shadowAlpha);
      }
      const inv = unit.inventory || {};
      const lowFood = (inv.food ?? 0) < 1;
      const lowWater = (inv.water ?? 0) < 1;
      const vitalsState = unit.isDead ? "dead" : (lowFood || lowWater) ? "alert" : "normal";
      if (entry.vitalsState === vitalsState && vitalsState !== "alert") {
        continue;
      }
      if (unit.isDead) {
        sprite.setAlpha(0.7);
        sprite.setTint(0x5a0a0a);
        entry.vitalsState = "dead";
        continue;
      }
      if (lowFood || lowWater) {
        sprite.setAlpha(alpha);
        sprite.setTint(pulseTint);
        entry.vitalsState = "alert";
      } else {
        sprite.setAlpha(1);
        sprite.setTint(0xffffff);
        entry.vitalsState = "normal";
      }
    }
  }
  rebuildSpriteAtlases() {
    const settlementsBaseKey = "settlementsLarge";
    const settlementsPlayerKey = "settlementsPlayer";
    const settlementsNeutralKey = "settlementsNeutral";
    const settlementsEnemyKey = "settlementsEnemy";
    this.spriteSheets.forEach((key) => {
      const rawKey = this.rawTextureKeys?.[key];
      if (rawKey) {
        cloneTexture(this, rawKey, key);
      }
      const base = spriteCleanupProfileFor(key);
      const profile = {
        tolerance: 120,
        softness: 0,
        erode: 0,
        alphaCutoff: base.alphaCutoff ?? 8,
        assumeAlpha: false,
        keepLargestComponent: false,
        bgColors: base.bgColors && base.bgColors.length ? base.bgColors : [CHROMA_BG],
      };
      stripTextureBackground(this, key, profile);
    });
    // Keep per-owner texture keys aligned with the base sprites (no hue shifts).
    cloneTexture(this, settlementsBaseKey, settlementsPlayerKey);
    cloneTexture(this, settlementsBaseKey, settlementsNeutralKey);
    cloneTexture(this, settlementsBaseKey, settlementsEnemyKey);
    const soldiersAtlas = buildUnitAtlas(this, "unitsSoldiers", { padding: 1, minArea: 400, detectKey: this.rawTextureKeys?.unitsSoldiers || "unitsSoldiers" });
    const vehiclesAtlas = buildUnitAtlas(this, "unitsVehicles", { padding: 1, minArea: 400, detectKey: this.rawTextureKeys?.unitsVehicles || "unitsVehicles" });
    const battleAtlases = {};
    BATTLE_SPRITE_KEYS.forEach((key) => {
      battleAtlases[key] = buildAutoAtlas(this, key, { padding: 8, minArea: 900, detectKey: this.rawTextureKeys?.[key] || key });
    });
    this.atlasFrames = {
      settlementsPlayer: buildAutoAtlas(this, settlementsPlayerKey, { padding: 6, minArea: 900, detectKey: this.rawTextureKeys?.settlementsLarge || settlementsBaseKey }),
      settlementsNeutral: buildAutoAtlas(this, settlementsNeutralKey, { padding: 6, minArea: 900, detectKey: this.rawTextureKeys?.settlementsLarge || settlementsBaseKey }),
      settlementsEnemy: buildAutoAtlas(this, settlementsEnemyKey, { padding: 6, minArea: 900, detectKey: this.rawTextureKeys?.settlementsLarge || settlementsBaseKey }),
      settlements: buildAutoAtlas(this, settlementsPlayerKey, { padding: 6, minArea: 900, detectKey: this.rawTextureKeys?.settlementsLarge || settlementsBaseKey }), // fallback
      settlementsSmall: buildAutoAtlas(this, "settlementsSmall", { padding: 6, minArea: 450, detectKey: this.rawTextureKeys?.settlementsSmall || "settlementsSmall" }),
      dams: buildAutoAtlas(this, "dams", { padding: 6, minArea: 900, detectKey: this.rawTextureKeys?.dams || "dams" }),
      landmarks: buildAutoAtlas(this, "landmarks", { padding: 8, minArea: 900, detectKey: this.rawTextureKeys?.landmarks || "landmarks" }),
      poi: buildAutoAtlas(this, "poi", { padding: 8, minArea: 900, detectKey: this.rawTextureKeys?.poi || "poi" }),
      randoms: buildAutoAtlas(this, "randoms", { padding: 8, minArea: 900, detectKey: this.rawTextureKeys?.randoms || "randoms" }),
      ...battleAtlases,
      [CAMP_SPRITE_KEY]: buildAutoAtlas(this, CAMP_SPRITE_KEY, { padding: 8, minArea: 900, detectKey: this.rawTextureKeys?.[CAMP_SPRITE_KEY] || CAMP_SPRITE_KEY }),
      natres: buildAutoAtlas(this, "natres", { padding: 8, minArea: 900, detectKey: this.rawTextureKeys?.natres || "natres" }),
      unitsSoldiers: soldiersAtlas.frames,
      unitsVehicles: vehiclesAtlas.frames,
    };
    this.unitFrameNames = soldiersAtlas.names;
    this.vehicleFrameNames = reorderVehicleFrameNames(vehiclesAtlas.names, VEHICLE_FRAME_SEQUENCE, vehiclesAtlas.frames);
    ensureSettlementFrameMap(this);
    this.syncMarkersToUnits();
  }
  clearEncounterPreview() {
    if (this.encounterPreviewTween?.stop) {
      this.encounterPreviewTween.stop();
    }
    if (this.encounterPreviewCameraTween?.stop) {
      this.encounterPreviewCameraTween.stop();
    } else if (this.encounterPreviewCameraTween?.remove) {
      this.encounterPreviewCameraTween.remove();
    }
    if (this.encounterPreviewDwell?.remove) {
      this.encounterPreviewDwell.remove(false);
    } else if (this.encounterPreviewDwell) {
      clearTimeout(this.encounterPreviewDwell);
    }
    if (this.encounterPreviewSprite) {
      this.encounterPreviewSprite.destroy();
    }
    this.encounterPreviewSprite = null;
    this.encounterPreviewTween = null;
    this.encounterPreviewCameraTween = null;
    this.encounterPreviewDwell = null;
  }
  playEncounterPreview(pending = {}) {
    if (encounterOverlayState.active || isAnySceneOverlayActive()) {
      toggleEncounterOverlay(true);
      return true;
    }
    const sceneKey = pending.sceneKey || pendingEncounter.sceneKey;
    const textureKey = pending.textureKey || encounterTextureKeyForScene(sceneKey);
    const encounterUnitId = encounterOverlayState.encounterUnitId;
    let encounterUnit = encounterUnitId && this.gameState?.rangerUnits
      ? this.gameState.rangerUnits.find((u) => u?.id === encounterUnitId) || null
      : null;
    if (!encounterUnit) encounterUnit = this.getActiveRangerUnit();
    const activeUnit = encounterUnit;
    const encounterMarkerEntry = encounterUnit?.id
      ? (this.unitMarkers?.get?.(encounterUnit.id) || null)
      : null;
    const activeEntry = encounterMarkerEntry || (this.getActiveMarkerEntry ? this.getActiveMarkerEntry() : null);
    const activeMarker = activeEntry?.sprite || this.marker;
    const unitPos = activeUnit ? getUnitPositionPct(this.gameState, activeUnit) : null;
    const unitWorld = unitPos ? this.pctToWorld(unitPos) : null;
    if (!sceneKey || !this.ready || !activeMarker || !unitWorld || !textureKey || !this.textures?.exists(textureKey)) {
      toggleEncounterOverlay(true);
      return true;
    }
    const frames = (this.atlasFrames && this.atlasFrames[textureKey]) || [];
    let frameKey = pending.frameKey;
    if (frameKey && frames.length && !frames.includes(frameKey)) {
      frameKey = null;
    }
    if ((!frameKey || frameKey === "__BASE") && frames.length) {
      frameKey = frames[Math.floor(Math.random() * frames.length)];
    }
    if (frameKey && !this.textures?.getFrame?.(textureKey, frameKey)) {
      frameKey = null;
    }
    const resolvedFrameKey = frameKey;
    if (pending === pendingEncounter) {
      pendingEncounter.sceneKey = sceneKey;
      pendingEncounter.textureKey = textureKey;
      pendingEncounter.frameKey = resolvedFrameKey;
      pendingEncounter.lockedFrame = !!resolvedFrameKey;
      setActiveEncounter(pendingEncounter);
      syncEncounterBadgeFromSelection(pendingEncounter);
    }
    this.clearEncounterPreview();
    const depth = (activeMarker.depth ?? 5) + 0.5;
    const baseScale = Math.max(0.25, activeMarker.scale || getUnitScale());
    if (SHOW_ENCOUNTER_PREVIEW_SPRITE) {
      const sprite = this.add
        .sprite(activeMarker.x, activeMarker.y, textureKey, resolvedFrameKey || undefined)
        .setOrigin(0.5, 1.0)
        .setDepth(depth)
        .setScale(baseScale * 0.94)
        .setAlpha(0);
      const shadowStyle = this.spriteShadowStyle || SPRITE_SHADOW_STYLE;
      addDropShadowFX(sprite, { ...shadowStyle, offsetX: 0, offsetY: 0 }, {
        power: (shadowStyle.scale || 1.05) * 1.01,
        decay: 0,
        samples: 10,
        intensity: (shadowStyle.alpha ?? 0.65) * 0.9,
        padding: Math.round(28 * baseScale),
      });
      if (sprite.postFX?.addGlow) {
        sprite.postFX.addGlow(0x8dffb1, 1.35 * baseScale, 0.55, false, 0.72, 3.5);
      }
      this.encounterPreviewSprite = sprite;
      this.encounterPreviewTween = this.tweens.add({
        targets: sprite,
        alpha: 1,
        scale: baseScale * 1.05,
        duration: 180,
        ease: "Sine.easeOut",
      });
    }
    const cam = this.cameras?.main;
    if (!cam) {
      toggleEncounterOverlay(true);
      return true;
    }
    const startCenterX = cam.scrollX + cam.width / (cam.zoom || 1) / 2;
    const startCenterY = cam.scrollY + cam.height / (cam.zoom || 1) / 2;
    const panNodFactor = 0.4;
    const targetCenterX = Phaser.Math.Linear(startCenterX, unitWorld.x, panNodFactor);
    const targetCenterY = Phaser.Math.Linear(startCenterY, unitWorld.y, panNodFactor);
    const startZoom = cam.zoom || this.initialZoom || this.minZoom;
    const targetZoom = Phaser.Math.Clamp(startZoom * 1.3, this.minZoom, this.maxZoom);
    const duration = 1500;
    const cameraTrack = { progress: 0 };
    this.encounterPreviewCameraTween = this.tweens.add({
      targets: cameraTrack,
      progress: 1,
      duration,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        const t = cameraTrack.progress;
        const zoom = Phaser.Math.Linear(startZoom, targetZoom, t);
        const centerX = Phaser.Math.Linear(startCenterX, targetCenterX, t);
        const centerY = Phaser.Math.Linear(startCenterY, targetCenterY, t);
        cam.setZoom(zoom);
        cam.scrollX = centerX - (cam.width * 0.5) / cam.zoom;
        cam.scrollY = centerY - (cam.height * 0.5) / cam.zoom;
        this.clampCameraToWorld(cam);
      },
      onComplete: () => {
        cam.setZoom(targetZoom);
        cam.scrollX = targetCenterX - (cam.width * 0.5) / cam.zoom;
        cam.scrollY = targetCenterY - (cam.height * 0.5) / cam.zoom;
        this.clampCameraToWorld(cam);
      },
    });
    const dwell = 180;
    if (this.time?.delayedCall) {
      this.encounterPreviewDwell = this.time.delayedCall(duration + dwell, () => {
        this.clearEncounterPreview();
        toggleEncounterOverlay(true);
      });
    } else {
      this.encounterPreviewDwell = setTimeout(() => {
        this.clearEncounterPreview();
        toggleEncounterOverlay(true);
      }, duration + dwell);
    }
    return true;
  }
  update(time, delta) {
    // Phaser 3.60 does not schedule the next frame after an uncaught exception in the
    // step, which would freeze the map permanently. Log and keep the loop alive.
    try {
      this.runFrame(time, delta);
    } catch (err) {
      const key = String(err?.message || err);
      if (this.lastFrameErrorKey !== key) {
        this.lastFrameErrorKey = key;
        console.error("MapScene frame error", err);
      }
    }
  }
  runFrame(__, delta) {
    const dt = Math.max(0, (delta || 0) / 1000);
    if (this.isEndTurnTransitionActive) {
      this.layoutEndTurnTransitionFx();
      return;
    }
    if (!isMenuPauseActive()) this.tickSquadMovement(dt);
    this.updateUnitMarkerVitals();
    this.syncSelectionGlow();
    const activeUnit = this.getActiveRangerUnit();
    const shouldCheckSettlementOverlaps = !!activeUnit?.deployed && (!!activeUnit?.isMoving || this.pendingSettlementOverlapCheck);
    if (shouldCheckSettlementOverlaps) {
      this.settlementOverlapAccumulator += dt;
      if (this.settlementOverlapAccumulator >= 0.12 || this.pendingSettlementOverlapCheck) {
        this.settlementOverlapAccumulator = 0;
        this.pendingSettlementOverlapCheck = false;
        checkSettlementOverlaps(this.gameState, this);
      }
    } else {
      this.settlementOverlapAccumulator = 0;
    }
    if (this.gameState?.visibility?.dirty) {
      renderPhaserMap(this.gameState, this);
    }
    this.gridTileCheckAccumulator += dt;
    if (this.gridTileCheckAccumulator >= 0.25) {
      this.gridTileCheckAccumulator = 0;
      this.prefetchTiledDataForView();
    }
    this.basemapViewportCheckAccumulator += dt;
    if (this.basemapViewportCheckAccumulator >= 0.2) {
      this.basemapViewportCheckAccumulator = 0;
      this.ensureBasemapTilesForViewport(1);
    }
    this.updateBasemapGlowEffects();
  }
  updateBasemapGlowEffects() {
    if (!BASEMAP_LIGHT_ANIMATIONS.length) return;
    const width = this.worldWidth || this.scale?.width;
    const height = this.worldHeight || this.scale?.height;
    if (!width || !height) return;
    const cam = this.cameras?.main;
    if (!cam) return;
    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    for (const effect of BASEMAP_LIGHT_ANIMATIONS) {
      if (!effect?.pos) continue;
      const layout = getBasemapGlowLayout(effect, width, height);
      const shouldRender = shouldRenderBasemapGlow(effect, this, cam, layout);
      if (!shouldRender) {
        const hiddenSprite = this.basemapGlowSprites.get(effect.id);
        if (hiddenSprite) hiddenSprite.setVisible(false);
        continue;
      }
      const sprite = this.ensureBasemapGlowSprite(effect);
      if (!sprite) continue;
      if (!sprite.visible) sprite.setVisible(true);
      if (!effect._layoutApplied || effect._layoutApplied !== layout) {
        sprite.setPosition(layout.px, layout.py);
        sprite.setScale(layout.scale);
        effect._layoutApplied = layout;
      }
      sprite.setAlpha(computeBasemapGlowAlpha(effect, now));
    }
  }
  ensureBasemapGlowSprite(effect) {
    if (!effect?.id) return null;
    const textureKey = ensureBasemapGlowTexture(this);
    let sprite = this.basemapGlowSprites.get(effect.id);
    if (!sprite) {
      sprite = this.add.image(0, 0, textureKey).setOrigin(0.5);
      sprite.setBlendMode(Phaser.BlendModes.ADD);
      sprite.setDepth(typeof effect.depth === "number" ? effect.depth : BASEMAP_GLOW_DEPTH);
      sprite.setScrollFactor(1);
      sprite.setVisible(false);
      const tint = typeof effect.color === "number" ? effect.color : 0xffffff;
      sprite.setTint(tint);
      // Force the next updateBasemapGlowEffects pass to apply position/scale.
      // Without this, a stale _layoutApplied left from a previous scene short-circuits
      // the setPosition/setScale call and leaves new sprites at (0,0) / scale 1.
      effect._layoutApplied = null;
      this.basemapGlowSprites.set(effect.id, sprite);
    }
    return sprite;
  }
  handleSquadMoveCommand(pointer, wasDragging = false, wasInsideMap = false, wasOnUnit = false) {
    if (wasDragging) return;
    if (!wasInsideMap) return;
    if (!canIssueUnitMovementOrders()) return;
    const unit = this.getActiveRangerUnit();
    if (!unit?.deployed || !this.gameState?.squadSelected) return;
    if (unit?.isDead) return;
    const apLeft = typeof unit?.inventory?.ap === "number" ? unit.inventory.ap : 0;
    const gasLeft = typeof unit?.inventory?.gas === "number" ? unit.inventory.gas : 0;
    const usesGas = isVehicleUnit(unit);
    if (apLeft <= 0) {
      if (this.gameState?.logger) {
        this.gameState.logger.log("Rangers are out of action points and must rest until next turn.");
      }
      return;
    }
    if (usesGas && gasLeft <= 0) {
      if (this.gameState?.logger) {
        this.gameState.logger.log("Rangers are out of gas and cannot march.");
      }
      return;
    }
    if (this.squadSelectGuard) {
      this.squadSelectGuard = false;
      return;
    }
    const rightReleased = typeof pointer?.rightButtonReleased === "function"
      ? pointer.rightButtonReleased()
      : pointer?.event?.button === 2;
    const leftReleased = typeof pointer?.leftButtonReleased === "function"
      ? pointer.leftButtonReleased()
      : pointer?.event?.button === 0;
    if (rightReleased && !leftReleased) {
      this.gameState.squadSelected = false;
      renderMap(this.gameState);
      updateSquadWindow(this.gameState);
      return;
    }
    if (wasOnUnit) {
      // First click to reselect the unit should not issue movement.
      return;
    }
    if (!leftReleased) return;
    const cam = this.cameras?.main;
    const wx = typeof pointer.worldX === "number" ? pointer.worldX : cam ? cam.scrollX + pointer.x / cam.zoom : pointer.x;
    const wy = typeof pointer.worldY === "number" ? pointer.worldY : cam ? cam.scrollY + pointer.y / cam.zoom : pointer.y;
    const targetPct = this.worldPointToPct(wx, wy);
    if (!targetPct) return;
    if (!this.ensureUnitPosition(unit) || !unit.positionPct) return;
    unit.moveTargetPct = targetPct;
    unit.isMoving = true;
    unit.keyboardMarching = false;
    this.spawnMovePing(wx, wy);
    this.pendingSettlementOverlapCheck = true;
    this.marchUiDirty = true;
    this.marchUiAccumulator = 0; // fast UI refresh after issuing an order
  }
  tickSquadMovement(dt) {
    const state = this.gameState;
    if (!state?.rangerUnits?.length) {
      encounterOverlayState.encounterUnitId = null;
      updateEncounterTimerFromMovement(false);
      return;
    }
    const activeUnit = this.getActiveRangerUnit();
    let visibilityDirty = false;
    let activeUiDirty = false;
    let activeUiForce = false;
    for (const unit of state.rangerUnits) {
      ensureUnitTravelState(state, unit);
      if (!unit.deployed) continue;
      if (!this.ensureUnitPosition(unit)) continue;
      if (unit.isDead) {
        unit.isMoving = false;
        unit.moveTargetPct = null;
        continue;
      }
      const apLeft = typeof unit.inventory?.ap === "number" ? unit.inventory.ap : 0;
      const gasLeft = typeof unit.inventory?.gas === "number" ? unit.inventory.gas : 0;
      const usesGas = isVehicleUnit(unit);
      if (apLeft <= 0 || (usesGas && gasLeft <= 0)) {
        if (unit.moveTargetPct && state?.logger) {
          const msg = apLeft <= 0
            ? "Rangers are out of action points and halted."
            : "Rangers are out of gas and halted.";
          state.logger.log(msg);
        }
        // Only refresh the UI on the frame the unit actually stops. A unit resting at
        // 0 AP hits this branch every frame, and rebuilding the squad pane 60 times a
        // second also replaced its buttons mid-click.
        const wasMarching = !!(unit.isMoving || unit.moveTargetPct);
        unit.isMoving = false;
        unit.moveTargetPct = null;
        if (wasMarching && unit.id === activeUnit?.id) {
          activeUiDirty = true;
          activeUiForce = true;
          this.pendingSettlementOverlapCheck = true;
        }
        continue;
      }
      const targetPct = unit.moveTargetPct;
      const hasTarget = targetPct && typeof targetPct.x === "number" && typeof targetPct.y === "number";
      if (!hasTarget) {
        unit.isMoving = false;
        continue;
      }
      const currentWorld = this.pctToWorld(unit.positionPct);
      const targetWorld = this.pctToWorld(targetPct);
      if (!currentWorld || !targetWorld) continue;
      const dx = targetWorld.x - currentWorld.x;
      const dy = targetWorld.y - currentWorld.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = Math.max(0, this.getMoveSpeedForUnitAtPct(unit, unit.positionPct));
      if (dist <= 1 || speed <= 0) {
        unit.positionPct = { x: Phaser.Math.Clamp(targetPct.x, 0, 100), y: Phaser.Math.Clamp(targetPct.y, 0, 100) };
        unit.moveTargetPct = null;
        unit.isMoving = false;
        const finalCellIdx = getVisibilityCellIndexForPct(unit.positionPct, state);
        if (finalCellIdx !== unit.lastVisibilityCellIdx) {
          unit.lastVisibilityCellIdx = finalCellIdx;
          visibilityDirty = true;
        }
        if (unit.id === activeUnit?.id) {
          activeUiDirty = true;
          activeUiForce = true;
          checkSettlementOverlaps(state, this);
        }
        continue;
      }
      const maxStep = speed * dt;
      const stepRatio = Math.min(1, maxStep / dist);
      const newWorld = {
        x: currentWorld.x + dx * stepRatio,
        y: currentWorld.y + dy * stepRatio,
      };
      const nextPct = this.worldToPct(newWorld);
      if (this.isWaterPct(nextPct)) {
        unit.moveTargetPct = null;
        unit.isMoving = false;
        const waterlineCellIdx = getVisibilityCellIndexForPct(unit.positionPct, state);
        if (waterlineCellIdx !== unit.lastVisibilityCellIdx) {
          unit.lastVisibilityCellIdx = waterlineCellIdx;
          visibilityDirty = true;
        }
        if (unit.id === activeUnit?.id) {
          activeUiDirty = true;
          activeUiForce = true;
          this.pendingSettlementOverlapCheck = true;
          if (state?.logger) {
            state.logger.log("Rangers halted at the waterline.");
          }
        }
        continue;
      }
      unit.positionPct = nextPct;
      unit.isMoving = true;
      const nextCellIdx = getVisibilityCellIndexForPct(nextPct, state);
      if (nextCellIdx !== unit.lastVisibilityCellIdx) {
        unit.lastVisibilityCellIdx = nextCellIdx;
        visibilityDirty = true;
      }
      if (this.applyMoveResourceDrain(dt, unit) && unit.id === activeUnit?.id) {
        activeUiDirty = true;
      }
      if (unit.id === activeUnit?.id) {
        activeUiDirty = true;
      }
    }
    if (visibilityDirty) {
      computeVisibility(state);
    }
    this.syncMarkersToUnits();
    if (activeUnit?.isMoving) {
      this.marchUiAccumulator += dt;
    }
    if (activeUiDirty) {
      this.refreshMarchingUi(activeUiForce);
    }
    let encounterCandidateUnit = null;
    for (const u of state.rangerUnits) {
      if (u.deployed && !u.isDead && u.isMoving && !isUnitNearAnySettlement(state, u)) {
        encounterCandidateUnit = u;
        break;
      }
    }
    encounterOverlayState.encounterUnitId = encounterCandidateUnit?.id || null;
    updateEncounterTimerFromMovement(!!encounterCandidateUnit);
  }
  applyMoveResourceDrain(dt, unit) {
    if (!unit?.inventory) return false;
    const rates = BALANCING.movementDrainPerSecond || {};
    let changed = false;
    let uiChanged = false;
    const usesGas = isVehicleUnit(unit);
    for (const [key, rate] of Object.entries(rates)) {
      if (!usesGas && key === "gas") continue;
      if (typeof rate !== "number" || rate <= 0) continue;
      const before = typeof unit.inventory[key] === "number" ? unit.inventory[key] : 0;
      const after = Math.max(0, before - rate * dt);
      if (after !== before) {
        unit.inventory[key] = after;
        changed = true;
        if (Math.floor(after) !== Math.floor(before)) {
          uiChanged = true;
        }
      }
    }
    if (changed) {
      if (uiChanged) {
        this.marchUiDirty = true;
      }
      this.gameState?.checkUnitVitality(unit, "ran out of supplies while marching");
    }
    // Halt movement if action points are depleted.
    const apLeft = typeof unit.inventory.ap === "number" ? unit.inventory.ap : 0;
    if (apLeft <= 0) {
      unit.isMoving = false;
      unit.moveTargetPct = null;
      if (this.gameState?.logger) {
        this.gameState.logger.log("Rangers ran out of action points and halted.");
      }
      this.refreshMarchingUi(true);
      return true;
    }
    // Halt movement if gas is depleted.
    const gasLeft = typeof unit.inventory.gas === "number" ? unit.inventory.gas : 0;
    if (usesGas && gasLeft <= 0) {
      unit.isMoving = false;
      unit.moveTargetPct = null;
      if (this.gameState?.logger) {
        this.gameState.logger.log("Rangers ran out of gas and halted.");
      }
      this.refreshMarchingUi(true);
      return true;
    }
    return uiChanged;
  }
  getActiveRangerUnit() {
    return getActiveRangerUnit(this.gameState);
  }
  ensureUnitPosition(unit) {
    if (!unit) return false;
    const hasPosition =
      unit.positionPct && typeof unit.positionPct.x === "number" && typeof unit.positionPct.y === "number";
    if (hasPosition) return true;
    if (!unit.currentNodeId) return false;
    const node = this.gameState.nodeMap.get(unit.currentNodeId);
    if (!node?.pos) return false;
    unit.positionPct = { x: node.pos.x, y: node.pos.y };
    return true;
  }
  worldPointToPct(worldX, worldY) {
    if (!this.worldWidth || !this.worldHeight) return null;
    const wx = Phaser.Math.Clamp(typeof worldX === "number" ? worldX : 0, 0, this.worldWidth);
    const wy = Phaser.Math.Clamp(typeof worldY === "number" ? worldY : 0, 0, this.worldHeight);
    return {
      x: (wx / this.worldWidth) * 100,
      y: (wy / this.worldHeight) * 100,
    };
  }
  pctToWorld(pct) {
    if (!pct || !this.worldWidth || !this.worldHeight) return null;
    return {
      x: (pct.x / 100) * this.worldWidth,
      y: (pct.y / 100) * this.worldHeight,
    };
  }
  worldToPct(pos) {
    if (!pos || !this.worldWidth || !this.worldHeight) return null;
    return {
      x: Phaser.Math.Clamp((pos.x / this.worldWidth) * 100, 0, 100),
      y: Phaser.Math.Clamp((pos.y / this.worldHeight) * 100, 0, 100),
    };
  }
  isWaterPct(pct) {
    if (!pct || !this.waterMaskReady || !this.waterMask?.bytes) return false;
    const gx = Phaser.Math.Clamp(Math.floor((pct.x / 100) * this.waterMask.width), 0, this.waterMask.width - 1);
    const gy = Phaser.Math.Clamp(Math.floor((pct.y / 100) * this.waterMask.height), 0, this.waterMask.height - 1);
    const idx = gy * this.waterMask.width + gx;
    const byte = this.waterMask.bytes[idx >> 3];
    const bit = (byte >> (idx & 7)) & 1;
    return bit === 1;
  }
  getDemSpeedValue(pct) {
    if (!pct || !this.demGridReady) return null;
    const tiled = this.getTiledGridValue("dem-grid", pct);
    if (tiled != null) return tiled;
    if (!this.demGrid?.values) return null;
    const gx = Phaser.Math.Clamp(Math.floor((pct.x / 100) * this.demGrid.width), 0, this.demGrid.width - 1);
    const gy = Phaser.Math.Clamp(Math.floor((pct.y / 100) * this.demGrid.height), 0, this.demGrid.height - 1);
    const idx = gy * this.demGrid.width + gx;
    return this.demGrid.values[idx];
  }
  demSpeedFactorForPct(pct, multiplier = (BALANCING.demSpeedMultiplier ?? 1)) {
    const demVal = this.getDemSpeedValue(pct);
    const baseFactor = demVal == null ? 1 : Phaser.Math.Clamp(demVal / 100, 0, 1);
    const scaled = baseFactor * multiplier;
    return Phaser.Math.Clamp(scaled, 0.05, 5); // keep a small floor and a sane ceiling
  }
  getNdviSpeedValue(pct) {
    if (!pct || !this.ndviGridReady) return null;
    const tiled = this.getTiledGridValue("ndvi-grid", pct);
    if (tiled != null) return tiled;
    if (!this.ndviGrid?.values) return null;
    const gx = Phaser.Math.Clamp(Math.floor((pct.x / 100) * this.ndviGrid.width), 0, this.ndviGrid.width - 1);
    const gy = Phaser.Math.Clamp(Math.floor((pct.y / 100) * this.ndviGrid.height), 0, this.ndviGrid.height - 1);
    const idx = gy * this.ndviGrid.width + gx;
    return this.ndviGrid.values[idx];
  }
  ndviSpeedFactorForPct(pct, multiplier = (BALANCING.ndviSpeedMultiplier ?? 1)) {
    const val = this.getNdviSpeedValue(pct);
    const baseFactor = val == null ? 1 : Phaser.Math.Clamp(val / 100, 0, 1);
    const scaled = baseFactor * multiplier;
    return Phaser.Math.Clamp(scaled, 0.05, 5);
  }
  isRoadPct(pct) {
    if (!pct || !this.roadsGridReady) return false;
    const tiled = this.getTiledGridBit("roads-grid", pct);
    if (tiled != null) return tiled;
    if (!this.roadsGrid?.bytes) return false;
    const gx = Phaser.Math.Clamp(Math.floor((pct.x / 100) * this.roadsGrid.width), 0, this.roadsGrid.width - 1);
    const gy = Phaser.Math.Clamp(Math.floor((pct.y / 100) * this.roadsGrid.height), 0, this.roadsGrid.height - 1);
    const idx = gy * this.roadsGrid.width + gx;
    const byte = this.roadsGrid.bytes[idx >> 3];
    const bit = (byte >> (idx & 7)) & 1;
    return bit === 1;
  }
  ensureRoadVectorsWorld() {
    if (!this.roadsVectorsReady) return null;
    if (this.roadsVectorsTileManifest) {
      return this.ensureRoadVectorsWorldFromTiles();
    }
    if (this.roadsVectorsWorld) return this.roadsVectorsWorld;
    if (!Array.isArray(this.roadsVectors)) return null;
    if (!this.worldWidth || !this.worldHeight) return null;
    this.roadsVectorsWorld = this.roadsVectors.map((line) =>
      line
        .map((p) => {
          if (typeof p?.x !== "number" || typeof p?.y !== "number") return null;
          return { x: (p.x / 100) * this.worldWidth, y: (p.y / 100) * this.worldHeight };
        })
        .filter(Boolean)
    );
    return this.roadsVectorsWorld;
  }
  getNearestRoadPointPct(pct) {
    if (!pct) return null;
    if (this.roadsVectorsTileManifest) {
      this.ensureRoadVectorTilesForPct(pct);
    }
    const vectors = this.ensureRoadVectorsWorld();
    if (!vectors || !vectors.length) return null;
    const wx = (pct.x / 100) * (this.worldWidth || 1);
    const wy = (pct.y / 100) * (this.worldHeight || 1);
    let best = null;
    for (const line of vectors) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i];
        const b = line[i + 1];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const len2 = vx * vx + vy * vy;
        if (len2 <= 0) continue;
        const t = Phaser.Math.Clamp(((wx - a.x) * vx + (wy - a.y) * vy) / len2, 0, 1);
        const px = a.x + vx * t;
        const py = a.y + vy * t;
        const dx = px - wx;
        const dy = py - wy;
        const dist2 = dx * dx + dy * dy;
        if (!best || dist2 < best.dist2) {
          best = {
            dist2,
            world: { x: px, y: py },
            pct: { x: (px / this.worldWidth) * 100, y: (py / this.worldHeight) * 100 },
          };
        }
      }
    }
    if (!best) return null;
    return { ...best, dist: Math.sqrt(best.dist2) };
  }
  terrainSpeedFactor(pct, unit = null) {
    const weights = BALANCING.terrainSpeedWeights || { dem: 0.5, ndvi: 0.5 };
    const demW = Math.max(0, weights.dem ?? 0);
    const ndviW = Math.max(0, weights.ndvi ?? 0);
    const totalW = demW + ndviW;
    const demFactor = this.demSpeedFactorForPct(pct, getDemMultiplierForUnit(unit));
    const ndviFactor = this.ndviSpeedFactorForPct(pct, getNdviMultiplierForUnit(unit));
    if (totalW <= 0) return demFactor; // fallback
    // If one grid is missing, bias to the other.
    const hasDem = this.demGridReady && (this.demGrid?.values || this.gridTileManifests?.["dem-grid"]);
    const hasNdvi = this.ndviGridReady && (this.ndviGrid?.values || this.gridTileManifests?.["ndvi-grid"]);
    if (hasDem && !hasNdvi) return demFactor;
    if (!hasDem && hasNdvi) return ndviFactor;
    const normDemW = demW / totalW;
    const normNdviW = ndviW / totalW;
    return demFactor * normDemW + ndviFactor * normNdviW;
  }
  getMoveSpeedForUnitAtPct(unit, pct) {
    const base = Math.max(0, getUnitBaseSpeed(unit));
    const factor = this.terrainSpeedFactor(pct, unit);
    return base * factor;
  }
  getMoveSpeedAtPct(pct) {
    return this.getMoveSpeedForUnitAtPct(null, pct);
  }
  syncMarkerToSquad() {
    this.syncMarkersToUnits();
  }
  syncSelectionGlow() {
    const entry = this.getActiveMarkerEntry();
    if (!entry?.glowControl) return;
    const unit = this.getActiveRangerUnit();
    const selectedActive = this.gameState?.squadSelected && unit?.deployed && !unit?.isDead;
    const hoverActive = !!entry.hovering;
    const shouldGlow = selectedActive || hoverActive;
    for (const [id, otherEntry] of this.unitMarkers.entries()) {
      if (id === this.activeUnitId) continue;
      otherEntry?.glowControl?.disable();
    }
    if (shouldGlow) {
      entry.glowControl.enable("active");
    } else {
      entry.glowControl.disable();
    }
  }
  refreshMarchingUi(force = false) {
    if (!this.gameState) return;
    const needsUpdate = force || this.marchUiDirty;
    if (!needsUpdate) return;
    const activeUnit = getActiveRangerUnit(this.gameState);
    refreshRangerPaneScene(this.gameState);
    const squadWin = document.getElementById("squadWindow");
    if (squadWin && !squadWin.classList.contains("hidden")) {
      updateSquadWindow(this.gameState);
    }
    const mapContainer = document.getElementById("mapContainer");
    if (mapContainer && this.cameras?.main && (!activeUnit?.isMoving || force)) {
      const rect = mapContainer.getBoundingClientRect();
      renderRangeOverlay(this.gameState, rect, this.cameras.main);
    }
    this.marchUiAccumulator = 0;
    this.marchUiDirty = false;
  }
  decodeBase64ToBytes(base64) {
    if (!base64) return null;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  getViewTileBounds(padding = 1) {
    return this.getViewTileBoundsForTileSize(
      this.basemapTileSize,
      this.basemapRows,
      this.basemapCols,
      padding
    );
  }
  getViewTileBoundsForTileSize(tileSize, rowsOverride, colsOverride, padding = 1) {
    const cam = this.cameras?.main;
    if (!cam || !tileSize || !this.worldWidth || !this.worldHeight) return null;
    const view = cam.worldView || {
      x: cam.scrollX,
      y: cam.scrollY,
      width: cam.width / cam.zoom,
      height: cam.height / cam.zoom,
    };
    const cols = colsOverride || Math.ceil(this.worldWidth / tileSize);
    const rows = rowsOverride || Math.ceil(this.worldHeight / tileSize);
    const minCol = Phaser.Math.Clamp(Math.floor(view.x / tileSize) - padding, 0, cols - 1);
    const maxCol = Phaser.Math.Clamp(Math.floor((view.x + view.width) / tileSize) + padding, 0, cols - 1);
    const minRow = Phaser.Math.Clamp(Math.floor(view.y / tileSize) - padding, 0, rows - 1);
    const maxRow = Phaser.Math.Clamp(Math.floor((view.y + view.height) / tileSize) + padding, 0, rows - 1);
    return { minCol, maxCol, minRow, maxRow, rows, cols, tileSize };
  }
  prefetchTiledDataForView() {
    if (!this.basemapReady || !this.initialCameraPlaced) return;
    const gridLayers = ["dem-grid", "ndvi-grid", "roads-grid"];
    gridLayers.forEach((layer) => {
      const manifest = this.gridTileManifests?.[layer];
      if (!manifest) return;
      const bounds = this.getViewTileBoundsForTileSize(
        manifest.tileSizePx || this.basemapTileSize,
        manifest.rows,
        manifest.cols,
        1
      );
      if (!bounds) return;
      this.ensureGridTilesForView(layer, bounds);
    });
    if (this.roadsVectorsTileManifest) {
      const manifest = this.roadsVectorsTileManifest;
      const bounds = this.getViewTileBoundsForTileSize(
        manifest.tileSizePx || this.basemapTileSize,
        manifest.rows,
        manifest.cols,
        1
      );
      if (!bounds) return;
      this.ensureRoadVectorTilesForView(bounds);
    }
  }
  async loadGridManifest(layer) {
    if (this.gridTileManifests?.[layer]) return this.gridTileManifests[layer];
    try {
      const manifest = await warmJsonResource(`json-tiles/${layer}/manifest.json`);
      if (!manifest) return null;
      manifest.layer = manifest.layer || layer;
      manifest.gridWidth = manifest.gridWidth || manifest.width;
      manifest.gridHeight = manifest.gridHeight || manifest.height;
      manifest.tileSizePx = manifest.tileSizePx || manifest.tileSize || this.basemapTileSize || 1024;
      manifest.rows = manifest.rows || this.basemapRows || Math.ceil((manifest.basemapHeight || 1) / manifest.tileSizePx);
      manifest.cols = manifest.cols || this.basemapCols || Math.ceil((manifest.basemapWidth || 1) / manifest.tileSizePx);
      const tiles = Array.isArray(manifest.tiles) ? manifest.tiles : [];
      manifest.tilesByKey = new Map();
      tiles.forEach((tile) => {
        if (!tile) return;
        const key = `${tile.row},${tile.col}`;
        manifest.tilesByKey.set(key, tile);
      });
      this.gridTileManifests[layer] = manifest;
      this.gridTileCaches[layer] = this.gridTileCaches[layer] || new Map();
      this.gridTileInFlight[layer] = this.gridTileInFlight[layer] || new Map();
      return manifest;
    } catch (err) {
      return null;
    }
  }
  async loadGridTile(layer, row, col) {
    const manifest = await this.loadGridManifest(layer);
    if (!manifest) return null;
    const cache = this.gridTileCaches[layer];
    const inflight = this.gridTileInFlight[layer];
    const key = `${row},${col}`;
    if (cache?.has(key)) return cache.get(key);
    if (inflight?.has(key)) return inflight.get(key);
    const tileMeta = manifest.tilesByKey?.get(key);
    const src = tileMeta?.src || `json-tiles/${layer}/${layer}_r${row}_c${col}.json`;
    const request = (async () => {
      try {
        const json = await warmJsonResource(src);
        if (!json) return null;
        const encoding = json.encoding || manifest.encoding || "uint8";
        let tile = {
          row: json.row ?? row,
          col: json.col ?? col,
          gx: json.gx ?? tileMeta?.gx ?? 0,
          gy: json.gy ?? tileMeta?.gy ?? 0,
          width: json.width ?? tileMeta?.width ?? 0,
          height: json.height ?? tileMeta?.height ?? 0,
          encoding,
        };
        if (encoding.includes("bitmask")) {
          const bytes = this.decodeBase64ToBytes(json.data);
          if (!bytes) return null;
          tile.bytes = bytes;
        } else {
          const values = this.decodeBase64ToBytes(json.data);
          if (!values) return null;
          tile.values = values;
        }
        cache?.set(key, tile);
        return tile;
      } catch (err) {
        return null;
      } finally {
        inflight?.delete(key);
      }
    })();
    inflight?.set(key, request);
    return request;
  }
  ensureGridTilesForView(layer, bounds) {
    const manifest = this.gridTileManifests?.[layer];
    if (!manifest) return;
    const maxRow = Math.min(bounds.maxRow, manifest.rows - 1);
    const maxCol = Math.min(bounds.maxCol, manifest.cols - 1);
    const cache = this.gridTileCaches?.[layer];
    for (let row = bounds.minRow; row <= maxRow; row++) {
      for (let col = bounds.minCol; col <= maxCol; col++) {
        if (cache?.has(`${row},${col}`)) continue;
        this.loadGridTile(layer, row, col);
      }
    }
  }
  getTileIndexForPct(pct, manifest) {
    if (!pct || !manifest) return null;
    const tileSize = manifest.tileSizePx || this.basemapTileSize;
    if (!tileSize || !this.worldWidth || !this.worldHeight) return null;
    const wx = (pct.x / 100) * this.worldWidth;
    const wy = (pct.y / 100) * this.worldHeight;
    const col = Phaser.Math.Clamp(Math.floor(wx / tileSize), 0, (manifest.cols || 1) - 1);
    const row = Phaser.Math.Clamp(Math.floor(wy / tileSize), 0, (manifest.rows || 1) - 1);
    return { row, col };
  }
  getTiledGridValue(layer, pct) {
    const manifest = this.gridTileManifests?.[layer];
    if (!manifest) return null;
    const tileIndex = this.getTileIndexForPct(pct, manifest);
    if (!tileIndex) return null;
    const tile = this.gridTileCaches?.[layer]?.get(`${tileIndex.row},${tileIndex.col}`);
    if (!tile) {
      // A unit can march through terrain the camera never looked at.
      void this.loadGridTile(layer, tileIndex.row, tileIndex.col);
      return null;
    }
    if (!tile?.values || !manifest.gridWidth || !manifest.gridHeight) return null;
    const gx = Phaser.Math.Clamp(Math.floor((pct.x / 100) * manifest.gridWidth), 0, manifest.gridWidth - 1);
    const gy = Phaser.Math.Clamp(Math.floor((pct.y / 100) * manifest.gridHeight), 0, manifest.gridHeight - 1);
    const lx = gx - tile.gx;
    const ly = gy - tile.gy;
    if (lx < 0 || ly < 0 || lx >= tile.width || ly >= tile.height) return null;
    const idx = ly * tile.width + lx;
    return tile.values[idx];
  }
  getTiledGridBit(layer, pct) {
    const manifest = this.gridTileManifests?.[layer];
    if (!manifest) return null;
    const tileIndex = this.getTileIndexForPct(pct, manifest);
    if (!tileIndex) return null;
    const tile = this.gridTileCaches?.[layer]?.get(`${tileIndex.row},${tileIndex.col}`);
    if (!tile?.bytes || !manifest.gridWidth || !manifest.gridHeight) return null;
    const gx = Phaser.Math.Clamp(Math.floor((pct.x / 100) * manifest.gridWidth), 0, manifest.gridWidth - 1);
    const gy = Phaser.Math.Clamp(Math.floor((pct.y / 100) * manifest.gridHeight), 0, manifest.gridHeight - 1);
    const lx = gx - tile.gx;
    const ly = gy - tile.gy;
    if (lx < 0 || ly < 0 || lx >= tile.width || ly >= tile.height) return null;
    const idx = ly * tile.width + lx;
    const byte = tile.bytes[idx >> 3];
    const bit = (byte >> (idx & 7)) & 1;
    return bit === 1;
  }
  async loadTiledGridLayer(layer, readyFlag) {
    const manifest = await this.loadGridManifest(layer);
    if (!manifest) return false;
    if (readyFlag === "dem") this.demGridReady = true;
    if (readyFlag === "ndvi") this.ndviGridReady = true;
    if (readyFlag === "roads") this.roadsGridReady = true;
    this.prefetchTiledDataForView();
    return true;
  }
  async loadRoadsVectorsTileManifest() {
    if (this.roadsVectorsTileManifest) return this.roadsVectorsTileManifest;
    try {
      const manifest = await warmJsonResource("json-tiles/roads-vectors/manifest.json");
      if (!manifest) return null;
      manifest.tileSizePx = manifest.tileSizePx || manifest.tileSize || this.basemapTileSize || 1024;
      manifest.rows = manifest.rows || this.basemapRows || 1;
      manifest.cols = manifest.cols || this.basemapCols || 1;
      const tiles = Array.isArray(manifest.tiles) ? manifest.tiles : [];
      manifest.tilesByKey = new Map();
      tiles.forEach((tile) => {
        if (!tile) return;
        const key = `${tile.row},${tile.col}`;
        manifest.tilesByKey.set(key, tile);
      });
      this.roadsVectorsTileManifest = manifest;
      return manifest;
    } catch (err) {
      return null;
    }
  }
  async loadRoadsVectorTile(row, col) {
    const manifest = await this.loadRoadsVectorsTileManifest();
    if (!manifest) return null;
    const key = `${row},${col}`;
    if (this.roadsVectorsTiles.has(key)) return this.roadsVectorsTiles.get(key);
    const tileMeta = manifest.tilesByKey?.get(key);
    const src = tileMeta?.src || `json-tiles/roads-vectors/roads-vectors_r${row}_c${col}.json`;
    try {
      const json = await warmJsonResource(src);
      if (!json?.lines || !Array.isArray(json.lines)) return null;
      this.roadsVectorsTiles.set(key, json.lines);
      this.roadsVectorsTilesVersion += 1;
      return json.lines;
    } catch (err) {
      return null;
    }
  }
  ensureRoadVectorTilesForView(bounds) {
    const manifest = this.roadsVectorsTileManifest;
    if (!manifest) return;
    const maxRow = Math.min(bounds.maxRow, manifest.rows - 1);
    const maxCol = Math.min(bounds.maxCol, manifest.cols - 1);
    for (let row = bounds.minRow; row <= maxRow; row++) {
      for (let col = bounds.minCol; col <= maxCol; col++) {
        this.loadRoadsVectorTile(row, col);
      }
    }
  }
  ensureRoadVectorTilesForPct(pct) {
    const manifest = this.roadsVectorsTileManifest;
    if (!manifest) return false;
    const tileIndex = this.getTileIndexForPct(pct, manifest);
    if (!tileIndex) return false;
    const key = `${tileIndex.row},${tileIndex.col}`;
    if (this.roadsVectorsTiles.has(key)) return true;
    this.loadRoadsVectorTile(tileIndex.row, tileIndex.col);
    return false;
  }
  ensureRoadVectorsWorldFromTiles() {
    if (!this.roadsVectorsTileManifest) return null;
    if (!this.worldWidth || !this.worldHeight) return null;
    if (this.roadsVectorsWorldVersion === this.roadsVectorsTilesVersion && this.roadsVectorsWorld) {
      return this.roadsVectorsWorld;
    }
    const combined = [];
    for (const lines of this.roadsVectorsTiles.values()) {
      if (!Array.isArray(lines)) continue;
      lines.forEach((line) => {
        if (!Array.isArray(line)) return;
        const worldLine = line
          .map((p) => {
            if (typeof p?.x !== "number" || typeof p?.y !== "number") return null;
            return { x: (p.x / 100) * this.worldWidth, y: (p.y / 100) * this.worldHeight };
          })
          .filter(Boolean);
        if (worldLine.length) combined.push(worldLine);
      });
    }
    this.roadsVectorsWorld = combined;
    this.roadsVectorsWorldVersion = this.roadsVectorsTilesVersion;
    return combined;
  }
  async loadWaterMaskGrid() {
    try {
      const json = await warmJsonResource("watermask-grid.json");
      if (!json?.data || !json.width || !json.height) return;
      const binary = atob(json.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      this.waterMask = {
        width: json.width,
        height: json.height,
        bytes,
      };
      this.waterMaskReady = true;
    } catch (err) {
      console.warn("Failed to load water mask grid", err);
    }
  }
  async loadNdviGrid() {
    try {
      const tiled = await this.loadTiledGridLayer("ndvi-grid", "ndvi");
      if (tiled) return;
      const json = await warmJsonResource("ndvi-grid.json");
      if (!json?.data || !json.width || !json.height) return;
      const binary = atob(json.data);
      const values = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        values[i] = binary.charCodeAt(i);
      }
      this.ndviGrid = {
        width: json.width,
        height: json.height,
        values,
      };
      this.ndviGridReady = true;
    } catch (err) {
      console.warn("Failed to load NDVI grid", err);
    }
  }
  async loadRoadsGrid() {
    if (!ROADS_FEATURE_ENABLED) return null;
    try {
      const tiled = await this.loadTiledGridLayer("roads-grid", "roads");
      if (tiled) return;
      const json = await warmJsonResource("roads-grid.json");
      if (!json?.data || !json.width || !json.height) return;
      const binary = atob(json.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      this.roadsGrid = {
        width: json.width,
        height: json.height,
        bytes,
      };
      this.roadsGridReady = true;
    } catch (err) {
      console.warn("Failed to load roads grid", err);
    }
  }
  async loadRoadsVectors() {
    if (!ROADS_FEATURE_ENABLED) return null;
    try {
      const manifest = await this.loadRoadsVectorsTileManifest();
      if (manifest) {
        this.roadsVectorsReady = true;
        this.roadsVectorsWorld = null;
        this.prefetchTiledDataForView();
        return;
      }
      const json = await warmJsonResource("roads-vectors.json");
      if (!json?.lines || !Array.isArray(json.lines)) return;
      this.roadsVectors = json.lines;
      this.roadsVectorsReady = true;
      this.roadsVectorsWorld = null; // reset cache
    } catch (err) {
      console.warn("Failed to load roads vectors", err);
    }
  }
  async loadDemGrid() {
    try {
      const tiled = await this.loadTiledGridLayer("dem-grid", "dem");
      if (tiled) return;
      const json = await warmJsonResource("dem-grid.json");
      if (!json?.data || !json.width || !json.height) return;
      const binary = atob(json.data);
      const values = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        values[i] = binary.charCodeAt(i);
      }
      this.demGrid = {
        width: json.width,
        height: json.height,
        values,
      };
      this.demGridReady = true;
    } catch (err) {
      console.warn("Failed to load DEM grid", err);
    }
  }
  handleDevMapProbe(pointer, wasDragging = false) {
    if (!this.gameState?.dev?.clickProbeEnabled) return;
    if (wasDragging) return;
    if (!this.worldWidth || !this.worldHeight) return;
    const worldX = Phaser.Math.Clamp(pointer.worldX ?? pointer.x, 0, this.worldWidth);
    const worldY = Phaser.Math.Clamp(pointer.worldY ?? pointer.y, 0, this.worldHeight);
    const pctX = Phaser.Math.Clamp((worldX / this.worldWidth) * 100, 0, 100);
    const pctY = Phaser.Math.Clamp((worldY / this.worldHeight) * 100, 0, 100);
    const vis = this.gameState?.visibility;
    const cell = pctToCell({ x: pctX, y: pctY }, vis);
    const visible = isPctVisible({ x: pctX, y: pctY }, this.gameState);
    const explored = isPctExplored({ x: pctX, y: pctY }, this.gameState);
    this.gameState.dev.lastMapClick = { x: pctX, y: pctY, cell, visible, explored };
    updateDevPanel(this.gameState);
    const visTag = visible ? "visible" : explored ? "seen" : "unknown";
    const cellText = cell ? ` cell ${cell.cx},${cell.cy}` : "";
    this.gameState.logger.log(`Map click at ${pctX.toFixed(2)}%, ${pctY.toFixed(2)}% (${visTag}${cellText}).`);
  }
  handleDevTeleport(pointer, wasDragging = false, wasInsideMap = false, wasOnUnit = false) {
    if (!this.gameState?.dev?.teleportArmed) return false;
    if (wasDragging || !wasInsideMap) return false;
    if (wasOnUnit) return false;
    const leftReleased = typeof pointer?.leftButtonReleased === "function"
      ? pointer.leftButtonReleased()
      : pointer?.event?.button === 0;
    if (!leftReleased) return false;
    const unit = this.getActiveRangerUnit();
    if (!unit || unit.isDead || !unit.deployed) {
      this.gameState.dev.teleportArmed = false;
      if (this.gameState.logger) {
        this.gameState.logger.log("Teleport canceled; no active deployed unit.");
      }
      updateDevPanel(this.gameState);
      return true;
    }
    const cam = this.cameras?.main;
    const wx = typeof pointer.worldX === "number" ? pointer.worldX : cam ? cam.scrollX + pointer.x / cam.zoom : pointer.x;
    const wy = typeof pointer.worldY === "number" ? pointer.worldY : cam ? cam.scrollY + pointer.y / cam.zoom : pointer.y;
    const targetPct = this.worldPointToPct(wx, wy);
    if (!targetPct) return false;
    unit.positionPct = { x: targetPct.x, y: targetPct.y };
    unit.moveTargetPct = null;
    unit.isMoving = false;
    if (this.gameState.refreshVisibility) {
      this.gameState.refreshVisibility();
    } else if (this.gameState.visibility) {
      this.gameState.visibility.dirty = true;
    }
    this.spawnMovePing(wx, wy);
    this.pendingSettlementOverlapCheck = true;
    this.marchUiDirty = true;
    this.marchUiAccumulator = 0;
    this.gameState.dev.teleportArmed = false;
    updateDevPanel(this.gameState);
    updateSquadWindow(this.gameState);
    renderMap(this.gameState);
    this.syncMarkersToUnits();
    if (this.gameState.logger) {
      const label = unit.callsign || "selected unit";
      this.gameState.logger.log(`Teleported ${label} to ${targetPct.x.toFixed(2)}%, ${targetPct.y.toFixed(2)}%.`);
    }
    return true;
  }
  getViewSize(gameSize = {}) {
    const container = document.getElementById("phaserContainer");
    const width = Math.max(200, container?.clientWidth || gameSize.width || this.scale.width || this.worldWidth);
    const height = Math.max(200, container?.clientHeight || gameSize.height || this.scale.height || this.worldHeight);
    return { width, height };
  }
  async loadBasemapTiled() {
    recordTransitionEvent("basemapTiled:load:start");
    const manifest = await fetchBasemapManifest();
    if (manifest) {
      recordTransitionEvent("basemapTiled:manifest:ready");
      return this.loadTilesFromManifest(manifest);
    }
    console.warn("Basemap manifest missing; tiles-only mode requires basemap-tiles/manifest.json.");
    recordTransitionEvent("basemapTiled:manifest:missing");
    this.clearBasemapTiles();
    this.worldWidth = this.worldWidth || this.scale.width || 2000;
    this.worldHeight = this.worldHeight || this.scale.height || 1000;
    return { width: this.worldWidth, height: this.worldHeight };
  }
  clearBasemapTiles() {
    this.backgroundTiles.forEach((tile) => tile.destroy());
    this.backgroundTiles = [];
    const keys = this.textures.getTextureKeys().filter((k) => k.startsWith("basemap_tile_"));
    keys.forEach((k) => this.textures.remove(k));
    this.basemapTileMetaByKey.clear();
    this.basemapTilesByKey.clear();
    this.basemapTileInFlight.clear();
    this.basemapTilePromises.clear();
    this.basemapStartupGate = null;
    this.basemapBackgroundWarmQueued = false;
  }
  getBasemapTileKey(row, col) {
    return getBasemapTileKeyStatic(row, col);
  }
  getBasemapTileRange(padding = 1) {
    const cam = this.cameras?.main;
    const tileSize = this.basemapTileSize;
    if (!cam || !tileSize || !this.worldWidth || !this.worldHeight) return null;
    const view = cam.worldView;
    const cols = this.basemapCols || Math.ceil(this.worldWidth / tileSize);
    const rows = this.basemapRows || Math.ceil(this.worldHeight / tileSize);
    const minCol = Phaser.Math.Clamp(Math.floor(view.x / tileSize) - padding, 0, cols - 1);
    const maxCol = Phaser.Math.Clamp(Math.floor((view.x + view.width) / tileSize) + padding, 0, cols - 1);
    const minRow = Phaser.Math.Clamp(Math.floor(view.y / tileSize) - padding, 0, rows - 1);
    const maxRow = Phaser.Math.Clamp(Math.floor((view.y + view.height) / tileSize) + padding, 0, rows - 1);
    return { minCol, maxCol, minRow, maxRow, rows, cols, tileSize };
  }
  getBasemapDeferredTilesNearViewport(padding = BASEMAP_BACKGROUND_WARM_PADDING, limit = BASEMAP_BACKGROUND_WARM_BATCH_SIZE) {
    const range = this.getBasemapTileRange(padding);
    if (!range) return [];
    const centerRow = (range.minRow + range.maxRow) * 0.5;
    const centerCol = (range.minCol + range.maxCol) * 0.5;
    const deferred = [];
    for (let row = range.minRow; row <= range.maxRow; row++) {
      for (let col = range.minCol; col <= range.maxCol; col++) {
        const key = this.getBasemapTileKey(row, col);
        if (this.basemapTilesByKey.has(key) || this.basemapTilePromises.has(key)) continue;
        deferred.push({
          row,
          col,
          distance: Math.abs(row - centerRow) + Math.abs(col - centerCol),
        });
      }
    }
    deferred.sort((a, b) => a.distance - b.distance);
    return deferred.slice(0, Math.max(0, limit)).map(({ row, col }) => ({ row, col }));
  }
  getBasemapStartupGate() {
    if (this.basemapStartupGate) return this.basemapStartupGate;
    let resolveReady;
    const readyPromise = new Promise((resolve) => {
      resolveReady = resolve;
    });
    const gate = {
      requiredKeys: new Set(),
      readyPromise,
      resolveReady,
      released: false,
      finishing: false,
    };
    this.basemapStartupGate = gate;
    // If a required tile never loads, open the map anyway; missing tiles keep retrying.
    setTimeout(() => {
      if (this.basemapStartupGate !== gate || gate.released || gate.finishing) return;
      console.warn("Basemap startup gate timed out; continuing without all startup tiles.");
      void this.finishBasemapStartupGate();
    }, BASEMAP_STARTUP_GATE_TIMEOUT_MS);
    return gate;
  }
  refreshInitialBasemapRequirement(padding = BASEMAP_STARTUP_VIEW_PADDING) {
    const gate = this.getBasemapStartupGate();
    const requirement = this.basemapManifest
      ? computeInitialBasemapRequirement(this.basemapManifest, {
          padding,
          viewSize: this.getViewSize({ width: this.scale?.width, height: this.scale?.height }),
          homePct: this.gameState?.nodeMap?.get("home")?.pos || getStartupHomePositionPct(),
          zoomMultiplier: this.zoomMultiplier,
          maxZoom: this.maxZoom,
        })
      : null;
    if (!requirement?.requiredKeys?.length) return gate;
    gate.requiredKeys = new Set(requirement.requiredKeys);
    const metrics = getTransitionMetrics();
    if (metrics) {
      metrics.initialRequiredTileCount = gate.requiredKeys.size;
      metrics.initialRequiredTileKeys = Array.from(gate.requiredKeys).sort();
    }
    return gate;
  }
  async finishBasemapStartupGate() {
    const gate = this.basemapStartupGate;
    if (!gate || gate.released || gate.finishing) return;
    gate.finishing = true;
    recordTransitionEvent("basemapStartupGate:finish:start", { requiredKeyCount: gate.requiredKeys.size });
    markTransitionTime("initialTilesReadyAt");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const mapContainer = document.getElementById("mapContainer");
    if (mapContainer) {
      mapContainer.classList.remove("basemap-pending");
    }
    markTransitionTime("initialGateReleasedAt");
    gate.released = true;
    if (typeof gate.resolveReady === "function") {
      gate.resolveReady();
    }
    this.markSessionReady();
    playLoadingOverlayOutro();
    this.queueBasemapBackgroundWarmup();
  }
  resolveBasemapStartupGateIfReady() {
    const gate = this.basemapStartupGate;
    if (!gate || gate.released || !gate.requiredKeys.size) return;
    for (const key of gate.requiredKeys) {
      if (!this.basemapTilesByKey.has(key)) return;
    }
    void this.finishBasemapStartupGate();
  }
  attachBasemapTile(tileMeta, img) {
    if (!tileMeta || !img) return null;
    const key = this.getBasemapTileKey(tileMeta.row, tileMeta.col);
    if (this.basemapTilesByKey.has(key)) {
      return this.basemapTilesByKey.get(key);
    }
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addImage(key, img);
    const sprite = this.add.image((tileMeta.col ?? 0) * this.basemapTileSize, (tileMeta.row ?? 0) * this.basemapTileSize, key)
      .setOrigin(0, 0)
      .setDepth(-1);
    this.backgroundTiles.push(sprite);
    this.basemapTilesByKey.set(key, sprite);
    this.fogNeedsRedraw = true;
    if (this.gameState && !this.deferBasemapRenderRefresh) {
      renderPhaserMap(this.gameState, this);
    }
    const metrics = getTransitionMetrics();
    if (metrics && BASEMAP_SESSION_CACHE.warmedKeys.has(key)) {
      metrics.warmCacheUsed = true;
    }
    this.resolveBasemapStartupGateIfReady();
    return sprite;
  }
  ensureBasemapTileLoaded(row, col) {
    const key = this.getBasemapTileKey(row, col);
    if (this.basemapTilesByKey.has(key)) {
      this.resolveBasemapStartupGateIfReady();
      return Promise.resolve(this.basemapTilesByKey.get(key));
    }
    if (this.basemapTilePromises.has(key)) {
      return this.basemapTilePromises.get(key);
    }
    const tileMeta = this.basemapTileMetaByKey.get(key);
    if (!tileMeta) return Promise.resolve(null);
    this.basemapTileInFlight.add(key);
    const promise = getCachedBasemapImage(tileMeta, {
      onWarmHit: () => {
        const metrics = getTransitionMetrics();
        if (metrics) {
          metrics.warmCacheHits = (metrics.warmCacheHits || 0) + 1;
        }
      },
    })
      .then((img) => this.attachBasemapTile(tileMeta, img))
      .catch((err) => {
        console.warn("Failed to load basemap tile", key, err);
        return null;
      })
      .finally(() => {
        this.basemapTileInFlight.delete(key);
        this.basemapTilePromises.delete(key);
      });
    this.basemapTilePromises.set(key, promise);
    return promise;
  }
  queueBasemapTileLoad(row, col) {
    void this.ensureBasemapTileLoaded(row, col);
  }
  ensureBasemapTilesForViewport(padding = 1) {
    const range = this.getBasemapTileRange(padding);
    if (!range) return;
    for (let r = range.minRow; r <= range.maxRow; r++) {
      for (let c = range.minCol; c <= range.maxCol; c++) {
        this.queueBasemapTileLoad(r, c);
      }
    }
  }
  async ensureBasemapTileBatchLoaded(tileEntries, concurrency = BASEMAP_INITIAL_LOAD_CONCURRENCY) {
    const tiles = Array.isArray(tileEntries) ? tileEntries.filter(Boolean) : [];
    if (!tiles.length) return [];
    const workerCount = Math.min(Math.max(1, concurrency), tiles.length);
    let nextIndex = 0;
    this.deferBasemapRenderRefresh = true;
    try {
      const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < tiles.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          const tile = tiles[currentIndex];
          await this.ensureBasemapTileLoaded(tile.row, tile.col);
        }
      });
      await Promise.all(workers);
    } finally {
      this.deferBasemapRenderRefresh = false;
    }
    if (this.gameState) {
      renderPhaserMap(this.gameState, this);
    }
    return tiles;
  }
  queueBasemapBackgroundWarmup() {
    if (this.basemapBackgroundWarmQueued || !this.basemapTileList.length) return;
    this.basemapBackgroundWarmQueued = true;
    scheduleBasemapWarmupTask(async () => {
      const nextTiles = this.getBasemapDeferredTilesNearViewport(
        BASEMAP_BACKGROUND_WARM_PADDING,
        BASEMAP_BACKGROUND_WARM_BATCH_SIZE
      );
      await Promise.all(
        nextTiles.map((tile) => this.ensureBasemapTileLoaded(tile.row, tile.col))
      );
      this.basemapBackgroundWarmQueued = false;
      if (this.getBasemapDeferredTilesNearViewport(BASEMAP_BACKGROUND_WARM_PADDING, 1).length) {
        this.queueBasemapBackgroundWarmup();
      }
    }, 0);
  }
  async loadTilesFromManifest(manifest) {
    this.clearBasemapTiles();
    this.worldWidth = manifest.width;
    this.worldHeight = manifest.height;
    this.fogNeedsRedraw = true;
    if (this.gameState?.visibility) {
      this.gameState.visibility.dirty = true;
    }
    const layout = getBasemapTileLayout(manifest);
    const tileSize = layout?.tileSize || 1024;
    const rows = layout?.rows || 1;
    const cols = layout?.cols || 1;
    this.basemapTileSize = tileSize;
    this.basemapRows = rows;
    this.basemapCols = cols;
    this.basemapManifest = manifest;
    if (this.cameras?.main) {
      this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
      const view = this.getViewSize({ width: this.scale?.width, height: this.scale?.height });
      this.updateZoomSettings(view.width, view.height, { clampCamera: true });
      if (!this.userAdjustedCamera) {
        this.focusCameraOnHome({ setZoom: true });
      }
    }
    if (this.gameState) {
      renderPhaserMap(this.gameState, this);
    }

    const homePos = this.gameState?.nodeMap?.get("home")?.pos;
    const focus = homePos
      ? { x: (homePos.x / 100) * this.worldWidth, y: (homePos.y / 100) * this.worldHeight }
      : { x: this.worldWidth / 2, y: this.worldHeight / 2 };

    const tiles = (manifest.tiles && manifest.tiles.length
      ? manifest.tiles
      : (() => {
          const entries = [];
          const prefix = manifest.prefix || "basemap-tiles/basemap";
          const ext = manifest.ext || "jpg";
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              entries.push({
                row: r,
                col: c,
                src: `${prefix}_r${r}_c${c}.${ext}`,
              });
            }
          }
          return entries;
        })()
    ).map((t) => {
      const src = normalizeBasemapSrc(t.src || "");
      const cx = (t.col ?? 0) * tileSize + tileSize * 0.5;
      const cy = (t.row ?? 0) * tileSize + tileSize * 0.5;
      const dist = Math.hypot(cx - focus.x, cy - focus.y);
      return { ...t, src, dist };
    }).sort((a, b) => a.dist - b.dist);
    this.basemapTileList = tiles;
    this.basemapTileMetaByKey = new Map();
    this.basemapTileList.forEach((tile) => {
      this.basemapTileMetaByKey.set(this.getBasemapTileKey(tile.row, tile.col), tile);
    });

    const requirement = computeInitialBasemapRequirement(manifest, {
      padding: BASEMAP_STARTUP_VIEW_PADDING,
      viewSize: this.getViewSize({ width: this.scale?.width, height: this.scale?.height }),
      homePct: homePos || getStartupHomePositionPct(),
      zoomMultiplier: this.zoomMultiplier,
      maxZoom: this.maxZoom,
    });
    const gate = this.getBasemapStartupGate();
    if (requirement?.requiredKeys?.length) {
      requirement.requiredKeys.forEach((key) => gate.requiredKeys.add(key));
    } else {
      this.refreshInitialBasemapRequirement(BASEMAP_STARTUP_VIEW_PADDING);
    }
    if (!gate.requiredKeys.size && tileSize) {
      const homeCol = Math.max(0, Math.min(cols - 1, Math.floor(focus.x / tileSize)));
      const homeRow = Math.max(0, Math.min(rows - 1, Math.floor(focus.y / tileSize)));
      gate.requiredKeys.add(this.getBasemapTileKey(homeRow, homeCol));
    }
    const startupTiles = Array.from(gate.requiredKeys)
      .map((key) => this.basemapTileMetaByKey.get(key))
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist);
    const metrics = getTransitionMetrics();
    if (metrics) {
      metrics.initialRequiredTileCount = gate.requiredKeys.size;
      metrics.initialRequiredTileKeys = Array.from(gate.requiredKeys).sort();
    }
    await this.ensureBasemapTileBatchLoaded(startupTiles, BASEMAP_INITIAL_LOAD_CONCURRENCY);
    this.resolveBasemapStartupGateIfReady();
    return { width: manifest.width, height: manifest.height };
  }
  updateZoomSettings(viewWidth, viewHeight, options = {}) {
    if (!viewWidth || !viewHeight || !this.worldWidth || !this.worldHeight) return;
    const coverZoom = Math.max(viewWidth / this.worldWidth, viewHeight / this.worldHeight);
    // Prevent zooming out so far that the map becomes smaller than the viewport on any edge.
    const minZoom = Math.max(0.05, coverZoom, CAMERA_MIN_ZOOM);
    this.minZoom = minZoom;
    const maxZoom = this.maxZoom || 2.5;
    const baseZoom = coverZoom;
    const targetZoom = Phaser.Math.Clamp(baseZoom * (this.zoomMultiplier || 3.2), minZoom, maxZoom);
    this.initialZoom = targetZoom;
    if (options.clampCamera && this.cameras?.main) {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom, minZoom, maxZoom));
    }
  }
  clampCameraToWorld(cam) {
    if (!cam || !this.worldWidth || !this.worldHeight) return;
    if (cam.useBounds && typeof cam.clampX === "function" && typeof cam.clampY === "function") {
      // The camera zooms about its centre, so the valid scroll range shifts with zoom.
      cam.scrollX = cam.clampX(cam.scrollX);
      cam.scrollY = cam.clampY(cam.scrollY);
      return;
    }
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const maxScrollX = Math.max(0, this.worldWidth - viewW);
    const maxScrollY = Math.max(0, this.worldHeight - viewH);
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, maxScrollX);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, maxScrollY);
  }
  getWorldPointFromPointer(pointer, cam) {
    if (!pointer || !cam) return null;
    if (typeof pointer.worldX === "number" && typeof pointer.worldY === "number") {
      return { x: pointer.worldX, y: pointer.worldY };
    }
    if (typeof pointer.x === "number" && typeof pointer.y === "number") {
      const pt = cam.getWorldPoint(pointer.x, pointer.y);
      return { x: pt.x, y: pt.y };
    }
    return null;
  }
  zoomTo(targetZoom, pointer, options = {}) {
    if (this.isEndTurnTransitionActive) return;
    const cam = this.cameras?.main;
    if (!cam) return;
    const zoom = Phaser.Math.Clamp(targetZoom, this.minZoom, this.maxZoom);
    const mode = options.mode || this.zoomMode || "phaser";
    const viewportX = cam.viewport?.x || 0;
    const viewportY = cam.viewport?.y || 0;
    const pointerForAnchor =
      pointer ||
      (options.useCenterFallback
        ? { x: viewportX + cam.width / 2, y: viewportY + cam.height / 2 }
        : null);
    if (mode === "anchored" && pointerForAnchor) {
      const worldPoint = this.getWorldPointFromPointer(pointerForAnchor, cam);
      if (worldPoint) {
        const offsetX = (pointerForAnchor.x || 0) - viewportX;
        const offsetY = (pointerForAnchor.y || 0) - viewportY;
        cam.setZoom(zoom);
        cam.scrollX = worldPoint.x - offsetX / cam.zoom;
        cam.scrollY = worldPoint.y - offsetY / cam.zoom;
        this.clampCameraToWorld(cam);
        this.userAdjustedCamera = true;
        return;
      }
    }
    cam.setZoom(zoom);
    this.clampCameraToWorld(cam);
    this.userAdjustedCamera = true;
  }
  getHomeWorldPosition() {
    const home = this.gameState?.nodeMap?.get("home");
    if (!home) return null;
    return {
      x: (home.pos.x / 100) * this.worldWidth,
      y: (home.pos.y / 100) * this.worldHeight,
    };
  }
  focusCameraOnHome(options = {}) {
    const cam = this.cameras?.main;
    if (!cam) return;
    const homePos = this.getHomeWorldPosition();
    if (homePos) {
      cam.centerOn(homePos.x, homePos.y);
    } else {
      cam.centerOn(this.worldWidth / 2, this.worldHeight / 2);
    }
    if (options.setZoom) {
      const targetZoom = Phaser.Math.Clamp(options.zoom ?? this.initialZoom, this.minZoom, this.maxZoom);
      cam.setZoom(targetZoom);
    }
    this.initialCameraPlaced = true;
  }
  focusCameraOnUnit(unit, options = {}) {
    const cam = this.cameras?.main;
    if (!cam || !unit) return;
    const pos = getUnitPositionPct(this.gameState, unit);
    if (!pos) return;
    const wx = (pos.x / 100) * this.worldWidth;
    const wy = (pos.y / 100) * this.worldHeight;
    cam.centerOn(wx, wy);
    if (options.setZoom) {
      const targetZoom = Phaser.Math.Clamp(options.zoom ?? this.initialZoom, this.minZoom, this.maxZoom);
      cam.setZoom(targetZoom);
    }
    this.initialCameraPlaced = true;
  }
    handleResize(gameSize) {
      if (!this.cameras?.main) return;
      const container = document.getElementById("phaserContainer");
      const mapContainer = document.getElementById("mapContainer");
      const viewSize = this.getViewSize(gameSize || {});
      this.cameras.main.setViewport(0, 0, viewSize.width, viewSize.height);
      this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
      this.updateZoomSettings(viewSize.width, viewSize.height, { clampCamera: true });
      if (!this.initialCameraPlaced) {
        this.focusCameraOnHome({ setZoom: true });
      }
    if (this.background) {
      this.background.setDisplaySize(this.worldWidth, this.worldHeight);
    }
    this.layoutEndTurnTransitionFx();
    this.fogNeedsRedraw = true;
    if (this.gameState?.visibility) {
      this.gameState.visibility.dirty = true;
    }
    if (this.basemapStartupGate && !this.basemapStartupGate.released) {
      this.refreshInitialBasemapRequirement(BASEMAP_STARTUP_VIEW_PADDING);
      for (const key of this.basemapStartupGate.requiredKeys) {
        const tile = this.basemapTileMetaByKey.get(key);
        if (tile) this.queueBasemapTileLoad(tile.row, tile.col);
      }
      this.resolveBasemapStartupGateIfReady();
    }
    renderPhaserMap(this.gameState, this);
    positionCommandPane(this);
    if (mapContainer) {
      const rect = mapContainer.getBoundingClientRect();
      if (rect) {
        renderRangeOverlay(this.gameState, rect, this.cameras.main);
      }
    }
  }
  refresh(state) {
    if (!this.ready) return;
    this.gameState = state;
    this.fogNeedsRedraw = true;
    this.syncMarkersToUnits();
    renderPhaserMap(state, this);
  }

  tryPlaceSmallSettlements() {
    if (this.smallSettlementsPlaced) {
      this.renderSmallSettlements();
      return;
    }
    if (!this.basemapReady || !this.waterMaskReady) return;
    const frames = (this.atlasFrames && this.atlasFrames.settlementsSmall) || [];
    if (!frames.length) return;
    const count = Math.max(runtimeSmallSettlementCount, 0);
    const framePool = shuffleArray(frames);
    const positions = this.generateSmallSettlementPositions(
      count,
      SMALL_SETTLEMENT_MIN_GAP,
      SMALL_SETTLEMENT_MIN_GAP_TO_LARGE
    );
    if (!positions.length) return;
    const names = buildSmallSettlementNames(count);
    const settlements = positions.map((pos, idx) => new SmallSettlement({
      id: `small-settlement-${idx}`,
      frame: framePool[idx % framePool.length],
      pos,
      owner: "neutral",
      name: names[idx] || "",
    }));
    this.smallSettlements = settlements;
    if (this.gameState) {
      this.gameState.smallSettlements = settlements;
    }
    this.smallSettlementsPlaced = true;
    this.renderSmallSettlements();
  }

  ensureDamsReady() {
    if (this.dams && this.dams.length) return;
    const baseDams = (this.gameState?.dams && this.gameState.dams.length) ? this.gameState.dams : DAM_PRESETS;
    const frames = (this.atlasFrames && this.atlasFrames.dams) || [];
    const framePool = frames.length ? [...frames] : ["__BASE"];
    const pickFrame = (idx) => (framePool.length ? framePool[idx % framePool.length] : frames[idx % Math.max(1, frames.length)] || "__BASE");
    this.dams = baseDams.map((dam, idx) => ({
      ...deepClone(dam),
      frame: pickFrame(idx),
    }));
    if (this.gameState) {
      this.gameState.dams = this.dams;
    }
  }

  generateSmallSettlementPositions(
    targetCount = runtimeSmallSettlementCount,
    minGap = SMALL_SETTLEMENT_MIN_GAP,
    minGapToLarge = SMALL_SETTLEMENT_MIN_GAP_TO_LARGE
  ) {
    const placements = [];
    const largeNodes = (this.gameState?.nodes || []).filter((n) => n?.pos);
    let gap = minGap;
    let gapLarge = minGapToLarge;
    let stage = 0;
    const maxStage = 4; // progressively relax spacing up to 4 times
    while (placements.length < targetCount && stage <= maxStage) {
      const maxAttempts = Math.max(200, targetCount * 300);
      let attempts = 0;
      while (placements.length < targetCount && attempts < maxAttempts) {
        attempts += 1;
        const candidate = { x: Math.random() * 100, y: Math.random() * 100 };
        if (this.isWaterPct(candidate)) continue;
        const strictAxisSpacing = stage < 2;
        const tooCloseSmall = placements.some((pos) => {
          const nearX = Math.abs(pos.x - candidate.x) < gap;
          const nearY = Math.abs(pos.y - candidate.y) < gap;
          return strictAxisSpacing ? (nearX || nearY) : (nearX && nearY);
        });
        if (tooCloseSmall) continue;
        const tooCloseLarge = largeNodes.some((node) => {
          const dx = node.pos.x - candidate.x;
          const dy = node.pos.y - candidate.y;
          const dist = Math.hypot(dx, dy);
          return dist < gapLarge;
        });
        if (tooCloseLarge) continue;
        placements.push(candidate);
      }
      if (placements.length >= targetCount) break;
      // Relax spacing and try again.
      gap = Math.max(2, gap * 0.75);
      gapLarge = Math.max(4, gapLarge * 0.8);
      stage += 1;
    }
    if (placements.length < targetCount) {
      console.warn(
        `Only placed ${placements.length}/${targetCount} small settlements (spacing relaxed to ${gap.toFixed(
          1
        )}% / ${gapLarge.toFixed(1)}%).`
      );
    }
    return placements;
  }

  renderSmallSettlements(markerCircle, overlapCircle = null, overlapCallback, unitBounds = null) {
    if (!this.smallSettlements?.length) return;
    if (!this.smallSettlementVisuals) this.smallSettlementVisuals = new Map();
    const desiredScale = getSmallSettlementScale();
    const liveIds = new Set();
    const state = this.gameState || {};
    const fogState = state;
    const markerCtx = markerCircle === undefined ? getMarkerHitContext(state, this) : { markerCircle };
    const markerOverlapCircle = markerCtx.markerCircle || null;
    const ghostAlpha = fogSetting("ghostAlpha");
    this.smallSettlements.forEach((settlement) => {
      const pos = this.pctToWorld(settlement.pos);
      if (!pos) return;
      liveIds.add(settlement.id);
      let visual = this.smallSettlementVisuals.get(settlement.id);
      if (!visual) {
        visual = ensureSmallSettlementVisual(this, settlement);
        this.smallSettlementVisuals.set(settlement.id, visual);
      }
      if (!visual) return;
      if (!visual.settlementIcon) visual.settlementIcon = visual.icon || visual.settlementIcon;
      const { container, icon, nameText, ownerText, circle } = visual;
      const explored = isPctExplored(settlement.pos, fogState);
      if (!explored) {
        if (icon.input) icon.input.enabled = false;
        container.setVisible(false);
        return;
      }
      const isVisible = isPctVisible(settlement.pos, fogState);
      if (isVisible) {
        settlement.lastKnownOwner = settlement.owner;
      }
      const ownerForTint = isVisible ? settlement.owner : (settlement.lastKnownOwner || settlement.owner);
      icon.setTexture("settlementsSmall", settlement.frame);
      container.setPosition(pos.x, pos.y);
      container.setVisible(true);
      nameText.setText(settlement.name || "");
      ownerText.setText((ownerForTint || "neutral").toUpperCase());
      // setColor always re-rasterises the label; skip it when nothing changed.
      const ownerColor = ownerLabelColor(ownerForTint);
      if (ownerText.style?.color !== ownerColor) ownerText.setColor(ownerColor);
      icon.setAlpha(isVisible ? 0.95 : ghostAlpha);
      icon.setScale(desiredScale);
      circle.setStrokeStyle(2, OWNER_COLORS[ownerForTint] || OWNER_COLORS.neutral || 0xcfffb3, isVisible ? 1 : ghostAlpha);
      circle.setScale(1);
      circle.setRadius(18 * desiredScale);
      if (ownerForTint === "player") {
        applyHomeBaseFx(this, visual, 1);
      } else {
        applyHomeBaseFx(this, visual, 0);
      }
      const labelScale = getSmallSettlementLabelScaleForScene(this);
      const { nameFontSize, ownerFontSize } = getSettlementLabelSizes(labelScale);
      nameText.setY(-10 * labelScale);
      ownerText.setY(16 * labelScale);
      nameText.setFontSize(nameFontSize);
      ownerText.setFontSize(ownerFontSize);
      nameText.setAlpha(isVisible ? 1 : ghostAlpha);
      ownerText.setAlpha(isVisible ? 0.85 : Math.max(0.4, ghostAlpha));
      const hitW = icon.displayWidth;
      const hitH = icon.displayHeight;
      const hitRect = new Phaser.Geom.Rectangle(-hitW * 0.5, -hitH, hitW, hitH);
      if (icon.input?.hitArea) {
        icon.setInteractive(hitRect, Phaser.Geom.Rectangle.Contains);
      }
      const worldHitRect = new Phaser.Geom.Rectangle(pos.x + hitRect.x, pos.y + hitRect.y, hitRect.width, hitRect.height);
      const markerBlocking = !!markerOverlapCircle && Phaser.Geom.Intersects.CircleToRectangle(markerOverlapCircle, worldHitRect);
      if (icon.input?.hitArea) {
        icon.input.useHandCursor = isVisible && !markerBlocking;
      }
      if (icon.input) icon.input.enabled = isVisible && !markerBlocking;
    const iconBounds = offsetOverlapBounds(icon.getBounds(), SETTLEMENT_OVERLAP_OFFSET_SMALL);
      const overlapShape = overlapCircle || unitBounds;
      const overlapPct = settlementOverlapPct(iconBounds, overlapShape);
      if (overlapPct >= SETTLEMENT_OVERLAP_THRESHOLD && overlapCallback) {
        overlapCallback(settlement.id);
      }
    });
    this.smallSettlementVisuals.forEach((visual, id) => {
      if (!liveIds.has(id)) {
        visual.container.destroy(true);
        this.smallSettlementVisuals.delete(id);
      }
    });
  }

  renderDams() {
    if (!this.dams?.length) return;
    if (!this.damVisuals) this.damVisuals = new Map();
    const liveIds = new Set();
    const fogState = this.gameState || {};
    const ghostAlpha = fogSetting("ghostAlpha");
    this.dams.forEach((dam) => {
      liveIds.add(dam.id);
      const pos = this.pctToWorld(dam.pos);
      if (!pos) return;
      let visual = this.damVisuals.get(dam.id);
      if (!visual) {
        visual = ensureDamVisual(this, dam);
        this.damVisuals.set(dam.id, visual);
      }
      if (!visual) return;
      const { container, icon, nameText, circle } = visual;
      const explored = isPctExplored(dam.pos, fogState);
      if (!explored) {
        if (icon.input) icon.input.enabled = false;
        container.setVisible(false);
        return;
      }
      const isVisible = isPctVisible(dam.pos, fogState);
      if (icon.input) icon.input.enabled = isVisible;
      container.setPosition(pos.x, pos.y);
      container.setVisible(true);
      icon.setTexture("dams", damFrameFor(this, dam.id));
      icon.setAlpha(isVisible ? 1 : Math.max(0.4, ghostAlpha));
      const labelScale = getSettlementLabelScaleForScene(this);
      const { nameFontSize } = getSettlementLabelSizes(labelScale);
      nameText.setFontSize(nameFontSize);
      nameText.setText(dam.name || "");
      nameText.setPosition(0, -icon.displayHeight * 0.6);
      nameText.setAlpha(isVisible ? 1 : Math.max(0.5, ghostAlpha));
      circle.setStrokeStyle(3, 0xfff4d6, isVisible ? 0.9 : Math.max(0.45, ghostAlpha));
    });
    this.damVisuals.forEach((visual, id) => {
      if (!liveIds.has(id)) {
        visual.container.destroy(true);
        this.damVisuals.delete(id);
      }
    });
  }

  addSettlement(frame, x, y) {
    return this.add.sprite(x, y, "settlementsLarge", atlasFrame(this, "settlements", frame));
  }

  addLandmark(frame, x, y) {
    return this.add.sprite(x, y, "landmarks", atlasFrame(this, "landmarks", frame));
  }

  addPoi(frame, x, y) {
    return this.add.sprite(x, y, "poi", atlasFrame(this, "poi", frame));
  }

  addResource(frame, x, y) {
    return this.add.sprite(x, y, "natres", atlasFrame(this, "natres", frame));
  }

  addUnit(frame, x, y) {
    return this.add.sprite(x, y, "unitsSoldiers", atlasFrame(this, "unitsSoldiers", frame));
  }
}

function bootPhaser(state) {
  recordTransitionEvent("bootPhaser:construct");
  const scene = new MapScene();
  scene.setGameState(state);
  if (mainPhaserGame) {
    try {
      mainPhaserGame.scene.add("mapScene", scene, true);
      recordTransitionEvent("bootPhaser:reused");
      return { game: mainPhaserGame, scene };
    } catch (err) {
      console.warn("Failed to reuse Phaser game for restart; rebuilding.", err);
      try {
        mainPhaserGame.destroy(true);
      } catch {}
      mainPhaserGame = null;
    }
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "phaserContainer",
    width: 960,
    height: 500,
    backgroundColor: "#000000",
    transparent: true,
    fps: {
      target: 60,
      min: 10,
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      roundPixels: true, // snap draw positions to whole pixels to avoid seams between tiles
    },
    scene,
  });
  mainPhaserGame = game;
  recordTransitionEvent("bootPhaser:constructed");
  return { game, scene };
}

function getMarkerHitContext(state, scene) {
  const activeUnit = getActiveRangerUnit(state);
  const markerEntry = scene?.getActiveMarkerEntry ? scene.getActiveMarkerEntry() : null;
  const marker = markerEntry?.sprite || scene?.marker;
  if (!state || !scene || !marker || !marker.input) {
    return { markerCircle: null, markerPos: null, squadPos: null };
  }
  if (!activeUnit?.deployed) {
    return { markerCircle: null, markerPos: null, squadPos: null };
  }
  let squadPos = getUnitPositionPct(state, activeUnit);
  const width = scene.worldWidth || scene.scale?.width;
  const height = scene.worldHeight || scene.scale?.height;
  if (!squadPos || !width || !height) {
    return { markerCircle: null, markerPos: null, squadPos: squadPos || null };
  }
  const markerPos = {
    x: (squadPos.x / 100) * width,
    y: (squadPos.y / 100) * height,
  };
  const hitArea = marker.input.hitArea;
  const markerCircle =
    state.squadSelected && !activeUnit?.isDead && hitArea
      ? new Phaser.Geom.Circle(markerPos.x + hitArea.x, markerPos.y + hitArea.y, hitArea.radius)
      : null;
  return { markerCircle, markerPos, squadPos };
}

function renderPhaserMap(state, scene) {
  if (!state) return;
  if (!scene || !scene.ready || !scene.linkGraphics) return;
  const width = scene.worldWidth || scene.scale.width;
  const height = scene.worldHeight || scene.scale.height;
  if (!width || !height) return;
  const activeUnit = getActiveRangerUnit(state);
  const activeMarkerEntry = scene.getActiveMarkerEntry ? scene.getActiveMarkerEntry() : null;
  const activeMarker = activeMarkerEntry?.sprite || scene.marker;
  const markerCtx = getMarkerHitContext(state, scene);
  const markerCircle = markerCtx.markerCircle;
  const markerPos = markerCtx.markerPos;
  const ghostAlpha = fogSetting("ghostAlpha");
  const unitOverlapCircle = getUnitOverlapCircle(state, scene);
  let unitBounds = null;
  if (activeUnit?.deployed && markerPos && activeMarker) {
    activeMarker.setVisible(true);
    activeMarker.setPosition(markerPos.x, markerPos.y);
    drawOverlapDebugDot(scene, activeMarker.getBounds(), 0xff6b2d);
    unitBounds = activeMarker.getBounds();
  } else if (activeMarker) {
    activeMarker.setVisible(false);
  }
  let smallSettlementOverlapId = null;
  let largeSettlementOverlapId = null;
  const recordSmallSettlementOverlap = (id) => {
    if (!smallSettlementOverlapId && id) smallSettlementOverlapId = id;
  };
  const recordLargeSettlementOverlap = (id) => {
    if (!largeSettlementOverlapId && id) largeSettlementOverlapId = id;
  };
  scene.fogNeedsRedraw = scene.fogNeedsRedraw || !!state?.visibility?.dirty;
  scene.gameState = state;
  if (state?.smallSettlements?.length && !scene.smallSettlements?.length) {
    scene.smallSettlements = state.smallSettlements;
  }
  if (!scene.smallSettlementsPlaced) scene.tryPlaceSmallSettlements();
  scene.renderSmallSettlements(markerCircle, unitOverlapCircle, recordSmallSettlementOverlap, unitBounds);
  scene.ensureDamsReady();
  scene.renderDams();
  scene.linkGraphics.clear();
  scene.linkGraphics.setVisible(false);
  const knownSet = new Set(state.knownNodes || []);
  const reachableEntries = state.squadSelected && activeUnit?.deployed ? getReachableNodes(state) : [];
  const reachableSet = new Set(reachableEntries.map((entry) => entry.id));
  for (const node of state.nodes) {
    const isCurrentNode = activeUnit?.currentNodeId === node.id;
    const explored = isPctExplored(node.pos, state);
    const known = explored || knownSet.has(node.id);
    const visual = ensureNodeVisual(scene, node);
    const { container, circle, nameText, ownerText, settlementIcon } = visual;
    if (!known || !explored) {
      if (settlementIcon?.input) settlementIcon.input.enabled = false;
      container.setVisible(false);
      if (isCurrentNode) {
        recordLargeSettlementOverlap(node.id);
      }
      continue;
    }
    const x = (node.pos.x / 100) * width;
    const y = (node.pos.y / 100) * height;
    container.setPosition(x, y);
    const isVisible = isNodeVisible(node.id, state);
    const lastOwner = node.lastKnownOwner || node.owner;
    const ownerForTint = isVisible ? node.owner : lastOwner;
    const strokeColor = state.selectedNode === node.id
      ? 0xffffff
      : (isVisible && reachableSet.has(node.id))
        ? 0x74ff8d
        : 0x2e4b2a;
    const strokeAlpha = isVisible ? 0.9 : Math.max(0.25, ghostAlpha * 0.9);
    circle.setStrokeStyle(3, strokeColor, strokeAlpha);
    circle.setFillStyle(OWNER_COLORS[ownerForTint] || 0x88a484, 0);
    circle.setAlpha(isVisible ? 1 : ghostAlpha);
    nameText.setText(node.name);
    nameText.setAlpha(isVisible ? 1 : ghostAlpha);
    ownerText.setText(ownerForTint.toUpperCase());
    const ownerColor = ownerLabelColor(ownerForTint);
    if (ownerText.style?.color !== ownerColor) ownerText.setColor(ownerColor);
    ownerText.setAlpha(isVisible ? 0.85 : Math.max(0.4, ghostAlpha * 0.9));
    settlementIcon.setTexture(settlementTextureKey(), settlementFrameForNode(scene, node.id, ownerForTint));
    settlementIcon.setAlpha(isVisible ? 1 : ghostAlpha);
    if (node.id === "home") {
      applyHomeBaseFx(scene, visual, state?.baseLevel || 1);
    } else if (ownerForTint === "player") {
      applyHomeBaseFx(scene, visual, 1);
    } else {
      applyHomeBaseFx(scene, visual, 0);
    }
    const iconScale = getSettlementScale();
    const labelScale = getSettlementLabelScaleForScene(scene);
    const { nameFontSize, ownerFontSize } = getSettlementLabelSizes(labelScale);
    const circleRadius = 22 * iconScale;
    circle.setScale(iconScale);
    circle.setRadius(circleRadius);
    settlementIcon.setScale(iconScale);
    const hitW = settlementIcon.displayWidth;
    const hitH = settlementIcon.displayHeight;
    const hitRect = new Phaser.Geom.Rectangle(-hitW * 0.5, -hitH, hitW, hitH);
    if (settlementIcon.input?.hitArea) {
      settlementIcon.setInteractive(hitRect, Phaser.Geom.Rectangle.Contains);
    }
    const worldHitRect = new Phaser.Geom.Rectangle(x + hitRect.x, y + hitRect.y, hitRect.width, hitRect.height);
    const markerBlocking = !!markerCircle && Phaser.Geom.Intersects.CircleToRectangle(markerCircle, worldHitRect);
    if (settlementIcon.input?.hitArea) {
      settlementIcon.input.useHandCursor = isVisible && !markerBlocking;
    }
    container.setSize(hitW, hitH);
    nameText.setFontSize(nameFontSize);
    ownerText.setFontSize(ownerFontSize);
    if (settlementIcon?.input) settlementIcon.input.enabled = isVisible && !markerBlocking;
    container.setVisible(true);
    const iconBounds = offsetOverlapBounds(settlementIcon.getBounds(), SETTLEMENT_OVERLAP_OFFSET_LARGE);
    const overlapShape = unitOverlapCircle || unitBounds;
    const overlapPct = settlementOverlapPct(iconBounds, overlapShape);
    const activePos = getUnitPositionPct(state, activeUnit);
    if (isCurrentNode && activeUnit?.justDeployed) {
      // Skip overlap on initial deploy until the unit moves away (home screen shouldn't loop).
    } else if (overlapPct >= SETTLEMENT_OVERLAP_THRESHOLD) {
      recordLargeSettlementOverlap(node.id);
    }
  }
  // marker visibility/position handled above so overlap checks use current bounds
  maybeTriggerSmallSettlementSceneFromCollision(state, smallSettlementOverlapId);
  maybeTriggerLargeSettlementSceneFromCollision(state, largeSettlementOverlapId);
  maybeTriggerDamCompletion(state);
  renderFogLayer(scene, state.visibility);
  drawOverlapDebugOverlay(scene, state);
}

function checkSettlementOverlaps(state, scene, overrideUnit = null) {
  if (!state || !scene || !scene.ready) return;
  const activeUnit = overrideUnit || getActiveRangerUnit(state);
  if (!activeUnit?.deployed) return;
  const width = scene.worldWidth || scene.scale?.width;
  const height = scene.worldHeight || scene.scale?.height;
  if (!width || !height) return;
  let squadPos = getUnitPositionPct(state, activeUnit);
  if (!squadPos) return;
  const unitWorld = {
    x: (squadPos.x / 100) * width,
    y: (squadPos.y / 100) * height,
  };
  let unitBounds = null;
  const markerEntry = overrideUnit
    ? scene.unitMarkers?.get?.(overrideUnit.id) || null
    : (scene.getActiveMarkerEntry ? scene.getActiveMarkerEntry() : null);
  const marker = markerEntry?.sprite || (overrideUnit ? null : scene.marker);
  if (marker) {
    marker.setPosition(unitWorld.x, unitWorld.y);
    unitBounds = marker.getBounds();
  }
  const unitOverlapCircle = getUnitOverlapCircle(state, scene, activeUnit);
  let smallSettlementOverlapId = null;
  let largeSettlementOverlapId = null;
  const recordSmallSettlementOverlap = (id) => {
    if (!smallSettlementOverlapId && id) smallSettlementOverlapId = id;
  };
  const recordLargeSettlementOverlap = (id) => {
    if (!largeSettlementOverlapId && id) largeSettlementOverlapId = id;
  };
  const smallSettlements = scene.smallSettlements?.length ? scene.smallSettlements : (state.smallSettlements || []);
  if (smallSettlements.length) {
    smallSettlements.forEach((settlement) => {
      if (!settlement?.pos) return;
      if (!isPctExplored(settlement.pos, state)) return;
      const pos = scene.pctToWorld ? scene.pctToWorld(settlement.pos) : {
        x: (settlement.pos.x / 100) * width,
        y: (settlement.pos.y / 100) * height,
      };
      const visual = ensureSmallSettlementVisual(scene, settlement);
      if (!visual) return;
      visual.container.setPosition(pos.x, pos.y);
      const iconBounds = offsetOverlapBounds(visual.icon.getBounds(), SETTLEMENT_OVERLAP_OFFSET_SMALL);
      const overlapShape = unitOverlapCircle || unitBounds;
      const overlapPct = settlementOverlapPct(iconBounds, overlapShape);
      if (overlapPct >= SETTLEMENT_OVERLAP_THRESHOLD) {
        recordSmallSettlementOverlap(settlement.id);
      }
    });
  }
  const knownSet = new Set(state.knownNodes || []);
  for (const node of state.nodes || []) {
    if (!node?.pos) continue;
    const explored = isPctExplored(node.pos, state);
    const known = explored || knownSet.has(node.id);
    if (!known || !explored) continue;
    const x = (node.pos.x / 100) * width;
    const y = (node.pos.y / 100) * height;
    const visual = ensureNodeVisual(scene, node);
    if (!visual) continue;
    visual.container.setPosition(x, y);
    const iconBounds = offsetOverlapBounds(visual.settlementIcon.getBounds(), SETTLEMENT_OVERLAP_OFFSET_LARGE);
    const overlapShape = unitOverlapCircle || unitBounds;
    const overlapPct = settlementOverlapPct(iconBounds, overlapShape);
    const overlapOk = overlapPct >= SETTLEMENT_OVERLAP_THRESHOLD;
    const distPct = Math.hypot((squadPos.x - node.pos.x), (squadPos.y - node.pos.y));
    if (node.id === activeUnit.currentNodeId && activeUnit.justDeployed) {
      if (distPct > 1.2) {
        activeUnit.justDeployed = false;
        if (node.id === "home") {
          activeUnit.hasLeftHome = true;
        }
      }
    }
    if (node.id === activeUnit.currentNodeId && activeUnit.justDeployed) {
      // Skip overlap on initial deploy at home until the unit moves away.
      continue;
    }
    if (overlapOk) {
      recordLargeSettlementOverlap(node.id);
    }
  }
  // Keyboard marches target the map edge, not a specific node, so the unit
  // would otherwise glide straight through a settlement icon without ever
  // becoming idle on it — and the large-settlement trigger requires idle.
  // Halt the march on first overlap so the trigger fires like a click-to-arrive.
  //
  // EXCEPT when the overlapping settlement is already suppressed (player just closed its scene
  // and is parked inside the overlap). In that case the trigger won't fire anyway, and halting
  // would just trap the unit — so let the keyboard march carry them out freely. Once the unit
  // fully exits the overlap, suppression clears and a subsequent re-entry will halt + trigger
  // as usual.
  const largeSuppressed =
    !!largeSettlementOverlapId && state.largeSettlementSceneSuppressedId === largeSettlementOverlapId;
  const smallSuppressed =
    !!smallSettlementOverlapId && state.settlementSceneSuppressedId === smallSettlementOverlapId;
  const haltLarge = !!largeSettlementOverlapId && !largeSuppressed;
  const haltSmall = !!smallSettlementOverlapId && !smallSuppressed;
  if ((haltLarge || haltSmall) && activeUnit?.keyboardMarching) {
    activeUnit.isMoving = false;
    activeUnit.moveTargetPct = null;
    activeUnit.keyboardMarching = false;
    if (scene) {
      scene.marchUiDirty = true;
      scene.marchUiAccumulator = 0;
    }
  }
  // Suppression-exit gate: clear the per-settlement suppression once the unit's logical position is
  // at least SUPPRESS_EXIT_FRACTION of the icon's width past the icon's bounding rectangle. This is
  // tighter than the overlap zone, so the player can re-trigger sooner — they just need to step a
  // sliver outside the sprite, not fully exit the collision radius.
  const SUPPRESS_EXIT_FRACTION = 0.2;
  const distPastRect = (rect, px, py) => {
    if (!rect) return Infinity;
    const dx = Math.max(rect.x - px, px - (rect.x + rect.width), 0);
    const dy = Math.max(rect.y - py, py - (rect.y + rect.height), 0);
    return Math.hypot(dx, dy);
  };
  // Guard the early-clear: if the unit is still in active overlap with the suppressed
  // settlement, do NOT clear suppression here. Otherwise the next line's trigger call
  // will immediately re-open the scene we just left, snapping the player back into a
  // loop. Suppression naturally clears via maybeTrigger*() when the unit is no longer
  // overlapping anything.
  if (
    state.largeSettlementSceneSuppressedId
    && !largeSettlementOverlayState.active
    && state.largeSettlementSceneSuppressedId !== largeSettlementOverlapId
  ) {
    const visual = scene.nodeSprites?.get?.(state.largeSettlementSceneSuppressedId);
    const icon = visual?.settlementIcon;
    if (icon) {
      const b = icon.getBounds();
      const margin = b.width * SUPPRESS_EXIT_FRACTION;
      if (distPastRect(b, unitWorld.x, unitWorld.y) >= margin) {
        state.largeSettlementSceneSuppressedId = null;
        state.largeSettlementSceneSuppressPos = null;
      }
    }
  }
  if (
    state.settlementSceneSuppressedId
    && !settlementOverlayState.active
    && state.settlementSceneSuppressedId !== smallSettlementOverlapId
  ) {
    const visual = scene.smallSettlementVisuals?.get?.(state.settlementSceneSuppressedId);
    const icon = visual?.icon;
    if (icon) {
      const b = icon.getBounds();
      const margin = b.width * SUPPRESS_EXIT_FRACTION;
      if (distPastRect(b, unitWorld.x, unitWorld.y) >= margin) {
        state.settlementSceneSuppressedId = null;
      }
    }
  }
  if (smallSettlementOverlapId || largeSettlementOverlapId) {
    encounterOverlayState.encounterUnitId = activeUnit.id;
  }
  maybeTriggerSmallSettlementSceneFromCollision(state, smallSettlementOverlapId);
  maybeTriggerLargeSettlementSceneFromCollision(state, largeSettlementOverlapId, activeUnit);
  maybeTriggerDamCompletion(state, scene, unitOverlapCircle || unitBounds);
}

function getUnitOverlapCircle(state, scene, overrideUnit = null) {
  const activeUnit = overrideUnit || getActiveRangerUnit(state);
  if (!activeUnit?.deployed) return null;
  const markerEntry = overrideUnit
    ? scene?.unitMarkers?.get?.(overrideUnit.id) || null
    : (scene?.getActiveMarkerEntry ? scene.getActiveMarkerEntry() : null);
  const marker = markerEntry?.sprite || (overrideUnit ? null : scene?.marker);
  if (!marker) return null;
  let squadPos = getUnitPositionPct(state, activeUnit);
  if (!squadPos || typeof squadPos.x !== "number" || typeof squadPos.y !== "number") return null;
  const world = scene?.pctToWorld ? scene.pctToWorld(squadPos) : null;
  if (!world) return null;
  // Settlement-overlap footprint: a circle centered at the unit's feet (= logical position), sized as a
  // fraction of the displayed sprite. Independent of the click hitbox (which is pixel-perfect on the sprite
  // silhouette and therefore not a circle anymore).
  const baseSize = Math.max(marker.displayWidth || 0, marker.displayHeight || 0);
  const radius = baseSize * 0.4;
  if (!radius) return null;
  return new Phaser.Geom.Circle(world.x, world.y, radius);
}

function settlementOverlapPct(iconBounds, overlapShape) {
  if (!iconBounds || !overlapShape) return 0;
  const iconArea = Math.max(0, iconBounds.width * iconBounds.height);
  if (!iconArea) return 0;
  if (overlapShape instanceof Phaser.Geom.Rectangle) {
    const intersection = Phaser.Geom.Rectangle.Intersection(iconBounds, overlapShape);
    const intersectArea = Math.max(0, intersection.width) * Math.max(0, intersection.height);
    return intersectArea / iconArea;
  }
  if (overlapShape instanceof Phaser.Geom.Circle) {
    const samples = Math.max(2, SETTLEMENT_OVERLAP_SAMPLE_GRID);
    const stepX = iconBounds.width / samples;
    const stepY = iconBounds.height / samples;
    if (!stepX || !stepY) return 0;
    let hit = 0;
    const total = samples * samples;
    for (let ix = 0; ix < samples; ix += 1) {
      for (let iy = 0; iy < samples; iy += 1) {
        const x = iconBounds.x + (ix + 0.5) * stepX;
        const y = iconBounds.y + (iy + 0.5) * stepY;
        if (Phaser.Geom.Circle.Contains(overlapShape, x, y)) {
          hit += 1;
        }
      }
    }
    return hit / total;
  }
  return 0;
}

function maybeTriggerDamCompletion(state, scene = null, unitOverlapShape = null) {
  if (!state || state.missionComplete || state.gameOver) return;
  const activeUnit = getActiveRangerUnit(state);
  if (!activeUnit?.deployed || activeUnit.isDead) return;
  if (!scene || !unitOverlapShape) return;
  const width = scene.worldWidth || scene.scale?.width;
  const height = scene.worldHeight || scene.scale?.height;
  if (!width || !height) return;
  for (const dam of state.dams || []) {
    if (!dam?.pos) continue;
    const world = scene.pctToWorld ? scene.pctToWorld(dam.pos) : {
      x: (dam.pos.x / 100) * width,
      y: (dam.pos.y / 100) * height,
    };
    const visual = scene.damVisuals?.get?.(dam.id) || ensureDamVisual(scene, dam);
    if (!visual?.icon) continue;
    visual.container.setPosition(world.x, world.y);
    const iconBounds = visual.icon.getBounds();
    const overlapPct = settlementOverlapPct(iconBounds, unitOverlapShape);
    if (overlapPct >= SETTLEMENT_OVERLAP_THRESHOLD) {
      state.missionComplete = true;
      haltSquadMovementForEncounter();
      cancelEncounterTimer();
      showMissionCompleteOverlay();
      return;
    }
  }
}

function offsetOverlapBounds(bounds, offset = null) {
  if (!bounds) return bounds;
  const ox = offset && typeof offset.x === "number" ? offset.x : 0;
  const oy = offset && typeof offset.y === "number" ? offset.y : 0;
  if (!ox && !oy) return bounds;
  return new Phaser.Geom.Rectangle(
    bounds.x + bounds.width * ox,
    bounds.y + bounds.height * oy,
    bounds.width,
    bounds.height
  );
}

// Selecting a unit is not the same as walking it into a settlement. While this is set,
// a settlement the newly selected unit is already standing on is recorded as "already
// entered" instead of opening its scene. The suppression clears as usual once the unit
// walks off.
let settlementOverlapAdoptMode = false;
function renderMapAdoptingSettlementOverlaps(state) {
  settlementOverlapAdoptMode = true;
  try {
    renderMap(state);
  } finally {
    settlementOverlapAdoptMode = false;
  }
}

function maybeTriggerSmallSettlementSceneFromCollision(state, settlementId) {
  if (!state) return;
  if (!settlementId) {
    if (state.settlementSceneSuppressedId && !settlementOverlayState.active) {
      state.settlementSceneSuppressedId = null;
    }
    return;
  }
  if (settlementOverlapAdoptMode) {
    state.settlementSceneSuppressedId = settlementId;
    return;
  }
  if (settlementOverlayState.active) return;
  if (state.settlementSceneSuppressedId === settlementId) return;
  if (isAnySceneOverlayActive()) return;
  state.settlementSceneSuppressedId = settlementId;
  startSettlementScene(settlementId);
}

function maybeTriggerLargeSettlementSceneFromCollision(state, settlementId, overlapUnit = null) {
  if (!state) return;
  const checkUnit = overlapUnit || getActiveRangerUnit(state);
  if (checkUnit && !isUnitIdle(checkUnit)) {
    return;
  }
  const suppressUntil = state.largeSettlementSceneSuppressUntil || 0;
  const suppressActive = state.largeSettlementSceneSuppressedId && performance.now() < suppressUntil;
  if (!settlementId) {
    if (suppressActive) return;
    if (state.largeSettlementSceneSuppressedId && !largeSettlementOverlayState.active) {
      state.largeSettlementSceneSuppressedId = null;
      state.largeSettlementSceneSuppressPos = null;
    }
    return;
  }
  if (settlementOverlapAdoptMode) {
    const adoptPos = state.nodeMap?.get?.(settlementId)?.pos || null;
    state.largeSettlementSceneSuppressedId = settlementId;
    state.largeSettlementSceneSuppressPos = adoptPos ? { x: adoptPos.x, y: adoptPos.y } : null;
    return;
  }
  if (largeSettlementOverlayState.active) return;
  // Suppression is now cleared by the distance-past-edge gate in checkSettlementOverlaps
  // (see SUPPRESS_EXIT_FRACTION). While suppressedId is set, the trigger is blocked — full stop.
  // Critical: this check must NOT depend on suppressPos, because snapUnitToSettlement runs renderMap
  // synchronously, which re-enters this function via renderPhaserMap. Without a clean suppression
  // bail-out here, the recursion locks up the main thread.
  if (state.largeSettlementSceneSuppressedId === settlementId) return;
  if (isAnySceneOverlayActive()) return;
  state.largeSettlementSceneSuppressedId = settlementId;
  // Snap on open (collision path) so currentNodeId/positionPct are correct before the home UI
  // inspects state — otherwise the loadout pane reads isUnitAtHome=false on the first open.
  snapUnitToSettlement(state, settlementId, "large");
  startLargeSettlementScene(settlementId, { enteredByCollision: true });
}

function renderFogLayer(scene, visibility) {
  if (!scene || !scene.fogGraphics) return;
  if (!isFogEnabled(scene?.gameState || scene)) {
    scene.fogGraphics.clear();
    scene.fogGraphics.setVisible(false);
    scene.fogNeedsRedraw = false;
    if (visibility) visibility.dirty = false;
    return;
  }
  if (!visibility || !visibility.visible || !visibility.explored || !scene.worldWidth || !scene.worldHeight) {
    scene.fogGraphics.clear();
    scene.fogGraphics.setVisible(false);
    scene.fogNeedsRedraw = false;
    if (visibility) visibility.dirty = false;
    return;
  }
  if (!visibility.dirty && !scene.fogNeedsRedraw) return;
  const width = visibility.width;
  const height = visibility.height;
  if (!width || !height) return;
  const cellW = scene.worldWidth / width;
  const cellH = scene.worldHeight / height;
  const pad = 0.5;
  const unknownAlpha = Math.max(0, Math.min(1, fogSetting("unknownAlpha") ?? 1));
  const exploredAlpha = Math.max(0, Math.min(1, fogSetting("exploredAlpha") ?? 0.55));
  const g = scene.fogGraphics;
  g.clear();
  g.setVisible(true);
  g.setAlpha(1);
  // Phaser replays every Graphics command each frame, so emit one rect per horizontal
  // run of fog cells instead of one per cell (tens of thousands fewer quads per frame).
  // Each cell used to be drawn `pad` wider than it is, so neighbours overlapped in a
  // thin strip that reads as a faint grid in translucent fog. To keep that exact look,
  // translucent runs also get the strip drawn at every cell boundary inside the run.
  const drawFogRuns = (alpha, isFogCell) => {
    if (alpha <= 0) return;
    const keepSeams = alpha < 1;
    g.fillStyle(0x000000, alpha);
    for (let cy = 0; cy < height; cy++) {
      const rowStart = cy * width;
      const top = cy * cellH - pad;
      let runStart = -1;
      for (let cx = 0; cx <= width; cx++) {
        const hit = cx < width && isFogCell(rowStart + cx);
        if (hit) {
          if (runStart < 0) runStart = cx;
        } else if (runStart >= 0) {
          g.fillRect(runStart * cellW - pad, top, (cx - runStart) * cellW + pad * 2, cellH + pad * 2);
          if (keepSeams) {
            for (let seam = runStart + 1; seam < cx; seam++) {
              g.fillRect(seam * cellW - pad, top, pad * 2, cellH + pad * 2);
            }
          }
          runStart = -1;
        }
      }
    }
  };
  drawFogRuns(unknownAlpha, (idx) => !visibility.visible[idx] && !visibility.explored[idx]);
  drawFogRuns(exploredAlpha, (idx) => !visibility.visible[idx] && !!visibility.explored[idx]);
  scene.fogNeedsRedraw = false;
  visibility.dirty = false;
}

function isPointerOverUnitMarker(scene, pointer) {
  if (!scene?.unitMarkers || !pointer) return false;
  const cam = scene.cameras?.main;
  const wx = typeof pointer.worldX === "number"
    ? pointer.worldX
    : cam
      ? cam.scrollX + pointer.x / cam.zoom
      : pointer.x;
  const wy = typeof pointer.worldY === "number"
    ? pointer.worldY
    : cam
      ? cam.scrollY + pointer.y / cam.zoom
      : pointer.y;
  for (const entry of scene.unitMarkers.values()) {
    const sprite = entry?.sprite;
    if (!sprite || !sprite.visible || !sprite.input?.enabled) continue;
    const hitArea = sprite.input?.hitArea;
    const hitCallback = sprite.input?.hitAreaCallback;
    const localPoint = sprite.getLocalPoint ? sprite.getLocalPoint(wx, wy) : null;
    if (localPoint && typeof hitCallback === "function") {
      // hitAreaCallback handles both geometric and pixel-perfect cases uniformly.
      if (hitCallback(hitArea, localPoint.x, localPoint.y, sprite)) return true;
    } else if (localPoint && hitArea && typeof hitArea.contains === "function") {
      if (hitArea.contains(localPoint.x, localPoint.y)) return true;
    } else {
      const bounds = sprite.getBounds();
      if (bounds?.contains(wx, wy)) return true;
    }
  }
  return false;
}

function overlapDebugEnabled() {
  return typeof window !== "undefined" && !!window.devOverlapDebug;
}

function ensureOverlapDebugGraphics(scene) {
  if (!scene) return null;
  if (!scene.overlapDebugGraphics) {
    scene.overlapDebugGraphics = scene.add.graphics();
    scene.overlapDebugGraphics.setDepth(12);
    scene.overlapDebugGraphics.setScrollFactor(1, 1);
  }
  return scene.overlapDebugGraphics;
}

function resetOverlapDebugGraphics(scene) {
  if (!overlapDebugEnabled()) return;
  const g = ensureOverlapDebugGraphics(scene);
  if (g) g.clear();
}

function drawOverlapDebugDot(scene, x, y, radius = 6, color = 0xff2d2d) {
  if (!overlapDebugEnabled() || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const g = ensureOverlapDebugGraphics(scene);
  if (!g) return;
  g.fillStyle(color, 0.9);
  g.fillCircle(x, y, radius);
}

function drawOverlapDebugOverlay(scene, state) {
  if (!overlapDebugEnabled() || !scene || !state) return;
  const g = ensureOverlapDebugGraphics(scene);
  if (!g) return;
  g.clear();
  const unitColor = 0xff9b4a;
  const settlementColor = 0xff2d2d;
  const getCenter = (bounds) => ({
    x: bounds.x + bounds.width * 0.5,
    y: bounds.y + bounds.height * 0.5,
  });
  const smallVisuals = scene.smallSettlementVisuals || new Map();
  smallVisuals.forEach((visual) => {
    const icon = visual?.icon;
    if (!icon || !icon.visible) return;
    const bounds = offsetOverlapBounds(icon.getBounds(), SETTLEMENT_OVERLAP_OFFSET_SMALL);
    const center = getCenter(bounds);
    drawOverlapDebugDot(scene, center.x, center.y, 6, settlementColor);
  });
  const nodeVisuals = scene.nodeSprites || new Map();
  nodeVisuals.forEach((visual) => {
    const icon = visual?.settlementIcon;
    if (!icon || !icon.visible) return;
    const bounds = offsetOverlapBounds(icon.getBounds(), SETTLEMENT_OVERLAP_OFFSET_LARGE);
    const center = getCenter(bounds);
    drawOverlapDebugDot(scene, center.x, center.y, 7, settlementColor);
  });
  for (const unit of state.rangerUnits || []) {
    if (!unit?.deployed) continue;
    const pos = getUnitPositionPct(state, unit);
    if (!pos) continue;
    const world = scene.pctToWorld ? scene.pctToWorld(pos) : null;
    if (!world) continue;
    drawOverlapDebugDot(scene, world.x, world.y, 7, unitColor);
  }
}

function findNearbyLargeSettlement(state, pos, maxDistPct = 1.4) {
  if (!state || !pos || !state.nodes?.length) return null;
  let bestNode = null;
  let bestDist = Infinity;
  for (const node of state.nodes) {
    if (!node?.pos) continue;
    const dist = Math.hypot(pos.x - node.pos.x, pos.y - node.pos.y);
    if (dist <= maxDistPct && dist < bestDist) {
      bestDist = dist;
      bestNode = node;
    }
  }
  return bestNode;
}

function findNearbySmallSettlement(state, pos, maxDistPct = SMALL_SETTLEMENT_NEAR_PCT) {
  if (!state || !pos || !state.smallSettlements?.length) return null;
  let best = null;
  let bestDist = Infinity;
  for (const settlement of state.smallSettlements) {
    if (!settlement?.pos) continue;
    const dist = Math.hypot(pos.x - settlement.pos.x, pos.y - settlement.pos.y);
    if (dist <= maxDistPct && dist < bestDist) {
      bestDist = dist;
      best = settlement;
    }
  }
  return best;
}

function isUnitNearAnySettlement(state, unit, maxDistPct = ENCOUNTER_SETTLEMENT_GUARD_PCT) {
  if (!state || !unit) return false;
  const pos = getUnitPositionPct(state, unit);
  if (!pos) return false;
  const large = findNearbyLargeSettlement(state, pos, maxDistPct);
  if (large) return true;
  const small = findNearbySmallSettlement(state, pos, maxDistPct);
  return !!small;
}

function isUnitAtPlayerSettlement(state, unit) {
  if (!state || !unit) return false;
  const pos = getUnitPositionPct(state, unit);
  if (pos) {
    const nearbyLarge = findNearbyLargeSettlement(state, pos);
    if (nearbyLarge?.owner === "player") return true;
    const nearbySmall = findNearbySmallSettlement(state, pos);
    if (nearbySmall?.owner === "player") return true;
    if (unit.currentNodeId && state?.nodeMap?.get) {
      const node = state.nodeMap.get(unit.currentNodeId);
      if (node?.owner === "player") return false;
    }
  } else if (unit.currentNodeId && state?.nodeMap?.get) {
    const node = state.nodeMap.get(unit.currentNodeId);
    if (node?.owner === "player") return true;
  }
  return false;
}

function ensureNodeVisual(scene, node) {
  if (scene.nodeSprites.has(node.id)) {
    return scene.nodeSprites.get(node.id);
  }
  const iconScale = getSettlementScale(); // clamp so it never sticks at an implicit minimum
  const shadowStyle = scene.spriteShadowStyle || SPRITE_SHADOW_STYLE;
  const circleRadius = 22 * iconScale;
  const labelScale = getSettlementLabelScaleForScene(scene);
  const { nameFontSize, ownerFontSize } = getSettlementLabelSizes(labelScale);
  const circle = scene.add.circle(0, 0, circleRadius, 0xffffff);
  circle.setVisible(false);
  const atlasKey = settlementTextureKey();
  const settlementIcon = scene
    .add
    .sprite(0, 0, atlasKey, settlementFrameForNode(scene, node.id, node.owner))
    .setOrigin(0.5, 1.0) // anchor feet at container origin
    .setDisplaySize(62, 62)
    .setScale(iconScale)
    .setDepth(1.2);
  const nameText = scene.add
    .text(0, -4, "", {
      fontFamily: "EightBitHud, \"8bithud\", monospace",
      fontSize: `${nameFontSize}px`,
      color: "#f4fcf6ff",
    })
    .setOrigin(0.5, -2);
  const ownerText = scene.add
    .text(0, 14, "", {
      fontFamily: "TW-bold, \"Pixel Times\", serif",
      fontSize: `${ownerFontSize}px`,
      color: ownerLabelColor(node.owner),
    })
    .setOrigin(0.5, -3.5);
  applyLabelHalo(nameText, { blurScale: 1, strokeThickness: 3, color: "rgba(0, 0, 0, 0.8)", strokeColor: "rgba(0, 0, 0, 0.95)" });
  applyLabelHalo(ownerText, { blurScale: 1, strokeThickness: 4, color: "rgba(36,20,58,0.65)", strokeColor: "rgba(10,8,16,0.8)" });
  const container = scene.add.container(0, 0, [circle, settlementIcon, nameText, ownerText]);
  container.setDepth(2);
  const baseScale = iconScale;
  const hoverScale = iconScale; // no hover grow
  settlementIcon.setScale(baseScale);
  // Pixel-perfect hit testing — only opaque sprite pixels register clicks/hover, so the hitbox
  // tracks the visible settlement silhouette exactly (not the bounding rect).
  const hitW = settlementIcon.displayWidth;
  const hitH = settlementIcon.displayHeight;
  const offsetX = (SETTLEMENT_OFFSET.x || 0) * hitW;
  const offsetY = (SETTLEMENT_OFFSET.y || 0) * hitH;
  settlementIcon.setPosition(offsetX, offsetY);
  settlementIcon.setInteractive({ pixelPerfect: true, alphaTolerance: 8 });
  if (settlementIcon.input) settlementIcon.input.useHandCursor = true;
  container.setSize(hitW, hitH);
  const lblOffX = (SETTLEMENT_LABEL_OFFSET.x || 0) * hitW;
  const lblOffY = (SETTLEMENT_LABEL_OFFSET.y || 0) * hitH;
  nameText.setPosition(lblOffX, -hitH * 0.6 + lblOffY);
  ownerText.setPosition(lblOffX, -hitH * 0.45 + lblOffY);
  const hoverGlowDist = (GLOW_DISTANCE.settlement.hover || 1) * baseScale;
  const selectGlowDist = (GLOW_DISTANCE.settlement.select || GLOW_DISTANCE.settlement.hover || 1) * baseScale;
  addDropShadowFX(settlementIcon, { ...shadowStyle, offsetX: 0, offsetY: 0 }, {
    power: (shadowStyle.scale || 1.05) * 1.02,
    decay: 0,
    samples: 10,
    intensity: (shadowStyle.alpha ?? 0.45) * 1.0,
    padding: 32,
  });
  if (node.id === "home") {
    // Home base already has a permanent postFX glow stack from applyHomeBaseFx.
    // Dynamically add/remove'ing another postFX layer on hover triggers a render-
    // texture re-alloc that — after a window resize has changed the WebGL drawing
    // buffer — visibly shifts and skews the sprite. Pre-allocate the hover glow
    // here with strength 0 and just toggle its outerStrength on hover, so no
    // postFX layers are ever added/removed at runtime for this sprite.
    if (settlementIcon.postFX?.setPadding) {
      settlementIcon.postFX.setPadding(Math.max(36, Math.ceil(hoverGlowDist) + 8));
    }
    const homeHoverGlow = settlementIcon.postFX?.addGlow
      ? settlementIcon.postFX.addGlow(0xcfffb3, 0, 0.4, false, 0.5, Math.max(0.1, hoverGlowDist))
      : null;
    const showHomeHover = () => {
      if (homeHoverGlow) homeHoverGlow.outerStrength = 1.12 * hoverScale;
    };
    const hideHomeHover = () => {
      if (homeHoverGlow) homeHoverGlow.outerStrength = 0;
    };
    settlementIcon.on("pointerover", showHomeHover);
    settlementIcon.on("pointerout", hideHomeHover);
    settlementIcon.on("pointerupoutside", hideHomeHover);
    // The always-on hover layer makes this the costliest icon on the map by a wide
    // margin; reuse its result on frames where nothing about it has changed.
    enableFxOutputCache(settlementIcon);
  } else {
    attachHoverGlowFX(settlementIcon, {
      hoverDistance: hoverGlowDist,
      activeDistance: selectGlowDist,
      color: 0xcfffb3, // soft highlight to avoid harsh white halo
      outerStrength: 1.4 * hoverScale,
      innerStrength: 0.4,
      quality: 0.5,
      distance: hoverGlowDist,
      padding: 32,
    });
  }
  circle.setScale(baseScale);
  nameText.setY(-4 * iconScale);
  ownerText.setY(14 * iconScale);
    settlementIcon.on("pointerdown", (pointer) => {
      const overUi = isPointerOverUI(pointer);
      if (overUi) {
        return;
      }
      if (scene.isEndTurnTransitionActive) return;
      const overUnit = isPointerOverUnitMarker(scene, pointer);
      if (overUnit) return;
    if (pointer?.event?.button === 2 || pointer?.rightButtonDown?.()) return;
    if (!scene.gameState) return;
    if (scene.panActive) return;
    if (!scene.gameState.visibleNodes.has(node.id)) return;
    scene.gameState.selectNode(node.id);
  });
  const visual = { container, circle, nameText, ownerText, settlementIcon };
  scene.nodeSprites.set(node.id, visual);
  return visual;
}

function ensureSmallSettlementVisual(scene, settlement) {
  if (!scene.smallSettlementVisuals) scene.smallSettlementVisuals = new Map();
  if (scene.smallSettlementVisuals.has(settlement.id)) {
    return scene.smallSettlementVisuals.get(settlement.id);
  }
  const labelScale = getSmallSettlementLabelScaleForScene(scene); // keep label sizing in line with large settlements
  const iconScale = getSmallSettlementScale();
  const shadowStyle = scene.spriteShadowStyle || SPRITE_SHADOW_STYLE;
  const circleRadius = 18 * iconScale;
  const { nameFontSize, ownerFontSize } = getSettlementLabelSizes(labelScale);
  const circle = scene.add.circle(0, 0, circleRadius, 0xffffff, 0);
  circle.setVisible(false);
  const icon = scene.add
    .sprite(0, 0, "settlementsSmall", settlement.frame)
    .setOrigin(0.5, 1.0)
    .setDisplaySize(48, 48)
    .setScale(iconScale)
    .setDepth(1);
  const nameText = scene.add
    .text(0, -4, settlement.name || "", {
      fontFamily: "EightBitHud, \"8bithud\", monospace",
      fontSize: `${nameFontSize}px`,
      fontWeight: "700",
      color: "#f4fcf6ff",
    })
    .setOrigin(0.5, -0.25);
  const ownerText = scene.add
    .text(0, 12, (settlement.owner || "neutral").toUpperCase(), {
      fontFamily: "TW-bold, \"Pixel Times\", serif",
      fontSize: `${ownerFontSize}px`,
      color: ownerLabelColor(settlement.owner),
    })
    .setOrigin(0.5, 0.05);
  applyLabelHalo(nameText, { blurScale: 1, strokeThickness: 2, color: "rgba(0, 0, 0, 0.8)", strokeColor: "rgba(0, 0, 0, 0.95)" });
  applyLabelHalo(ownerText, { blurScale: 1, strokeThickness: 3, color: "rgba(36,20,58,0.65)", strokeColor: "rgba(10,8,16,0.8)" });
  const container = scene.add.container(0, 0, [circle, icon, nameText, ownerText]);
  container.setDepth(1.8);
  const baseScale = iconScale;
  icon.setScale(baseScale);
  const hitW = icon.displayWidth;
  const hitH = icon.displayHeight;
  // Pixel-perfect hit testing on the small settlement icon — hitbox follows the sprite silhouette.
  icon.setInteractive({ pixelPerfect: true, alphaTolerance: 8 });
  if (icon.input) icon.input.useHandCursor = true;
  container.setSize(hitW, hitH);
  nameText.setY(-10 * labelScale);
  ownerText.setY(16 * labelScale);
  const hoverGlowDist = (GLOW_DISTANCE.settlementSmall.hover || 1) * baseScale;
  const selectGlowDist = (GLOW_DISTANCE.settlementSmall.select || GLOW_DISTANCE.settlementSmall.hover || 1) * baseScale;
  addDropShadowFX(icon, { ...shadowStyle, offsetX: 0, offsetY: 0 }, {
    power: (shadowStyle.scale || 1.05) * 1.02,
    decay: 0,
    samples: 8,
    intensity: (shadowStyle.alpha ?? 0.55) * 1.0,
    padding: 24,
  });
  attachHoverGlowFX(icon, {
    hoverDistance: hoverGlowDist,
    activeDistance: selectGlowDist,
    color: 0xcfffb3,
    outerStrength: 1.4 * baseScale,
    innerStrength: 0.4,
    quality: 0.45,
    distance: hoverGlowDist,
    padding: 24,
  });
  icon.on("pointerdown", (pointer) => {
    if (isPointerOverUI(pointer)) return;
    // Currently decorative only; placeholder for future interactions.
  });
  const visual = { container, circle, icon, settlementIcon: icon, nameText, ownerText };
  scene.smallSettlementVisuals.set(settlement.id, visual);
  return visual;
}

function ensureDamFrameMap(scene) {
  if (!scene) return;
  if (!scene.damFrameMap) scene.damFrameMap = new Map();
  else scene.damFrameMap.clear();
  const ids = (scene.gameState?.dams || []).map((d) => d.id);
  const frames = (scene.atlasFrames && scene.atlasFrames.dams) || [];
  if (!frames.length) return;
  const framePool = [...frames];
  const popFrame = () => (framePool.length ? framePool.shift() : frames[0] || "__BASE");
  ids.forEach((id, idx) => {
    if (scene.damFrameMap.has(id)) return;
    if (framePool.length) {
      scene.damFrameMap.set(id, popFrame());
    } else {
      scene.damFrameMap.set(id, frames[idx % frames.length]);
    }
  });
}

function damFrameFor(scene, damId) {
  if (!scene) return "__BASE";
  ensureDamFrameMap(scene);
  const frames = (scene.atlasFrames && scene.atlasFrames.dams) || [];
  if (!frames.length) return "__BASE";
  const mapped = scene.damFrameMap?.get(damId);
  if (mapped && frames.includes(mapped)) return mapped;
  return frames[0] || "__BASE";
}

function ensureDamVisual(scene, dam) {
  if (scene.damVisuals.has(dam.id)) return scene.damVisuals.get(dam.id);
  const labelScale = getSettlementLabelScaleForScene(scene);
  const { nameFontSize } = getSettlementLabelSizes(labelScale);
  const iconScale = Math.max(0.8, getSettlementScale() * DAM_ICON_SCALE);
  const shadowStyle = scene.spriteShadowStyle || SPRITE_SHADOW_STYLE;
  const circle = scene.add.circle(0, 0, 26 * iconScale, 0xfef7e6, 0.22);
  const icon = scene.add
    .sprite(0, 0, "dams", damFrameFor(scene, dam.id))
    .setOrigin(0.5, 0.5) // center origin so glow/halo stays centered on the dam
    .setDisplaySize(96, 96)
    .setScale(iconScale)
    .setDepth(1.35);
  const nameText = scene.add
    .text(0, -8, dam.name || "", {
      fontFamily: "EightBitHud, \"8bithud\", monospace",
      fontSize: `${nameFontSize}px`,
      fontWeight: "700",
      color: "#f4fcf6ff",
    })
    .setOrigin(0.5, -2);
  applyLabelHalo(nameText, { blurScale: 1, strokeThickness: 3, color: "rgba(0, 0, 0, 0.8)", strokeColor: "rgba(0, 0, 0, 0.95)" });
  const container = scene.add.container(0, 0, [circle, icon, nameText]);
  container.setDepth(1.3);
  addDropShadowFX(icon, { ...shadowStyle, offsetX: 0, offsetY: 0 }, {
    power: (shadowStyle.scale || 1.05) * 1.05,
    decay: 0,
    samples: 12,
    intensity: (shadowStyle.alpha ?? 0.65) * 1.05,
    padding: 28,
  });
  if (icon.postFX?.addGlow) {
    icon.postFX.addGlow(
      DAM_HALO_STYLE.color,
      DAM_HALO_STYLE.outerStrength * iconScale,
      DAM_HALO_STYLE.innerStrength,
      false,
      Math.max(0.05, DAM_HALO_STYLE.quality),
      Math.max(0.1, DAM_HALO_STYLE.distance) // tiny distance prevents shader div/0
    );
  }
  const hoverGlowDist = Math.max(0.1, (GLOW_DISTANCE.dam.hover || DAM_HALO_STYLE.distance || 2) * iconScale);
  const selectGlowDist = Math.max(0.1, (GLOW_DISTANCE.dam.select || GLOW_DISTANCE.dam.hover || DAM_HALO_STYLE.distance || 2) * iconScale);
  attachHoverGlowFX(icon, {
    hoverDistance: hoverGlowDist,
    activeDistance: selectGlowDist,
    color: DAM_HALO_STYLE.color,
    outerStrength: DAM_HALO_STYLE.outerStrength * iconScale,
    innerStrength: DAM_HALO_STYLE.innerStrength,
    distance: hoverGlowDist,
    quality: DAM_HALO_STYLE.quality,
    padding: 36,
    layers: [
      { color: 0xfff7e4, outerStrength: DAM_HALO_STYLE.outerStrength * 0.7 * iconScale, innerStrength: 0.5, quality: 0.55, distance: hoverGlowDist },
      { color: 0xf3e7cf, outerStrength: DAM_HALO_STYLE.outerStrength * 0.35 * iconScale, innerStrength: 0.15, quality: 0.45, distance: Math.max(0.08, hoverGlowDist * 0.8) },
    ],
  });
  const hitW = icon.displayWidth;
  const hitH = icon.displayHeight;
  const hitRect = new Phaser.Geom.Rectangle(-hitW * 0.5, -hitH * 0.5, hitW, hitH);
  icon.setInteractive(hitRect, Phaser.Geom.Rectangle.Contains);
  if (icon.input) icon.input.useHandCursor = true;
  container.setSize(hitW, hitH);
  nameText.setPosition(0, -hitH * 0.6);
  const visual = { container, icon, nameText, circle };
  scene.damVisuals.set(dam.id, visual);
  return visual;
}

function settlementAtlasKeyForOwner(owner = "neutral") {
  if (owner === "player") return "settlementsPlayer";
  if (owner === "enemy") return "settlementsEnemy";
  return "settlementsNeutral";
}

function settlementTextureKey() {
  return "settlementsLarge";
}

function ensureSettlementFrameMap(scene) {
  if (!scene || !scene.gameState) return;
  if (!scene.settlementFrameMap) scene.settlementFrameMap = new Map();
  else scene.settlementFrameMap.clear();
  const ids = scene.gameState.nodes.map((n) => n.id);
  const frames = (scene.atlasFrames && scene.atlasFrames.settlementsPlayer) || [];
  if (!frames.length) return;
  // Apply explicit frame overrides when available.
  const resolveOverrideFrame = (id) => {
    const override = SETTLEMENT_FRAME_OVERRIDES[id];
    if (override === undefined || override === null) return null;
    if (typeof override === "number") {
      const idx = Math.max(0, Math.floor(override)) % frames.length;
      return { frame: frames[idx], index: idx };
    }
    if (typeof override === "string") {
      if (frames.includes(override)) return override;
      const m = override.match(/-(\d+)$/);
      if (m) {
        const idx = Math.max(0, parseInt(m[1], 10)) % frames.length;
        return { frame: frames[idx], index: idx };
      }
    }
    return null;
  };
  const applyOverride = (id) => {
    const frame = resolveOverrideFrame(id);
    if (frame) {
      scene.settlementFrameMap.set(id, frame);
      return true;
    }
    return false;
  };
  const uniquePossible = frames.length >= ids.length;
  const framePool = [...frames]; // shallow copy so we can pop without mutating atlasFrames
  const popFrame = () => (framePool.length ? framePool.shift() : frames[0] || "__BASE");
  ids.forEach((id, idx) => {
    if (scene.settlementFrameMap.has(id)) return;
    if (applyOverride(id)) return;
    if (id === "home") {
      scene.settlementFrameMap.set(id, popFrame());
      return;
    }
    if (uniquePossible) {
      scene.settlementFrameMap.set(id, popFrame());
    } else {
      scene.settlementFrameMap.set(id, frames[idx % frames.length]);
    }
  });
}

function settlementFrameForNode(scene, nodeId, owner = "neutral") {
  if (!scene) return "__BASE";
  ensureSettlementFrameMap(scene);
  const atlasKey = settlementAtlasKeyForOwner(owner);
  const frames = (scene?.atlasFrames && scene.atlasFrames[atlasKey]) || [];
  if (!frames.length) return "__BASE";
  const mapped = scene.settlementFrameMap?.get(nodeId);
  if (mapped) {
    // Handle object form with explicit index.
    if (typeof mapped === "object" && mapped !== null) {
      const { frame, index } = mapped;
      if (frame && frames.includes(frame)) return frame;
      if (Number.isFinite(index) && frames.length) {
        const idx = Math.max(0, Math.floor(index)) % frames.length;
        return frames[idx];
      }
      if (typeof frame === "string") {
        const m = frame.match(/-(\d+)$/);
        if (m && frames.length) {
          const idx = Math.max(0, parseInt(m[1], 10)) % frames.length;
          return frames[idx];
        }
      }
    } else if (typeof mapped === "string") {
      if (frames.includes(mapped)) return mapped;
      const m = mapped.match(/-(\d+)$/);
      if (m && frames.length) {
        const idx = Math.max(0, parseInt(m[1], 10)) % frames.length;
        return frames[idx];
      }
    }
  }
  // fallback: hash pick
  return pickFrame(scene, atlasKey, nodeId, frames[0] || "__BASE");
}

function issueMarchOrderToNode(state, node) {
  if (!state || !node?.pos) return;
  if (isRunOver(state) || isMenuPauseActive() || isEncounterTransitionActive() || isMapEndTurnTransitionActive()) return;
  const active = getActiveRangerUnit(state);
  if (!active || active.isDead || !active.deployed) return;
  const apLeft = typeof active?.inventory?.ap === "number" ? active.inventory.ap : 0;
  if (apLeft <= 0) {
    if (state.logger) {
      state.logger.log("Rangers are out of action points and must rest until next turn.");
    }
    return;
  }
  const usesGas = isVehicleUnit(active);
  const gasLeft = typeof active?.inventory?.gas === "number" ? active.inventory.gas : 0;
  if (usesGas && gasLeft <= 0) {
    if (state.logger) {
      state.logger.log("Rangers are out of gas and cannot march.");
    }
    return;
  }
  if (!active.positionPct) {
    const fallback = active.currentNodeId ? state.nodeMap.get(active.currentNodeId)?.pos : null;
    active.positionPct = { ...(fallback || node.pos) };
  }
  state.squadSelected = true;
  state.squadPaneClosed = false;
  active.moveTargetPct = { x: node.pos.x, y: node.pos.y };
  active.isMoving = true;
  active.keyboardMarching = false;
  if (mapSceneInstance) {
    mapSceneInstance.marchUiDirty = true;
    mapSceneInstance.marchUiAccumulator = 0;
    mapSceneInstance.pendingSettlementOverlapCheck = true;
  }
  updateSquadWindow(state);
}

function issueFastTravelOrder(state, target) {
  if (!state || !target) return;
  if (isRunOver(state) || isMenuPauseActive() || isEncounterTransitionActive() || isMapEndTurnTransitionActive()) return;
  const active = getActiveRangerUnit(state);
  if (!active || active.isDead || !active.deployed) return;
  if (!isUnitAtPlayerSettlement(state, active)) return;
  if (target.kind === "large" && target.node?.pos) {
    snapUnitToSettlement(state, target.node.id, "large");
  } else if (target.kind === "small" && target.settlement?.pos) {
    snapUnitToSettlement(state, target.settlement.id, "small");
  } else {
    return;
  }
  if (active.inventory) {
    active.inventory.ap = 0;
  }
  state.clampUnitInventory(active);
  if (state.logger) {
    state.logger.log(`Fast travel to ${target.name || "settlement"} completed. Action points drained.`);
  }
  if (mapSceneInstance) {
    mapSceneInstance.marchUiDirty = true;
    mapSceneInstance.marchUiAccumulator = 0;
  }
  updateSquadWindow(state);
}




















