import { _decorator, Button } from 'cc';
import { ResultView } from './ResultView';

const { ccclass, property } = _decorator;

/** End card shown when every bus has left: a single CONTINUE button. */
@ccclass('WinView')
export class WinView extends ResultView {
    @property(Button) continueButton: Button = null;

    onContinue: (() => void) | null = null;

    onLoad(): void {
        this.bindButton(this.continueButton, () => this.onContinue && this.onContinue());
    }
}
