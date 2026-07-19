import { createHash, randomBytes } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { runCli } from './cli.mjs';

function required(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing required environment variable: ${name}`);
  return normalized;
}

function normalizeApiBaseUrl(baseUrl) {
  const url = new URL(required(baseUrl, 'COOLIFY_BASE_URL'));
  url.pathname = `${url.pathname.replace(/\/$/, '')}${url.pathname.endsWith('/api/v1') ? '' : '/api/v1'}/`;
  url.search = '';
  url.hash = '';
  return url;
}

function parseJsonResponse(text, pathname) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Coolify returned non-JSON from ${pathname}: ${text.slice(0, 200)}`);
  }
}

async function requestJson(fetchImpl, url, token, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Coolify ${init.method ?? 'GET'} ${url.pathname} failed with ${response.status}: ${text.slice(0, 300)}`,
    );
  }
  return parseJsonResponse(text, url.pathname);
}

async function findTemplateLocation({ apiBaseUrl, fetchImpl, templateApplication, token }) {
  const projects = await requestJson(fetchImpl, new URL('projects', apiBaseUrl), token);
  if (!Array.isArray(projects)) throw new Error('Coolify projects response must be an array');

  let project;
  let projectEnvironments;
  for (const candidate of projects) {
    const environments = await requestJson(
      fetchImpl,
      new URL(`projects/${encodeURIComponent(candidate.uuid)}/environments`, apiBaseUrl),
      token,
    );
    if (!Array.isArray(environments)) continue;
    if (environments.some((environment) => environment?.id === templateApplication.environment_id)) {
      project = candidate;
      projectEnvironments = environments;
      break;
    }
  }
  if (!project) throw new Error('Could not resolve the Coolify project containing the template application');

  const servers = await requestJson(fetchImpl, new URL('servers', apiBaseUrl), token);
  if (!Array.isArray(servers)) throw new Error('Coolify servers response must be an array');

  let server;
  for (const candidate of servers) {
    const resources = await requestJson(
      fetchImpl,
      new URL(`servers/${encodeURIComponent(candidate.uuid)}/resources`, apiBaseUrl),
      token,
    );
    if (Array.isArray(resources) && resources.some((resource) => resource?.uuid === templateApplication.uuid)) {
      server = candidate;
      break;
    }
  }
  if (!server) throw new Error('Could not resolve the Coolify server containing the template application');

  return { project, projectEnvironments, server };
}

async function ensureEnvironment({ apiBaseUrl, environmentName, fetchImpl, project, projectEnvironments, token }) {
  const existing = projectEnvironments.find((environment) => environment?.name === environmentName);
  if (existing) return existing;

  return requestJson(
    fetchImpl,
    new URL(`projects/${encodeURIComponent(project.uuid)}/environments`, apiBaseUrl),
    token,
    { method: 'POST', body: JSON.stringify({ name: environmentName }) },
  );
}

async function createApplication({
  apiBaseUrl,
  apiUrl,
  appName,
  environment,
  environmentName,
  fetchImpl,
  project,
  queueUrl,
  repository,
  server,
  templateApplication,
  token,
}) {
  const payload = {
    project_uuid: project.uuid,
    server_uuid: server.uuid,
    environment_name: environmentName,
    ...(environment.uuid ? { environment_uuid: environment.uuid } : {}),
    git_repository: repository,
    git_branch: 'development',
    build_pack: 'dockercompose',
    name: appName,
    description: 'Artifact staging API, worker, queue UI, Postgres, and Redis',
    docker_compose_location: templateApplication.docker_compose_location || '/docker-compose.coolify.yml',
    docker_compose_domains: [
      { name: 'api', domain: apiUrl },
      { name: 'bull-board', domain: queueUrl },
    ],
    is_auto_deploy_enabled: false,
    is_force_https_enabled: true,
    instant_deploy: false,
    autogenerate_domain: false,
    connect_to_docker_network: true,
    force_domain_override: false,
    is_container_label_escape_enabled: false,
  };

  return requestJson(fetchImpl, new URL('applications/public', apiBaseUrl), token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function generatedVariables(randomValue) {
  const bullBoardPassword = randomValue();
  const bullBoardDigest = createHash('sha1').update(bullBoardPassword).digest('base64');
  return [
    { key: 'POSTGRES_PASSWORD', value: randomValue(), sensitive: true },
    { key: 'AUTH_JWT_SECRET', value: randomValue(), sensitive: true },
    { key: 'BETTER_AUTH_SECRET', value: randomValue(), sensitive: true },
    { key: 'BULL_BOARD_BASIC_AUTH_USERS', value: `artifact-staging:{SHA}${bullBoardDigest}`, sensitive: true },
  ];
}

async function upsertVariables({ apiBaseUrl, applicationUuid, fetchImpl, variables, token }) {
  const url = new URL(`applications/${encodeURIComponent(applicationUuid)}/envs`, apiBaseUrl);
  const existing = await requestJson(fetchImpl, url, token);
  if (!Array.isArray(existing)) throw new Error('Coolify environment list response must be an array');

  for (const variable of variables) {
    const current = existing.find((candidate) => candidate?.key === variable.key && candidate?.is_preview !== true);
    if (current?.is_shown_once === true && variable.sensitive === true) continue;
    if (current?.is_shown_once === true) {
      const variableUuid = required(current.uuid, `${variable.key} environment variable UUID`);
      await requestJson(
        fetchImpl,
        new URL(
          `applications/${encodeURIComponent(applicationUuid)}/envs/${encodeURIComponent(variableUuid)}`,
          apiBaseUrl,
        ),
        token,
        { method: 'DELETE' },
      );
    }
    const method = current && current.is_shown_once !== true ? 'PATCH' : 'POST';
    await requestJson(fetchImpl, url, token, {
      method,
      body: JSON.stringify({
        key: variable.key,
        value: variable.value,
        is_preview: false,
        is_literal: true,
        is_shown_once: variable.sensitive === true,
      }),
    });
  }
}

export async function provisionStaging({
  apiUrl,
  appName = 'artifact-staging',
  baseUrl,
  environmentName = 'staging',
  fetchImpl = fetch,
  openAiApiKey,
  queueUrl,
  randomValue = () => randomBytes(32).toString('hex'),
  repository = 'https://github.com/shchilkin/artifact.git',
  templateApplicationUuid,
  token,
  webUrl,
}) {
  const apiBaseUrl = normalizeApiBaseUrl(baseUrl);
  const normalizedToken = required(token, 'COOLIFY_TOKEN');
  const normalizedTemplateUuid = required(templateApplicationUuid, 'COOLIFY_TEMPLATE_APPLICATION_UUID');
  const normalizedApiUrl = required(apiUrl, 'STAGING_API_URL');
  const normalizedWebUrl = required(webUrl, 'STAGING_WEB_URL');
  const normalizedQueueUrl = required(queueUrl, 'STAGING_QUEUE_URL');
  const normalizedOpenAiApiKey = required(openAiApiKey, 'OPENAI_API_KEY');

  const applications = await requestJson(fetchImpl, new URL('applications', apiBaseUrl), normalizedToken);
  if (!Array.isArray(applications)) throw new Error('Coolify applications response must be an array');

  let application = applications.find((candidate) => candidate?.name === appName);
  const created = !application;
  let location;

  if (!application) {
    const templateApplication = await requestJson(
      fetchImpl,
      new URL(`applications/${encodeURIComponent(normalizedTemplateUuid)}`, apiBaseUrl),
      normalizedToken,
    );
    location = await findTemplateLocation({
      apiBaseUrl,
      fetchImpl,
      templateApplication,
      token: normalizedToken,
    });
    const environment = await ensureEnvironment({
      apiBaseUrl,
      environmentName,
      fetchImpl,
      project: location.project,
      projectEnvironments: location.projectEnvironments,
      token: normalizedToken,
    });
    application = await createApplication({
      apiBaseUrl,
      apiUrl: normalizedApiUrl,
      appName,
      environment,
      environmentName,
      fetchImpl,
      project: location.project,
      queueUrl: normalizedQueueUrl,
      repository,
      server: location.server,
      templateApplication,
      token: normalizedToken,
    });
  }

  const baseVariables = [
    { key: 'ARTIFACT_BUILD_SHA', value: 'development' },
    { key: 'WEB_ORIGIN', value: normalizedWebUrl },
    { key: 'WEB_ORIGINS', value: '' },
    { key: 'POSTGRES_DB', value: 'artifact_staging' },
    { key: 'POSTGRES_USER', value: 'artifact_staging' },
    { key: 'BETTER_AUTH_URL', value: normalizedApiUrl },
    { key: 'OPENAI_API_KEY', value: normalizedOpenAiApiKey, sensitive: true },
  ];
  await upsertVariables({
    apiBaseUrl,
    applicationUuid: required(application.uuid, 'Coolify application UUID'),
    fetchImpl,
    variables: created ? [...baseVariables, ...generatedVariables(randomValue)] : baseVariables,
    token: normalizedToken,
  });

  return {
    applicationUuid: application.uuid,
    created,
    environmentName,
    projectUuid: location?.project.uuid,
    serverUuid: location?.server.uuid,
  };
}

async function writeGitHubOutputs(result) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  await appendFile(outputPath, `application-uuid=${result.applicationUuid}\ncreated=${result.created}\n`);
}

async function main() {
  const result = await provisionStaging({
    apiUrl: process.env.STAGING_API_URL,
    baseUrl: process.env.COOLIFY_BASE_URL,
    openAiApiKey: process.env.OPENAI_API_KEY,
    queueUrl: process.env.STAGING_QUEUE_URL,
    templateApplicationUuid: process.env.COOLIFY_TEMPLATE_APPLICATION_UUID,
    token: process.env.COOLIFY_TOKEN,
    webUrl: process.env.STAGING_WEB_URL,
  });
  await writeGitHubOutputs(result);
  console.log(
    JSON.stringify({
      event: 'coolify.staging_provisioned',
      applicationUuid: result.applicationUuid,
      created: result.created,
      environmentName: result.environmentName,
    }),
  );
}

runCli(import.meta.url, main);
