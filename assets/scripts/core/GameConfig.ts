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
        /** Time for the reverse-park manoeuvre into a slot. */
        parkDuration: 0.7,
        /** Wheel travel applied per frame while reversing (visual only). */
        parkWheelSpin: 0.06,
        /** Time for the buses behind a dispatched bus to roll forward in their row. */
        rowShiftDuration: 0.35,
        /** "Đóng hòm": the lid drops from this height onto the bus. */
        lidDropHeight: 1.6,
        lidDropDuration: 0.32,
        lidPunch: { amount: 0.08, duration: 0.3 },
        parkPunch: { amount: 0.06, duration: 0.25 },
        tapPunch: { amount: 0.14, duration: 0.3 },
        rejectWobble: { degrees: 5, duration: 0.3 },
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
        /** Passengers drop into their seat from this height, over this time. */
        dropHeight: 1.2,
        dropDuration: 0.25,
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
        /** Small pull-back after the search so the box never touches the margin. */
        distanceSafety: 1.002,
    },

    hint: {
        /** Seconds without a valid tap before the tap hint is shown again. */
        idleDelay: 3.5,
    },

    hud: {
        /** Height above a world anchor (sign, bus) where HUD widgets are placed. */
        anchorHeight: 1.2,
    },

    autoplay: {
        /** Seconds between two automatic dispatch attempts (debug modes `?auto=1|2|3`). */
        interval: 0.5,
    },

    barrier: {
        punch: { amount: 0.18, duration: 0.4 },
    },

    /** Defaults of the tween helpers in fx/Juice.ts. */
    fx: {
        punch: { amount: 0.15, duration: 0.28, attackRatio: 0.35, squashFactor: 0.6 },
        popDuration: 0.3,
        wobble: { degrees: 6, duration: 0.32, secondSwing: 0.5 },
        dropDuration: 0.28,
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
            noParking: 'NO PARKING LEFT!',
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
