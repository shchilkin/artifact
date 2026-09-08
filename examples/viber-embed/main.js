import { mountArtwork } from './embed.js';

const dialog = document.querySelector('dialog');
const trigger = document.querySelector('#open');
let mounted;
const motion = document.querySelector('#motion');
const recipes = {
  combined: '/viber.motion.json',
  flow: '/viber-flow.motion.json',
  grain: '/viber-grain.motion.json',
  glitch: '/viber-glitch.motion.json',
  classic: '/viber-classic.motion.json',
};
function mountSelected() {
  mounted?.destroy();
  mounted = mountArtwork({
    container: document.querySelector('#artwork'),
    playButton: document.querySelector('#play'),
    neutralButton: document.querySelector('#neutral'),
    status: document.querySelector('#status'),
    compositionUrl: '/viber.artifact',
    recipeUrl: recipes[motion.value],
  });
}
trigger.addEventListener('click', () => {
  dialog.showModal();
  mountSelected();
});
motion.addEventListener('change', () => {
  if (dialog.open) mountSelected();
});
document.querySelector('#close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  mounted?.destroy();
  mounted = undefined;
  trigger.focus();
});
window.addEventListener('pagehide', () => mounted?.destroy());
