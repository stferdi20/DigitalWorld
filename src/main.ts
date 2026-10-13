import Phaser from 'phaser';
import { OfficeScene } from './scenes/OfficeScene';
import { mountUI } from './ui';

const scene = new OfficeScene();
scene.onReady = () => mountUI(scene);
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  backgroundColor: '#050a14',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene,
});
