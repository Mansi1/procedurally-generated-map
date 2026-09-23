// Headless Chrome für die Bild-Skripte. Pfad zu Chrome über die Umgebungs-
// variable CHROME, sonst der übliche Ort auf macOS.
import { chromium } from 'playwright-core';

export function launch() {
  const executablePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return chromium.launch({ executablePath });
}
