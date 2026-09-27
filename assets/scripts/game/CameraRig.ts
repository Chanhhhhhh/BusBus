import { _decorator, Camera, Component, Mat4, Vec3, Vec4, screen } from 'cc';
import { GameConfig } from '../core/GameConfig';

const { ccclass, property } = _decorator;

/**
 * Frames a world-space box in the camera for any aspect ratio. The camera looks down at a fixed
 * pitch and pulls back until all eight box corners fit inside the viewport (minus margins and
 * HUD reserves). Because of perspective the near edge of the box would touch the bottom long
 * before the far edge touches the top, so the look-at point is also slid along the depth axis
 * until the top and bottom slack are equal: that is what lets the camera get as close as possible.
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
    private readonly target = new Vec3();
    private readonly forward = new Vec3();
    private readonly pos = new Vec3();
    private readonly view = new Mat4();
    private readonly proj = new Mat4();
    private readonly clip = new Vec4();
    /** Resting position from the last fit(); shakes are offsets from it. */
    private readonly basePos = new Vec3();
    private readonly shakeOffset = new Vec3();
    private shakeAmplitude = 0;
    private shakeDuration = 0;
    private shakeLeft = 0;

    // Scratch results of project(): NDC extents of the corners and whether all were in front.
    private ndcMinX = 0;
    private ndcMaxX = 0;
    private ndcMinY = 0;
    private ndcMaxY = 0;
    private inFront = true;
    /** Depth offset of the look-at point from the box centre chosen by the last fitsAt(). */
    private shift = 0;

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
        const distance = hi * cfg.distanceSafety;
        this.fitsAt(distance);
        this.lookAt(distance, this.shift);
        this.basePos.set(this.pos);
        this.node.setWorldPosition(this.pos);
        this.node.lookAt(this.target, Vec3.UP);
    }

    /** Screen shake: random in-plane offsets that fade out quadratically over `duration`. */
    shake(amplitude: number, duration: number): void {
        this.shakeAmplitude = Math.max(amplitude, this.shakeAmplitude * (this.shakeLeft / Math.max(this.shakeDuration, 1e-3)));
        this.shakeDuration = duration;
        this.shakeLeft = duration;
    }

    lateUpdate(dt: number): void {
        if (this.shakeLeft <= 0) return;
        this.shakeLeft -= dt;
        const k = Math.max(0, this.shakeLeft / this.shakeDuration);
        const a = this.shakeAmplitude * k * k;
        Vec3.scaleAndAdd(this.shakeOffset, this.basePos, this.node.right, (Math.random() * 2 - 1) * a);
        Vec3.scaleAndAdd(this.shakeOffset, this.shakeOffset, this.node.up, (Math.random() * 2 - 1) * a);
        this.node.setWorldPosition(this.shakeOffset);
        if (this.shakeLeft <= 0) this.shakeAmplitude = 0;
    }

    /**
     * Can the box be framed from `distance` away? Slides the look-at point along Z (bisection)
     * until the slack above and below the box is equal, then checks every corner.
     */
    private fitsAt(distance: number): boolean {
        const minX = -1 + 2 * this.margin;
        const maxX = 1 - 2 * this.margin;
        const minY = -1 + 2 * (this.margin + this.bottomReserve);
        const maxY = 1 - 2 * (this.margin + this.topReserve);

        const halfDepth = (this.boundsMax.z - this.boundsMin.z) * 0.5;
        let lo = -halfDepth;
        let hi = halfDepth;
        for (let iter = 0; iter < GameConfig.camera.shiftIterations; iter++) {
            const s = (lo + hi) * 0.5;
            this.project(distance, s);
            // Moving the look-at point (and the camera) forward shifts everything down on screen.
            if (maxY - this.ndcMaxY > this.ndcMinY - minY) hi = s;
            else lo = s;
        }
        this.shift = (lo + hi) * 0.5;
        this.project(distance, this.shift);
        return this.inFront
            && this.ndcMinX >= minX && this.ndcMaxX <= maxX
            && this.ndcMinY >= minY && this.ndcMaxY <= maxY;
    }

    private lookAt(distance: number, shift: number): void {
        this.target.set(this.center.x, this.center.y, this.center.z + shift);
        Vec3.scaleAndAdd(this.pos, this.target, this.forward, -distance);
    }

    /** Projects the box corners for a camera `distance` away from the shifted look-at point. */
    private project(distance: number, shift: number): void {
        this.lookAt(distance, shift);
        Mat4.lookAt(this.view, this.pos, this.target, Vec3.UP);
        this.ndcMinX = this.ndcMinY = Infinity;
        this.ndcMaxX = this.ndcMaxY = -Infinity;
        this.inFront = true;
        for (const c of this.corners) {
            this.clip.set(c.x, c.y, c.z, 1);
            Vec4.transformMat4(this.clip, this.clip, this.view);
            Vec4.transformMat4(this.clip, this.clip, this.proj);
            if (this.clip.w <= 0) {
                this.inFront = false;
                return;
            }
            const x = this.clip.x / this.clip.w;
            const y = this.clip.y / this.clip.w;
            this.ndcMinX = Math.min(this.ndcMinX, x);
            this.ndcMaxX = Math.max(this.ndcMaxX, x);
            this.ndcMinY = Math.min(this.ndcMinY, y);
            this.ndcMaxY = Math.max(this.ndcMaxY, y);
        }
    }
}
