import { Color, Font, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, tween } from 'cc';
import { GameConfig } from '../core/GameConfig';

const D2R = Math.PI / 180;
const FLOAT = GameConfig.fx.floatText;

export interface BurstPreset {
    count: number;
    /** Particle diameter in design pixels. */
    size: number;
    /** Initial speed in px/s (each particle gets 50-100 % of it). */
    speed: number;
    life: number;
    /** px/s^2, positive pulls the particles down. */
    gravity: number;
    /** Emission direction in degrees (0 = right, 90 = up) and the half-angle of the cone around it. */
    angle: number;
    spread: number;
    /** Height / width ratio of the particle (1 = round dot, < 1 = confetti strip). */
    stretch?: number;
    /** Degrees per second of spin. */
    spin?: number;
    /** Horizontal band the particles spawn in, centred on the emit point. */
    spawnWidth?: number;
}

interface Particle {
    node: Node;
    sprite: Sprite;
    color: Color;
    x0: number;
    y0: number;
    vx: number;
    vy: number;
    spin: number;
    life: number;
}

/**
 * Lightweight canvas-space particle bursts and floating labels, built from pooled Sprite / Label
 * nodes so no particle asset has to ship. The layer node is added last under the canvas so the
 * effects draw above every view.
 */
export class FxLayer {
    readonly node: Node;
    private readonly spritePool: Node[] = [];
    private readonly labelPool: Node[] = [];
    private readonly tmpColor = new Color();

    constructor(canvas: Node, private readonly frame: SpriteFrame | null, private readonly font: Font | null = null) {
        this.node = new Node('FxLayer');
        this.node.layer = canvas.layer;
        // Camera.convertToUINode() needs a UITransform on the target node.
        this.node.addComponent(UITransform);
        this.node.setParent(canvas, false);
    }

    /** Emits one burst at `center` (local to the layer); colours are picked round-robin. */
    burst(center: Vec3, colors: readonly Color[], preset: BurstPreset): void {
        if (!this.frame || colors.length === 0) return;
        const particles: Particle[] = [];
        for (let i = 0; i < preset.count; i++) {
            const node = this.acquireSprite();
            const sprite = node.getComponent(Sprite);
            const color = colors[i % colors.length];
            const a = (preset.angle + (Math.random() * 2 - 1) * preset.spread) * D2R;
            const v = preset.speed * (0.5 + Math.random() * 0.5);
            const size = preset.size * (0.7 + Math.random() * 0.6);
            const spawn = preset.spawnWidth ? (Math.random() - 0.5) * preset.spawnWidth : 0;
            node.getComponent(UITransform).setContentSize(size, size * (preset.stretch ?? 1));
            node.angle = Math.random() * 360;
            sprite.color = color;
            particles.push({
                node, sprite, color,
                x0: center.x + spawn, y0: center.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                spin: (preset.spin ?? 0) * (Math.random() < 0.5 ? -1 : 1),
                life: preset.life * (0.7 + Math.random() * 0.3),
            });
        }
        const state = { t: 0, last: 0 };
        tween(state)
            .to(preset.life, { t: preset.life }, {
                onUpdate: () => {
                    this.step(particles, state.t, state.t - state.last, preset.gravity);
                    state.last = state.t;
                },
            })
            .call(() => { for (const p of particles) this.releaseSprite(p.node); })
            .start();
    }

    /** A label that pops in above `anchor`, rises and fades out. */
    floatText(text: string, anchor: Vec3, color: Color): void {
        const node = this.acquireLabel();
        const label = node.getComponent(Label);
        const opacity = node.getComponent(UIOpacity);
        label.string = text;
        label.color = color;
        opacity.opacity = 255;
        const startY = anchor.y + FLOAT.startOffset;
        node.setPosition(anchor.x, startY, 0);
        node.setScale(0.3, 0.3, 1);
        tween(node)
            .to(FLOAT.duration * 0.25, { scale: new Vec3(FLOAT.popScale, FLOAT.popScale, 1) }, { easing: 'backOut' })
            .to(FLOAT.duration * 0.75, { scale: new Vec3(1, 1, 1), position: new Vec3(anchor.x, startY + FLOAT.rise, 0) }, { easing: 'quadOut' })
            .call(() => this.release(node, this.labelPool))
            .start();
        tween(opacity)
            .delay(FLOAT.duration * 0.5)
            .to(FLOAT.duration * 0.5, { opacity: 0 })
            .start();
    }

    private step(particles: Particle[], t: number, dt: number, gravity: number): void {
        for (const p of particles) {
            const k = t / p.life;
            if (k >= 1) {
                if (p.node.active) p.node.active = false;
                continue;
            }
            p.node.setPosition(p.x0 + p.vx * t, p.y0 + p.vy * t - 0.5 * gravity * t * t, 0);
            if (p.spin) p.node.angle += p.spin * dt;
            // Full size for the first half of the life, then shrink and fade together.
            const fade = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
            p.node.setScale(fade, fade, 1);
            this.tmpColor.set(p.color.r, p.color.g, p.color.b, Math.round(p.color.a * fade));
            p.sprite.color = this.tmpColor;
        }
    }

    private acquireSprite(): Node {
        let node = this.spritePool.pop();
        if (!node) {
            node = new Node('Particle');
            node.layer = this.node.layer;
            const sprite = node.addComponent(Sprite);
            sprite.spriteFrame = this.frame;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        }
        node.setParent(this.node, false);
        node.active = true;
        return node;
    }

    private acquireLabel(): Node {
        let node = this.labelPool.pop();
        if (!node) {
            node = new Node('FloatText');
            node.layer = this.node.layer;
            node.addComponent(UIOpacity);
            const label = node.addComponent(Label);
            if (this.font) {
                label.useSystemFont = false;
                label.font = this.font;
            } else {
                label.isBold = true;
            }
            label.fontSize = FLOAT.fontSize;
            label.lineHeight = FLOAT.fontSize * 1.2;
            label.enableOutline = true;
            label.outlineWidth = 4;
            label.outlineColor = new Color(0, 0, 0, 200);
        }
        node.setParent(this.node, false);
        node.active = true;
        return node;
    }

    private releaseSprite(node: Node): void {
        node.setScale(1, 1, 1);
        this.release(node, this.spritePool);
    }

    private release(node: Node, pool: Node[]): void {
        node.active = false;
        pool.push(node);
    }
}
