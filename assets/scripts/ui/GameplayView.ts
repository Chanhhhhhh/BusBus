import { _decorator, Button, Component, Label, Node, Tween, Vec3, tween } from 'cc';
import { GameConfig } from '../core/GameConfig';

const { ccclass, property } = _decorator;

const ANIM = GameConfig.ui.anim;
const TEXT = GameConfig.ui.text;

/**
 * HUD shown while playing. The counters and the tap hint are positioned by GameManager
 * from world positions; everything else is static UI that can be re-skinned in the prefab.
 */
@ccclass('GameplayView')
export class GameplayView extends Component {
    @property(Label) levelLabel: Label = null;
    @property(Label) capacityLabel: Label = null;
    @property(Label) hintLabel: Label = null;
    @property(Node) passengerCounter: Node = null;
    @property(Label) passengerLabel: Label = null;
    @property(Node) busCounter: Node = null;
    @property(Label) busLabel: Label = null;
    @property(Node) tapHint: Node = null;
    @property(Label) toastLabel: Label = null;
    @property(Button) ctaButton: Button = null;

    onCta: (() => void) | null = null;

    private hintVisible = false;
    private lastPassengers = -1;
    private lastBuses = -1;

    onLoad(): void {
        if (this.ctaButton) this.ctaButton.node.on(Button.EventType.CLICK, () => this.onCta && this.onCta(), this);
        if (this.toastLabel) this.toastLabel.node.active = false;
        this.showTapHint(false);
    }

    setLevel(id: number): void {
        if (this.levelLabel) this.levelLabel.string = TEXT.level.replace('{n}', `${id}`);
    }

    setCapacity(onRoad: number, max: number): void {
        if (this.capacityLabel) this.capacityLabel.string = TEXT.capacity.replace('{n}', `${onRoad}`).replace('{max}', `${max}`);
    }

    setCounters(passengers: number, buses: number): void {
        if (this.passengerLabel && passengers !== this.lastPassengers) {
            this.passengerLabel.string = `${passengers}`;
            if (this.lastPassengers >= 0) this.bump(this.passengerCounter);
            this.lastPassengers = passengers;
        }
        if (this.busLabel && buses !== this.lastBuses) {
            this.busLabel.string = `${buses}`;
            if (this.lastBuses >= 0) this.bump(this.busCounter);
            this.lastBuses = buses;
        }
    }

    /** Moves the world-anchored widgets. Positions are in the local space of this node. */
    setAnchors(passengerPos: Vec3, busPos: Vec3): void {
        if (this.passengerCounter) this.passengerCounter.setPosition(passengerPos);
        if (this.busCounter) this.busCounter.setPosition(busPos);
    }

    showTapHint(visible: boolean, pos?: Vec3): void {
        if (!this.tapHint) return;
        if (visible && pos) this.tapHint.setPosition(pos);
        if (visible === this.hintVisible) return;
        this.hintVisible = visible;
        this.tapHint.active = visible;
        Tween.stopAllByTarget(this.tapHint);
        if (visible) {
            this.tapHint.setScale(1, 1, 1);
            tween(this.tapHint)
                .to(ANIM.hintPulseDuration, { scale: new Vec3(ANIM.hintPulseScale, ANIM.hintPulseScale, 1) }, { easing: 'sineInOut' })
                .to(ANIM.hintPulseDuration, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
                .union()
                .repeatForever()
                .start();
        }
    }

    toast(message: string, duration = GameConfig.ui.toastDuration): void {
        if (!this.toastLabel) return;
        const node = this.toastLabel.node;
        this.toastLabel.string = message;
        node.active = true;
        Tween.stopAllByTarget(node);
        node.setScale(ANIM.toastStartScale, ANIM.toastStartScale, 1);
        tween(node)
            .to(ANIM.toastIn, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .delay(duration)
            .to(ANIM.toastOut, { scale: new Vec3(ANIM.toastStartScale, ANIM.toastStartScale, 1) }, { easing: 'quadIn' })
            .call(() => { node.active = false; })
            .start();
    }

    private bump(node: Node | null): void {
        if (!node) return;
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        tween(node)
            .to(ANIM.counterBumpIn, { scale: new Vec3(ANIM.counterBumpScale, ANIM.counterBumpScale, 1) })
            .to(ANIM.counterBumpOut, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }
}
