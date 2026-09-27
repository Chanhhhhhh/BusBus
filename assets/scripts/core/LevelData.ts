import { BusColor, BusSpec, LevelDef } from './Types';

const R = BusColor.Red;
const B = BusColor.Blue;
const G = BusColor.Green;
const Y = BusColor.Yellow;
const P = BusColor.Purple;

function bus(color: BusColor, seats: 4 | 6 | 10): BusSpec {
    return { color, seats };
}

/** Expands `[colour, count]` segments into a flat passenger queue. */
function queue(segments: [BusColor, number][]): BusColor[] {
    const out: BusColor[] = [];
    for (const [color, count] of segments) {
        for (let i = 0; i < count; i++) out.push(color);
    }
    return out;
}

/**
 * Level 1. Two bus stops: a bus boards at the first stop, then at the second one, and only
 * parks if it is still not full. Following the hint wins in 9 trips; tapping random buses that
 * match one of the two queue heads wins ~87 % of the time (sequential model, 4 parking slots).
 * 54 passengers: 28 at the first stop, 26 at the second.
 */
export const LEVEL_1: LevelDef = {
    id: 1,
    roadCapacity: 4,
    rows: [
        [bus(Y, 6), bus(B, 10), bus(P, 4)],
        [bus(R, 4), bus(P, 6), bus(Y, 4)],
        [bus(G, 6), bus(R, 10)],
        [bus(G, 4)],
    ],
    stops: [
        queue([[Y, 3], [G, 6], [P, 6], [G, 4], [Y, 4], [B, 5]]),
        queue([[R, 4], [Y, 3], [B, 5], [P, 4], [R, 6], [R, 4]]),
    ],
};

/** Sanity check used at start-up: every seat must have exactly one passenger. */
export function validateLevel(level: LevelDef): string | null {
    let seats = 0;
    for (const row of level.rows) for (const spec of row) seats += spec.seats;
    let passengers = 0;
    for (const queue of level.stops) passengers += queue.length;
    if (seats !== passengers) {
        return `Level ${level.id}: ${seats} seats but ${passengers} passengers`;
    }
    return null;
}
