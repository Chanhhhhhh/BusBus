import {
    _decorator, Button, Color, Label, Layers, MeshRenderer, Node, RenderRoot2D, Sprite, SpriteFrame, TTFFont, Vec3,
    instantiate,
} from 'cc';
import { GameConfig } from '../core/GameConfig';
import { AnimService } from '../services/AnimService';
import { BaseView } from './BaseView';

const { ccclass, property } = _decorator;

const TEXT = GameConfig.ui.text;
const SIGN_COUNTER = GameConfig.hud.signCounter;

/**
 * HUD shown while playing. The counters are world-space widgets: at runtime they are moved off
 * the canvas onto RenderRoot2D nodes parented to the sign meshes (one passenger counter per bus
 * stop, cloned from `passengerCounter`, plus the bus counter on the gate sign), so the numbers are printed
 * on the sign boards and drawn by the main camera. The tap hint is still a canvas widget
 * positioned by GameManager from world positions; everything else is static UI that can be
 * re-skinned in the prefab.
 */
@ccclass('GameplayView')
export class GameplayView extends BaseView {
    @property(Label) levelLabel: Label = null;
    @property(Label) capacityLabel: Label = null;
    /** Pill behind the capacity label: green while there is room on the road, red when full. */
    @property(Sprite) capacityBg: Sprite = null;
    @property(SpriteFrame) capacityFreeFrame: SpriteFrame = null;
    @property(SpriteFrame) capacityFullFrame: SpriteFrame = null;
    @property(Label) hintLabel: Label = null;
    /** Background strip of the instruction line; it breathes slowly to draw the eye. */
    @property(Node) hintBar: Node = null;
    @property(Node) passengerCounter: Node = null;
    @property(Label) passengerLabel: Label = null;
    @property(Node) busCounter: Node = null;
    @property(Label) busLabel: Label = null;
    @property(Node) tapHint: Node = null;
    /** Toast root (text only) and its label. */
    @property(Node) toastNode: Node = null;
    @property(Label) toastLabel: Label = null;
    @property(Button) ctaButton: Button = null;
    /** Soft round sprite the runtime particle bursts are made of (fx/FxLayer.ts). */
    @property(SpriteFrame) fxSprite: SpriteFrame = null;
    /** White star the tap / bus-full bursts are made of (tinted per particle). */
    @property(SpriteFrame) starSprite: SpriteFrame = null;
    /** Font of the runtime labels (floating texts). */
    @property(TTFFont) font: TTFFont = null;

    onCta: (() => void) | null = null;

    private hintVisible = false;
    private lastOnRoad = -1;
    private lastBuses = -1;

    /** One passenger counter per bus stop: widget, its label and the last value shown (-1 = none). */
    private stopCounters: { widget: Node; label: Label; last: number }[] = [];
    /** RenderRoot2D roots parented to the sign meshes (empty / null until attached). */
    private signRoots: Node[] = [];
    private busRoot: Node | null = null;

    onLoad(): void {
        this.bindButton(this.ctaButton, () => this.onCta && this.onCta());
        if (this.hintBar) AnimService.breathe(this.hintBar);
        if (this.toastRoot) this.toastRoot.active = false;
        this.showTapHint(false);
    }

    protected onDestroy(): void {
        super.onDestroy();
        for (const root of this.signRoots) if (root.isValid) root.destroy();
        if (this.busRoot?.isValid) this.busRoot.destroy();
        this.signRoots = [];
        this.busRoot = null;
    }

    /**
     * Moves the counters out of the canvas onto the sign boards: each one is reparented under a
     * RenderRoot2D node that is a child of the sign's mesh, placed on the board face
     * (`GameConfig.hud.signCounter`, in mesh-local units). The counters then follow the sign's
     * transform, so nothing has to be repositioned per frame. Layer DEFAULT so the main camera
     * draws them.
     */
    attachSignCounters(stopSigns: readonly Node[], gateSign: Node): void {
        if (this.signRoots.length === 0 && this.passengerCounter && this.passengerLabel) {
            stopSigns.forEach((sign, i) => {
                const widget = i === 0 ? this.passengerCounter : instantiate(this.passengerCounter);
                const label = i === 0 ? this.passengerLabel : widget.getComponentInChildren(Label);
                this.signRoots.push(GameplayView.mountOnSign(`PassengerCounterRoot${i}`, sign, widget));
                this.stopCounters.push({ widget, label, last: -1 });
            });
        }
        if (!this.busRoot) this.busRoot = GameplayView.mountOnSign('BusCounterRoot', gateSign, this.busCounter);
    }

    private static mountOnSign(name: string, sign: Node, widget: Node | null): Node {
        const board = sign.getComponentInChildren(MeshRenderer)?.node ?? sign;
        const root = new Node(name);
        root.layer = Layers.Enum.DEFAULT;
        root.addComponent(RenderRoot2D);
        const o = SIGN_COUNTER.offset;
        root.setPosition(o.x, o.y, o.z);
        root.setScale(SIGN_COUNTER.scale, SIGN_COUNTER.scale, SIGN_COUNTER.scale);
        root.setParent(board, false);
        if (widget) {
            widget.setParent(root, false);
            widget.setPosition(0, 0, 0);
            GameplayView.setLayerRecursive(widget, Layers.Enum.DEFAULT);
        }
        return root;
    }

    private static setLayerRecursive(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) GameplayView.setLayerRecursive(child, layer);
    }

    setLevel(id: number): void {
        if (this.levelLabel) this.levelLabel.string = TEXT.level.replace('{n}', `${id}`);
    }

    setCapacity(onRoad: number, max: number): void {
        if (onRoad === this.lastOnRoad) return;
        const first = this.lastOnRoad < 0;
        this.lastOnRoad = onRoad;
        if (this.capacityLabel) this.capacityLabel.string = TEXT.capacity.replace('{n}', `${onRoad}`).replace('{max}', `${max}`);
        const full = onRoad >= max;
        const frame = full ? this.capacityFullFrame : this.capacityFreeFrame;
        if (this.capacityBg && frame) this.capacityBg.spriteFrame = frame;
        if (this.capacityLabel) {
            const o = full ? GameConfig.hud.capacityOutline.full : GameConfig.hud.capacityOutline.free;
            this.capacityLabel.outlineColor = new Color(o.r, o.g, o.b, o.a);
        }
        if (!first && this.capacityBg) AnimService.bump(this.capacityBg.node);
    }

    private get toastRoot(): Node | null {
        return this.toastNode ?? this.toastLabel?.node ?? null;
    }

    /** `passengers[i]` = passengers waiting at stop i (same order as the signs given to attachSignCounters). */
    setCounters(passengers: readonly number[], buses: number): void {
        // Not attached to any sign: the canvas counter shows the total.
        const values = this.signRoots.length > 0 ? passengers : [passengers.reduce((a, b) => a + b, 0)];
        if (this.stopCounters.length === 0 && this.passengerCounter && this.passengerLabel) {
            this.stopCounters.push({ widget: this.passengerCounter, label: this.passengerLabel, last: -1 });
        }
        this.stopCounters.forEach((counter, i) => {
            const value = values[i] ?? 0;
            if (value === counter.last) return;
            counter.label.string = `${value}`;
            if (counter.last >= 0) AnimService.bump(counter.widget);
            counter.last = value;
        });
        if (this.busLabel && buses !== this.lastBuses) {
            this.busLabel.string = `${buses}`;
            if (this.lastBuses >= 0 && this.busCounter) AnimService.bump(this.busCounter);
            this.lastBuses = buses;
        }
    }

    showTapHint(visible: boolean, pos?: Vec3): void {
        if (!this.tapHint) return;
        if (visible && pos) this.tapHint.setPosition(pos);
        if (visible === this.hintVisible) return;
        this.hintVisible = visible;
        this.tapHint.active = visible;
        // The TapHint origin is the fingertip, so the press loop pushes the finger onto the bus.
        if (visible) AnimService.pressLoop(this.tapHint);
        else AnimService.stop(this.tapHint);
    }

    toast(message: string, duration = GameConfig.ui.toastDuration): void {
        const node = this.toastRoot;
        if (!node || !this.toastLabel) return;
        this.toastLabel.string = message;
        AnimService.toast(node, duration);
    }
}
