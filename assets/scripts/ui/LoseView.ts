import { _decorator, Button } from 'cc';
import { ResultView } from './ResultView';

const { ccclass, property } = _decorator;

/**
 * End card shown when a returning bus finds every parking slot taken: a single TRY AGAIN button.
 * The ad does not replay the level; TRY AGAIN is a call to action like CONTINUE and PLAY NOW
 * (`onTryAgain`, to be wired to the store together with them).
 */
@ccclass('LoseView')
export class LoseView extends ResultView {
    @property(Button) retryButton: Button = null;

    onTryAgain: (() => void) | null = null;

    onLoad(): void {
        this.bindButton(this.retryButton, () => this.onTryAgain && this.onTryAgain());
    }
}
