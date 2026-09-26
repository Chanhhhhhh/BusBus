import { _decorator, Button, Component, Label, Layers, MeshRenderer, Node, RenderRoot2D, Tween, Vec3, tween } from 'cc';
import { GameConfig } from '../core/GameConfig';

const { ccclass, property } = _decorator;

const ANIM = GameConfig.ui.anim;
const TEXT = GameConfig.ui.text;
const SIGN_COUNTER = GameConfig.hud.signCounter;

/**
 * HUD shown while playing. The two counters are world-space widgets: at runtime they are moved
 * off the canvas onto RenderRoot2D nodes parented to the sign meshes, so the numbers are printed
 * on the sign boards and drawn by the main camera. The tap hint is still a canvas widget
 * positioned by GameManager from world positions; everything else is static UI that can be
 * re-skinned in the prefab.
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

    /** RenderRoot2D roots parented to the sign meshes (null until attached). */
    private passengerRoot: Node | null = null;
    private busRoot: Node | null = null;

    onLoad(): void {
        if (this.ctaButton) this.ctaButton.node.on(Button.EventType.CLICK, () => this.onCta && this.onCta(), this);
        if (this.toastLabel) this.toastLabel.node.active = false;
        this.showTapHint(false);
    }

    onDestroy(): void {
        if (this.passengerRoot?.isValid) this.passengerRoot.destroy();
        if (this.busRoot?.isValid) this.busRoot.destroy();
        this.passengerRoot = this.busRoot = null;
    }

    /**
     * Moves the counters out of the canvas onto the sign boards: each one is reparented under a
     * RenderRoot2D node that is a child of the sign's mesh, placed on the board face
     * (`GameConfig.hud.signCounter`, in mesh-local units). The counters then follow the sign's
     * transform, so nothing has to be repositioned per frame. Layer DEFAULT so the main camera
     * draws them.
     */
    attachSignCounters(stopSign: Node, gateSign: Node): void {
        if (!this.passengerRoot) this.passengerRoot = GameplayView.mountOnSign('PassengerCounterRoot', stopSign, this.passengerCounter);
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
