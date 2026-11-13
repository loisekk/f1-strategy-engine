/* Art direction config for the scroll-controlled exploded vehicle scene.
 *
 * MODEL SPACE (the glTF's pre-rotation coordinate system):
 *   -Y = front of car · +Z = up · +X = one side
 * The scene wraps all parts in a group rotated -90° about X so world space
 * becomes: +Z front · +Y up. Offsets below are written in MODEL space.
 */

export interface PartConfig {
  /** base node name prefix in the gltf (nodes may be split as name_0, name_1…) */
  base: string;
  /** exploded offset in model space */
  offset: [number, number, number];
  /** exploded rotation (radians, model space) */
  rotation: [number, number, number];
  /** [begin, end] window of the global explode progress */
  window: [number, number];
  /** optional per-part ease override power */
  easePower?: number;
}

export const CAR_SCALE = 0.62;

/** Rotation applied to the whole car so world = +Z front, +Y up. */
export const CAR_ROTATION_X = -Math.PI / 2;

export const PARTS: PartConfig[] = [
  { base: "front_wing", offset: [0, -2.4, -0.2], rotation: [0.12, 0, 0], window: [0.0, 0.42] },
  { base: "nose", offset: [0, -1.35, 0.15], rotation: [0, 0, 0], window: [0.08, 0.48] },
  { base: "front_susp", offset: [0, -1.1, 0.35], rotation: [0, 0, 0], window: [0.05, 0.45] },
  { base: "sidepod_l", offset: [-1.7, -0.15, 0.35], rotation: [0, 0, -0.08], window: [0.16, 0.58] },
  { base: "sidepod_r", offset: [1.7, -0.15, 0.35], rotation: [0, 0, 0.08], window: [0.19, 0.61] },
  { base: "engine_cover", offset: [0, -0.5, 1.55], rotation: [0, 0, 0], window: [0.26, 0.72] },
  { base: "floor", offset: [0, 0.35, -1.05], rotation: [0, 0, 0], window: [0.3, 0.78] },
  { base: "diffuser", offset: [0, 2.3, -0.35], rotation: [0.1, 0, 0], window: [0.2, 0.62] },
  { base: "rear_susp", offset: [0, 1.15, 0.15], rotation: [0, 0, 0], window: [0.22, 0.64] },
  { base: "rear_wing", offset: [0, 2.75, 0.85], rotation: [0, 0, 0], window: [0.1, 0.52] },
  { base: "wheel_fl", offset: [-1.55, -0.55, 0.1], rotation: [0, 0, 0], window: [0.12, 0.55] },
  { base: "wheel_fr", offset: [1.55, -0.55, 0.1], rotation: [0, 0, 0], window: [0.15, 0.58] },
  { base: "wheel_rl", offset: [-1.55, 0.55, 0.1], rotation: [0, 0, 0], window: [0.18, 0.61] },
  { base: "wheel_rr", offset: [1.55, 0.55, 0.1], rotation: [0, 0, 0], window: [0.21, 0.64] },
];

/* ---------------- technical labels ---------------- */

export interface LabelConfig {
  id: string;
  part: string;
  title: string;
  spec: string;
  /** anchor in the part's model-space (offset applied by wrapper, so use the
   *  assembled part centre — wrapper position adds the exploded offset) */
  anchor: [number, number, number];
  /** screen-space label offset from the projected anchor (px) */
  screenOffset: [number, number];
  /** reveal threshold within the labels progress (0..1) */
  reveal: number;
  /** side the leader line exits to */
  side: "left" | "right";
}

export const LABELS: LabelConfig[] = [
  {
    id: "front-wing", part: "front_wing", title: "FRONT WING",
    spec: "4-ELEMENT · REGULATION 2022",
    anchor: [0, -3.15, 0.55], screenOffset: [-150, -120], reveal: 0.1, side: "left",
  },
  {
    id: "nose", part: "nose", title: "NOSE / CHASSIS",
    spec: "CRASH STRUCTURE",
    anchor: [0, -2.45, 0.62], screenOffset: [-170, 70], reveal: 0.2, side: "left",
  },
  {
    id: "front-susp", part: "front_susp", title: "FRONT SUSPENSION",
    spec: "PUSH-ROD · UPRIGHT",
    anchor: [0, -2.25, 0.6], screenOffset: [160, -140], reveal: 0.3, side: "right",
  },
  {
    id: "monocoque", part: "monocoque", title: "MONOCOQUE",
    spec: "SURVIVAL CELL · CFK",
    anchor: [0, -0.3, 0.75], screenOffset: [-170, -30], reveal: 0.4, side: "left",
  },
  {
    id: "sidepod", part: "sidepod_r", title: "SIDEPOD · COOLING",
    spec: "RADIATOR CORE · INLET",
    anchor: [0.62, -0.4, 0.62], screenOffset: [170, 40], reveal: 0.5, side: "right",
  },
  {
    id: "engine-cover", part: "engine_cover", title: "ENGINE COVER",
    spec: "POWER UNIT · AIRBOX",
    anchor: [0, 1.1, 1.05], screenOffset: [160, -110], reveal: 0.6, side: "right",
  },
  {
    id: "floor", part: "floor", title: "FLOOR",
    spec: "GROUND EFFECT · VENTURI",
    anchor: [0, 0.6, 0.28], screenOffset: [-170, 100], reveal: 0.7, side: "left",
  },
  {
    id: "rear-susp", part: "rear_susp", title: "REAR SUSPENSION",
    spec: "MULTI-LINK",
    anchor: [0, 3.05, 0.8], screenOffset: [170, 10], reveal: 0.8, side: "right",
  },
  {
    id: "rear-wing", part: "rear_wing", title: "REAR WING",
    spec: "DRS ACTUATOR",
    anchor: [0, 3.15, 1.1], screenOffset: [150, -120], reveal: 0.9, side: "right",
  },
  {
    id: "tyre", part: "wheel_fr", title: "TYRE ASSEMBLY",
    spec: "18-INCH · PIRELLI",
    anchor: [1.0, -1.92, 0.5], screenOffset: [170, 90], reveal: 1.0, side: "right",
  },
];

/** Labels shown on small screens (subset). */
export const MOBILE_LABEL_IDS = ["front-wing", "monocoque", "sidepod", "rear-wing", "tyre"];

/* ---------------- capability chapters ---------------- */

export interface CapabilityChapter {
  id: string;
  code: string;
  title: string;
  body: string;
  metric: { label: string; value: string }[];
  link?: { label: string; view: string };
}

export const CAPABILITIES: CapabilityChapter[] = [
  {
    id: "aero",
    code: "S/01",
    title: "AERODYNAMICS",
    body: "Every surface is a trade-off between downforce and drag. The strategy engine models how track position and dirty air change overtaking probability — the context in which every pit call is made.",
    metric: [
      { label: "FLOOR LOAD", value: "~50%" },
      { label: "DRS ZONES", value: "2–4" },
      { label: "CAR MASS", value: "798 KG" },
    ],
    link: { label: "Race Intelligence", view: "race-intelligence" },
  },
  {
    id: "tyres",
    code: "S/02",
    title: "TYRE PERFORMANCE",
    body: "Degradation is non-linear — grip collapses past the cliff. Empirical curves measured from 101,371 laps of telemetry show exactly where each compound falls off, per circuit and per stint.",
    metric: [
      { label: "COMPOUNDS", value: "5" },
      { label: "PIT LOSS", value: "19.9 S" },
      { label: "SAMPLE LAPS", value: "101,371" },
    ],
    link: { label: "Telemetry Lab", view: "telemetry" },
  },
  {
    id: "strategy",
    code: "S/03",
    title: "RACE STRATEGY",
    body: "One-stop or two? The simulator compares scenario timelines using measured degradation and pit loss, then asks the champion model whether it would box in the same state.",
    metric: [
      { label: "SCENARIOS", value: "A / B" },
      { label: "DECISIONS", value: "BOX · WATCH · STAY" },
      { label: "HORIZON", value: "PER-LAP" },
    ],
    link: { label: "Strategy Simulator", view: "strategy" },
  },
  {
    id: "telemetry",
    code: "S/04",
    title: "TELEMETRY",
    body: "Speed traces, throttle maps, braking points and gear shifts — synchronised on a shared distance axis, the way race engineers read a lap. Replay real stints lap by lap on the circuit map.",
    metric: [
      { label: "CHANNELS", value: "6+" },
      { label: "SYNC AXIS", value: "DISTANCE" },
      { label: "REPLAY", value: "LAP-BY-LAP" },
    ],
    link: { label: "Race Replay", view: "race-replay" },
  },
  {
    id: "ml",
    code: "S/05",
    title: "MACHINE LEARNING",
    body: "LightGBM champion with leaf-wise growth captures the sharp degradation cliff that beats level-wise boosting. Threshold-optimised at 0.64, tracked against four challenger models.",
    metric: [
      { label: "MODELS", value: "5" },
      { label: "PIT F1", value: "0.9445" },
      { label: "THRESHOLD", value: "0.64" },
    ],
    link: { label: "Model Intelligence", view: "models" },
  },
];

/* ---------------- scroll timeline keyframes ---------------- */

export interface SceneState {
  /** camera azimuth (radians, 0 = front of car) */
  camAz: number;
  /** camera polar (radians, 0 = top) */
  camPol: number;
  /** camera distance in world units */
  camRad: number;
  /** camera look-at height */
  targetY: number;
  /** screen-space horizontal shift of subject (world units; >0 pushes car right) */
  shiftX: number;
  /** screen-space vertical shift (world units; >0 pushes car down… camera up) */
  shiftY: number;
  /** global explode progress 0..1 */
  explode: number;
  /** label reveal progress 0..1 */
  labels: number;
  /** hero turntable spin (radians) */
  spin: number;
}

export const INITIAL_SCENE_STATE: SceneState = {
  camAz: (40 * Math.PI) / 180,
  camPol: (79 * Math.PI) / 180,
  camRad: 8.6,
  targetY: 0.42,
  shiftX: 1.55,
  shiftY: 0,
  explode: 0,
  labels: 0,
  spin: 0,
};

/** master timeline: [start, end, props] — values tweened within the window */
export const TIMELINE: {
  start: number;
  end: number;
  props: Partial<Record<keyof SceneState, number>>;
  ease?: string;
}[] = [
  { start: 0.0, end: 0.12, props: { camAz: (52 * Math.PI) / 180, spin: 0.22 }, ease: "none" },
  {
    start: 0.1,
    end: 0.27,
    props: { camAz: (118 * Math.PI) / 180, camRad: 7.6, shiftX: 0, spin: 0.35 },
    ease: "power1.inOut",
  },
  {
    start: 0.24,
    end: 0.46,
    props: { explode: 1, camPol: (72 * Math.PI) / 180, camRad: 9.4, camAz: (150 * Math.PI) / 180, spin: 0.35 },
    ease: "power2.inOut",
  },
  {
    start: 0.44,
    end: 0.56,
    props: { labels: 1, camRad: 10.6, camAz: (168 * Math.PI) / 180, targetY: 0.55 },
    ease: "power2.inOut",
  },
  {
    start: 0.56,
    end: 1.0,
    props: { camAz: ((360 + 48) * Math.PI) / 180, camPol: (75 * Math.PI) / 180, camRad: 9.6 },
    ease: "none",
  },
];

/** capability panel visibility windows (progress space) — sequential, no overlap */
export const CHAPTER_WINDOWS: [number, number][] = [
  [0.58, 0.665],
  [0.675, 0.76],
  [0.77, 0.855],
  [0.86, 0.945],
  [0.95, 1.001],
];

export const MODEL_URL = "/models/f1_car_parts.glb";
export const DECODER_PATH = "/models/draco/";
