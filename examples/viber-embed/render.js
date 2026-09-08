import { renderArtifactRuntimeProject } from '@shchilkin/artifact-runtime';

try {
  const response = await fetch('/viber.artifact');
  if (!response.ok) throw new Error(`Composition: ${response.status}`);
  await renderArtifactRuntimeProject({
    canvas: document.querySelector('canvas'),
    project: await response.json(),
    width: 512,
    height: 512,
  });
  document.body.dataset.state = 'ready';
} catch (error) {
  document.body.dataset.state = 'error';
  document.body.textContent = String(error);
}
