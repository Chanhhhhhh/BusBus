/** Shared enums and data contracts for the Bus Away playable. */

export enum BusColor {
    Red = 0,
    Blue = 1,
    Green = 2,
    Yellow = 3,
    Purple = 4,
}

export type SeatCount = 4 | 6 | 10;

export interface BusSpec {
    color: BusColor;
    seats: SeatCount;
}

export interface LevelDef {
    id: number;
    /** Maximum number of buses allowed on the road loop at the same time. */
    roadCapacity: number;
    /** Bus rows, head of the row first. Only the head can be dispatched. */
    rows: BusSpec[][];
    /**
     * Passenger queue of each bus stop, in the order the buses reach the stops, head first.
     * Together they must contain exactly as many passengers as there are seats.
     */
    stops: BusColor[][];
}

export enum BusState {
    /** Waiting in a row, not yet dispatched. */
    InRow,
    /** Driving from its row / parking slot towards the road entry and along the road. */
    OnRoad,
    /** Stopped at the bus stop, passengers are boarding. */
    Boarding,
    /** Full: leaving through the gate. */
    Exiting,
    /** Not full: driving back to a free parking slot. */
    Returning,
    /** Reverse-parking manoeuvre in progress. */
    Parking,
    /** Parked in a slot, can be dispatched again. */
    Parked,
    /** Left the level. */
    Gone,
}

export enum GameState {
    Playing,
    Won,
    Lost,
}
