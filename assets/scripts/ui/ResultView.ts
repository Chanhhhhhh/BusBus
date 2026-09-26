import { _decorator, Button, Component, Label, Node, Tween, Vec3, tween } from 'cc';
import { GameConfig } from '../core/GameConfig';

const { ccclass, property } = _decorator;

/** Shared behaviour of the win and lose end cards: panel pop-in and a pulsing CTA button. */
@ccclass('ResultView')
export class ResultView extends Component {
    @property(Node) panel: Node = null;
    @property(Label) titleLabel: Label = null;
    @property(Label) subtitleLabel: Label = null;
    @property(Button) ctaButton: Button = null;

    onCta: (() => void) | null = null;

    onLoad(): void {
        if (this.ctaButton) this.ctaButton.node.on(Button.EventType.CLICK, () => this.onCta && this.onCta(), this);
    }

    show(): void {
        const anim = GameConfig.ui.anim;
        this.node.active = true;
        if (this.panel) {
            Tween.stopAllByTarget(this.panel);
            this.panel.setScale(anim.panelStartScale, anim.panelStartScale, 1);
            tween(this.panel).to(anim.panelIn, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        }
        if (this.ctaButton) {
            const btn = this.ctaButton.node;
            Tween.stopAllByTarget(btn);
            tween(btn)
                .delay(anim.ctaPulseDelay)
                .to(anim.ctaPulseDuration, { scale: new Vec3(anim.ctaPulseScale, anim.ctaPulseScale, 1) }, { easing: 'sineInOut' })
                .to(anim.ctaPulseDuration, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
                .union()
                .repeatForever()
                .start();
        }
    }

    hide(): void {
        this.node.active = false;
    }
}
