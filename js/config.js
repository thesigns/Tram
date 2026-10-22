// Game tuning constants. Units: meters, seconds, radians (route data uses degrees and percent).

export const SIM = {
  hz: 60,               // fixed simulation step
};

export const PHYSICS = {
  g: 9.81,
  rolling: 0.02,        // rolling resistance [m/s²]
  aero: 1.5e-4,         // aerodynamic drag, a = aero · v² [1/m]
  effortTau: 0.35,      // build-up time constant of traction and the service brake [s]
  ebTau: 0.15,          // build-up time constant of the emergency brake [s]
  doorTime: 1.6,        // doors fully open / fully closed [s]
};

// Deceleration per notch (GDD §5): service brake B1–B4 and the emergency brake [m/s²].
export const BRAKE = {
  service: [0.4, 0.8, 1.2, 1.6],
  emergency: 2.8,
};

export const TRAMS = {
  classic: {
    name: 'Classic',
    mass: 17000,            // [kg]
    tractiveForce: 20400,   // P4 at standstill [N] → 1.2 m/s²
    baseSpeed: 30 / 3.6,    // constant force up to here, constant power above
    maxSpeed: 70 / 3.6,     // the motors stop pulling here
    length: 15,
    doors: [1.6, 7.4, 13.2], // door centres, meters behind the front
    eyeBack: 1.4,           // driver's eye behind the front
    eyeHeight: 2.4,         // driver's eye above the rail top
  },
};

export const STOPS = {
  platformLength: 30,
  markerFromEnd: 4,       // the stop marker stands this far before the platform end
  platformEdge: 1.45,     // platform edge, lateral distance from the track centreline
  platformWidth: 3,
  platformHeight: 0.25,
  doorMargin: 0.6,        // a door counts as "on the platform" with this much platform on both sides
  // rating by |error| of the tram front vs. the marker [m] (GDD §6.1); doors on the platform otherwise = OK
  ratings: [
    { max: 0.5, name: 'PERFECT', points: 1000 },
    { max: 1.5, name: 'GREAT', points: 700 },
    { max: 3, name: 'GOOD', points: 400 },
  ],
  okPoints: 150,
  comboStep: 0.25,        // +25% per consecutive PERFECT/GREAT stop
  comboMax: 2,
  boardInterval: 0.6,     // one passenger boards every … [s]
  boardExtra: 1.2,        // after the last one
  alightTime: 2,          // terminus: everybody gets off
  penaltyDoorsAway: 200,
  penaltyLeftBehind: 150,
  precisionRange: 20,     // the HUD switches to the precision bar this close to the marker
};

export const CITY = {
  chunk: 100,             // street geometry is merged per chunk of this length
  drawAhead: 650,
  drawBehind: 40,
  roadHalf: 7,
  facade: 10,             // building line, lateral distance from the track
  poleSpacing: 30,
  gauge: 1.435,
  palette: ['#d9c7a3', '#c98f6b', '#e0d6b8', '#b8c4b0', '#d4a373', '#a8b5c4', '#e6c79c', '#c4a6a0'],
};

export const WORLD = {
  fogNear: 70,
  fogFar: 560,
  fogColor: 0xc9d3d8,
  skyTop: 0x6f97c4,
  ground: 0x8a8f80,
  sunDir: [-0.4, 0.75, 0.35],
};

export const VIEW = {
  hfovPortrait: 66,       // degrees
  hfovLandscape: 88,
  centerPortrait: 0.35,   // optical centre, fraction of the screen height from the top
  centerLandscape: 0.45,
  headTilt: -0.04,        // look slightly down at the street [rad]
  lookAhead: 14,          // the view turns towards the track this far ahead (looking into curves)
};
