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
  haltDecel: 5,         // a derailed or crashed tram grinds to a halt [m/s²]
};

export const LIMITS = {
  lineSpeed: 50,        // when the route doesn't set one [km/h]
  aLat: 0.7,            // lateral acceleration curves are signed for [m/s²]: v_safe = √(aLat · R)
  step: 5,              // curve limits are rounded down to this [km/h]
  derail: 1.4,          // derailment above this multiple of the safe curve speed (GDD §5)
  tolerance: 2,         // overspeed is penalized above limit + tolerance [km/h]
  overspeedRate: 20,    // points per second of overspeed
  warnAhead: 220,       // the HUD announces a lower limit this far ahead [m]
};

// Passenger comfort 0–100 (GDD §6.3).
export const COMFORT = {
  jerkFree: 1,          // jerk passengers don't mind [m/s³]
  jerk: 5,              // comfort lost per m/s² of acceleration change above that
  lateralFree: 0.7,     // lateral acceleration passengers don't mind [m/s²] (= LIMITS.aLat)
  lateral: 25,          // comfort lost per second per m/s² of lateral acceleration above that
  emergency: 10,        // pulling the emergency brake
  doorsSlam: 10,        // doors closed on boarding passengers
  recover: 0.4,         // per second of smooth riding
  bonus: 10,            // end of run: points per percent of average comfort
};

// Timetable (GDD §6.2). Times are game seconds; the game clock runs timeScale × faster than real time.
export const TIMETABLE = {
  timeScale: 4,
  leadIn: 16,           // the run starts this long before the first departure [game s]
  slack: 1,             // driving time allowance over the reference profile
  refBrake: 1,          // reference profile braking [m/s²]
  refMargin: 2,         // the reference profile stays this far under the limit [km/h]
  reaction: 2,          // reference dwell: the driver's reactions on top of doors and boarding [s]
  signalAllowance: 2,   // per tram signal on the way [real s]
  round: 15,            // departures are rounded up to this [game s]
  earlyTolerance: 5,    // on time = from 0:05 early …
  lateTolerance: 30,    // … to 0:30 late [game s]
  onTimePoints: 300,
  earlyPenalty: 400,
  latePerSecond: 4,     // per game second beyond the tolerance
  lateMax: 400,
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
  // request stops (GDD §6.1): sometimes nobody gets on or off – the tram may pass through
  requestEmpty: 0.5,      // chance that nobody needs the stop
  requestAlight: 0.5,     // otherwise: chance that it's somebody inside pressing the button
  requestSkipPoints: 400, // passing an empty request stop
  requestMissPenalty: 300, // passing a request stop somebody needed
  continuePenalty: 1000,  // continuing from the last served stop after a failed run
};

// The street: signals, traffic and hazards (GDD §7).
export const STREET = {
  envelope: 1.25,         // half-width of the tram's swept path [m]
  crossHalf: 6,           // cross street half-width [m]
  stopLineBack: 10,       // the tram stop line is this far before the intersection centre [m]
  signal: { cycle: 36, go: 18, prepare: 5 },   // tram signal timing [real s]; prepare = "about to change"
  penaltyRed: 500,        // passing the stop line on a stop aspect
  penaltyCollision: 500,  // minor collision with a car
  fatalSpeed: 15,         // collisions with cars above this end the run [km/h]
  collisionComfort: 25,
  // a hazard commits only while the tram can still stop at commitBrake after commitReaction (+ margin) …
  commitBrake: 1.2,
  commitReaction: 1.5,
  commitMargin: 8,
  // … and never once the tram couldn't stop at B4 after a short reaction – every hazard is avoidable
  fairBrake: 1.6,
  fairReaction: 0.6,
  fairMargin: 3,
  bellRange: 90,          // hazards hear the bell this far ahead [m]
  bellSpam: 2.5,          // rings closer together than this upset the passengers [s]
  bellSpamComfort: 3,
  warnRange: 150,         // the HUD warns about hazards on the track this far ahead [m]
  signalAhead: 220,       // the HUD shows the next signal this far ahead [m]
};

export const CITY = {
  chunk: 100,             // street geometry is merged per chunk of this length
  drawAhead: 650,
  drawBehind: 40,
  poleSpacing: 30,
  gauge: 1.435,
  foundation: 30,         // buildings reach this far below the street, so hills never show a gap [m]
};

// Street looks per city (route `look`): the street profile, paving, buildings (GDD §13).
export const LOOKS = {
  modern: {
    roadHalf: 7,          // road edge (kerb), lateral distance from the track
    facade: 10,           // building line
    road: '#55585c',
    trackbed: '#7a7266',
    sidewalk: '#a49e94',
    curb: '#8d877e',
    dashes: true,         // lane markings
    floors: [3, 6],
    roofs: 0,             // share of pitched roofs
    palette: ['#d9c7a3', '#c98f6b', '#e0d6b8', '#b8c4b0', '#d4a373', '#a8b5c4', '#e6c79c', '#c4a6a0'],
    roofColors: ['#8a7f70'],
  },
  // the old town: narrow cobbled streets, lower houses with pitched roofs, warm colours
  altstadt: {
    roadHalf: 5.5,
    facade: 8,
    road: '#6e655b',
    trackbed: '#655c53',
    sidewalk: '#9c9184',
    curb: '#857a6d',
    dashes: false,
    floors: [2, 4],
    roofs: 0.8,
    palette: ['#e2c58f', '#d98e5f', '#efe0bd', '#b9c7a5', '#d6a35b', '#c9b6d6', '#f0d39a', '#d2a19a', '#a9c1c9'],
    roofColors: ['#a5532f', '#8c4a2f', '#9a5a3a', '#4f545c'],
  },
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
