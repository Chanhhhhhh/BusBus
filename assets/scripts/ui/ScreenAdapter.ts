import { _decorator, Component, ResolutionPolicy, screen, view } from 'cc';
import { GameConfig } from '../core/GameConfig';

const { ccclass } = _decorator;

/**
 * Keeps the short screen edge at 1080 design units in both orientations so UI keeps the
 * same physical size whether the ad is shown portrait or landscape.
 */
@ccclass('ScreenAdapter')
export class ScreenAdapter extends Component {
    onLoad(): void {
        this.apply();
        screen.on('window-resize', this.apply, this);
        screen.on('orientation-change', this.apply, this);
    }

    onDestroy(): void {
        screen.off('window-resize', this.apply, this);
        screen.off('orientation-change', this.apply, this);
    }

    apply(): void {
        const size = screen.windowSize;
        const { width, height } = GameConfig.design;
        if (size.height >= size.width) {
            view.setDesignResolutionSize(width, height, ResolutionPolicy.FIXED_WIDTH);
        } else {
            view.setDesignResolutionSize(height, width, ResolutionPolicy.FIXED_HEIGHT);
        }
    }
}
