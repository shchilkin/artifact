import { mountArtwork } from './embed.js';

const dialog = document.querySelector('dialog');
const trigger = document.querySelector('#open');
let mounted;
trigger.addEventListener('click', () => {
  dialog.showModal();
  mounted = mountArtwork({
    container: document.querySelector('#artwork'),
    playButton: document.querySelector('#play'),
    neutralButton: document.querySelector('#neutral'),
    status: document.querySelector('#status'),
    compositionUrl: '/viber.artifact',
    recipeUrl: '/viber.motion.json',
  });
});
document.querySelector('#close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  mounted?.destroy();
  mounted = undefined;
  trigger.focus();
});
window.addEventListener('pagehide', () => mounted?.destroy());
