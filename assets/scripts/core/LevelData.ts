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
 * Level 1. Designed so that, apart from two identical G4 buses, only one bus of the colour
 * at the head of the queue is ever available: any matching tap keeps the level solvable.
 * 12 trips, at most 2 buses parked at once, 54 passengers.
 */
export const LEVEL_1: LevelDef = {
    id: 1,
    roadCapacity: 2,
    rows: [
        [bus(Y, 6), bus(B, 10), bus(P, 4)],
        [bus(R, 4), bus(P, 6), bus(Y, 4)],
        [bus(G, 6), bus(R, 10)],
        [bus(G, 4)],
    ],
    passengers: queue([
        [Y, 3], [R, 4], [G, 6], [Y, 3], [P, 6], [B, 5], [G, 4], [P, 4], [Y, 4],
        [R, 6], [B, 5], [R, 4],
    ]),
};

/** Sanity check used at start-up: every seat must have exactly one passenger. */
export function validateLevel(level: LevelDef): string | null {
    let seats = 0;
    for (const row of level.rows) for (const spec of row) seats += spec.seats;
    if (seats !== level.passengers.length) {
        return `Level ${level.id}: ${seats} seats but ${level.passengers.length} passengers`;
    }
    return null;
}
