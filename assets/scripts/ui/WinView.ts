import { _decorator } from 'cc';
import { ResultView } from './ResultView';

const { ccclass } = _decorator;

/** End card shown when every bus has left. */
@ccclass('WinView')
export class WinView extends ResultView {}
