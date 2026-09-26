import { _decorator, Button } from 'cc';
import { ResultView } from './ResultView';

const { ccclass, property } = _decorator;

/** End card shown when a returning bus finds every parking slot taken. */
@ccclass('LoseView')
export class LoseView extends ResultView {
    @property(Button) retryButton: Button = null;

    onRetry: (() => void) | null = null;

    onLoad(): void {
        super.onLoad();
        if (this.retryButton) this.retryButton.node.on(Button.EventType.CLICK, () => this.onRetry && this.onRetry(), this);
    }
}
