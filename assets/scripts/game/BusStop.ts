import { _decorator, Component, Vec3 } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { BusColor } from '../core/Types';
import { popIn } from '../fx/Juice';
import { Passenger } from './Passenger';

const { ccclass, property } = _decorator;

export type PassengerFactory = (color: BusColor) => Passenger;

/**
 * "Bến xe": owns the passenger queue. The node position is where the head of the queue stands;
 * the queue extends along `queueDir`. Only the first `visibleInQueue` passengers are instantiated.
 */
@ccclass('BusStop')
export class BusStop extends Component {
    /** Direction (world XZ) in which the queue extends behind the head. */
    @property(Vec3) queueDir = new Vec3(0, 0, -1);
    /** Direction the waiting passengers face (towards the road). */
    @property(Vec3) faceDir = new Vec3(1, 0, 0);

    private pending: BusColor[] = [];
    private visible: Passenger[] = [];
    private factory: PassengerFactory | null = null;
    private readonly tmp = new Vec3();

    /** Passengers still waiting (visible + not yet spawned). */
    get remaining(): number { return this.pending.length; }

    init(colors: readonly BusColor[], factory: PassengerFactory): void {
        this.factory = factory;
        this.pending = colors.slice();
        for (const p of this.visible) p.node.destroy();
        this.visible = [];
        this.fillTail(false);
    }

    /** Number of consecutive passengers at the head sharing the head colour. */
    headRunLength(): number {
        let n = 0;
        while (n < this.pending.length && this.pending[n] === this.pending[0]) n++;
        return n;
    }

    /** Colour of the passenger at the head of the queue, or null when the queue is empty. */
    peek(): BusColor | null {
        return this.pending.length > 0 ? this.pending[0] : null;
    }

    /** Removes the head passenger from the queue and hands its node over to the caller. */
    takeHead(): Passenger | null {
        if (this.pending.length === 0 || this.visible.length === 0) return null;
        this.pending.shift();
        const head = this.visible.shift();
        this.shiftForward();
        this.fillTail(true);
        return head;
    }

    slotWorldPos(index: number, out: Vec3 = new Vec3()): Vec3 {
        const base = this.node.worldPosition;
        const spacing = GameConfig.passenger.queueSpacing;
        return out.set(
            base.x + this.queueDir.x * spacing * index,
            base.y,
            base.z + this.queueDir.z * spacing * index,
        );
    }

    private shiftForward(): void {
        for (let i = 0; i < this.visible.length; i++) {
            const p = this.visible[i];
            this.slotWorldPos(i, this.tmp);
            p.walkTo(this.tmp, GameConfig.passenger.walkSpeed, () => {
                p.face(this.faceDir);
                p.idle();
            });
        }
    }

    private fillTail(animate: boolean): void {
        if (!this.factory) return;
        const max = GameConfig.passenger.visibleInQueue;
        while (this.visible.length < max && this.visible.length < this.pending.length) {
            const index = this.visible.length;
            const p = this.factory(this.pending[index]);
            p.node.setParent(this.node, false);
            p.node.setWorldPosition(this.slotWorldPos(index, this.tmp));
            p.face(this.faceDir);
            p.idle();
            const scale = GameConfig.passenger.scale;
            if (animate) popIn(p.node, scale, GameConfig.passenger.spawnPopDuration);
            else p.node.setScale(scale, scale, scale);
            this.visible.push(p);
        }
    }
}
