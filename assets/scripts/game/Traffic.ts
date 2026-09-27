import { Vec3 } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { BusState } from '../core/Types';
import { Bus, ParkPlan } from './Bus';

const D2R = Math.PI / 180;
const CFG = GameConfig.traffic;

/** Oriented rectangle on the ground plane (XZ): centre, unit forward vector, half length / width. */
class Footprint {
    x = 0;
    z = 0;
    fx = 0;
    fz = 1;
    hl = 1;
    hw = 0.5;
    /** Radius of the bounding circle, for a cheap rejection before the SAT test. */
    radius = 1;

    set(x: number, z: number, fx: number, fz: number, hl: number, hw: number): this {
        this.x = x;
        this.z = z;
        this.fx = fx;
        this.fz = fz;
        this.hl = hl;
        this.hw = hw;
        this.radius = Math.sqrt(hl * hl + hw * hw);
        return this;
    }

    overlaps(o: Footprint): boolean {
        const dx = o.x - this.x;
        const dz = o.z - this.z;
        const r = this.radius + o.radius;
        if (dx * dx + dz * dz >= r * r) return false;
        // Separating axis test on the two forward and the two side axes.
        return Footprint.overlapOn(this, o, dx, dz, this.fx, this.fz)
            && Footprint.overlapOn(this, o, dx, dz, this.fz, -this.fx)
            && Footprint.overlapOn(this, o, dx, dz, o.fx, o.fz)
            && Footprint.overlapOn(this, o, dx, dz, o.fz, -o.fx);
    }

    private static overlapOn(a: Footprint, b: Footprint, dx: number, dz: number, ax: number, az: number): boolean {
        const ra = a.hl * Math.abs(a.fx * ax + a.fz * az) + a.hw * Math.abs(a.fz * ax - a.fx * az);
        const rb = b.hl * Math.abs(b.fx * ax + b.fz * az) + b.hw * Math.abs(b.fz * ax - b.fx * az);
        return Math.abs(dx * ax + dz * az) < ra + rb;
    }
}

/**
 * Footprints belonging to one bus: its body, a stretch of path it claims, or a reverse-park
 * sweep. The bounding box lets a probe skip the whole group at once.
 */
class Group {
    readonly shapes: Footprint[] = [];
    private minX = Infinity;
    private maxX = -Infinity;
    private minZ = Infinity;
    private maxZ = -Infinity;

    /** `claim`: only the promise of a future position, which a deadlock breaker may ignore. */
    constructor(readonly owner: Bus, readonly claim: boolean) {}

    add(shape: Footprint): void {
        this.shapes.push(shape);
        this.minX = Math.min(this.minX, shape.x - shape.radius);
        this.maxX = Math.max(this.maxX, shape.x + shape.radius);
        this.minZ = Math.min(this.minZ, shape.z - shape.radius);
        this.maxZ = Math.max(this.maxZ, shape.z + shape.radius);
    }

    hits(shape: Footprint): boolean {
        const r = shape.radius;
        if (shape.x + r < this.minX || shape.x - r > this.maxX || shape.z + r < this.minZ || shape.z - r > this.maxZ) return false;
        for (const s of this.shapes) if (s.overlaps(shape)) return true;
        return false;
    }
}

/** What stopped a driver: the bus in the way, and whether only its claim (not its body) is in the way. */
interface Block {
    by: Bus;
    claim: boolean;
}

/**
 * Keeps buses from driving into each other anywhere in the level (rows, lot lanes, road loop,
 * gate).
 *
 * Every frame each bus driving along a path probes the footprints it is about to occupy and gets
 * `maxS` set just before the first one that would touch an obstacle (Bus.update brakes smoothly
 * towards it). Obstacles are:
 * - the current footprint of every other bus (moving, parked, in a row, mid-manoeuvre);
 * - the path claimed by buses with right of way (earlier `tripOrder`): each driver claims its
 *   path up to `reach` metres ahead or up to what blocks it, so a bus dispatched earlier goes
 *   first through every merge and crossing, even while it is still far from it;
 * - the swept area of a reverse park: always while it runs (a tween cannot stop), and as a claim
 *   for buses with less right of way while the bus is still heading to its slot.
 * A returning bus only starts its reverse park (`canStartPark`) once that swept area is free.
 *
 * Deadlocks: a bus that already stands in another one's path blocks it with its body while it
 * waits for that bus's claim. When blocked buses wait on each other in a cycle, a bus of the
 * cycle held back only by a claim ignores the claims of the cycle: whoever is already in the way
 * goes first. If the cycle is made of bodies only (a layout where two lanes overlap), the bus
 * with the most right of way forces its way and a warning is logged.
 * Bodies and running sweeps a bus already touches are ignored, so overlapping buses drive apart
 * instead of freezing.
 */
export class Traffic {
    private readonly pool: Footprint[] = [];
    private used = 0;
    private readonly bodies = new Map<Bus, Footprint>();
    private readonly sweeps = new Map<Bus, Group>();
    /** Path claims of the drivers processed so far this frame (i.e. with more right of way). */
    private readonly claims: Group[] = [];
    /** What blocked each driver in the previous frame (deadlock detection), and in this one. */
    private blockedBy = new Map<Bus, Block>();
    private nextBlockedBy = new Map<Bus, Block>();
    /** Obstacles of the driver being processed: hard ones first, then claims. */
    private readonly solids: Group[] = [];
    private readonly promises: Group[] = [];
    private readonly probe = new Footprint();
    private readonly nose = new Footprint();
    private readonly tmpPos = new Vec3();
    private readonly tmpDir = new Vec3();

    /** Sets `maxS` on every bus that drives along a path. Call once per frame. */
    update(buses: readonly Bus[]): void {
        this.used = 0;
        this.bodies.clear();
        this.sweeps.clear();
        this.claims.length = 0;
        this.nextBlockedBy.clear();

        const active = buses.filter((b) => b.isValid && b.state !== BusState.Gone);
        for (const bus of active) {
            this.bodies.set(bus, this.bodyOf(bus, this.take()));
            if (bus.parkPlan) this.sweeps.set(bus, this.sweep(bus, bus.isParking ? bus.parkT : 0));
        }

        const drivers = active.filter((b) => b.isMoving && b.currentTrip);
        drivers.sort((a, b) => a.tripOrder - b.tripOrder);
        const cycle = this.findCycle(drivers);
        let breaker: Bus | null = null;
        let force = false;
        if (cycle.length) {
            breaker = cycle.find((b) => this.blockedBy.get(b).claim) ?? null;
            if (!breaker) {
                force = true;
                breaker = cycle.reduce((a, b) => (a.tripOrder <= b.tripOrder ? a : b));
                console.warn(`[traffic] gridlock, ${breaker.node.name} forces its way: ${cycle.map(Traffic.describe).join(' / ')}`);
            }
        }

        for (const bus of drivers) {
            this.collectObstacles(bus, active, bus === breaker ? cycle : null, force);
            this.drive(bus);
        }
        const last = this.blockedBy;
        this.blockedBy = this.nextBlockedBy;
        this.nextBlockedBy = last;
    }

    /** True when the swept area of `bus`'s reverse park is free, so the manoeuvre can start. */
    canStartPark(bus: Bus): boolean {
        const sweep = bus.parkPlan ? this.sweeps.get(bus) : null;
        if (!sweep) return true;
        for (const [other, body] of this.bodies) {
            // Buses standing in a slot or a row never reach into the arrival lane.
            if (other === bus || other.state === BusState.Parked || other.state === BusState.InRow) continue;
            if (sweep.hits(body)) return false;
            const otherSweep = other.isParking ? this.sweeps.get(other) : null;
            if (otherSweep && otherSweep.shapes.some((s) => sweep.hits(s))) return false;
        }
        for (const claim of this.claims) {
            if (claim.owner !== bus && claim.owner.tripOrder < bus.tripOrder && claim.shapes.some((s) => sweep.hits(s))) return false;
        }
        return true;
    }

    // ---------------------------------------------------------------- per driver

    /**
     * Gathers what `bus` must avoid. `cycle` (deadlock breaker only): buses whose claims are
     * ignored, and with `force` their bodies and sweeps too.
     */
    private collectObstacles(bus: Bus, active: readonly Bus[], cycle: readonly Bus[] | null, force: boolean): void {
        this.solids.length = 0;
        this.promises.length = 0;
        const inCycle = (owner: Bus) => cycle !== null && cycle.indexOf(owner) >= 0;
        const body = this.bodies.get(bus);
        for (const other of active) {
            if (other === bus || (force && inCycle(other))) continue;
            // Bodies and running sweeps the bus already touches are ignored, so it can drive out of them.
            const otherBody = this.bodies.get(other);
            if (!body.overlaps(otherBody)) {
                const group = new Group(other, false);
                group.add(otherBody);
                this.solids.push(group);
            }
            const sweep = this.sweeps.get(other);
            if (!sweep) continue;
            if (other.isParking) {
                if (!sweep.hits(body)) this.solids.push(sweep);
            } else if (other.tripOrder < bus.tripOrder && !inCycle(other)) {
                this.promises.push(sweep);
            }
        }
        for (const claim of this.claims) if (!inCycle(claim.owner)) this.promises.push(claim);
    }

    private drive(bus: Bus): void {
        const path = bus.currentTrip.path;
        const s0 = bus.progress;
        const end = Math.min(path.length, s0 + CFG.reach);
        let free = s0;
        let blocker: Group | null = null;
        for (let s = s0; ; s = Math.min(end, s + CFG.probeStep)) {
            blocker = this.blockerAt(bus, s);
            if (blocker) break;
            free = s;
            if (s >= end) break;
        }
        if (blocker) {
            // Refine the contact point between the last free sample and the first blocked one.
            let lo = free;
            let hi = Math.min(end, free + CFG.probeStep);
            for (let i = 0; i < CFG.refineSteps && hi > lo; i++) {
                const mid = (lo + hi) / 2;
                if (this.blockerAt(bus, mid)) hi = mid;
                else lo = mid;
            }
            bus.maxS = lo;
            // Only a bus actually held up counts for deadlock detection, not one braking for something far ahead.
            if (lo - s0 < CFG.heldDistance) this.nextBlockedBy.set(bus, { by: blocker.owner, claim: blocker.claim });
        } else {
            bus.maxS = Infinity;
        }
        // Claim the path the bus is committed to, for the buses with less right of way.
        const claim = new Group(bus, true);
        const claimEnd = blocker ? bus.maxS : end;
        for (let s = s0; ; s = Math.min(claimEnd, s + CFG.claimStep)) {
            const shape = this.onPath(bus, s, this.take());
            claim.add(shape.set(shape.x, shape.z, shape.fx, shape.fz, shape.hl + CFG.claimMargin, shape.hw + CFG.claimMargin));
            if (s >= claimEnd) break;
        }
        this.claims.push(claim);
    }

    /**
     * First obstacle the bus would touch at arc length `s`, hard ones before claims. Besides the
     * body, a narrow "nose" keeps `gap` free in front of the bumper: it keeps followers at a
     * distance but, being narrower than the bus, does not catch parked buses the body clears
     * when it turns.
     */
    private blockerAt(bus: Bus, s: number): Group | null {
        const body = this.onPath(bus, s, this.probe);
        const reach = body.hl + CFG.gap / 2;
        const nose = this.nose.set(body.x + body.fx * reach, body.z + body.fz * reach, body.fx, body.fz, CFG.gap / 2, CFG.noseHalfWidth);
        for (const g of this.solids) if (g.hits(body) || g.hits(nose)) return g;
        for (const g of this.promises) if (g.hits(body) || g.hits(nose)) return g;
        return null;
    }

    // ---------------------------------------------------------------- footprints

    private take(): Footprint {
        if (this.used === this.pool.length) this.pool.push(new Footprint());
        return this.pool[this.used++];
    }

    /** Where the bus stands now, from its node (covers tweens as well as path driving). */
    private bodyOf(bus: Bus, out: Footprint): Footprint {
        const p = bus.node.worldPosition;
        const yaw = bus.node.eulerAngles.y * D2R;
        return out.set(p.x, p.z, Math.sin(yaw), Math.cos(yaw), bus.length / 2, CFG.halfWidth);
    }

    /** Footprint of the bus at arc length `s` of its trip. */
    private onPath(bus: Bus, s: number, out: Footprint): Footprint {
        Bus.poseOnPath(bus.currentTrip.path, s, bus.length, this.tmpPos, this.tmpDir);
        return out.set(this.tmpPos.x, this.tmpPos.z, this.tmpDir.x, this.tmpDir.z, bus.length / 2, CFG.halfWidth);
    }

    /** Footprints along the rest of the bus's reverse-park curve, from `t0` to the slot. */
    private sweep(bus: Bus, t0: number): Group {
        const plan: ParkPlan = bus.parkPlan;
        const group = new Group(bus, !bus.isParking);
        for (let i = 0; i <= CFG.sweepSamples; i++) {
            const t = t0 + ((1 - t0) * i) / CFG.sweepSamples;
            const yaw = Bus.parkPose(plan, t, this.tmpPos) * D2R;
            group.add(this.take().set(this.tmpPos.x, this.tmpPos.z, Math.sin(yaw), Math.cos(yaw), plan.halfLength, CFG.halfWidth));
        }
        return group;
    }

    private static describe(bus: Bus): string {
        const p = bus.node.worldPosition;
        return `${bus.node.name}#${bus.tripOrder} ${BusState[bus.state]} (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`;
    }

    /** Buses blocked (last frame) in a cycle of drivers waiting on each other, or empty. */
    private findCycle(drivers: readonly Bus[]): Bus[] {
        for (const start of drivers) {
            const chain: Bus[] = [];
            let bus: Bus | undefined = start;
            while (bus && chain.indexOf(bus) < 0) {
                chain.push(bus);
                bus = this.blockedBy.get(bus)?.by;
            }
            if (bus) return chain.slice(chain.indexOf(bus));
        }
        return [];
    }
}
