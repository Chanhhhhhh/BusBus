import { _decorator, Camera, Component, EventTouch, Input, Vec3, geometry, input } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { Bus } from './Bus';

const { ccclass, property } = _decorator;

/**
 * Picks the bus under a tap by casting a ray from the 3D camera against the body bounds.
 * Falls back to the closest bus in screen space so small buses stay easy to hit on phones.
 */
@ccclass('TapInput')
export class TapInput extends Component {
    @property(Camera) camera: Camera = null;
    /** Screen-space fallback radius in CSS pixels. */
    @property fallbackRadius = 48;

    onTap: ((bus: Bus) => void) | null = null;
    getTargets: (() => readonly Bus[]) | null = null;

    private readonly ray = new geometry.Ray();
    private readonly aabb = new geometry.AABB();
    private readonly screenPos = new Vec3();

    onEnable(): void {
        input.on(Input.EventType.TOUCH_START, this.onTouch, this);
    }

    onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouch, this);
    }

    private onTouch(event: EventTouch): void {
        if (!this.onTap || !this.getTargets || !this.camera) return;
        const loc = event.getLocation();
        const bus = this.pick(loc.x, loc.y);
        if (bus) this.onTap(bus);
    }

    pick(x: number, y: number): Bus | null {
        const targets = this.getTargets ? this.getTargets() : [];
        this.camera.screenPointToRay(x, y, this.ray);

        let best: Bus | null = null;
        let bestDist = Infinity;
        for (const bus of targets) {
            const model = bus.bodyRenderer && bus.bodyRenderer.model;
            const bounds = model && model.worldBounds;
            if (!bounds) continue;
            geometry.AABB.copy(this.aabb, bounds);
            // Generous bounds: buses are small on screen.
            this.aabb.halfExtents.x += GameConfig.input.tapPadding;
            this.aabb.halfExtents.z += GameConfig.input.tapPadding;
            const d = geometry.intersect.rayAABB(this.ray, this.aabb);
            if (d > 0 && d < bestDist) {
                bestDist = d;
                best = bus;
            }
        }
        if (best) return best;

        const radius = this.fallbackRadius * (window.devicePixelRatio || 1);
        let bestPx = radius * radius;
        for (const bus of targets) {
            this.camera.worldToScreen(bus.node.worldPosition, this.screenPos);
            const dx = this.screenPos.x - x;
            const dy = this.screenPos.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestPx) {
                bestPx = d2;
                best = bus;
            }
        }
        return best;
    }
}
