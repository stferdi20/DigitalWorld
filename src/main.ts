import Phaser from 'phaser';
import { OfficeScene } from './scenes/OfficeScene';
import { mountUI } from './ui';
import { audio } from './world/audio';

audio.init();

const scene = new OfficeScene();
scene.onReady = () => mountUI(scene);
(window as unknown as { office: OfficeScene }).office = scene; // handy for debugging in devtools
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  backgroundColor: '#050a14',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene,
});
