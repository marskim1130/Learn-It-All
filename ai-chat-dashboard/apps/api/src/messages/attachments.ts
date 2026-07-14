export const MAX_ATTACHMENT_BYTES = 1 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);
const ALLOWED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/octet-stream",
]);

export interface AttachmentMeta {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ParsedAttachment extends AttachmentMeta {
  text: string;
}

export class AttachmentValidationError extends Error {
  readonly code = "VALIDATION_ERROR" as const;
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "AttachmentValidationError";
    this.field = field;
  }
}

/**
 * 校验文本/Markdown 附件，并返回 UTF-8 正文。
 *
 * @example
 * const attachment = parseTextAttachment({
 *   fileName: "notes.md",
 *   mimeType: "text/markdown",
 *   content: Buffer.from("# hi"),
 * });
 */
export function parseTextAttachment(input: {
  fileName: string;
  mimeType?: string;
  content: Buffer | string;
}): ParsedAttachment {
  const fileName = input.fileName.trim();
  if (!fileName) {
    throw new AttachmentValidationError("file", "附件文件名无效");
  }

  const lowerName = fileName.toLowerCase();
  const hasAllowedExtension = [...ALLOWED_EXTENSIONS].some((ext) =>
    lowerName.endsWith(ext),
  );
  const mimeType = (input.mimeType ?? "application/octet-stream").toLowerCase();
  const mimeAllowed =
    ALLOWED_MIME_TYPES.has(mimeType) || mimeType.startsWith("text/");

  if (!hasAllowedExtension && !mimeAllowed) {
    throw new AttachmentValidationError(
      "file",
      "仅支持 text/plain 或 text/markdown 附件",
    );
  }
  if (!hasAllowedExtension) {
    throw new AttachmentValidationError("file", "附件扩展名必须是 .txt 或 .md");
  }

  const buffer =
    typeof input.content === "string"
      ? Buffer.from(input.content, "utf8")
      : input.content;

  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentValidationError("file", "附件不能超过 1 MB");
  }

  return {
    fileName,
    mimeType: mimeType.startsWith("text/") ? mimeType : guessMimeType(fileName),
    sizeBytes: buffer.byteLength,
    text: buffer.toString("utf8"),
  };
}

/**
 * 把用户说明与附件正文合并为模型上下文文本。
 */
export function mergeMessageContentWithAttachment(
  content: string,
  attachment: ParsedAttachment | null,
): string {
  if (!attachment) {
    return content;
  }
  if (!content) {
    return `附件: ${attachment.fileName}\n${attachment.text}`;
  }
  return `${content}\n\n---\n附件: ${attachment.fileName}\n${attachment.text}`;
}

function guessMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "text/markdown";
  }
  return "text/plain";
}
