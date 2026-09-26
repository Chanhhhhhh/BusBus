import { Node, Tween, Vec3, tween } from 'cc';
import { GameConfig } from '../core/GameConfig';

/** Small reusable tween helpers that give taps and events some physicality. */

const FX = GameConfig.fx;

export function punchScale(node: Node, base = 1, amount = FX.punch.amount, duration = FX.punch.duration): void {
    Tween.stopAllByTarget(node);
    node.setScale(base, base, base);
    const attack = duration * FX.punch.attackRatio;
    tween(node)
        .to(attack, { scale: new Vec3(base * (1 + amount), base * (1 - amount * FX.punch.squashFactor), base * (1 + amount)) }, { easing: 'quadOut' })
        .to(duration - attack, { scale: new Vec3(base, base, base) }, { easing: 'backOut' })
        .start();
}

export function popIn(node: Node, target = 1, duration = FX.popDuration): void {
    Tween.stopAllByTarget(node);
    node.setScale(0.01, 0.01, 0.01);
    tween(node)
        .to(duration, { scale: new Vec3(target, target, target) }, { easing: 'backOut' })
        .start();
}

/** Short yaw wobble used as "you cannot do that" feedback. */
export function wobble(node: Node, degrees = FX.wobble.degrees, duration = FX.wobble.duration): void {
    const yaw = node.eulerAngles.y;
    const step = duration / 4;
    tween(node)
        .to(step, { eulerAngles: new Vec3(0, yaw + degrees, 0) })
        .to(step, { eulerAngles: new Vec3(0, yaw - degrees, 0) })
        .to(step, { eulerAngles: new Vec3(0, yaw + degrees * FX.wobble.secondSwing, 0) })
        .to(step, { eulerAngles: new Vec3(0, yaw, 0) })
        .start();
}

export function dropIn(node: Node, from: Vec3, to: Vec3, duration = FX.dropDuration, onDone?: () => void): void {
    node.setPosition(from);
    const t = tween(node).to(duration, { position: to.clone() }, { easing: 'bounceOut' });
    if (onDone) t.call(onDone);
    t.start();
}
