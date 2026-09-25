/** Types for browser.mjs - headless Chrome for the image scripts. */
import type { Browser } from 'playwright-core';

export declare function launch(): Promise<Browser>;
