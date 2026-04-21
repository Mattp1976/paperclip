import PDFDocument from "pdfkit";
import type { Writable } from "node:stream";
import { normalizeIssueSlug } from "@mattparrytfc/shared";

// Issue-like shape — we only read the fields we need, so we keep the input loose
// to avoid a hard coupling to the enriched Drizzle row type.
export interface IssueForExport {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  identifier?: string | null;
  issueNumber?: number | null;
  companyId: string;
  projectId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  completedAt?: Date | string | null;
  startedAt?: Date | string | null;
}

export interface WorkProductForExport {
  id: string;
  type: string;
  provider: string;
  title: string;
  url?: string | null;
  status: string;
  summary?: string | null;
  reviewState?: string | null;
  isPrimary?: boolean | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface DocumentForExport {
  id: string;
  key: string;
  title: string | null;
  format: string;
  latestBody: string | null;
  latestRevisionNumber?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface IssueExportContext {
  issue: IssueForExport;
  workProducts: WorkProductForExport[];
  documents: DocumentForExport[];
  companyName?: string | null;
  projectName?: string | null;
}

/**
 * Palette — kept in lockstep with the UI `sage`/`rose` tokens.
 * These are hex equivalents of the OKLCH tokens defined in ui/src/index.css.
 * pdfkit does not support OKLCH or CSS variables, so we render hex directly.
 */
const COLORS = {
  ink: "#1F2A24", // near-black sage
  body: "#3D4A37", // sage-body
  dim: "#6B7A69", // muted sage
  hairline: "#D7E4CB", // sage-ink-dim
  surface: "#F7F2E9", // taupe-adjacent page background
  accent: "#A4BD95", // sage-soft (brand accent)
  rose: "#C47878", // rose-deep
  linkUnderline: "#3D4A37",
} as const;

function safeDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: Date | string | null | undefined): string {
  const date = safeDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return status
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function buildExportFilename(issue: IssueForExport): string {
  // Share the same slug logic as UI URL keys so downloads match in-app names.
  const slug = normalizeIssueSlug(issue.title ?? "") || "task";
  const id = issue.identifier ?? (issue.issueNumber ? `task-${issue.issueNumber}` : issue.id.slice(0, 8));
  return `${id}-${slug}.pdf`;
}

interface RenderHelpers {
  doc: PDFKit.PDFDocument;
  addSectionHeading: (text: string) => void;
  addSubHeading: (text: string) => void;
  addBodyParagraph: (text: string) => void;
  addMutedLabel: (text: string) => void;
  addHairline: () => void;
  ensureSpace: (height: number) => void;
  addLink: (label: string, href: string) => void;
  addMetaRow: (label: string, value: string) => void;
}

function makeHelpers(doc: PDFKit.PDFDocument): RenderHelpers {
  const PAGE_BOTTOM = () => doc.page.height - doc.page.margins.bottom;

  return {
    doc,
    addSectionHeading(text: string) {
      doc.moveDown(0.6);
      doc.fillColor(COLORS.ink)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text(text);
      doc.moveDown(0.25);
    },
    addSubHeading(text: string) {
      doc.moveDown(0.3);
      doc.fillColor(COLORS.body)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(text);
      doc.moveDown(0.15);
    },
    addBodyParagraph(text: string) {
      doc.fillColor(COLORS.body)
        .font("Helvetica")
        .fontSize(10.5)
        .text(text, { align: "left", lineGap: 2 });
      doc.moveDown(0.4);
    },
    addMutedLabel(text: string) {
      doc.fillColor(COLORS.dim)
        .font("Helvetica")
        .fontSize(9)
        .text(text);
    },
    addHairline() {
      const y = doc.y + 4;
      doc.save();
      doc.lineWidth(0.5).strokeColor(COLORS.hairline)
        .moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.width - doc.page.margins.right, y)
        .stroke();
      doc.restore();
      doc.moveDown(0.6);
    },
    ensureSpace(height: number) {
      if (doc.y + height > PAGE_BOTTOM()) {
        doc.addPage();
      }
    },
    addLink(label: string, href: string) {
      doc.fillColor(COLORS.linkUnderline)
        .font("Helvetica")
        .fontSize(10)
        .text(label, { link: href, underline: true });
    },
    addMetaRow(label: string, value: string) {
      const startY = doc.y;
      doc.fillColor(COLORS.dim)
        .font("Helvetica")
        .fontSize(9)
        .text(label, doc.page.margins.left, startY, { continued: false, width: 100 });
      doc.fillColor(COLORS.body)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(value, doc.page.margins.left + 110, startY);
      doc.moveDown(0.35);
    },
  };
}

function renderCoverPage(h: RenderHelpers, ctx: IssueExportContext) {
  const { doc } = h;
  const { issue } = ctx;

  // Brand band at the top.
  const bandHeight = 6;
  doc.save();
  doc.rect(0, 0, doc.page.width, bandHeight).fill(COLORS.accent);
  doc.restore();

  // Wordmark.
  doc.fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Paperclip", doc.page.margins.left, bandHeight + 18);
  doc.fillColor(COLORS.dim)
    .font("Helvetica")
    .fontSize(9)
    .text("Task report", doc.page.margins.left, doc.y, { lineBreak: false });

  // Spacer
  doc.y = Math.max(doc.y + 60, 180);

  // Identifier + status row.
  const idLabel = issue.identifier ?? (issue.issueNumber ? `#${issue.issueNumber}` : issue.id.slice(0, 8));
  doc.fillColor(COLORS.dim)
    .font("Helvetica")
    .fontSize(10)
    .text(`${idLabel} · ${formatStatus(issue.status)}`, { lineBreak: true });
  doc.moveDown(0.4);

  // Big title.
  doc.fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(26)
    .text(issue.title ?? "Untitled task", { lineGap: 2 });
  doc.moveDown(0.8);

  h.addHairline();

  // Meta rows.
  if (ctx.companyName) h.addMetaRow("Company", ctx.companyName);
  if (ctx.projectName) h.addMetaRow("Project", ctx.projectName);
  if (issue.priority) h.addMetaRow("Priority", formatStatus(issue.priority));
  h.addMetaRow("Created", formatDate(issue.createdAt));
  h.addMetaRow("Updated", formatDate(issue.updatedAt));
  if (issue.startedAt) h.addMetaRow("Started", formatDate(issue.startedAt));
  if (issue.completedAt) h.addMetaRow("Completed", formatDate(issue.completedAt));
  h.addMetaRow("Outputs", String(ctx.workProducts.length));
  h.addMetaRow("Documents", String(ctx.documents.length));

  // Footer on cover page.
  doc.fillColor(COLORS.dim)
    .font("Helvetica")
    .fontSize(8)
    .text(
      `Generated ${formatDate(new Date())} · Paperclip`,
      doc.page.margins.left,
      doc.page.height - doc.page.margins.bottom - 20,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right },
    );
}

function renderSummarySection(h: RenderHelpers, ctx: IssueExportContext) {
  const { doc } = h;
  doc.addPage();
  h.addSectionHeading("Summary");

  const description = ctx.issue.description?.trim();
  if (description) {
    h.addBodyParagraph(description);
  } else {
    doc.fillColor(COLORS.dim).font("Helvetica-Oblique").fontSize(10)
      .text("No description was provided for this task.");
    doc.moveDown(0.6);
  }

  h.addHairline();

  // Top-line counts.
  const primary = ctx.workProducts.find((wp) => wp.isPrimary);
  h.addSubHeading("At a glance");
  h.addBodyParagraph(
    [
      `${ctx.workProducts.length} output${ctx.workProducts.length === 1 ? "" : "s"}`,
      `${ctx.documents.length} document${ctx.documents.length === 1 ? "" : "s"}`,
      primary ? `Primary output: ${primary.title}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

function renderWorkProducts(h: RenderHelpers, ctx: IssueExportContext) {
  if (ctx.workProducts.length === 0) return;
  const { doc } = h;
  doc.addPage();
  h.addSectionHeading("Outputs");

  for (const wp of ctx.workProducts) {
    h.ensureSpace(120);
    h.addSubHeading(wp.title);
    h.addMutedLabel(
      [formatStatus(wp.type), wp.provider, formatStatus(wp.status), wp.isPrimary ? "Primary" : null]
        .filter(Boolean)
        .join(" · "),
    );
    doc.moveDown(0.25);

    if (wp.summary && wp.summary.trim()) {
      h.addBodyParagraph(wp.summary.trim());
    }
    if (wp.url) {
      h.addLink(wp.url, wp.url);
      doc.moveDown(0.25);
    }
    h.addHairline();
  }
}

function renderDocuments(h: RenderHelpers, ctx: IssueExportContext) {
  if (ctx.documents.length === 0) return;
  const { doc } = h;
  doc.addPage();
  h.addSectionHeading("Documents");

  for (const docEntry of ctx.documents) {
    h.ensureSpace(140);
    const heading = docEntry.title ?? docEntry.key;
    h.addSubHeading(heading);
    h.addMutedLabel(
      [
        `Key: ${docEntry.key}`,
        `Format: ${docEntry.format}`,
        docEntry.latestRevisionNumber ? `Revision ${docEntry.latestRevisionNumber}` : null,
        `Updated ${formatDate(docEntry.updatedAt)}`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    doc.moveDown(0.3);

    const body = (docEntry.latestBody ?? "").trim();
    if (body) {
      // Cap enormous docs so the PDF stays a reasonable size. Everything past
      // the cap is still available via the raw document endpoint.
      const MAX_CHARS = 20000;
      const rendered = body.length > MAX_CHARS
        ? `${body.slice(0, MAX_CHARS)}\n\n[…truncated — ${body.length - MAX_CHARS} more characters available in the raw document]`
        : body;
      h.addBodyParagraph(rendered);
    } else {
      doc.fillColor(COLORS.dim).font("Helvetica-Oblique").fontSize(10)
        .text("Document body is empty.");
      doc.moveDown(0.4);
    }

    h.addHairline();
  }
}

function addPageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const pageNum = i - range.start + 1;
    const total = range.count;
    doc.fillColor(COLORS.dim)
      .font("Helvetica")
      .fontSize(8)
      .text(
        `${pageNum} / ${total}`,
        doc.page.margins.left,
        doc.page.height - doc.page.margins.bottom + 8,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "right", lineBreak: false },
      );
  }
}

/**
 * Render an issue + its outputs/documents to a branded PDF. Streams directly
 * to the given writable (typically an Express `res`). Resolves when the PDF
 * has finished writing.
 */
export async function renderIssuePdf(stream: Writable, ctx: IssueExportContext): Promise<void> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 54, bottom: 54, left: 54, right: 54 },
    bufferPages: true,
    info: {
      Title: ctx.issue.title ?? "Task report",
      Author: "Paperclip",
      Subject: "Task report",
      Creator: "Paperclip",
    },
  });

  // Register error/finish listeners before we start writing so we never miss
  // a stream error fired synchronously during pipe setup.
  const done = new Promise<void>((resolve, reject) => {
    stream.once("finish", resolve);
    stream.once("error", reject);
    doc.once("error", reject);
  });

  doc.pipe(stream);

  const helpers = makeHelpers(doc);
  renderCoverPage(helpers, ctx);
  renderSummarySection(helpers, ctx);
  renderWorkProducts(helpers, ctx);
  renderDocuments(helpers, ctx);

  addPageNumbers(doc);
  doc.end();

  await done;
}
