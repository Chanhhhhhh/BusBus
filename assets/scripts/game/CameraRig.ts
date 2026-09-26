import { _decorator, Camera, Component, Mat4, Vec3, Vec4, screen } from 'cc';
import { GameConfig } from '../core/GameConfig';

const { ccclass, property } = _decorator;

/**
 * Frames a world-space box in the camera for any aspect ratio: the camera looks at the box
 * centre from a fixed pitch and pulls back until all eight corners fit inside the viewport.
 */
@ccclass('CameraRig')
export class CameraRig extends Component {
    @property(Camera) camera: Camera = null;
    /** Downward tilt in degrees (90 = straight down). */
    @property pitch = 58;
    @property(Vec3) boundsMin = new Vec3(-7.5, 0, -24);
    @property(Vec3) boundsMax = new Vec3(7.5, 1.5, 15);
    /** Fraction of the viewport kept empty on each side. */
    @property margin = 0.03;
    /** Extra space reserved at the top / bottom for the HUD (fraction of the viewport). */
    @property topReserve = 0.08;
    @property bottomReserve = 0.1;

    private readonly corners: Vec3[] = [];
    private readonly center = new Vec3();
    private readonly forward = new Vec3();
    private readonly pos = new Vec3();
    private readonly view = new Mat4();
    private readonly proj = new Mat4();
    private readonly clip = new Vec4();

    onLoad(): void {
        for (let i = 0; i < 8; i++) this.corners.push(new Vec3());
        this.fit();
        screen.on('window-resize', this.fit, this);
        screen.on('orientation-change', this.fit, this);
    }

    onDestroy(): void {
        screen.off('window-resize', this.fit, this);
        screen.off('orientation-change', this.fit, this);
    }

    setBounds(min: Vec3, max: Vec3): void {
        this.boundsMin.set(min);
        this.boundsMax.set(max);
        this.fit();
    }

    fit(): void {
        if (!this.camera) return;
        const min = this.boundsMin;
        const max = this.boundsMax;
        Vec3.add(this.center, min, max).multiplyScalar(0.5);
        let i = 0;
        for (const x of [min.x, max.x]) {
            for (const y of [min.y, max.y]) {
                for (const z of [min.z, max.z]) this.corners[i++].set(x, y, z);
            }
        }
        const rad = (this.pitch * Math.PI) / 180;
        // Camera sits on the -Z side of the box, looking towards +Z and down.
        this.forward.set(0, -Math.sin(rad), Math.cos(rad));

        const size = screen.windowSize;
        const aspect = size.width / Math.max(1, size.height);
        Mat4.perspective(this.proj, this.camera.fov, aspect, this.camera.near, this.camera.far);

        // Binary search on the distance: the projected box shrinks monotonically as we pull back.
        const cfg = GameConfig.camera;
        let lo = cfg.minDistance;
        let hi = cfg.maxDistance;
        for (let iter = 0; iter < cfg.searchIterations; iter++) {
            const d = (lo + hi) * 0.5;
            if (this.fitsAt(d)) hi = d;
            else lo = d;
        }
        Vec3.scaleAndAdd(this.pos, this.center, this.forward, -hi * cfg.distanceSafety);
        this.node.setWorldPosition(this.pos);
        this.node.lookAt(this.center, Vec3.UP);
    }

    /** Projects the box corners with a camera `distance` away from the centre and checks NDC bounds. */
    private fitsAt(distance: number): boolean {
        Vec3.scaleAndAdd(this.pos, this.center, this.forward, -distance);
        Mat4.lookAt(this.view, this.pos, this.center, Vec3.UP);
        const minX = -1 + 2 * this.margin;
        const maxX = 1 - 2 * this.margin;
        const minY = -1 + 2 * (this.margin + this.bottomReserve);
        const maxY = 1 - 2 * (this.margin + this.topReserve);
        for (const c of this.corners) {
            this.clip.set(c.x, c.y, c.z, 1);
            Vec4.transformMat4(this.clip, this.clip, this.view);
            Vec4.transformMat4(this.clip, this.clip, this.proj);
            if (this.clip.w <= 0) return false;
            const x = this.clip.x / this.clip.w;
            const y = this.clip.y / this.clip.w;
            if (x < minX || x > maxX || y < minY || y > maxY) return false;
        }
        return true;
    }
}
