import { resolveCatalogRoot } from "../catalog-root.js";
import { loadManifest } from "../manifest.js";
import { validateCatalog, type ValidationResult } from "../core/validate.js";

export interface ValidateOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
}

export async function runValidate(options: ValidateOptions = {}): Promise<ValidationResult> {
  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);
  return validateCatalog(catalogRoot, manifest);
}

export function formatValidationResult(result: ValidationResult): string {
  if (result.issues.length === 0) {
    return "valid\n";
  }

  return `${result.issues.map((issue) => `error: ${issue.message}`).join("\n")}\n`;
}
