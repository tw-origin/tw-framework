/**
 * Command Injection Detector -- detects and prevents OS command
 * injection attacks through shell metacharacters, command chaining,
 * and dangerous commands.
 *
 * @module security/injection/command-detector
 */

/** Command injection detection result. */
export interface CommandDetectionResult {
  detected: boolean;
  confidence: number;
  patterns: string[];
  risk: "none" | "low" | "medium" | "high" | "critical";
  sanitized: string;
}

/** Dangerous shell metacharacters and their meanings. */
const SHELL_METACHARACTERS: Array<{ char: string; name: string; severity: number }> = [
  { char: ";", name: "Command separator", severity: 9 },
  { char: "|", name: "Pipe", severity: 8 },
  { char: "&&", name: "AND operator", severity: 9 },
  { char: "||", name: "OR operator", severity: 9 },
  { char: "&", name: "Background execution", severity: 7 },
  { char: "$(", name: "Command substitution", severity: 10 },
  { char: "`", name: "Backtick substitution", severity: 10 },
  { char: ">", name: "Output redirect", severity: 6 },
  { char: ">>", name: "Append redirect", severity: 6 },
  { char: "<", name: "Input redirect", severity: 6 },
  { char: "<<", name: "Heredoc", severity: 7 },
  { char: "<<<", name: "Here string", severity: 7 },
  { char: "*", name: "Glob wildcard", severity: 4 },
  { char: "?", name: "Single char wildcard", severity: 3 },
  { char: "[", name: "Character class", severity: 4 },
  { char: "]", name: "Character class close", severity: 3 },
  { char: "~", name: "Home directory", severity: 3 },
  { char: "#", name: "Comment", severity: 5 },
  { char: "\\", name: "Escape character", severity: 5 },
  { char: "\n", name: "Newline", severity: 8 },
  { char: "\r", name: "Carriage return", severity: 8 },
];

/** Dangerous commands by OS. */
const DANGEROUS_COMMANDS: Array<{ pattern: RegExp; name: string; severity: number }> = [
  // System control
  { pattern: /\b(shutdown|reboot|halt|poweroff)\b/i, name: "System shutdown", severity: 10 },
  { pattern: /\b(init\s+\d)\b/i, name: "Init level change", severity: 10 },

  // File system damage
  { pattern: /\brm\s+-rf?\s*\//i, name: "rm -rf /", severity: 10 },
  { pattern: /\brm\s+-rf?\s+\*/i, name: "rm -rf *", severity: 10 },
  { pattern: /\bmkfs\b/i, name: "mkfs (format)", severity: 10 },
  { pattern: /\bdd\s+.*of=\/dev\//i, name: "dd to device", severity: 10 },
  { pattern: /\bformat\b/i, name: "format command", severity: 10 },
  { pattern: /\b(fdisk|parted)\b/i, name: "Partition tool", severity: 9 },

  // Privilege escalation
  { pattern: /\bsudo\b/i, name: "sudo", severity: 8 },
  { pattern: /\bsu\s+/i, name: "su command", severity: 8 },
  { pattern: /\bchmod\s+[0-7]{3,4}/i, name: "chmod", severity: 6 },
  { pattern: /\bchown\b/i, name: "chown", severity: 7 },

  // Network operations
  { pattern: /\b(curl|wget)\s+/i, name: "Download (curl/wget)", severity: 6 },
  { pattern: /\bnc\s+/i, name: "Netcat", severity: 8 },
  { pattern: /\b(netcat|ncat)\b/i, name: "Netcat variant", severity: 8 },
  { pattern: /\b(telnet|ssh)\s+/i, name: "Remote shell", severity: 7 },

  // Reverse shells
  { pattern: /\bbash\s+-i/i, name: "Interactive bash", severity: 9 },
  { pattern: /\/dev\/tcp\//i, name: "/dev/tcp", severity: 10 },
  { pattern: /\bpython\s+-c/i, name: "Python -c", severity: 8 },
  { pattern: /\bperl\s+-e/i, name: "Perl -e", severity: 8 },
  { pattern: /\bruby\s+-e/i, name: "Ruby -e", severity: 8 },
  { pattern: /\bphp\s+-r/i, name: "PHP -r", severity: 8 },

  // Information gathering
  { pattern: /\b(id|whoami|uname|hostname)\b/i, name: "System info", severity: 5 },
  { pattern: /\bps\s+/i, name: "Process list", severity: 4 },
  { pattern: /\b(ifconfig|ip\s+addr)\b/i, name: "Network info", severity: 4 },
  { pattern: /\b(netstat|ss)\b/i, name: "Network connections", severity: 4 },
  { pattern: /\b(env|printenv)\b/i, name: "Environment dump", severity: 6 },

  // Data exfiltration
  { pattern: /\bcat\s+\/etc\//i, name: "Read /etc/", severity: 7 },
  { pattern: /\bcat\s+\/proc\//i, name: "Read /proc/", severity: 6 },
  { pattern: /\bbase64\s+/i, name: "Base64 encode", severity: 5 },
  { pattern: /\b(tar|zip|gzip)\s+/i, name: "Archive command", severity: 4 },

  // Process control
  { pattern: /\b(kill|killall|pkill)\b/i, name: "Kill process", severity: 7 },
  { pattern: /\b(nohup|disown)\b/i, name: "Background process", severity: 5 },

  // Cron manipulation
  { pattern: /\bcrontab\b/i, name: "Crontab manipulation", severity: 8 },
  { pattern: /\/etc\/cron/i, name: "Cron file access", severity: 9 },

  // Package manager abuse
  { pattern: /\b(apt|apt-get|yum|dnf|pacman|brew)\s+install/i, name: "Package install", severity: 7 },
  { pattern: /\bpip\s+install/i, name: "Pip install", severity: 5 },
  { pattern: /\bnpm\s+install/i, name: "NPM install", severity: 5 },
];

/** Environment variable access patterns. */
const ENV_PATTERNS: Array<{ pattern: RegExp; name: string; severity: number }> = [
  { pattern: /\$\{[A-Z_]+\}/g, name: "Variable expansion ${VAR}", severity: 6 },
  { pattern: /\$[A-Z_]+/g, name: "Variable $VAR", severity: 5 },
  { pattern: /\$\(/, name: "Command substitution $()", severity: 10 },
  { pattern: /`[^`]+`/, name: "Backtick substitution", severity: 10 },
];

/** Escapes shell metacharacters for safe command execution. */
function escapeShellArg(input: string): string {
  // Single-quote the entire string and escape any existing single quotes
  return "'" + input.replace(/'/g, "'\\''") + "'";
}

/** Calculates risk level. */
function riskFromConfidence(confidence: number): CommandDetectionResult["risk"] {
  if (confidence >= 0.9) return "critical";
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  if (confidence >= 0.2) return "low";
  return "none";
}

/**
 * Command Injection Detector -- analyzes input strings for
 * OS command injection patterns.
 */
export class CommandInjectionDetector {
  private metacharacters: typeof SHELL_METACHARACTERS;
  private dangerousCommands: typeof DANGEROUS_COMMANDS;
  private envPatterns: typeof ENV_PATTERNS;
  private sanitizeMode: "escape" | "reject";

  constructor(options?: {
    sanitizeMode?: "escape" | "reject";
    allowedCommands?: string[];
  }) {
    this.metacharacters = [...SHELL_METACHARACTERS];
    this.dangerousCommands = [...DANGEROUS_COMMANDS];
    this.envPatterns = [...ENV_PATTERNS];
    this.sanitizeMode = options?.sanitizeMode ?? "reject";
  }

  /** Detects command injection in input. */
  detect(input: string): CommandDetectionResult {
    const detectedPatterns: string[] = [];
    let maxSeverity = 0;
    let patternCount = 0;

    // Check shell metacharacters
    for (const { char, name, severity } of this.metacharacters) {
      if (input.includes(char)) {
        detectedPatterns.push(`${name} ("${char}")`);
        maxSeverity = Math.max(maxSeverity, severity);
        patternCount++;
      }
    }

    // Check dangerous commands
    for (const { pattern, name, severity } of this.dangerousCommands) {
      if (pattern.test(input)) {
        detectedPatterns.push(name);
        maxSeverity = Math.max(maxSeverity, severity);
        patternCount++;
      }
    }

    // Check environment variable patterns
    for (const { pattern, name, severity } of this.envPatterns) {
      if (pattern.test(input)) {
        if (!detectedPatterns.includes(name)) {
          detectedPatterns.push(name);
        }
        maxSeverity = Math.max(maxSeverity, severity);
        patternCount++;
      }
    }

    // Calculate confidence
    let confidence = 0;
    if (maxSeverity >= 10) confidence = 0.95;
    else if (maxSeverity >= 8) confidence = 0.75;
    else if (maxSeverity >= 6) confidence = 0.5;
    else if (maxSeverity >= 4) confidence = 0.3;
    else if (maxSeverity > 0) confidence = 0.2;

    if (patternCount >= 2) confidence = Math.min(1, confidence + 0.1);
    if (patternCount >= 3) confidence = Math.min(1, confidence + 0.1);
    if (patternCount >= 5) confidence = Math.min(1, confidence + 0.1);

    const detected = confidence >= 0.2;
    const sanitized = detected
      ? (this.sanitizeMode === "escape" ? escapeShellArg(input) : "")
      : input;

    return {
      detected,
      confidence,
      patterns: detectedPatterns,
      risk: riskFromConfidence(confidence),
      sanitized,
    };
  }

  /** Checks if input is safe. */
  isSafe(input: string): boolean {
    return !this.detect(input).detected;
  }

  /** Sanitizes input for safe command execution. */
  sanitize(input: string): string {
    const result = this.detect(input);
    if (result.detected && this.sanitizeMode === "reject") {
      return "";
    }
    return result.sanitized;
  }

  /** Validates a command before execution. */
  validateCommand(command: string): { allowed: boolean; reason: string } {
    const result = this.detect(command);
    if (!result.detected) {
      return { allowed: true, reason: "No injection detected" };
    }
    return {
      allowed: false,
      reason: `Command injection detected: ${result.patterns.join(", ")}`,
    };
  }
}

/** Creates a new command injection detector. */
export function createCommandDetector(options?: {
  sanitizeMode?: "escape" | "reject";
}): CommandInjectionDetector {
  return new CommandInjectionDetector(options);
}
