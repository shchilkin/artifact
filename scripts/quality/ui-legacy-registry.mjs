import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REGISTRY_PATH = 'docs/ui-legacy-registry.json';

export async function loadLegacyRegistry(repoRoot, registryPath = DEFAULT_REGISTRY_PATH) {
  const source = await readFile(path.join(repoRoot, registryPath), 'utf8');
  return JSON.parse(source);
}

async function collectFiles(repoRoot, relativeRoot, extensions) {
  const files = [];
  const absoluteRoot = path.join(repoRoot, relativeRoot);

  async function visit(absoluteDirectory) {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (extensions.includes(path.extname(entry.name).slice(1))) {
        files.push(path.relative(repoRoot, absolutePath).split(path.sep).join('/'));
      }
    }
  }

  await visit(absoluteRoot);
  return files.sort();
}

function countMatches(source, pattern) {
  const expression = new RegExp(pattern, 'g');
  let count = 0;
  while (expression.exec(source)) {
    count += 1;
    if (expression.lastIndex === 0) expression.lastIndex += 1;
  }
  return count;
}

export async function scanContractReferences(repoRoot, contract) {
  const counts = {};
  for (const relativeRoot of contract.scan.roots) {
    const files = await collectFiles(repoRoot, relativeRoot, contract.scan.extensions);
    for (const file of files) {
      const source = await readFile(path.join(repoRoot, file), 'utf8');
      const count = countMatches(source, contract.scan.pattern);
      if (count > 0) counts[file] = count;
    }
  }
  return counts;
}

export async function auditLegacyContract(repoRoot, contract) {
  const actual = await scanContractReferences(repoRoot, contract);
  const errors = [];
  const allowed = contract.allowedReferences ?? {};
  for (const [file, count] of Object.entries(actual)) {
    if (!(file in allowed)) {
      errors.push(`${contract.id}: new legacy reference in ${file} (${count})`);
    } else if (count > allowed[file]) {
      errors.push(`${contract.id}: ${file} grew from ${allowed[file]} to ${count} references`);
    }
  }
  return { actual, errors };
}

function validateRegistryShape(registry) {
  const errors = [];
  if (registry.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (registry.mode !== 'expand') errors.push('mode must remain "expand" for issue #179');

  const batchIds = new Set();
  for (const batch of registry.migrationBatches ?? []) {
    if (batchIds.has(batch.id)) errors.push(`duplicate migration batch: ${batch.id}`);
    batchIds.add(batch.id);
    if (!batch.replacementBoundary) errors.push(`migration batch ${batch.id} has no replacementBoundary`);
  }

  const contractIds = new Set();
  for (const contract of registry.legacyContracts ?? []) {
    if (contractIds.has(contract.id)) errors.push(`duplicate legacy contract: ${contract.id}`);
    contractIds.add(contract.id);
    if (!batchIds.has(contract.batch))
      errors.push(`legacy contract ${contract.id} references unknown batch ${contract.batch}`);
    if (!contract.replacement) errors.push(`legacy contract ${contract.id} has no named replacement`);
    try {
      new RegExp(contract.scan.pattern, 'g');
    } catch (error) {
      errors.push(`legacy contract ${contract.id} has an invalid pattern: ${error.message}`);
    }
  }

  const surfaceIds = new Set();
  for (const product of Object.values(registry.products ?? {})) {
    for (const surface of product.routes ?? []) {
      if (surfaceIds.has(surface.id)) errors.push(`duplicate surface id: ${surface.id}`);
      surfaceIds.add(surface.id);
      if (!surface.systems?.length) errors.push(`surface ${surface.id} has no system owner`);
    }
  }

  const legacyFilePaths = new Set();
  for (const legacyFile of registry.legacyFiles ?? []) {
    if (legacyFilePaths.has(legacyFile.path)) errors.push(`duplicate legacy file: ${legacyFile.path}`);
    legacyFilePaths.add(legacyFile.path);
    if (!batchIds.has(legacyFile.batch))
      errors.push(`legacy file ${legacyFile.path} references unknown batch ${legacyFile.batch}`);
    if (!legacyFile.replacement) errors.push(`legacy file ${legacyFile.path} has no named replacement`);
  }

  const stylesheetPaths = new Set();
  for (const stylesheet of registry.legacyStylesheetSections ?? []) {
    const stylesheetKey = `${stylesheet.path}:${stylesheet.batch}`;
    if (stylesheetPaths.has(stylesheetKey)) errors.push(`duplicate legacy stylesheet section: ${stylesheetKey}`);
    stylesheetPaths.add(stylesheetKey);
    if (!batchIds.has(stylesheet.batch))
      errors.push(`legacy stylesheet ${stylesheet.path} references unknown batch ${stylesheet.batch}`);
    if (!stylesheet.selectors?.length) errors.push(`legacy stylesheet ${stylesheet.path} has no bounded selectors`);
    if (!stylesheet.replacement) errors.push(`legacy stylesheet ${stylesheet.path} has no named replacement`);
  }

  return errors;
}

function extractRouteModules(source) {
  return [...source.matchAll(/['"](routes\/[^'"]+\.tsx)['"]/g)].map((match) => match[1]);
}

async function auditRouteCoverage(repoRoot, registry) {
  const errors = [];
  let routeCount = 0;
  for (const [productId, product] of Object.entries(registry.products)) {
    const source = await readFile(path.join(repoRoot, product.routeConfig), 'utf8');
    const configured = [...new Set(extractRouteModules(source))].sort();
    const registered = [...new Set(product.routes.map((surface) => surface.module))].sort();
    routeCount += configured.length;

    for (const module of configured.filter((item) => !registered.includes(item))) {
      errors.push(`${productId} route ${module} has no UI-system assignment`);
    }
    for (const module of registered.filter((item) => !configured.includes(item))) {
      errors.push(`${productId} registry route ${module} is not present in ${product.routeConfig}`);
    }
    for (const inventoryDocument of product.inventoryDocuments ?? []) {
      try {
        await readFile(path.join(repoRoot, inventoryDocument), 'utf8');
      } catch {
        errors.push(`${productId} inventory document does not exist: ${inventoryDocument}`);
      }
    }
  }
  return { errors, routeCount };
}

function extractStringArray(source) {
  const body = source.match(/=\s*\[([\s\S]*?)\]\s+as const/)?.[1] ?? '';
  return [...body.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

async function auditFoundationMatrix(repoRoot, registry) {
  const errors = [];
  for (const section of registry.foundationMatrix.sections) {
    const source = await readFile(path.join(repoRoot, section.source), 'utf8');
    const sourceIdentifiers = extractStringArray(source);
    if (JSON.stringify(sourceIdentifiers) !== JSON.stringify(section.identifiers)) {
      errors.push(`Foundation Matrix section ${section.id} identifiers drifted from ${section.source}`);
    }

    for (const route of registry.foundationMatrix.routes) {
      const routeSource = await readFile(path.join(repoRoot, route), 'utf8');
      if (!routeSource.includes(`<${section.component} `) && !routeSource.includes(`<${section.component}/>`)) {
        errors.push(`${route} does not mount ${section.component}`);
      }
    }
  }
  return errors;
}

async function auditDeclaredLegacyFiles(repoRoot, registry) {
  const errors = [];
  for (const entry of [...(registry.legacyFiles ?? []), ...(registry.legacyStylesheetSections ?? [])]) {
    try {
      await readFile(path.join(repoRoot, entry.path), 'utf8');
    } catch {
      errors.push(`declared legacy file does not exist: ${entry.path}`);
    }
  }
  return errors;
}

export async function auditLegacyRegistry(repoRoot, registry) {
  const errors = validateRegistryShape(registry);
  const routeAudit = await auditRouteCoverage(repoRoot, registry);
  errors.push(...routeAudit.errors);
  errors.push(...(await auditFoundationMatrix(repoRoot, registry)));
  errors.push(...(await auditDeclaredLegacyFiles(repoRoot, registry)));

  const baselines = {};
  for (const contract of registry.legacyContracts) {
    const contractAudit = await auditLegacyContract(repoRoot, contract);
    baselines[contract.id] = contractAudit.actual;
    errors.push(...contractAudit.errors);
  }

  return {
    baselines,
    errors,
    matrixSectionCount: registry.foundationMatrix.sections.length,
    routeCount: routeAudit.routeCount,
  };
}

async function main() {
  const repoRoot = process.cwd();
  const registry = await loadLegacyRegistry(repoRoot);
  const result = await auditLegacyRegistry(repoRoot, registry);

  if (process.argv.includes('--print-baseline')) {
    process.stdout.write(`${JSON.stringify(result.baselines, null, 2)}\n`);
    return;
  }

  if (result.errors.length > 0) {
    process.stderr.write(`UI legacy registry failed with ${result.errors.length} finding(s):\n`);
    for (const error of result.errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `UI legacy registry passed: ${result.routeCount} routes, ${result.matrixSectionCount} Foundation Matrix sections, ${registry.legacyContracts.length} bounded legacy contracts.\n`,
  );
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) await main();
