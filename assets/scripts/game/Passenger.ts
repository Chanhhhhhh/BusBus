import { _decorator, Component, Material, Node, SkeletalAnimation, SkinnedMeshRenderer, Vec3 } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { BusColor } from '../core/Types';

const { ccclass, property } = _decorator;

const R2D = 180 / Math.PI;

const CLIP_IDLE = 'Idle';
const CLIP_WALK = 'Walk';
const CLIP_SIT = 'Sit';

/** A stickman passenger: colour, animation state and simple "walk to point" movement. */
@ccclass('Passenger')
export class Passenger extends Component {
    @property(SkeletalAnimation) anim: SkeletalAnimation = null;
    @property(SkinnedMeshRenderer) renderer: SkinnedMeshRenderer = null;
    /** Child node holding the mesh, rotated so the character faces +Z of this node. */
    @property(Node) model: Node = null;
    @property(Node) shadow: Node = null;
    @property modelYawOffset = 0;

    color: BusColor = BusColor.Red;

    private target: Vec3 | null = null;
    private speed = GameConfig.passenger.walkSpeed;
    private onArrive: (() => void) | null = null;
    private readonly tmp = new Vec3();

    onLoad(): void {
        if (this.model) this.model.setRotationFromEuler(0, this.modelYawOffset, 0);
    }

    init(color: BusColor, material: Material): void {
        this.color = color;
        this.renderer.setSharedMaterial(material, 0);
        this.idle();
    }

    idle(): void { this.play(CLIP_IDLE, GameConfig.passenger.fade.idle); }
    walk(): void { this.play(CLIP_WALK, GameConfig.passenger.fade.walk); }
    sit(): void { this.play(CLIP_SIT, GameConfig.passenger.fade.sit); }

    private play(clip: string, fade: number): void {
        if (!this.anim) return;
        const state = this.anim.getState(clip);
        if (state && state.isPlaying) return;
        this.anim.crossFade(clip, fade);
    }

    /** Faces a world-space direction on the XZ plane. */
    face(dir: Vec3): void {
        if (dir.lengthSqr() < 1e-6) return;
        this.node.setRotationFromEuler(0, Math.atan2(dir.x, dir.z) * R2D, 0);
    }

    /** Walks in a straight line to `worldPos` (y ignored) and calls back on arrival. */
    walkTo(worldPos: Vec3, speed: number, onArrive?: () => void): void {
        this.target = new Vec3(worldPos.x, this.node.worldPosition.y, worldPos.z);
        this.speed = speed;
        this.onArrive = onArrive ?? null;
        Vec3.subtract(this.tmp, this.target, this.node.worldPosition);
        this.face(this.tmp);
        this.walk();
    }

    cancelWalk(): void {
        this.target = null;
        this.onArrive = null;
    }

    update(dt: number): void {
        if (!this.target) return;
        const pos = this.node.worldPosition;
        Vec3.subtract(this.tmp, this.target, pos);
        this.tmp.y = 0;
        const dist = this.tmp.length();
        const step = this.speed * dt;
        if (dist <= step) {
            this.node.setWorldPosition(this.target);
            this.target = null;
            const cb = this.onArrive;
            this.onArrive = null;
            if (cb) cb();
            return;
        }
        this.tmp.multiplyScalar(step / dist);
        this.node.setWorldPosition(pos.x + this.tmp.x, pos.y, pos.z + this.tmp.z);
    }
}
