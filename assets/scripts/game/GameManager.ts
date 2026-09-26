import {
    _decorator, Camera, Component, Material, Node, Prefab, Vec2, Vec3, director, instantiate,
} from 'cc';
import { GameConfig } from '../core/GameConfig';
import { LEVEL_1, validateLevel } from '../core/LevelData';
import { Path } from '../core/Path';
import { BusColor, BusSpec, BusState, GameState, LevelDef } from '../core/Types';
import { dropIn, punchScale } from '../fx/Juice';
import { GameplayView } from '../ui/GameplayView';
import { LoseView } from '../ui/LoseView';
import { WinView } from '../ui/WinView';
import { Bus, BusTrip, BusTripListener } from './Bus';
import { BusStop } from './BusStop';
import { ColorMaterials } from './ColorPalette';
import { Passenger } from './Passenger';
import { TapInput } from './TapInput';

const { ccclass, property } = _decorator;

/** Passengers queue on the outside of the loop, i.e. on the right of the driving direction. */
const BUS_RIGHT = new Vec3(1, 0, 0);
const HUD_UP = new Vec3(0, GameConfig.hud.anchorHeight, 0);
const SEAT_UP = new Vec3(0, GameConfig.boarding.dropHeight, 0);

/**
 * Owns the level: spawns rows, routes buses over the road loop, runs boarding at the stop,
 * enforces road capacity / parking slots and drives the HUD and end cards.
 */
@ccclass('GameManager')
export class GameManager extends Component implements BusTripListener {
    @property(Prefab) bus04Prefab: Prefab = null;
    @property(Prefab) bus06Prefab: Prefab = null;
    @property(Prefab) bus10Prefab: Prefab = null;
    @property(Prefab) stickmanPrefab: Prefab = null;
    @property(Prefab) gameplayViewPrefab: Prefab = null;
    @property(Prefab) winViewPrefab: Prefab = null;
    @property(Prefab) loseViewPrefab: Prefab = null;

    @property(Material) vehicleMaterial: Material = null;
    @property(Material) stickmanMaterial: Material = null;

    /** Children = control points of the road centreline, entry first (Catmull-Rom spline). */
    @property(Node) roadWaypoints: Node = null;
    @property(BusStop) busStop: BusStop = null;
    /** Children = parking slots, screen-left first (the first free one is used). */
    @property(Node) slotsRoot: Node = null;
    /** Children = front bumper of each bus row; rows face +Z. */
    @property(Node) rowsRoot: Node = null;
    /** Waypoints a bus follows from its row lane to the road entry. */
    @property(Node) rowExitPath: Node = null;
    /** Waypoints a bus follows from the slots to the road entry. */
    @property(Node) slotExitPath: Node = null;
    /** Waypoints from the road exit through the gate and out of the level. */
    @property(Node) gatePath: Node = null;
    /** Waypoints from the road exit to the arrival lane in front of the slots. */
    @property(Node) returnPath: Node = null;
    @property(Node) barrier: Node = null;
    @property(Node) signStop: Node = null;
    @property(Node) signGate: Node = null;
    /** Parent for everything spawned at runtime. */
    @property(Node) worldRoot: Node = null;
    @property(Node) canvas: Node = null;
    @property(Camera) mainCamera: Camera = null;
    @property(TapInput) tapInput: TapInput = null;

    /** Debug: the level plays itself (also enabled with `?auto=1` in the URL). */
    @property autoplay = false;

    private level: LevelDef = LEVEL_1;
    state = GameState.Playing;
    private materials: ColorMaterials = null;
    private busPrefabs: Record<number, Prefab> = {};

    private buses: Bus[] = [];
    private rows: Bus[][] = [];
    private slots: (Bus | null)[] = [];
    private busesLeft = 0;

    private roadPoints: Vec2[] = [];
    private roadEntry = new Vec2();
    private roadExit = new Vec2();
    private stopPoint = new Vec3();

    private gameplay: GameplayView = null;
    private winView: WinView = null;
    private loseView: LoseView = null;

    /** Passengers that left the queue for a bus but have not sat down yet. */
    private readonly boardersInFlight = new Map<Bus, number>();
    private hasTapped = false;
    private idleTimer = 0;
    private autoTimer = 0;
    private autoRandom = false;
    private autoWrong = false;

    private readonly tmpWorld = new Vec3();
    private readonly tmpUi = new Vec3();
    private readonly tmpUi2 = new Vec3();

    onLoad(): void {
        const search = typeof location !== 'undefined' ? location.search : '';
        if (/[?&]auto=1/.test(search)) this.autoplay = true;
        if (/[?&]auto=2/.test(search)) { this.autoplay = true; this.autoRandom = true; }
        if (/[?&]auto=3/.test(search)) { this.autoplay = true; this.autoWrong = true; }
        // Debug hook for the preview harness (tools/preview.mjs).
        (globalThis as any).__busAway = this;
    }

    start(): void {
        const problem = validateLevel(this.level);
        if (problem) console.error(problem);

        this.materials = new ColorMaterials(this.vehicleMaterial, this.stickmanMaterial);
        this.busPrefabs = { 4: this.bus04Prefab, 6: this.bus06Prefab, 10: this.bus10Prefab };
        this.buildRoad();
        if (this.level.rows.length > this.rowsRoot.children.length) {
            console.error(`Level ${this.level.id} has ${this.level.rows.length} rows but the scene only has ${this.rowsRoot.children.length} row markers`);
        }
        this.spawnRows();
        this.slots = this.slotsRoot.children.map(() => null);
        this.busStop.init(this.level.passengers, (color) => this.spawnPassenger(color));
        this.setupUi();

        this.tapInput.getTargets = () => this.buses;
        this.tapInput.onTap = (bus) => this.onBusTapped(bus);
    }

    update(dt: number): void {
        this.applyRoadQueue();
        this.updateHud(dt);
        if (this.autoplay) this.tickAutoplay(dt);
    }

    // ---------------------------------------------------------------- setup

    private buildRoad(): void {
        this.roadPoints = Path.catmullRom(GameManager.pointsOf(this.roadWaypoints), GameConfig.road.splineSamples);
        if (this.roadPoints.length < 2) {
            console.error('Road needs at least two waypoints');
            return;
        }
        this.roadEntry.set(this.roadPoints[0]);
        this.roadExit.set(this.roadPoints[this.roadPoints.length - 1]);

        const road = new Path(this.roadPoints, 0);
        const head = this.busStop.node.worldPosition;
        road.posAt(road.closestS(head.x, head.z), this.stopPoint);
    }

    private spawnRows(): void {
        this.rows = [];
        this.buses = [];
        this.level.rows.forEach((specs, rowIndex) => {
            const row = specs.map((spec) => this.spawnBus(spec));
            const positions = this.rowPositions(row, rowIndex);
            row.forEach((bus, i) => {
                bus.rowIndex = rowIndex;
                bus.node.setPosition(positions[i]);
                bus.node.setRotationFromEuler(0, 0, 0);
            });
            this.rows.push(row);
        });
        this.busesLeft = this.buses.length;
    }

    /** Centre positions of buses stacked bumper to bumper behind the row marker, head first. */
    private rowPositions(row: readonly Bus[], rowIndex: number): Vec3[] {
        const out: Vec3[] = [];
        const front = this.rowsRoot.children[rowIndex].worldPosition;
        let offset = 0;
        for (const bus of row) {
            out.push(new Vec3(front.x, 0, front.z - offset - bus.length / 2));
            offset += bus.length + GameConfig.bus.rowGap;
        }
        return out;
    }

    /** Converts a world anchor into HUD space, slightly above the anchor. */
    private worldToHud(anchor: Vec3, out: Vec3): Vec3 {
        Vec3.add(this.tmpWorld, anchor, HUD_UP);
        return this.mainCamera.convertToUINode(this.tmpWorld, this.gameplay.node, out);
    }

    /** Sends a bus along a plain waypoint path (no road, no stop). */
    private static driveAlong(bus: Bus, points: Vec2[], listener: BusTripListener): void {
        bus.startTrip({
            path: new Path(points, GameConfig.road.cornerRadius, GameConfig.road.cornerSubdivisions),
            roadStartS: -1,
            stopS: -1,
        }, listener);
    }

    private addBoarder(bus: Bus, delta: number): void {
        this.boardersInFlight.set(bus, (this.boardersInFlight.get(bus) ?? 0) + delta);
    }

    /** World XZ positions of a marker node's children, in order. */
    private static pointsOf(root: Node | null): Vec2[] {
        return root ? root.children.map((c) => new Vec2(c.worldPosition.x, c.worldPosition.z)) : [];
    }

    private slotPosition(index: number, out: Vec3 = new Vec3()): Vec3 {
        const p = this.slotsRoot.children[index].worldPosition;
        return out.set(p.x, 0, p.z);
    }

    /** Drives straight (along Z) to the first lane point, then follows the lane. */
    private static appendLane(pts: Vec2[], start: Vec3, lane: Vec2[]): void {
        if (lane.length === 0) return;
        pts.push(new Vec2(start.x, lane[0].y));
        for (const p of lane) pts.push(p);
    }

    private spawnBus(spec: BusSpec): Bus {
        const node = instantiate(this.busPrefabs[spec.seats]);
        node.setParent(this.worldRoot, false);
        const bus = node.getComponent(Bus);
        if (bus.seatCount !== spec.seats) console.warn(`Bus prefab for ${spec.seats} seats has ${bus.seatCount} seats`);
        bus.init(spec.color, this.materials.vehicle(spec.color));
        this.buses.push(bus);
        return bus;
    }

    private spawnPassenger(color: BusColor): Passenger {
        const node = instantiate(this.stickmanPrefab);
        const passenger = node.getComponent(Passenger);
        passenger.init(color, this.materials.stickman(color));
        return passenger;
    }

    private setupUi(): void {
        this.gameplay = instantiate(this.gameplayViewPrefab).getComponent(GameplayView);
        this.gameplay.node.setParent(this.canvas, false);
        this.gameplay.setLevel(this.level.id);

        this.winView = instantiate(this.winViewPrefab).getComponent(WinView);
        this.winView.node.setParent(this.canvas, false);
        this.winView.hide();

        this.loseView = instantiate(this.loseViewPrefab).getComponent(LoseView);
        this.loseView.node.setParent(this.canvas, false);
        this.loseView.onRetry = () => this.restart();
        this.loseView.hide();
    }

    // ---------------------------------------------------------------- input / dispatch

    private onBusTapped(bus: Bus): void {
        if (this.state !== GameState.Playing) return;
        if (!this.canDispatch(bus)) {
            bus.rejectFeedback();
            return;
        }
        if (this.busesOnRoad() >= this.level.roadCapacity) {
            bus.rejectFeedback();
            this.gameplay.toast(GameConfig.ui.text.roadFull);
            return;
        }
        this.hasTapped = true;
        this.idleTimer = 0;
        this.dispatch(bus);
    }

    /** Only the head of a row or a parked bus may enter the road. */
    private canDispatch(bus: Bus): boolean {
        if (bus.state === BusState.Parked) return true;
        return bus.state === BusState.InRow && this.rows[bus.rowIndex][0] === bus;
    }

    private busesOnRoad(): number {
        let n = 0;
        for (const b of this.buses) {
            if (b.state !== BusState.InRow && b.state !== BusState.Parked && b.state !== BusState.Gone) n++;
        }
        return n;
    }

    private dispatch(bus: Bus): void {
        const start = bus.node.position;
        const pts: Vec2[] = [new Vec2(start.x, start.z)];

        if (bus.state === BusState.InRow) {
            this.rows[bus.rowIndex].shift();
            this.shiftRow(bus.rowIndex);
            GameManager.appendLane(pts, start, GameManager.pointsOf(this.rowExitPath));
        } else {
            this.slots[bus.slotIndex] = null;
            bus.slotIndex = -1;
            GameManager.appendLane(pts, start, GameManager.pointsOf(this.slotExitPath));
        }
        for (const p of this.roadPoints) pts.push(p);

        const path = new Path(pts, GameConfig.road.cornerRadius, GameConfig.road.cornerSubdivisions);
        const trip: BusTrip = {
            path,
            roadStartS: path.closestS(this.roadEntry.x, this.roadEntry.y),
            stopS: path.closestS(this.stopPoint.x, this.stopPoint.z),
        };
        bus.state = BusState.OnRoad;
        bus.startTrip(trip, this);
        bus.tapFeedback();
        this.gameplay.showTapHint(false);
    }

    private shiftRow(rowIndex: number): void {
        const row = this.rows[rowIndex];
        const positions = this.rowPositions(row, rowIndex);
        row.forEach((bus, i) => bus.moveTo(positions[i], GameConfig.bus.rowShiftDuration));
    }

    // ---------------------------------------------------------------- road queue

    /** Buses on the loop keep their distance: each one is capped by the bus in front of it. */
    private applyRoadQueue(): void {
        const moving = this.buses.filter((b) => b.state === BusState.OnRoad || b.state === BusState.Boarding);
        moving.sort((a, b) => b.roadS - a.roadS);
        for (let i = 0; i < moving.length; i++) {
            const bus = moving[i];
            const trip = bus.currentTrip;
            if (i === 0 || !trip || trip.roadStartS < 0) {
                bus.maxS = Infinity;
                continue;
            }
            const leader = moving[i - 1];
            const gap = (leader.length + bus.length) / 2 + GameConfig.bus.queueGap;
            bus.maxS = trip.roadStartS + leader.roadS - gap;
        }
    }

    // ---------------------------------------------------------------- BusTripListener

    onReachStop(bus: Bus): boolean {
        if (bus.isFull || this.busStop.peek() !== bus.color) return false;
        bus.state = BusState.Boarding;
        this.boardNext(bus);
        return true;
    }

    private boardNext(bus: Bus): void {
        if (this.state !== GameState.Playing) return;
        if (!bus.isFull && this.busStop.peek() === bus.color) {
            const passenger = this.busStop.takeHead();
            if (passenger) {
                this.boardPassenger(bus, passenger, bus.takeSeat());
                this.scheduleOnce(() => this.boardNext(bus), GameConfig.boarding.interval);
                return;
            }
        }
        this.finishBoarding(bus);
    }

    /** Waits for the last walkers to sit down, then closes the lid (if full) and drives on. */
    private finishBoarding(bus: Bus): void {
        if (bus.state !== BusState.Boarding) return;
        if ((this.boardersInFlight.get(bus) ?? 0) > 0) {
            this.scheduleOnce(() => this.finishBoarding(bus), GameConfig.boarding.settlePoll);
            return;
        }
        if (bus.isFull) bus.closeLid();
        bus.state = BusState.OnRoad;
        bus.resume();
    }

    private boardPassenger(bus: Bus, passenger: Passenger, seatIndex: number): void {
        this.addBoarder(bus, 1);
        passenger.node.setParent(this.worldRoot, true);
        Vec3.transformQuat(this.tmpWorld, BUS_RIGHT, bus.node.worldRotation);
        Vec3.scaleAndAdd(this.tmpWorld, bus.node.worldPosition, this.tmpWorld, GameConfig.boarding.doorOffset);
        passenger.walkTo(this.tmpWorld, GameConfig.boarding.walkSpeed, () => {
            const scale = GameConfig.boarding.seatedScale;
            passenger.node.setParent(bus.seatRoot, false);
            passenger.node.setScale(scale, scale, scale);
            passenger.node.setRotationFromEuler(0, 0, 0);
            if (passenger.shadow) passenger.shadow.active = false;
            passenger.sit();
            const seat = bus.seatPosition(seatIndex);
            dropIn(passenger.node, Vec3.add(new Vec3(), seat, SEAT_UP), seat, GameConfig.boarding.dropDuration,
                () => this.addBoarder(bus, -1));
        });
    }

    onTripEnd(bus: Bus): void {
        switch (bus.state) {
            case BusState.OnRoad:
                this.onRoadExit(bus);
                break;
            case BusState.Exiting:
                this.onBusGone(bus);
                break;
            case BusState.Returning:
                bus.state = BusState.Parking;
                bus.reversePark(
                    this.slotPosition(bus.slotIndex),
                    GameConfig.bus.parkDuration,
                    () => { bus.state = BusState.Parked; },
                );
                break;
            default:
                break;
        }
    }

    /** End of the loop: full buses leave through the gate, others look for a parking slot. */
    private onRoadExit(bus: Bus): void {
        const exit = this.roadExit;
        if (bus.isFull) {
            bus.state = BusState.Exiting;
            this.openBarrier();
            GameManager.driveAlong(bus, [new Vec2(exit.x, exit.y), ...GameManager.pointsOf(this.gatePath)], this);
            return;
        }

        const slot = this.slots.indexOf(null);
        if (slot < 0) {
            this.lose(bus);
            return;
        }
        this.slots[slot] = bus;
        bus.slotIndex = slot;
        bus.state = BusState.Returning;
        const lane = GameManager.pointsOf(this.returnPath);
        const last = lane.length ? lane[lane.length - 1] : exit;
        const slotPos = this.slotPosition(slot);
        GameManager.driveAlong(bus, [new Vec2(exit.x, exit.y), ...lane, new Vec2(slotPos.x, last.y)], this);
    }

    private onBusGone(bus: Bus): void {
        bus.state = BusState.Gone;
        this.buses = this.buses.filter((b) => b !== bus);
        bus.node.destroy();
        this.busesLeft--;
        if (this.busesLeft <= 0) this.win();
    }

    private openBarrier(): void {
        if (!this.barrier) return;
        punchScale(this.barrier, 1, GameConfig.barrier.punch.amount, GameConfig.barrier.punch.duration);
    }

    // ---------------------------------------------------------------- outcome

    private win(): void {
        if (this.state !== GameState.Playing) return;
        this.state = GameState.Won;
        this.gameplay.showTapHint(false);
        this.scheduleOnce(() => this.winView.show(), GameConfig.ui.resultDelay);
    }

    private lose(bus: Bus): void {
        if (this.state !== GameState.Playing) return;
        this.state = GameState.Lost;
        bus.halt();
        bus.rejectFeedback();
        this.gameplay.showTapHint(false);
        this.gameplay.toast(GameConfig.ui.text.noParking, GameConfig.ui.loseToastDuration);
        this.scheduleOnce(() => this.loseView.show(), GameConfig.ui.resultDelay + GameConfig.ui.loseExtraDelay);
    }

    private restart(): void {
        const scene = director.getScene();
        if (scene) director.loadScene(scene.name);
    }

    // ---------------------------------------------------------------- HUD / hint / autoplay

    private updateHud(dt: number): void {
        if (!this.gameplay) return;
        this.gameplay.setCapacity(this.busesOnRoad(), this.level.roadCapacity);
        this.gameplay.setCounters(this.busStop.remaining, this.busesLeft);

        if (this.signStop && this.signGate) {
            this.worldToHud(this.signStop.worldPosition, this.tmpUi);
            this.worldToHud(this.signGate.worldPosition, this.tmpUi2);
            this.gameplay.setAnchors(this.tmpUi, this.tmpUi2);
        }

        if (this.state !== GameState.Playing) return;
        this.idleTimer += dt;
        const wantHint = !this.hasTapped || this.idleTimer > GameConfig.hint.idleDelay;
        const target = wantHint && this.busesOnRoad() < this.level.roadCapacity ? this.suggestBus() : null;
        if (target) {
            this.gameplay.showTapHint(true, this.worldToHud(target.node.worldPosition, this.tmpUi));
        } else {
            this.gameplay.showTapHint(false);
        }
    }

    /**
     * The bus a player should tap next: dispatchable and matching the queue head. Parked buses
     * come first (they free a slot), then the row head whose seat count best fits the run of
     * same-coloured passengers.
     */
    private suggestBus(): Bus | null {
        const color = this.busStop.peek();
        if (color === null) return null;
        // A matching bus already driving towards the stop will serve the head: no hint needed.
        if (this.buses.some((b) => b.color === color && this.isInboundToStop(b))) return null;
        const run = this.busStop.headRunLength();
        const candidates = this.buses.filter((b) => b.color === color && this.canDispatch(b));
        candidates.sort((a, b) => {
            const parkedFirst = Number(b.state === BusState.Parked) - Number(a.state === BusState.Parked);
            return parkedFirst || Math.abs(a.freeSeats - run) - Math.abs(b.freeSeats - run);
        });
        return candidates.length ? candidates[0] : null;
    }

    /** True while a bus with free seats is on the road and has not reached the stop yet. */
    private isInboundToStop(bus: Bus): boolean {
        const trip = bus.currentTrip;
        return bus.state === BusState.OnRoad && !bus.isFull && !!trip && trip.stopS >= 0 && bus.progress < trip.stopS;
    }

    private tickAutoplay(dt: number): void {
        if (this.state !== GameState.Playing) return;
        this.autoTimer += dt;
        if (this.autoTimer < GameConfig.autoplay.interval) return;
        this.autoTimer = 0;
        if (this.busesOnRoad() >= this.level.roadCapacity) return;
        let target: Bus | null;
        if (this.autoRandom || this.autoWrong) {
            const head = this.busStop.peek();
            const options = this.buses.filter((b) => this.canDispatch(b) && (!this.autoWrong || b.color !== head));
            target = options.length ? options[Math.floor(Math.random() * options.length)] : null;
        } else {
            target = this.suggestBus();
        }
        if (target) {
            console.log(`[autoplay] dispatch ${BusColor[target.color]}${target.seatCount} (${BusState[target.state]}) queue=${this.busStop.remaining} buses=${this.busesLeft}`);
            this.hasTapped = true;
            this.dispatch(target);
        }
    }
}
