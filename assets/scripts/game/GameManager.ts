import {
    _decorator, Camera, Color, Component, Material, MeshRenderer, Node, Prefab, UITransform, Vec2, Vec3, Vec4, instantiate,
} from 'cc';
import { GameConfig } from '../core/GameConfig';
import { LEVEL_1, validateLevel } from '../core/LevelData';
import { Path } from '../core/Path';
import { BusColor, BusSpec, BusState, GameState, LevelDef } from '../core/Types';
import { FxLayer } from '../fx/FxLayer';
import { GameplayView } from '../ui/GameplayView';
import { LoseView } from '../ui/LoseView';
import { WinView } from '../ui/WinView';
import { AnimService } from '../services/AnimService';
import { Barrier } from './Barrier';
import { Bus, BusTrip, BusTripListener } from './Bus';
import { BusStop } from './BusStop';
import { CameraRig } from './CameraRig';
import { ColorMaterials, uiColor } from './ColorPalette';
import { Passenger } from './Passenger';
import { TapInput } from './TapInput';
import { Traffic } from './Traffic';

const { ccclass, property } = _decorator;

/** Passengers queue on the outside of the loop, i.e. on the right of the driving direction. */
const BUS_RIGHT = new Vec3(1, 0, 0);
const HUD_UP = new Vec3(0, GameConfig.hud.anchorHeight, 0);
const CONFETTI_COLORS = GameConfig.fx.confettiColors.map((c) => new Color(c.r, c.g, c.b, 255));
const WHITE = Color.WHITE.clone();
const GOLD = new Color(255, 215, 70, 255);
const FLASH_TAP = new Color(255, 255, 255, GameConfig.fx.flashAlpha.tap);
const FLASH_FULL = new Color(255, 255, 255, GameConfig.fx.flashAlpha.full);

/**
 * Owns the level: spawns rows, routes buses over the road loop, runs boarding at the stops,
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
    /** Passenger queues, in the order the buses reach them on the road (matches `LevelDef.stops`). */
    @property([BusStop]) busStops: BusStop[] = [];
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
    /** Sign next to each bus stop (same order as `busStops`): shows how many passengers wait there. */
    @property([Node]) signStops: Node[] = [];
    /** Sign by the gate: shows how many buses are left. */
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
    private roadExit = new Vec2();
    private readonly traffic = new Traffic();
    /** Buses at the end of their return trip, waiting for their reverse-park area to clear. */
    private readonly parkQueue: Bus[] = [];
    /** Point on the road centreline next to each bus stop. */
    private stopPoints: Vec3[] = [];

    private gameplay: GameplayView = null;
    private winView: WinView = null;
    private loseView: LoseView = null;
    private fx: FxLayer = null;
    private gate: Barrier = null;
    private cameraRig: CameraRig | null = null;
    /** Bus currently marked by the tap hint (hops on the spot). */
    private hinted: Bus | null = null;

    /** Passengers that left the queue for a bus but have not sat down yet. */
    private readonly boardersInFlight = new Map<Bus, number>();
    private hasTapped = false;
    private idleTimer = 0;
    private autoTimer = 0;
    private autoRandom = false;
    private autoWrong = false;

    private readonly tmpWorld = new Vec3();
    private readonly tmpUi = new Vec3();

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
        this.cameraRig = this.mainCamera.getComponent(CameraRig);
        this.gate = new Barrier(this.barrier);
        this.buildRoad();
        if (this.level.rows.length > this.rowsRoot.children.length) {
            console.error(`Level ${this.level.id} has ${this.level.rows.length} rows but the scene only has ${this.rowsRoot.children.length} row markers`);
        }
        this.spawnRows();
        this.slots = this.slotsRoot.children.map(() => null);
        if (this.level.stops.length !== this.busStops.length) {
            console.error(`Level ${this.level.id} has ${this.level.stops.length} passenger queues but the scene has ${this.busStops.length} bus stops`);
        }
        this.busStops.forEach((stop, i) => stop.init(this.level.stops[i] ?? [], (color) => this.spawnPassenger(color)));
        this.setupUi();

        this.tapInput.getTargets = () => this.buses;
        this.tapInput.onTap = (bus) => this.onBusTapped(bus);
    }

    update(dt: number): void {
        this.traffic.update(this.buses);
        this.startPendingParks();
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
        this.roadExit.set(this.roadPoints[this.roadPoints.length - 1]);

        const road = new Path(this.roadPoints, 0);
        let lastS = -Infinity;
        this.stopPoints = this.busStops.map((stop) => {
            const head = stop.node.worldPosition;
            const s = road.closestS(head.x, head.z);
            if (s < lastS) console.error(`Bus stop ${stop.node.name} is listed after a stop further down the road`);
            lastS = s;
            return road.posAt(s, new Vec3());
        });
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

    /** Converts a world anchor into the local space of a canvas node, `height` metres above the anchor. */
    private worldToUi(anchor: Vec3, uiNode: Node, out: Vec3, height = HUD_UP.y): Vec3 {
        this.tmpWorld.set(anchor.x, anchor.y + height, anchor.z);
        return this.mainCamera.convertToUINode(this.tmpWorld, uiNode, out);
    }

    private shake(preset: { amplitude: number; duration: number }): void {
        if (this.cameraRig) this.cameraRig.shake(preset.amplitude, preset.duration);
    }

    /** Sends a bus along a plain waypoint path (no road, no stop). */
    private static driveAlong(bus: Bus, points: Vec2[], listener: BusTripListener): void {
        bus.startTrip({
            path: new Path(points, GameConfig.road.cornerRadius, GameConfig.road.cornerSubdivisions),
            stops: [],
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
        if (this.signGate) {
            GameManager.shiftSignColors(this.signGate, GameConfig.hud.gateSign.uvShift);
            this.gameplay.attachSignCounters(this.signStops, this.signGate);
        }

        this.winView = instantiate(this.winViewPrefab).getComponent(WinView);
        this.winView.node.setParent(this.canvas, false);
        this.winView.hide();

        this.loseView = instantiate(this.loseViewPrefab).getComponent(LoseView);
        this.loseView.node.setParent(this.canvas, false);
        this.loseView.hide();

        // Created last so particles and floating labels draw above the end cards.
        this.fx = new FxLayer(this.canvas, this.gameplay.fxSprite, this.gameplay.starSprite, this.gameplay.font);
    }

    /** Re-colours a sign by shifting its UVs over the colour-strip atlas (own material instance). */
    private static shiftSignColors(sign: Node, uShift: number): void {
        const material = sign.getComponentInChildren(MeshRenderer)?.getMaterialInstance(0);
        if (material) material.setProperty('tilingOffset', new Vec4(1, 1, uShift, 0));
    }

    // ---------------------------------------------------------------- input / dispatch

    private onBusTapped(bus: Bus): void {
        if (this.state !== GameState.Playing) return;
        if (!this.canDispatch(bus)) {
            bus.rejectFeedback();
            if (bus.state === BusState.InRow) this.gameplay.toast(GameConfig.ui.text.notFront);
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

        const fromRow = bus.state === BusState.InRow;
        if (fromRow) {
            this.rows[bus.rowIndex].shift();
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
            stops: this.stopPoints.map((p) => path.closestS(p.x, p.z)),
        };
        bus.state = BusState.OnRoad;
        bus.startTrip(trip, this);
        // After startTrip: the dispatched bus must have right of way over the buses rolling up behind it.
        if (fromRow) this.shiftRow(bus.rowIndex);
        bus.tapFeedback();
        this.tapFx(bus);
        this.gameplay.showTapHint(false);
    }

    /** White star flash on the tapped bus with a ring of stars in its colour. */
    private tapFx(bus: Bus): void {
        const at = this.worldToUi(bus.node.worldPosition, this.fx.node, this.tmpUi);
        this.fx.flash(at, FLASH_TAP, GameConfig.fx.flash.tap);
        this.fx.burst(at, [uiColor(bus.color), WHITE], GameConfig.fx.burst.tap);
    }

    /**
     * The buses behind a dispatched bus roll up to their new spots. They drive with the same
     * accel / brake profile as the leader and start slightly later, so they cannot overlap it.
     */
    private shiftRow(rowIndex: number): void {
        const row = this.rows[rowIndex];
        const positions = this.rowPositions(row, rowIndex);
        row.forEach((bus, i) => {
            const target = positions[i];
            const roll = () => {
                // The bus may have been dispatched itself while waiting for its turn.
                if (bus.state !== BusState.InRow) return;
                const from = bus.node.position;
                if (Math.abs(target.z - from.z) < 1e-3) return;
                GameManager.driveAlong(bus, [new Vec2(from.x, from.z), new Vec2(target.x, target.z)], this);
            };
            const delay = i * GameConfig.bus.rowShiftStagger;
            if (delay > 0) this.scheduleOnce(roll, delay);
            else roll();
        });
    }

    // ---------------------------------------------------------------- parking

    /** Starts the reverse park of every waiting bus whose manoeuvre area is clear. */
    private startPendingParks(): void {
        for (let i = 0; i < this.parkQueue.length; i++) {
            const bus = this.parkQueue[i];
            if (this.state === GameState.Lost || !this.traffic.canStartPark(bus)) continue;
            this.parkQueue.splice(i--, 1);
            bus.state = BusState.Parking;
            bus.reversePark(GameConfig.bus.parkDuration, () => { bus.state = BusState.Parked; });
        }
    }

    // ---------------------------------------------------------------- BusTripListener

    onReachStop(bus: Bus, index: number): boolean {
        const stop = this.busStops[index];
        if (!stop || bus.isFull || stop.peek() !== bus.color) return false;
        bus.state = BusState.Boarding;
        this.boardNext(bus, stop);
        return true;
    }

    private boardNext(bus: Bus, stop: BusStop): void {
        if (this.state !== GameState.Playing) return;
        if (!bus.isFull && stop.peek() === bus.color) {
            const passenger = stop.takeHead();
            if (passenger) {
                this.boardPassenger(bus, passenger, bus.takeSeat());
                this.scheduleOnce(() => this.boardNext(bus, stop), GameConfig.boarding.interval);
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
        if (bus.isFull) this.celebrateFull(bus);
        bus.state = BusState.OnRoad;
        bus.resume();
    }

    /** Lid drops, a star explosion in the bus colour, a floating label and a small screen kick. */
    private celebrateFull(bus: Bus): void {
        bus.closeLid();
        const at = this.worldToUi(bus.node.worldPosition, this.fx.node, this.tmpUi);
        const colors = [uiColor(bus.color), GOLD, WHITE];
        this.fx.flash(at, FLASH_FULL, GameConfig.fx.flash.full);
        this.fx.burst(at, colors, GameConfig.fx.burst.full);
        this.fx.burst(at, colors, GameConfig.fx.burst.fullSparkle);
        this.fx.floatText(GameConfig.ui.text.busFull, at, uiColor(bus.color));
        this.shake(GameConfig.camera.shake.lid);
    }

    private boardPassenger(bus: Bus, passenger: Passenger, seatIndex: number): void {
        this.addBoarder(bus, 1);
        passenger.node.setParent(this.worldRoot, true);
        Vec3.transformQuat(this.tmpWorld, BUS_RIGHT, bus.node.worldRotation);
        Vec3.scaleAndAdd(this.tmpWorld, bus.node.worldPosition, this.tmpWorld, GameConfig.boarding.doorOffset);
        passenger.walkTo(this.tmpWorld, GameConfig.boarding.walkSpeed, () => {
            const cfg = GameConfig.boarding;
            // Keep the world position so the hop starts at the door, then continue in seat space.
            passenger.node.setParent(bus.seatRoot, true);
            const door = passenger.node.position.clone();
            passenger.node.setScale(cfg.seatedScale, cfg.seatedScale, cfg.seatedScale);
            passenger.node.setRotationFromEuler(0, 0, 0);
            if (passenger.shadow) passenger.shadow.active = false;
            passenger.sit();
            AnimService.arcTo(passenger.node, door, bus.seatPosition(seatIndex), cfg.hopHeight, cfg.hopDuration, () => {
                // Boarding from the +X side: the body dips towards the door.
                bus.kickSuspension(0, -GameConfig.bus.suspension.boardKick);
                this.addBoarder(bus, -1);
            });
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
                this.parkQueue.push(bus);
                this.startPendingParks();
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
            this.gate.open();
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
        // Drive a little past the slot along the arrival lane; reversePark() backs in from there.
        const dir = Math.sign(slotPos.x - last.x) || 1;
        const stop = new Vec2(slotPos.x + dir * GameConfig.bus.parkOvershoot, last.y);
        bus.planPark(new Vec3(stop.x, 0, stop.y), slotPos);
        GameManager.driveAlong(bus, [new Vec2(exit.x, exit.y), ...lane, stop], this);
    }

    private onBusGone(bus: Bus): void {
        bus.state = BusState.Gone;
        this.buses = this.buses.filter((b) => b !== bus);
        bus.node.destroy();
        this.busesLeft--;
        if (!this.buses.some((b) => b.state === BusState.Exiting)) this.gate.close();
        if (this.busesLeft <= 0) this.win();
    }

    // ---------------------------------------------------------------- outcome

    private win(): void {
        if (this.state !== GameState.Playing) return;
        this.state = GameState.Won;
        this.setHinted(null);
        this.gameplay.showTapHint(false);
        this.scheduleOnce(() => {
            this.winView.show();
            this.confetti();
        }, GameConfig.ui.resultDelay);
    }

    /** Confetti rain from the top edge of the canvas. */
    private confetti(): void {
        const preset = GameConfig.fx.burst.confetti;
        const size = this.canvas.getComponent(UITransform).contentSize;
        this.tmpUi.set(0, size.height / 2 + preset.size, 0);
        this.fx.burst(this.tmpUi, CONFETTI_COLORS, preset);
    }

    private lose(bus: Bus): void {
        if (this.state !== GameState.Playing) return;
        this.state = GameState.Lost;
        bus.halt();
        bus.crashFeedback();
        this.shake(GameConfig.camera.shake.lose);
        this.setHinted(null);
        this.gameplay.showTapHint(false);
        this.gameplay.toast(GameConfig.ui.text.noParking, GameConfig.ui.loseToastDuration);
        this.scheduleOnce(() => this.loseView.show(), GameConfig.ui.resultDelay + GameConfig.ui.loseExtraDelay);
    }


    // ---------------------------------------------------------------- HUD / hint / autoplay

    private updateHud(dt: number): void {
        if (!this.gameplay) return;
        this.gameplay.setCapacity(this.busesOnRoad(), this.level.roadCapacity);
        this.gameplay.setCounters(this.busStops.map((stop) => stop.remaining), this.busesLeft);

        if (this.state !== GameState.Playing) return;
        this.idleTimer += dt;
        const wantHint = !this.hasTapped || this.idleTimer > GameConfig.hint.idleDelay;
        const target = wantHint && this.busesOnRoad() < this.level.roadCapacity ? this.suggestBus() : null;
        this.setHinted(target);
        if (target) {
            this.gameplay.showTapHint(true, this.worldToUi(target.node.worldPosition, this.gameplay.node, this.tmpUi,
                GameConfig.hint.handHeight));
        } else {
            this.gameplay.showTapHint(false);
        }
    }

    private setHinted(bus: Bus | null): void {
        if (this.hinted === bus) return;
        if (this.hinted && this.hinted.isValid) this.hinted.setHighlighted(false);
        this.hinted = bus;
        if (bus) bus.setHighlighted(true);
    }

    /**
     * The bus a player should tap next: dispatchable and matching the head of a queue that no bus
     * on the road is already heading for. Parked buses come first (they free a slot), then the row
     * head whose free seats best fit the run of same-coloured passengers at that head.
     */
    private suggestBus(): Bus | null {
        const runs = new Map<BusColor, number>();
        this.busStops.forEach((stop, i) => {
            const color = stop.peek();
            if (color === null) return;
            // A matching bus already driving towards this stop will serve its head: no hint needed.
            if (this.buses.some((b) => b.color === color && this.isInboundToStop(b, i))) return;
            runs.set(color, Math.max(runs.get(color) ?? 0, stop.headRunLength()));
        });
        const candidates = this.buses.filter((b) => runs.has(b.color) && this.canDispatch(b));
        candidates.sort((a, b) => {
            const parkedFirst = Number(b.state === BusState.Parked) - Number(a.state === BusState.Parked);
            return parkedFirst || Math.abs(a.freeSeats - runs.get(a.color)) - Math.abs(b.freeSeats - runs.get(b.color));
        });
        return candidates.length ? candidates[0] : null;
    }

    /** True while a bus with free seats is on the road and has not passed stop `index` yet. */
    private isInboundToStop(bus: Bus, index: number): boolean {
        const trip = bus.currentTrip;
        if (bus.isFull || !trip || index >= trip.stops.length) return false;
        // While boarding, the stop the bus stands at still counts as ahead of it.
        if (bus.state === BusState.Boarding) return bus.nextStopIndex - 1 <= index;
        return bus.state === BusState.OnRoad && bus.nextStopIndex <= index;
    }

    /** Colours currently at the head of a queue. */
    private headColors(): BusColor[] {
        return this.busStops.map((stop) => stop.peek()).filter((c): c is BusColor => c !== null);
    }

    /** Passengers still waiting over all the stops. */
    private get passengersLeft(): number {
        return this.busStops.reduce((sum, stop) => sum + stop.remaining, 0);
    }

    private tickAutoplay(dt: number): void {
        if (this.state !== GameState.Playing) return;
        this.autoTimer += dt;
        if (this.autoTimer < GameConfig.autoplay.interval) return;
        this.autoTimer = 0;
        if (this.busesOnRoad() >= this.level.roadCapacity) return;
        let target: Bus | null;
        if (this.autoRandom || this.autoWrong) {
            const heads = this.headColors();
            const options = this.buses.filter((b) => this.canDispatch(b) && (!this.autoWrong || heads.indexOf(b.color) < 0));
            target = options.length ? options[Math.floor(Math.random() * options.length)] : null;
        } else {
            target = this.suggestBus();
        }
        if (target) {
            console.log(`[autoplay] dispatch ${BusColor[target.color]}${target.seatCount} (${BusState[target.state]}) queue=${this.passengersLeft} buses=${this.busesLeft}`);
            this.hasTapped = true;
            this.dispatch(target);
        }
    }
}
