/**
 * @module
 * Shared types for the init scaffolder: wizard answers, template manifest,
 * and per-question autodetect handler keys.
 */

/** Wizard answers keyed by placeholder name (without underscores). */
export interface Answers {
  /** Project identifier — used in log output and `name:` of generated config. */
  PROJECT_NAME: string;
  /** Workflow folder name; placed under `.flowai-workflow/<WORKFLOW_NAME>/`
   * (FR-S47). Defaults to `default` when wizard omitted. */
  WORKFLOW_NAME: string;
  /** Base branch for PRs (e.g., `main`, `master`). */
  DEFAULT_BRANCH: string;
  /** Command that runs the project build/lint gate (used as `custom_script`). */
  LINT_CMD: string;
  /** Command that runs the project test suite. */
  TEST_CMD: string;
}

/**
 * Known autodetect handler keys. The manifest's `detect:` field maps to one
 * of these; unknown keys are a validation error at load time.
 */
export type DetectKey =
  | "project_name"
  | "default_branch"
  | "test_cmd"
  | "lint_cmd";

/** Single wizard question as declared in `template.yaml`. */
export interface TemplateQuestion {
  /** Placeholder key (matches `__<KEY>__` tokens in template files). */
  key: keyof Answers;
  /** Human-readable prompt shown in the wizard. */
  label: string;
  /** Optional handler name used to pre-fill the default. */
  detect?: DetectKey;
  /** Fallback value when both autodetect and user input yield empty. */
  default?: string;
  /** When true, empty values are rejected by the wizard. */
  required?: boolean;
}

/** File copy rule: glob source → target directory. */
export interface CopyRule {
  /** Glob pattern relative to the template root. */
  from: string;
  /** Target path relative to the project root. */
  to: string;
}

/** Dependency precondition enforced by preflight. */
export interface TemplateRequirement {
  /** Check category. Currently only `git_remote` is supported. */
  kind: "git_remote";
  /** Expected host (when `kind: git_remote`, e.g., `github.com`). */
  host?: string;
}

/** Parsed shape of `template.yaml`. */
export interface TemplateManifest {
  /** Template identifier (e.g., `sdlc-claude`). */
  name: string;
  /** Template schema version. */
  version: string;
  /** Human-readable one-line description. */
  description?: string;
  /** Runtime requirements — preflight fails if any are missing. */
  requires: TemplateRequirement[];
  /** Ordered list of wizard questions. */
  questions: TemplateQuestion[];
  /** File copy rules. */
  files: {
    copy: CopyRule[];
  };
}
