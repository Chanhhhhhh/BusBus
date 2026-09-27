/**
 * Every tunable number and UI string of the game. Values are in world units (metres), seconds
 * and degrees. Per-prefab data (seat count, bus length, seat layout) lives on the prefabs, and
 * per-scene placement (markers, camera pitch, bounds) lives in the scene.
 */
export const GameConfig = {
    design: { width: 1080, height: 1920 },

    bus: {
        maxSpeed: 12,
        accel: 18,
        decel: 20,
        wheelRadius: 0.24,
        /** Extra distance kept between two buses queued on the road. */
        queueGap: 0.7,
        /** Gap between two buses standing in the same row. */
        rowGap: 0.45,
        /** Reverse-park manoeuvre: the bus drives this far past the slot, then backs in over `parkDuration`. */
        parkOvershoot: 1.5,
        parkDuration: 0.9,
        /**
         * Buses behind a dispatched bus roll forward with the same accel / brake profile as the
         * leader (so they can never catch up with it), each starting this much later than the one
         * in front.
         */
        rowShiftStagger: 0.08,
        /** "Đóng hòm": the lid drops from this height onto the bus. */
        lidDropHeight: 1.6,
        lidDropDuration: 0.32,
        lidPunch: { amount: 0.08, duration: 0.3 },
        parkPunch: { amount: 0.06, duration: 0.25 },
        tapPunch: { amount: 0.1, duration: 0.3 },
        rejectWobble: { degrees: 5, duration: 0.3 },
        /**
         * Fake suspension: the body (not the wheels) pitches with longitudinal acceleration and
         * rolls with lateral acceleration, on a damped spring so it settles with a small bounce.
         * Angles in degrees, accelerations in m/s².
         */
        suspension: {
            pitchPerAccel: 0.32,
            maxPitch: 7,
            rollPerAccel: 0.2,
            maxRoll: 8,
            stiffness: 150,
            damping: 13,
            /** Velocity spikes above this are treated as teleports and ignored. */
            maxAccel: 60,
            /** Spring kicks (deg/s): a passenger dropping into a seat, the lid slamming shut. */
            boardKick: 70,
            lidKick: 160,
        },
        /** The bus the hint points at hops on the spot. */
        hintBob: { height: 0.1, period: 0.5 },
    },

    road: {
        /** Catmull-Rom samples per waypoint segment. */
        splineSamples: 8,
        /** Corner rounding applied to every driving path (radius / curve subdivisions). */
        cornerRadius: 1.2,
        cornerSubdivisions: 6,
        /** Corners with a smaller cross product are treated as straight and not rounded. */
        straightThreshold: 0.02,
    },

    palette: {
        /** Outline colour = body colour multiplied by this factor. */
        outlineDarken: 0.45,
    },

    boarding: {
        /** Delay between two passengers leaving the queue for the same bus. */
        interval: 0.18,
        walkSpeed: 5.5,
        /** Distance from the bus centre to the point where a passenger hops in. */
        doorOffset: 1.35,
        /** Scale applied to a passenger once seated. */
        seatedScale: 0.78,
        /** Passengers hop from the door into their seat: arc height and duration. */
        hopHeight: 0.9,
        hopDuration: 0.28,
        /** How often the bus re-checks whether the last walkers have sat down before leaving. */
        settlePoll: 0.1,
    },

    passenger: {
        /** Passengers rendered in the queue; the rest is only a counter on the sign. */
        visibleInQueue: 10,
        queueSpacing: 0.62,
        walkSpeed: 3.2,
        scale: 0.9,
        spawnPopDuration: 0.3,
        /** Animation cross-fade times. */
        fade: { idle: 0.15, walk: 0.1, sit: 0.05 },
    },

    input: {
        /** Extra world-space padding around the bus bounds when picking a tap (XZ). */
        tapPadding: 0.25,
    },

    camera: {
        /** Distance range and precision of the framing search. */
        minDistance: 4,
        maxDistance: 400,
        searchIterations: 24,
        /** Bisection steps used to balance the slack above / below the framed box. */
        shiftIterations: 16,
        /** Small pull-back after the search so the box never touches the margin. */
        distanceSafety: 1.002,
        /** Screen shakes (world units, seconds). */
        shake: {
            lid: { amplitude: 0.1, duration: 0.25 },
            lose: { amplitude: 0.3, duration: 0.5 },
        },
    },

    hint: {
        /** Seconds without a valid tap before the tap hint is shown again. */
        idleDelay: 3.5,
    },

    hud: {
        /** Height above a world anchor (sign, bus) where HUD widgets are placed. */
        anchorHeight: 1.2,
        /**
         * Where the counters sit on the sign boards, in the sign mesh's local space (the board
         * face is x [-0.35, 0.35], y [0.32, 0.79], front at z 0.10). `scale` = mesh units per UI unit.
         */
        signCounter: {
            offset: { x: 0, y: 0.555, z: 0.11 },
            scale: 0.0058,
        },
    },

    autoplay: {
        /** Seconds between two automatic dispatch attempts (debug modes `?auto=1|2|3`). */
        interval: 0.5,
    },

    barrier: {
        /** Name of the hinged arm node inside the Barrier prefab (mesh extends along its local +Z). */
        armNode: 'Barrier_Open',
        /** Arm rotation about the hinge when open (degrees, negative = tip up). */
        openAngle: -85,
        openDuration: 0.35,
        closeDuration: 0.5,
        punch: { amount: 0.18, duration: 0.4 },
    },

    /** Defaults of the tween helpers in fx/Juice.ts. */
    fx: {
        punch: { amount: 0.15, duration: 0.28, attackRatio: 0.35, squashFactor: 0.6 },
        popDuration: 0.3,
        wobble: { degrees: 6, duration: 0.32, secondSwing: 0.5 },
        arcDuration: 0.28,
        /**
         * Presets of the 2D particle bursts drawn on the canvas (fx/FxLayer.ts). Sizes and speeds
         * are in design pixels, life in seconds, gravity in px/s² (positive = falls).
         */
        burst: {
            /** Bus is full: a ring of dots in the bus colour. */
            full: { count: 14, size: 22, speed: 560, life: 0.55, gravity: 700, angle: 90, spread: 180, spin: 720 },
            /** Puff behind a bus that starts driving. */
            exhaust: { count: 5, size: 44, speed: 120, life: 0.5, gravity: -120, angle: 90, spread: 180 },
            /** Win: rectangles raining from the top edge. */
            confetti: { count: 70, size: 26, speed: 260, life: 2.2, gravity: 520, angle: -90, spread: 70, stretch: 0.55, spin: 540, spawnWidth: 1080 },
        },
        exhaustColor: { r: 210, g: 210, b: 210, a: 170 },
        confettiColors: [
            { r: 255, g: 90, b: 90 }, { r: 90, g: 160, b: 255 }, { r: 110, g: 220, b: 120 },
            { r: 255, g: 210, b: 60 }, { r: 190, g: 110, b: 255 }, { r: 255, g: 255, b: 255 },
        ],
        /** Floating labels such as "FULL!": start this far above the anchor and rise further (design px). */
        floatText: { fontSize: 64, startOffset: 110, rise: 150, duration: 0.85, popScale: 1.3 },
    },

    ui: {
        /** Delay between the last bus leaving / the failed return and the end card. */
        resultDelay: 0.8,
        loseExtraDelay: 0.5,
        toastDuration: 1.1,
        loseToastDuration: 1.4,
        text: {
            level: 'LEVEL {n}',
            capacity: 'ROAD {n}/{max}',
            roadFull: 'ROAD FULL!',
            notFront: 'ONLY THE FRONT BUS CAN GO!',
            noParking: 'NO PARKING LEFT!',
            busFull: 'FULL!',
        },
        anim: {
            hintPulseScale: 1.18,
            hintPulseDuration: 0.45,
            toastStartScale: 0.6,
            toastIn: 0.18,
            toastOut: 0.15,
            counterBumpScale: 1.25,
            counterBumpIn: 0.1,
            counterBumpOut: 0.18,
            panelStartScale: 0.6,
            panelIn: 0.4,
            ctaPulseScale: 1.08,
            ctaPulseDuration: 0.5,
            ctaPulseDelay: 0.4,
        },
    },
};
