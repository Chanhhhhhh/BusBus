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
        /**
         * Front and rear axle distance from the bus centre, as a fraction of the bus length. Both
         * axles follow the path, so the body cuts corners like a real vehicle instead of swinging
         * its rear out (a centre-on-path bus sweeps into the row heads when it turns off the lane).
         */
        axleOffset: 0.4,
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

    /** Collision avoidance between buses (game/Traffic.ts). Metres. */
    traffic: {
        /** Free distance a bus keeps in front of its bumper. Must stay below `bus.rowGap`. */
        gap: 0.35,
        /** Half width of the strip kept free in front of the bumper (narrower than the bus, see Traffic.blockerAt). */
        noseHalfWidth: 0.4,
        /**
         * Half width of a bus footprint (bodies are ~0.64-0.70 wide each side of the centre line).
         * The lot is tight: with the slots at z -8.85 a 3.2 m bus turning out of a row clears the
         * parked buses by only a few centimetres.
         */
        halfWidth: 0.68,
        /**
         * How far ahead a driving bus looks for obstacles and claims its path. Far more than its
         * braking distance (maxSpeed² / (2 decel) = 3.6): a bus with right of way must claim a
         * crossing before a bus waiting next to it (e.g. a row head beside the lane) pulls out.
         */
        reach: 30,
        probeStep: 0.3,
        /** A bus whose way is blocked closer than this counts as waiting (deadlock detection). */
        heldDistance: 0.5,
        /** Bisection steps refining where a probe first touches an obstacle. */
        refineSteps: 5,
        /** Spacing of the footprints a bus claims along its path, and samples per reverse-park sweep. */
        claimStep: 0.25,
        /**
         * Claimed footprints are this much longer / wider on each side, so a bus waiting beside a
         * claimed path stands clear of the corners of the bus that will drive through.
         */
        claimMargin: 0.1,
        sweepSamples: 10,
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
        /** Height above the bus origin (roof) where the fingertip of the hand points. */
        handHeight: 0.6,
    },

    hud: {
        /** Outline of the ROAD label, matching its pill: green while there is room, red when full. */
        capacityOutline: {
            free: { r: 40, g: 105, b: 15, a: 255 },
            full: { r: 125, g: 15, b: 30, a: 255 },
        },
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
        /**
         * The gate sign (buses left) is re-coloured so it cannot be mistaken for a bus-stop sign
         * (passengers left): its UVs are shifted along Asset_Texture, a strip of colour columns
         * 0.1 wide, so the light-blue frame samples the orange column (same orange as the barrier).
         */
        gateSign: {
            uvShift: 0.7,
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

    /** Defaults of the juice animations in services/AnimService.ts. */
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
            /** Tapped bus sets off: a small ring of stars in the bus colour that shoots out and settles. */
            tap: {
                shape: 'star' as const, count: 8, size: 34, speed: 900, drag: 7, life: 0.5, gravity: 0,
                angle: 90, spread: 180, spin: 360, radius: 40, grow: 0.15,
            },
            /** Bus is full: a big star explosion that arcs down... */
            full: {
                shape: 'star' as const, count: 16, size: 46, speed: 1400, drag: 5, life: 0.85, gravity: 420,
                angle: 90, spread: 180, spin: 540, radius: 60, grow: 0.12,
            },
            /** ...plus small stars drifting up over the bus. */
            fullSparkle: {
                shape: 'star' as const, count: 10, size: 24, speed: 260, life: 1.0, gravity: -150,
                angle: 90, spread: 45, spin: 240, spawnWidth: 180, grow: 0.3,
            },
            /** Win: rectangles raining from the top edge. */
            confetti: { count: 70, size: 26, speed: 260, life: 2.2, gravity: 520, angle: -90, spread: 70, stretch: 0.55, spin: 540, spawnWidth: 1080 },
        },
        /** Single star behind the bursts: pops in, keeps expanding while it fades (FxLayer.flash). */
        flash: {
            tap: { shape: 'star' as const, size: 80, peakScale: 1, endScale: 1.25, duration: 0.32, grow: 0.35, spin: 90 },
            full: { shape: 'star' as const, size: 110, peakScale: 1.15, endScale: 1.5, duration: 0.6, grow: 0.3, spin: 120 },
        },
        /** Alpha of the white flash star (0-255). */
        flashAlpha: { tap: 130, full: 160 },
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
        /**
         * Every button (BaseView + AnimService): an idle scale pulse that never stops while the view
         * is shown. Press feedback is the cc.Button COLOR transition (tint), which leaves the scale alone.
         */
        button: {
            /** Idle pulse: uniform scale between `pulseMax` and `pulseMin`, `pulseHalf` seconds each way. */
            pulseMax: 1.08,
            pulseMin: 0.96,
            pulseHalf: 0.45,
            /** Delay before the pulse starts when the button appears. */
            startDelay: 0.4,
        },
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
            /** Hand tap loop: press down to this scale, release, then rest. */
            hintPressScale: 0.82,
            hintPressIn: 0.14,
            hintPressOut: 0.28,
            hintPressRest: 0.35,
            /** Result-card icon pops in this long after the panel starts. */
            iconDelay: 0.2,
            /** Slow "breathing" of the instruction bar: peak scale and seconds per half cycle. */
            hintBreathScale: 1.04,
            hintBreathHalf: 0.9,
            toastStartScale: 0.6,
            toastIn: 0.18,
            toastOut: 0.15,
            counterBumpScale: 1.25,
            counterBumpIn: 0.1,
            counterBumpOut: 0.18,
            panelStartScale: 0.6,
            panelIn: 0.4,

        },
    },
};
