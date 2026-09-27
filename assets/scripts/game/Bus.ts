import { _decorator, Component, Material, MeshRenderer, Node, Tween, Vec3, math, tween } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { Path } from '../core/Path';
import { BusColor, BusState } from '../core/Types';
import { AnimService } from '../services/AnimService';

const { ccclass, property } = _decorator;

/** One leg of driving: a path plus the arc lengths of the points of interest on it. */
export interface BusTrip {
    path: Path;
    /** Arc lengths of the bus stops on the trip, in driving order (empty if the trip has no stop). */
    stops: number[];
}

export interface BusTripListener {
    /** Called when the bus reaches stop `index` of its trip. Return true to make it wait there. */
    onReachStop(bus: Bus, index: number): boolean;
    /** Called when the bus reaches the end of its trip path. */
    onTripEnd(bus: Bus): void;
}

/**
 * Reverse-park manoeuvre: a quadratic curve from the stop point on the arrival lane, via the
 * corner in front of the slot (`corner`), into the slot. The bus faces away from its direction
 * of travel because it reverses.
 */
export interface ParkPlan {
    from: Vec3;
    corner: Vec3;
    to: Vec3;
    /** Half length of the bus. */
    halfLength: number;
}

const R2D = 180 / Math.PI;
const AXLE_FRONT = new Vec3();
const AXLE_REAR = new Vec3();
const D2R = Math.PI / 180;

/** Wraps an angle difference in degrees into [-180, 180). */
function wrapDegrees(delta: number): number {
    return delta - Math.floor((delta + 180) / 360) * 360;
}

/**
 * A bus: follows trips along a Path, keeps its seats and drives the wheels / lid / suspension
 * visuals. All decisions (stop or not, where to go next) are delegated to the listener
 * (GameManager).
 */
@ccclass('Bus')
export class Bus extends Component {
    @property(Node) body: Node = null;
    @property(Node) lid: Node = null;
    @property([Node]) wheels: Node[] = [];
    @property(Node) seatRoot: Node = null;
    @property(MeshRenderer) bodyRenderer: MeshRenderer = null;
    @property(MeshRenderer) lidRenderer: MeshRenderer = null;

    @property seatCount = 4;
    @property length = 2.3;
    @property seatSpacing = 0.55;
    @property seatSideOffset = 0.3;
    @property seatHeight = 0.42;

    color: BusColor = BusColor.Red;
    state: BusState = BusState.InRow;
    rowIndex = -1;
    slotIndex = -1;
    seated = 0;
    /** Arc-length limit imposed by the traffic ahead (game/Traffic.ts); Infinity when unconstrained. */
    maxS = Infinity;
    /** Start order of the current trip: buses that set off earlier have right of way (game/Traffic.ts). */
    tripOrder = 0;
    /** Reverse-park manoeuvre planned for the end of the current trip, or running. */
    parkPlan: ParkPlan | null = null;
    /** Progress (0..1) along `parkPlan` while the manoeuvre runs. */
    parkT = 0;

    private static tripCounter = 0;

    private trip: BusTrip | null = null;
    private listener: BusTripListener | null = null;
    private s = 0;
    private speed = 0;
    private moving = false;
    /** True while the reverse-park tween steers the node (the suspension then reads the yaw rate). */
    private parking = false;
    /** Index in `trip.stops` of the next stop ahead (== stops.length once all are passed). */
    private nextStop = 0;
    private wheelAngle = 0;
    private readonly tmpPos = new Vec3();
    private readonly tmpDir = new Vec3();

    // Suspension: measured from the node's actual motion, so path driving, row shifts and the
    // parking tween all feed it. Angles in degrees, angular velocities in deg/s.
    private hasMotionSample = false;
    private readonly lastPos = new Vec3();
    private lastYaw = 0;
    private lastForwardSpeed = 0;
    private pitch = 0;
    private pitchVel = 0;
    private roll = 0;
    private rollVel = 0;
    private highlighted = false;
    private bobTime = 0;
    private bobY = 0;

    get isFull(): boolean { return this.seated >= this.seatCount; }
    get freeSeats(): number { return this.seatCount - this.seated; }
    get isMoving(): boolean { return this.moving; }
    get currentTrip(): BusTrip | null { return this.trip; }
    get progress(): number { return this.s; }
    get currentSpeed(): number { return this.speed; }
    /** True while the reverse-park tween steers the bus. */
    get isParking(): boolean { return this.parking; }
    /** Index in the current trip's `stops` of the next stop ahead. */
    get nextStopIndex(): number { return this.nextStop; }

    init(color: BusColor, material: Material): void {
        this.color = color;
        this.bodyRenderer.setSharedMaterial(material, 0);
        this.lidRenderer.setSharedMaterial(material, 0);
        this.lid.active = false;
        this.seated = 0;
    }

    startTrip(trip: BusTrip, listener: BusTripListener): void {
        Tween.stopAllByTarget(this.node);
        this.trip = trip;
        this.listener = listener;
        this.s = 0;
        // Held in place until Traffic has checked the way ahead (next frame).
        this.maxS = 0;
        this.tripOrder = ++Bus.tripCounter;
        this.nextStop = 0;
        this.moving = true;
        this.place(0);
    }

    resume(): void {
        this.moving = true;
    }

    halt(): void {
        this.moving = false;
        this.speed = 0;
    }

    update(dt: number): void {
        if (!this.moving || !this.trip) return;
        const cfg = GameConfig.bus;
        const path = this.trip.path;

        let target = path.length;
        const stops = this.trip.stops;
        if (this.nextStop < stops.length) target = Math.min(target, stops[this.nextStop]);
        target = Math.min(target, this.maxS);

        const dist = Math.max(0, target - this.s);
        const cap = Math.min(cfg.maxSpeed, Math.sqrt(2 * cfg.decel * dist));
        this.speed = this.speed < cap
            ? Math.min(cap, this.speed + cfg.accel * dt)
            : Math.max(cap, this.speed - cfg.decel * 2 * dt);

        this.s = Math.min(target, this.s + this.speed * dt);
        this.place(this.s);

        if (this.nextStop < stops.length && this.s >= stops[this.nextStop] - 1e-3) {
            const index = this.nextStop++;
            if (this.listener && this.listener.onReachStop(this, index)) {
                this.moving = false;
                this.speed = 0;
                return;
            }
        }
        if (this.s >= path.length - 1e-3) {
            this.moving = false;
            this.speed = 0;
            if (this.listener) this.listener.onTripEnd(this);
        }
    }

    /** Visual layer: runs after the tweens so it wins over them on the body node. */
    lateUpdate(dt: number): void {
        if (dt <= 0) return;
        const pos = this.node.worldPosition;
        const yaw = this.node.eulerAngles.y;
        if (!this.hasMotionSample) {
            this.hasMotionSample = true;
            this.lastPos.set(pos);
            this.lastYaw = yaw;
            return;
        }
        const cfg = GameConfig.bus.suspension;
        // The bus faces the local +Z axis, i.e. world (sin yaw, cos yaw).
        const rad = yaw * D2R;
        const forwardSpeed = ((pos.x - this.lastPos.x) * Math.sin(rad) + (pos.z - this.lastPos.z) * Math.cos(rad)) / dt;
        const accel = math.clamp((forwardSpeed - this.lastForwardSpeed) / dt, -cfg.maxAccel, cfg.maxAccel);
        // Only driving turns the node; a reject wobble on a standing bus must not roll it.
        const yawRate = this.moving || this.parking ? wrapDegrees(yaw - this.lastYaw) * D2R / dt : 0;
        const lateralAccel = math.clamp(forwardSpeed * yawRate, -cfg.maxAccel, cfg.maxAccel);
        this.lastPos.set(pos);
        this.lastYaw = yaw;
        this.lastForwardSpeed = forwardSpeed;

        // Nose dips when braking (positive X rotation), body leans out of the corner.
        const targetPitch = math.clamp(-accel * cfg.pitchPerAccel, -cfg.maxPitch, cfg.maxPitch);
        const targetRoll = math.clamp(lateralAccel * cfg.rollPerAccel, -cfg.maxRoll, cfg.maxRoll);
        this.pitchVel += ((targetPitch - this.pitch) * cfg.stiffness - this.pitchVel * cfg.damping) * dt;
        this.pitch += this.pitchVel * dt;
        this.rollVel += ((targetRoll - this.roll) * cfg.stiffness - this.rollVel * cfg.damping) * dt;
        this.roll += this.rollVel * dt;

        this.updateBob(dt);
        this.body.setRotationFromEuler(this.pitch, 0, this.roll);
        this.body.setPosition(0, this.bobY, 0);
        this.spinWheels(forwardSpeed * dt);
    }

    private updateBob(dt: number): void {
        const bob = GameConfig.bus.hintBob;
        if (this.highlighted) {
            this.bobTime += dt;
            this.bobY = bob.height * Math.abs(Math.sin((this.bobTime / bob.period) * Math.PI));
        } else if (this.bobY > 0) {
            this.bobY = Math.max(0, this.bobY - (bob.height / bob.period) * 2 * dt);
        }
    }

    private place(s: number): void {
        Bus.poseOnPath(this.trip.path, s, this.length, this.tmpPos, this.tmpDir);
        this.node.setPosition(this.tmpPos);
        this.node.setRotationFromEuler(0, Math.atan2(this.tmpDir.x, this.tmpDir.z) * R2D, 0);
    }

    /**
     * Pose of a bus of length `length` at arc length `s` of a path: its front and rear axles both
     * sit on the path (GameConfig.bus.axleOffset), the centre halfway between them. Writes the
     * centre into `outPos` and the unit heading into `outDir`.
     */
    static poseOnPath(path: Path, s: number, length: number, outPos: Vec3, outDir: Vec3): void {
        const offset = length * GameConfig.bus.axleOffset;
        const front = path.pointAt(s + offset, AXLE_FRONT);
        const rear = path.pointAt(s - offset, AXLE_REAR);
        outPos.set((front.x + rear.x) / 2, 0, (front.z + rear.z) / 2);
        outDir.set(front.x - rear.x, 0, front.z - rear.z);
        if (outDir.lengthSqr() > 1e-10) outDir.normalize();
        else path.dirAt(s, outDir);
    }

    private spinWheels(distance: number): void {
        if (distance === 0) return;
        this.wheelAngle = (this.wheelAngle + (distance / GameConfig.bus.wheelRadius) * R2D) % 360;
        for (const w of this.wheels) w.setRotationFromEuler(this.wheelAngle, 0, 0);
    }

    /** World position of a point on the bus centre line, `localZ` metres ahead of the centre. */
    pointAhead(localZ: number, out: Vec3 = new Vec3()): Vec3 {
        const rad = this.node.eulerAngles.y * D2R;
        const p = this.node.worldPosition;
        return out.set(p.x + Math.sin(rad) * localZ, p.y, p.z + Math.cos(rad) * localZ);
    }

    /** Reserves the next seat and returns its index. */
    takeSeat(): number {
        return this.seated++;
    }

    /** Local position of a seat inside `seatRoot`: two columns, filled from the back. */
    seatPosition(index: number, out: Vec3 = new Vec3()): Vec3 {
        const rows = this.seatCount / 2;
        const col = index % 2;
        const row = Math.floor(index / 2);
        const z = -((rows - 1) / 2) * this.seatSpacing + row * this.seatSpacing;
        return out.set(col === 0 ? -this.seatSideOffset : this.seatSideOffset, this.seatHeight, z);
    }

    /** Kicks the suspension springs (deg/s): positive pitch = nose down, positive roll = lean to -X. */
    kickSuspension(pitch: number, roll: number): void {
        this.pitchVel += pitch;
        this.rollVel += roll;
    }

    /** "Đóng hòm": the roof drops onto the bus with a bounce once every seat is taken. */
    closeLid(): void {
        const cfg = GameConfig.bus;
        this.lid.active = true;
        const rest = this.lid.position.clone();
        const from = new Vec3(rest.x, rest.y + cfg.lidDropHeight, rest.z);
        // Once the lid lands the passengers are boxed in: their heads would poke through the roof.
        AnimService.dropTo(this.lid, from, rest, cfg.lidDropDuration, 'bounceOut', () => { this.seatRoot.active = false; });
        AnimService.punchScale(this.body, 1, cfg.lidPunch.amount, cfg.lidPunch.duration);
        this.kickSuspension(cfg.suspension.lidKick, 0);
    }

    /** Plans a reverse park into `slot`, starting from `from` (just past the slot on the arrival lane). */
    planPark(from: Vec3, slot: Vec3): void {
        this.parkPlan = {
            from: from.clone(), corner: new Vec3(slot.x, 0, from.z), to: new Vec3(slot.x, 0, slot.z), halfLength: this.length / 2,
        };
    }

    /** Position of the bus at `t` (0..1) along a park manoeuvre; returns its yaw in degrees. */
    static parkPose(plan: ParkPlan, t: number, out: Vec3): number {
        const { from: p0, corner: p1, to: p2 } = plan;
        const u = 1 - t;
        out.set(u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, 0, u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z);
        // Derivative of the curve; the bus faces the opposite way because it reverses.
        const tx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
        const tz = 2 * u * (p1.z - p0.z) + 2 * t * (p2.z - p1.z);
        // The tangent vanishes only at a degenerate plan; the bus then keeps facing the road.
        return tx * tx + tz * tz > 1e-8 ? Math.atan2(-tx, -tz) * R2D : 0;
    }

    /**
     * Backs into the slot along `parkPlan`: from the current spot (just past the slot on the
     * arrival lane) the bus reverses towards the corner in front of the slot and swings its rear
     * into the bay, ending with yaw 0 (facing the road).
     */
    reversePark(duration: number, onDone: () => void): void {
        const plan = this.parkPlan;
        if (!plan) return;
        this.halt();
        this.parking = true;
        this.parkT = 0;
        const state = { t: 0 };
        const pos = new Vec3();
        tween(state)
            .to(duration, { t: 1 }, {
                easing: 'quadInOut',
                onUpdate: () => {
                    this.parkT = state.t;
                    const yaw = Bus.parkPose(plan, state.t, pos);
                    this.node.setPosition(pos);
                    this.node.setRotationFromEuler(0, yaw, 0);
                },
            })
            .call(() => {
                this.parking = false;
                this.parkPlan = null;
                this.node.setPosition(plan.to);
                this.node.setRotationFromEuler(0, 0, 0);
                AnimService.punchScale(this.body, 1, GameConfig.bus.parkPunch.amount, GameConfig.bus.parkPunch.duration);
                onDone();
            })
            .start();
    }

    /** Hops on the spot while the tap hint points at this bus. */
    setHighlighted(on: boolean): void {
        if (this.highlighted === on) return;
        this.highlighted = on;
        this.bobTime = 0;
    }

    tapFeedback(): void {
        AnimService.punchScale(this.body, 1, GameConfig.bus.tapPunch.amount, GameConfig.bus.tapPunch.duration);
    }

    /** "You cannot send this bus": standing buses wobble, buses out on a trip just twitch. */
    rejectFeedback(): void {
        const standing = (this.state === BusState.InRow || this.state === BusState.Parked) && !this.moving;
        if (standing) this.crashFeedback();
        else AnimService.punchScale(this.body, 1, GameConfig.bus.parkPunch.amount, GameConfig.bus.parkPunch.duration);
    }

    /** Yaw wobble of the whole bus; only for a bus that is not being steered along a path. */
    crashFeedback(): void {
        AnimService.wobble(this.node, GameConfig.bus.rejectWobble.degrees, GameConfig.bus.rejectWobble.duration);
    }
}
