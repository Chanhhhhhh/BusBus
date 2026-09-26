import { Vec2, Vec3 } from 'cc';
import { GameConfig } from './GameConfig';

/**
 * A 2D polyline on the XZ plane with rounded corners, parameterised by arc length.
 * `Vec2.y` stores the world Z coordinate.
 */
export class Path {
    private readonly pts: Vec2[] = [];
    private readonly cum: number[] = [];
    readonly length: number;

    constructor(points: readonly Vec2[], cornerRadius = GameConfig.road.cornerRadius, subdivisions = GameConfig.road.cornerSubdivisions) {
        const rounded = Path.roundCorners(points, cornerRadius, subdivisions);
        let acc = 0;
        this.pts.push(rounded[0].clone());
        this.cum.push(0);
        for (let i = 1; i < rounded.length; i++) {
            const d = Vec2.distance(rounded[i], rounded[i - 1]);
            if (d < 1e-5) continue;
            acc += d;
            this.pts.push(rounded[i].clone());
            this.cum.push(acc);
        }
        this.length = acc;
    }

    /**
     * Samples a Catmull-Rom spline through `control` (endpoints included) into a dense polyline.
     * Used for the road, whose shape is authored as a handful of waypoint nodes in the scene.
     */
    static catmullRom(control: readonly Vec2[], samplesPerSegment = GameConfig.road.splineSamples): Vec2[] {
        if (control.length < 2) return control.map((p) => p.clone());
        const pts = [control[0], ...control, control[control.length - 1]];
        const out: Vec2[] = [];
        for (let i = 1; i < pts.length - 2; i++) {
            const p0 = pts[i - 1];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2];
            for (let k = 0; k < samplesPerSegment; k++) {
                const t = k / samplesPerSegment;
                const t2 = t * t;
                const t3 = t2 * t;
                out.push(new Vec2(
                    0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                    0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
                ));
            }
        }
        out.push(control[control.length - 1].clone());
        return out;
    }

    /** Replaces every corner with a quadratic curve so vehicles do not snap between directions. */
    static roundCorners(points: readonly Vec2[], radius: number, subdivisions: number): Vec2[] {
        if (points.length < 3 || radius <= 0) return points.map((p) => p.clone());
        const out: Vec2[] = [points[0].clone()];
        const u = new Vec2();
        const v = new Vec2();
        for (let i = 1; i < points.length - 1; i++) {
            const a = points[i - 1];
            const p = points[i];
            const b = points[i + 1];
            Vec2.subtract(u, p, a);
            Vec2.subtract(v, b, p);
            const lu = u.length();
            const lv = v.length();
            if (lu < 1e-5 || lv < 1e-5) continue;
            u.multiplyScalar(1 / lu);
            v.multiplyScalar(1 / lv);
            const cross = u.x * v.y - u.y * v.x;
            const dot = u.x * v.x + u.y * v.y;
            if (Math.abs(cross) < GameConfig.road.straightThreshold && dot > 0) {
                out.push(p.clone());
                continue;
            }
            const d = Math.min(radius, lu * 0.5, lv * 0.5);
            const p0x = p.x - u.x * d;
            const p0y = p.y - u.y * d;
            const p2x = p.x + v.x * d;
            const p2y = p.y + v.y * d;
            for (let k = 0; k <= subdivisions; k++) {
                const t = k / subdivisions;
                const mt = 1 - t;
                out.push(new Vec2(
                    mt * mt * p0x + 2 * mt * t * p.x + t * t * p2x,
                    mt * mt * p0y + 2 * mt * t * p.y + t * t * p2y,
                ));
            }
        }
        out.push(points[points.length - 1].clone());
        return out;
    }

    /** World position (y = 0) at arc length `s`. */
    posAt(s: number, out: Vec3 = new Vec3()): Vec3 {
        const { i, t } = this.locate(s);
        const a = this.pts[i];
        const b = this.pts[i + 1];
        return out.set(a.x + (b.x - a.x) * t, 0, a.y + (b.y - a.y) * t);
    }

    /** Unit tangent at arc length `s`. */
    dirAt(s: number, out: Vec3 = new Vec3()): Vec3 {
        const { i } = this.locate(s);
        const a = this.pts[i];
        const b = this.pts[i + 1];
        out.set(b.x - a.x, 0, b.y - a.y);
        return out.normalize();
    }

    /** Arc length of the point on the path closest to (x, z). */
    closestS(x: number, z: number): number {
        let bestS = 0;
        let bestD = Infinity;
        for (let i = 0; i < this.pts.length - 1; i++) {
            const a = this.pts[i];
            const b = this.pts[i + 1];
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const len2 = abx * abx + aby * aby;
            let t = len2 > 0 ? ((x - a.x) * abx + (z - a.y) * aby) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            const px = a.x + abx * t;
            const py = a.y + aby * t;
            const d = (px - x) * (px - x) + (py - z) * (py - z);
            if (d < bestD) {
                bestD = d;
                bestS = this.cum[i] + Math.sqrt(len2) * t;
            }
        }
        return bestS;
    }

    private locate(s: number): { i: number; t: number } {
        const cum = this.cum;
        const last = cum.length - 1;
        if (s <= 0) return { i: 0, t: 0 };
        if (s >= this.length) return { i: last - 1, t: 1 };
        let lo = 0;
        let hi = last;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (cum[mid] <= s) lo = mid;
            else hi = mid;
        }
        const seg = cum[hi] - cum[lo];
        return { i: lo, t: seg > 0 ? (s - cum[lo]) / seg : 0 };
    }
}
