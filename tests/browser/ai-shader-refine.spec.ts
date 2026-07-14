import { expect, test } from '@playwright/test';
import { expectNoBrowserIssues, gotoDocument, setupBrowserTestPage, supportsWebGl, switchToNodeView } from './helpers';

const acceptedShader = {
  version: 1,
  id: 'accepted-water-definition',
  label: 'Accepted Water',
  language: 'glsl-fragment',
  code: `vec4 mainImage(vec2 uv) {
    vec2 offset = vec2(sin(uv.y * 12.0), cos(uv.x * 10.0)) * u_prop_amount;
    vec4 source = texture2D(u_backdrop, clamp(uv + offset, 0.0, 1.0));
    return vec4(source.rgb * u_prop_tint, source.a);
  }`,
  properties: [
    { key: 'amount', label: 'Amount', type: 'number', default: 0.02, min: 0, max: 0.1, step: 0.001 },
    { key: 'tint', label: 'Tint', type: 'color', default: '#ffffff' },
  ],
  provenance: {
    source: 'openai',
    prompt: 'Water refraction',
    model: 'browser-fixture',
    requestId: 'accepted-request-1',
    attempt: 'initial',
  },
};

const refinedShader = {
  ...acceptedShader,
  id: 'refined-water-definition',
  label: 'Calm Water',
  code: `vec4 mainImage(vec2 uv) {
    vec4 source = texture2D(u_backdrop, uv);
    float bands = smoothstep(0.35, 0.65, fract((uv.x + uv.y) * 6.0 + u_prop_waveAmount * 20.0));
    vec3 highlighted = mix(source.rgb, u_prop_highlight, 0.45);
    return vec4(mix(source.rgb, highlighted, bands), source.a);
  }`,
  properties: [
    {
      key: 'waveAmount',
      label: 'Wave amount',
      type: 'number',
      default: 0.015,
      min: 0,
      max: 0.08,
      step: 0.001,
    },
    { key: 'highlight', label: 'Highlight', type: 'color', default: '#bfefff' },
  ],
  provenance: {
    source: 'openai',
    prompt: 'Use calmer waves and preserve facial detail.',
    model: 'browser-fixture',
    requestId: 'refined-request-1',
    parentRequestId: 'accepted-request-1',
    attempt: 'refine',
  },
};

const documentFixture = {
  schemaVersion: 3,
  global: { bg: 'transparent', seed: 1171, aspect: '1:1' },
  layers: [
    {
      id: 'refine-source',
      name: 'Source',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#516ea8',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  graph: {
    edges: [
      { id: 'source-shader', fromId: 'refine-source', fromPort: 'out', toId: 'refine-shader', toPort: 'bg' },
      { id: 'shader-output', fromId: 'refine-shader', fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    positions: {
      'refine-source': { x: 0, y: 100 },
      'refine-shader': { x: 430, y: 100 },
      __export__: { x: 900, y: 100 },
    },
    mergeNodes: [],
    colorNodes: [],
    shaderNodes: [
      {
        id: 'refine-shader',
        name: 'Accepted Water',
        shaderKind: 'aiShader',
        role: 'effect',
        palette: ['#ff705f', '#8d5cff'],
        distortion: 56,
        swirl: 28,
        grain: 12,
        scale: 100,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        seedOffset: 0,
        opacity: 100,
        blendMode: 'normal',
        aiPrompt: 'Water refraction',
        shaderInstance: {
          definition: acceptedShader,
          values: { amount: 0.02, tint: '#ffffff' },
        },
      },
    ],
  },
  export: { format: 'png', scale: 1, target: 'cover' },
};

test('shows an occupied AI slot as busy instead of a shader failure', async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.route('**/api/ai/shaders', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'operation_in_progress',
        message: 'Another AI creation is still running.',
      }),
    });
  });

  await gotoDocument(page, documentFixture);
  test.skip(!(await supportsWebGl(page)), 'AI shader creation requires WebGL.');
  await switchToNodeView(page);
  await page.locator('.react-flow__node-shaderNode').click();
  await page.getByRole('button', { name: 'Create New Version' }).click();

  await expect(page.getByText('Another creation is running').first()).toBeVisible();
  await expect(page.getByText('Could not create')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try Again' })).toBeEnabled();
});

test('refines an accepted AI shader only after browser validation', async ({ page }) => {
  await setupBrowserTestPage(page);
  let createBody: Record<string, unknown> | null = null;
  await page.route('**/api/ai/shaders', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    createBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'refined-request-1',
        candidateRevision: 0,
        status: 'generated',
        attempt: 'refine',
        prompt: 'Use calmer waves and preserve facial detail.',
        source: 'openai',
        model: 'browser-fixture',
        instance: {
          definition: refinedShader,
          values: { waveAmount: 0.015, highlight: '#bfefff' },
        },
      }),
    });
  });
  await page.route('**/api/ai/shaders/refined-request-1/validation', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'refined-request-1',
        candidateRevision: 0,
        status: 'accepted',
        repairAvailable: false,
      }),
    });
  });

  await gotoDocument(page, documentFixture);
  test.skip(!(await supportsWebGl(page)), 'AI shader browser acceptance requires WebGL.');
  await switchToNodeView(page);
  await page.locator('.react-flow__node-shaderNode').click();

  const refineInput = page.getByPlaceholder('Describe what to change while keeping the current effect');
  await expect(refineInput).toBeVisible();
  await refineInput.fill('Use calmer waves and preserve facial detail.');
  await page.getByRole('button', { name: 'Refine with AI' }).click();

  await expect(
    page.getByText('Refined the current shader. The previous version stayed active until this one passed.'),
  ).toBeVisible({ timeout: 15_000 });
  expect(createBody).toMatchObject({
    prompt: 'Use calmer waves and preserve facial detail.',
    mode: 'openai',
    refineFromRequestId: 'accepted-request-1',
  });
  await expect(page.getByText('Wave amount', { exact: true })).toBeVisible();
  await expect(page.getByText(/u_prop_waveAmount/)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const documentState = JSON.parse(localStorage.getItem('doc') ?? '{}');
        return documentState.graph?.shaderNodes?.find((node: { id: string }) => node.id === 'refine-shader')
          ?.shaderInstance?.definition?.provenance;
      }),
    )
    .toMatchObject({ attempt: 'refine', parentRequestId: 'accepted-request-1', requestId: 'refined-request-1' });
  expectNoBrowserIssues(page);
});
