import type {
  ClaudeCliOutput,
  HitlConfig,
  RuntimeId,
  Verbosity,
} from "../types.ts";

/** Capability flags advertised by a runtime adapter. */
export interface RuntimeCapabilities {
  /** Whether the runtime supports a first-class permission mode flag. */
  permissionMode: boolean;
  /** Whether the runtime supports engine-managed HITL resume flow. */
  hitl: boolean;
  /** Whether the runtime provides an external transcript file the engine can copy. */
  transcript: boolean;
}

/** Low-level options for a single runtime invocation (initial or resume). */
export interface RuntimeInvokeOptions {
  /** Optional runtime-native agent selector. */
  agent?: string;
  /** Optional system prompt content for the invocation. */
  systemPrompt?: string;
  /** User task prompt passed to the runtime. */
  taskPrompt: string;
  /** Existing session ID for continuation/resume. */
  resumeSessionId?: string;
  /** Additional CLI flags forwarded to the runtime. */
  extraArgs?: string[];
  /** Runtime-specific permission mode. */
  permissionMode?: string;
  /** Model identifier understood by the selected runtime. */
  model?: string;
  /** Max seconds before the runtime process is terminated. */
  timeoutSeconds: number;
  /** Max retry attempts on runtime error or crash. */
  maxRetries: number;
  /** Base delay between retries in seconds. */
  retryDelaySeconds: number;
  /** Callback for streaming terminal output. */
  onOutput?: (line: string) => void;
  /** Optional path for the runtime stream log file. */
  streamLogPath?: string;
  /** Terminal verbosity level used by stream formatting. */
  verbosity?: Verbosity;
  /** Workflow HITL configuration used by runtimes that need extra tool wiring. */
  hitlConfig?: HitlConfig;
  /** Working directory for the runtime subprocess. */
  cwd?: string;
}

/** Result returned by a runtime adapter invocation. */
export interface RuntimeInvokeResult {
  /** Normalized runtime output when invocation produced structured output. */
  output?: ClaudeCliOutput;
  /** Human-readable error when the invocation failed. */
  error?: string;
}

/** Adapter interface implemented by each supported runtime. */
export interface RuntimeAdapter {
  /** Stable runtime identifier. */
  id: RuntimeId;
  /** Capability metadata used by config validation and HITL flow. */
  capabilities: RuntimeCapabilities;
  /** Invoke the runtime with normalized options. */
  invoke(opts: RuntimeInvokeOptions): Promise<RuntimeInvokeResult>;
}

/** Effective runtime configuration after defaults/parent/node resolution. */
export interface ResolvedRuntimeConfig {
  /** Selected runtime ID. */
  runtime: RuntimeId;
  /** Effective extra CLI args for the selected runtime. */
  args: string[];
  /** Effective model value after precedence resolution. */
  model?: string;
  /** Effective permission mode after precedence resolution. */
  permissionMode?: string;
}
