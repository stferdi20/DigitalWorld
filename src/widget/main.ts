import Phaser from 'phaser';
import { audio } from '../world/audio';
import { FarmScene } from './FarmScene';
import { Farm } from './state';
import { mountUI } from './ui';

/**
 * DigiFarm corner widget: a small idle farm that sits beside the Dock. In a browser it is
 * pinned to the bottom-right of the page; inside the desktop shell the window *is* the frame.
 */
const farm = new Farm();
audio.init();
audio.settings.on = farm.state.settings.sound;

document.body.insertAdjacentHTML('afterbegin', '<div id="frame"><div id="farm"></div></div>');
const scene = new FarmScene(farm);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'farm',
  pixelArt: true,
  transparent: true,
  scale: { mode: Phaser.Scale.RESIZE, width: farm.state.settings.w, height: farm.state.settings.h },
  scene,
});

scene.onReady = () => {
  mountUI(farm, scene, () => game.scale.resize(farm.state.settings.w, farm.state.settings.h));
  // the idle loop runs on real time so it keeps going while the tab is in the background
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    farm.tick(((now - last) / 1000) * farm.state.settings.speed);
    last = now;
  }, 250);
  setInterval(() => farm.save(), 10000);
  window.addEventListener('beforeunload', () => farm.save());
  (window as unknown as { farm: Farm }).farm = farm;   // handy for debugging in devtools
};
