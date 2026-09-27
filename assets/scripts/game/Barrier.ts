import { Node, TweenEasing, Vec3 } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { AnimService } from '../services/AnimService';

/**
 * The gate barrier: a post plus an arm hinged at the post top (the arm mesh extends along its
 * local +Z from the hinge). The arm swings up while a full bus turns into the gate and drops
 * back with a bounce once it has left.
 */
export class Barrier {
    private readonly arm: Node | null;
    private isOpen = false;

    constructor(private readonly root: Node | null) {
        this.arm = Barrier.find(root, GameConfig.barrier.armNode);
        if (this.arm) this.arm.setRotationFromEuler(0, 0, 0);
    }

    open(): void {
        if (this.isOpen || !this.root) return;
        this.isOpen = true;
        const cfg = GameConfig.barrier;
        this.swing(cfg.openAngle, cfg.openDuration, 'backOut');
        AnimService.punchScale(this.root, 1, cfg.punch.amount, cfg.punch.duration);
    }

    close(): void {
        if (!this.isOpen || !this.root) return;
        this.isOpen = false;
        this.swing(0, GameConfig.barrier.closeDuration, 'bounceOut');
    }

    /** Rotates the arm about its hinge (local X); negative angles lift the tip. */
    private swing(angle: number, duration: number, easing: TweenEasing): void {
        if (this.arm) AnimService.rotateTo(this.arm, new Vec3(angle, 0, 0), duration, easing);
    }

    private static find(root: Node | null, name: string): Node | null {
        if (!root) return null;
        if (root.name === name) return root;
        for (const child of root.children) {
            const hit = Barrier.find(child, name);
            if (hit) return hit;
        }
        return null;
    }
}
