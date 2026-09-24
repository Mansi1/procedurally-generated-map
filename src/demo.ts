const DEMO_SEED = 'Demo'

const loadDemo = async () => {
    const SEED_KEY = `pgm.world.${DEMO_SEED}`
    if(!localStorage.getItem(SEED_KEY)){
        const demoState = JSON.stringify(await (await fetch('/savegame/demo.json')).json());
        localStorage.setItem(SEED_KEY, demoState);
        localStorage.setItem('pgm.seed', DEMO_SEED);
    }
}

loadDemo()