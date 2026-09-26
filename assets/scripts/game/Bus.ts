import { _decorator, Component, Material, MeshRenderer, Node, Tween, Vec3, math, tween } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { Path } from '../core/Path';
import { BusColor, BusState } from '../core/Types';
import { punchScale, wobble } from '../fx/Juice';

const { ccclass, property } = _decorator;

/** One leg of driving: a path plus the arc lengths of the points of interest on it. */
export interface BusTrip {
    path: Path;
    /** Arc length where the bus enters the road loop (-1 if the trip does not use the road). */
    roadStartS: number;
    /** Arc length of the bus stop (-1 if the trip has no stop). */
    stopS: number;
}

export interface BusTripListener {
    /** Called when the bus reaches the stop. Return true to make it wait there. */
    onReachStop(bus: Bus): boolean;
    /** Called when the bus reaches the end of its trip path. */
    onTripEnd(bus: Bus): void;
}

const R2D = 180 / Math.PI;

/**
 * A bus: follows trips along a Path, keeps its seats and drives the wheels / lid visuals.
 * All decisions (stop or not, where to go next) are delegated to the listener (GameManager).
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
    /** Arc-length limit imposed by the bus ahead; Infinity when unconstrained. */
    maxS = Infinity;

    private trip: BusTrip | null = null;
    private listener: BusTripListener | null = null;
    private s = 0;
    private speed = 0;
    private moving = false;
    private stopPending = false;
    private wheelAngle = 0;
    private readonly tmpPos = new Vec3();
    private readonly tmpDir = new Vec3();

    get isFull(): boolean { return this.seated >= this.seatCount; }
    get freeSeats(): number { return this.seatCount - this.seated; }
    get isMoving(): boolean { return this.moving; }
    get currentTrip(): BusTrip | null { return this.trip; }
    get progress(): number { return this.s; }

    /** Distance travelled along the road loop; negative while still driving towards the entry. */
    get roadS(): number {
        return this.trip && this.trip.roadStartS >= 0 ? this.s - this.trip.roadStartS : -Infinity;
    }

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
        this.maxS = Infinity;
        this.stopPending = trip.stopS >= 0;
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
        if (this.stopPending) target = Math.min(target, this.trip.stopS);
        target = Math.min(target, this.maxS);

        const dist = Math.max(0, target - this.s);
        const cap = Math.min(cfg.maxSpeed, Math.sqrt(2 * cfg.decel * dist));
        this.speed = this.speed < cap
            ? Math.min(cap, this.speed + cfg.accel * dt)
            : Math.max(cap, this.speed - cfg.decel * 2 * dt);

        const prev = this.s;
        this.s = Math.min(target, this.s + this.speed * dt);
        this.place(this.s);
        this.spinWheels(this.s - prev);

        if (this.stopPending && this.s >= this.trip.stopS - 1e-3) {
            this.stopPending = false;
            if (this.listener && this.listener.onReachStop(this)) {
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

    private place(s: number): void {
        const path = this.trip.path;
        path.posAt(s, this.tmpPos);
        this.node.setPosition(this.tmpPos);
        path.dirAt(s, this.tmpDir);
        this.node.setRotationFromEuler(0, Math.atan2(this.tmpDir.x, this.tmpDir.z) * R2D, 0);
    }

    private spinWheels(distance: number): void {
        if (distance === 0) return;
        this.wheelAngle = (this.wheelAngle + (distance / GameConfig.bus.wheelRadius) * R2D) % 360;
        for (const w of this.wheels) w.setRotationFromEuler(this.wheelAngle, 0, 0);
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

    /** "Đóng hòm": the roof drops onto the bus with a bounce once every seat is taken. */
    closeLid(): void {
        const cfg = GameConfig.bus;
        this.lid.active = true;
        const rest = this.lid.position.clone();
        this.lid.setPosition(rest.x, rest.y + cfg.lidDropHeight, rest.z);
        tween(this.lid)
            .to(cfg.lidDropDuration, { position: rest }, { easing: 'bounceOut' })
            .start();
        punchScale(this.body, 1, cfg.lidPunch.amount, cfg.lidPunch.duration);
    }

    /** Rolls forward inside the row when the bus ahead has been dispatched. */
    moveTo(pos: Vec3, duration: number): void {
        tween(this.node).to(duration, { position: pos.clone() }, { easing: 'quadOut' }).start();
    }

    /** Swings into the slot: yaw back to "facing the road" while sliding into the bay. */
    reversePark(slotPos: Vec3, duration: number, onDone: () => void): void {
        this.halt();
        const start = this.node.position.clone();
        const startYaw = this.node.eulerAngles.y;
        const targetYaw = startYaw > 0 ? 0 : startYaw < -180 ? -360 : 0;
        const state = { t: 0 };
        const pos = new Vec3();
        tween(state)
            .to(duration, { t: 1 }, {
                easing: 'quadInOut',
                onUpdate: () => {
                    const t = state.t;
                    Vec3.lerp(pos, start, slotPos, t);
                    this.node.setPosition(pos);
                    this.node.setRotationFromEuler(0, math.lerp(startYaw, targetYaw, t), 0);
                    this.spinWheels(-GameConfig.bus.parkWheelSpin);
                },
            })
            .call(() => {
                this.node.setPosition(slotPos);
                this.node.setRotationFromEuler(0, 0, 0);
                punchScale(this.body, 1, GameConfig.bus.parkPunch.amount, GameConfig.bus.parkPunch.duration);
                onDone();
            })
            .start();
    }

    tapFeedback(): void {
        punchScale(this.body, 1, GameConfig.bus.tapPunch.amount, GameConfig.bus.tapPunch.duration);
    }

    rejectFeedback(): void {
        wobble(this.body, GameConfig.bus.rejectWobble.degrees, GameConfig.bus.rejectWobble.duration);
    }
}
