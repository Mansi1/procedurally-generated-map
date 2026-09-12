export type RGB = [number, number, number]
export type HexColor = `#${string}`;
export type RGBColor = `rgb(${number},${number},${number})`;

export class Color {
    private hex: HexColor | undefined
    private rgbColor: RGBColor | undefined
    private constructor(private rgb: RGB){}

    static rgb(red: number, green: number, blue: number) {
        return new Color([red, green, blue])
    }

    static hex(hex: HexColor): Color | null{
        // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        const fullHex = hex.replace(shorthandRegex, (_m, r, g, b) => r + r + g + g + b + b);

        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
        return result ? new Color([
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ]) : null;
    }

    toHex(): HexColor {
        if(this.hex){
            return this.hex
        }
        const toHex = (c: number) => c.toString(16).padStart(2, '0');
        return this.hex  = `#${toHex(this.rgb[0])}${toHex(this.rgb[1])}${toHex(this.rgb[2])}`;
    }

    toRGB(): RGB {
        return this.rgb
    }

    toRgbString(): RGBColor {
        if(this.rgbColor){
            return this.rgbColor;
        }
        return this.rgbColor = `rgb(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]})`
    }
    
}