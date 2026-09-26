import { Color, Material } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { BusColor } from '../core/Types';

/** Body colours; both the vehicle and the stickman shaders take them as `mainColor`. */
export const PALETTE: Record<BusColor, Color> = {
    [BusColor.Red]: new Color(228, 48, 58),
    [BusColor.Blue]: new Color(48, 128, 255),
    [BusColor.Green]: new Color(72, 196, 92),
    [BusColor.Yellow]: new Color(250, 196, 32),
    [BusColor.Purple]: new Color(156, 72, 236),
};

/** UI colour for the same palette (slightly brighter for labels). */
export function uiColor(color: BusColor): Color {
    return PALETTE[color].clone();
}

function darken(c: Color, factor: number): Color {
    return new Color(c.r * factor, c.g * factor, c.b * factor, 255);
}

/**
 * Creates one material per colour from a base material so every bus / passenger of a colour
 * shares the same GPU state. The outline pass (index 3) gets a darker tint of the body colour.
 */
export class ColorMaterials {
    private readonly cache = new Map<string, Material>();

    constructor(private readonly vehicleBase: Material, private readonly stickmanBase: Material) {}

    vehicle(color: BusColor): Material {
        return this.get('v', this.vehicleBase, color);
    }

    stickman(color: BusColor): Material {
        return this.get('s', this.stickmanBase, color);
    }

    private get(kind: string, base: Material, color: BusColor): Material {
        const key = kind + color;
        let mat = this.cache.get(key);
        if (!mat) {
            mat = new Material();
            mat.copy(base);
            const c = PALETTE[color];
            mat.setProperty('mainColor', c, 0);
            if (mat.passes.length > 3) {
                mat.setProperty('baseColor', darken(c, GameConfig.palette.outlineDarken), 3);
            }
            this.cache.set(key, mat);
        }
        return mat;
    }
}
