import { _decorator, Button, Component, Node } from 'cc';
import { AnimService } from '../services/AnimService';

const { ccclass } = _decorator;

/**
 * Base of every UI view. A view owns the events of its buttons: `bindButton()` wires the click
 * callback, and the view starts / stops the idle pulse of its buttons when it is shown / hidden.
 * Tapping a button never interrupts the pulse: press feedback is the cc.Button COLOR transition
 * (a tint), and the scale belongs to AnimService alone.
 */
@ccclass('BaseView')
export class BaseView extends Component {
    private readonly buttonNodes: Node[] = [];

    /** Registers a button of this view: `onClick` runs on a completed tap. */
    protected bindButton(button: Button | null, onClick: () => void): void {
        if (!button) return;
        this.buttonNodes.push(button.node);
        button.node.on(Button.EventType.CLICK, onClick, this);
        if (this.enabledInHierarchy) AnimService.buttonIdle(button.node);
    }

    protected onEnable(): void {
        for (const node of this.buttonNodes) AnimService.buttonIdle(node);
    }

    protected onDisable(): void {
        for (const node of this.buttonNodes) AnimService.buttonReset(node);
    }

    protected onDestroy(): void {
        for (const node of this.buttonNodes) {
            if (node.isValid) node.targetOff(this);
        }
        this.buttonNodes.length = 0;
    }
}
