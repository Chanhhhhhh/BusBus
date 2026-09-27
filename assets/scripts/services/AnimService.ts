import { Node, Tween, TweenEasing, Vec3, tween } from 'cc';
import { GameConfig } from '../core/GameConfig';

const FX = GameConfig.fx;
const ANIM = GameConfig.ui.anim;
const BUTTON = GameConfig.ui.button;

/**
 * Every reusable tween animation of the game, in one stateless service. Callers pass the node and
 * (optionally) the tuning; defaults come from GameConfig. Each method stops the tweens already
 * running on its target first, so animations never stack on the same node.
 *
 * Gameplay motion (driving, reverse parking, particles, camera shake) lives with its owner; this
 * service only holds the "juice" and UI animations shared by several classes.
 */
export class AnimService {
    // ------------------------------------------------------------------ generic

    static stop(node: Node | null): void {
        if (node) Tween.stopAllByTarget(node);
    }

    /** Squash-and-stretch punch: wide and short, then springs back to `base`. */
    static punchScale(node: Node, base = 1, amount = FX.punch.amount, duration = FX.punch.duration): void {
        Tween.stopAllByTarget(node);
        node.setScale(base, base, base);
        const attack = duration * FX.punch.attackRatio;
        tween(node)
            .to(attack, { scale: new Vec3(base * (1 + amount), base * (1 - amount * FX.punch.squashFactor), base * (1 + amount)) }, { easing: 'quadOut' })
            .to(duration - attack, { scale: new Vec3(base, base, base) }, { easing: 'backOut' })
            .start();
    }

    /** Grows from (almost) nothing to `target` with an overshoot, optionally after `delay`. */
    static popIn(node: Node, target = 1, duration = FX.popDuration, delay = 0, from = 0.01): void {
        Tween.stopAllByTarget(node);
        node.setScale(from, from, node.scale.z || 1);
        tween(node)
            .delay(delay)
            .to(duration, { scale: new Vec3(target, target, target) }, { easing: 'backOut' })
            .start();
    }

    /** Short yaw wobble used as "you cannot do that" feedback. */
    static wobble(node: Node, degrees = FX.wobble.degrees, duration = FX.wobble.duration): void {
        const yaw = node.eulerAngles.y;
        const step = duration / 4;
        tween(node)
            .to(step, { eulerAngles: new Vec3(0, yaw + degrees, 0) })
            .to(step, { eulerAngles: new Vec3(0, yaw - degrees, 0) })
            .to(step, { eulerAngles: new Vec3(0, yaw + degrees * FX.wobble.secondSwing, 0) })
            .to(step, { eulerAngles: new Vec3(0, yaw, 0) })
            .start();
    }

    /** Hops the node along a parabola from `from` to `to` (local positions), `height` above the chord. */
    static arcTo(node: Node, from: Vec3, to: Vec3, height: number, duration = FX.arcDuration, onDone?: () => void): void {
        const state = { t: 0 };
        const pos = new Vec3();
        node.setPosition(from);
        tween(state)
            .to(duration, { t: 1 }, {
                onUpdate: () => {
                    const t = state.t;
                    Vec3.lerp(pos, from, to, t);
                    pos.y += height * 4 * t * (1 - t);
                    node.setPosition(pos);
                },
            })
            .call(() => {
                node.setPosition(to);
                if (onDone) onDone();
            })
            .start();
    }

    /** Moves from `from` to `to` (local), by default landing with a bounce. */
    static dropTo(node: Node, from: Vec3, to: Vec3, duration: number, easing: TweenEasing = 'bounceOut', onDone?: () => void): void {
        Tween.stopAllByTarget(node);
        node.setPosition(from);
        const t = tween(node).to(duration, { position: to.clone() }, { easing });
        if (onDone) t.call(onDone);
        t.start();
    }

    /** Rotates to local Euler angles. */
    static rotateTo(node: Node, euler: Vec3, duration: number, easing: TweenEasing): void {
        Tween.stopAllByTarget(node);
        tween(node).to(duration, { eulerAngles: euler.clone() }, { easing }).start();
    }

    // ------------------------------------------------------------------ UI

    /** Quick scale bump of a HUD widget (counter or pill changed). */
    static bump(node: Node): void {
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        tween(node)
            .to(ANIM.counterBumpIn, { scale: new Vec3(ANIM.counterBumpScale, ANIM.counterBumpScale, 1) })
            .to(ANIM.counterBumpOut, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    /** Pops a toast in, holds it for `hold` seconds, shrinks it away and deactivates it. */
    static toast(node: Node, hold: number): void {
        Tween.stopAllByTarget(node);
        node.active = true;
        node.setScale(ANIM.toastStartScale, ANIM.toastStartScale, 1);
        tween(node)
            .to(ANIM.toastIn, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .delay(hold)
            .to(ANIM.toastOut, { scale: new Vec3(ANIM.toastStartScale, ANIM.toastStartScale, 1) }, { easing: 'quadIn' })
            .call(() => { node.active = false; })
            .start();
    }

    /** Tap-hint loop: press down (scale around the node origin = the fingertip), release, rest. */
    static pressLoop(node: Node): void {
        Tween.stopAllByTarget(node);
        const press = ANIM.hintPressScale;
        node.setScale(1, 1, 1);
        tween(node)
            .to(ANIM.hintPressIn, { scale: new Vec3(press, press, 1) }, { easing: 'quadIn' })
            .to(ANIM.hintPressOut, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .delay(ANIM.hintPressRest)
            .union()
            .repeatForever()
            .start();
    }

    /** Slow endless scale pulse used to draw attention to a static widget (instruction bar). */
    static breathe(node: Node, scale = ANIM.hintBreathScale, half = ANIM.hintBreathHalf): void {
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        tween(node)
            .to(half, { scale: new Vec3(scale, scale, 1) }, { easing: 'sineInOut' })
            .to(half, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    /** End-card panel: grows in from `panelStartScale`. */
    static panelIn(node: Node): void {
        AnimService.popIn(node, 1, ANIM.panelIn, 0, ANIM.panelStartScale);
    }

    // ------------------------------------------------------------------ buttons

    /**
     * Idle pulse of a button: grows to `pulseMax`, shrinks to `pulseMin`, forever (uniform scale,
     * sine easing), starting after `delay`.
     */
    static buttonIdle(node: Node, delay: number = BUTTON.startDelay): void {
        Tween.stopAllByTarget(node);
        const big = new Vec3(BUTTON.pulseMax, BUTTON.pulseMax, 1);
        const small = new Vec3(BUTTON.pulseMin, BUTTON.pulseMin, 1);
        const loop = () => tween(node)
            .to(BUTTON.pulseHalf, { scale: big }, { easing: 'sineInOut' })
            .to(BUTTON.pulseHalf, { scale: small }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
        tween(node).delay(delay).call(loop).start();
    }

    /** Stops a button's animation and restores its rest scale (view hidden). */
    static buttonReset(node: Node): void {
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
    }
}
