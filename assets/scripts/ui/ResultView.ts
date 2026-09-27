import { _decorator, Label, Node } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { AnimService } from '../services/AnimService';
import { BaseView } from './BaseView';

const { ccclass, property } = _decorator;

/**
 * Shared behaviour of the win and lose end cards: panel pop-in and icon pop. Each card has a single
 * button, bound by the subclass (CONTINUE on the win card, TRY AGAIN on the lose card).
 */
@ccclass('ResultView')
export class ResultView extends BaseView {
    @property(Node) panel: Node = null;
    /** Optional illustration (the tick on the win card) that pops in after the panel. */
    @property(Node) icon: Node = null;
    @property(Label) titleLabel: Label = null;
    @property(Label) subtitleLabel: Label = null;
    show(): void {
        const anim = GameConfig.ui.anim;
        this.node.active = true;
        if (this.panel) AnimService.panelIn(this.panel);
        if (this.icon) AnimService.popIn(this.icon, 1, anim.panelIn, anim.iconDelay, 0);
    }

    hide(): void {
        this.node.active = false;
    }
}
