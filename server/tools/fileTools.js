import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import yauzl from "yauzl";
import { AppError } from "../services/errors.js";

export async function extractPdfText(buffer) {
  if (buffer.subarray(0, 5).toString() !== "%PDF-")
    throw new AppError(400, "This file is not a valid PDF.");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const info = await parser.getInfo();
    if (info.total > 100)
      throw new AppError(
        400,
        "Use a PDF with 100 pages or fewer. Split this lecture into smaller files.",
      );
    const result = await parser.getText();
    // Page separators are not lecture content, particularly in scanned PDFs.
    return result.pages.map((page) => page.text).join("\n\n");
  } finally {
    await parser.destroy();
  }
}
function checkDocxArchive(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error)
        return reject(
          new AppError(400, "This file is not a valid DOCX document."),
        );
      let total = 0,
        count = 0,
        hasDocument = false;
      zip.on("error", reject);
      zip.on("entry", (entry) => {
        total += entry.uncompressedSize;
        count++;
        if (total > 20 * 1024 * 1024 || count > 2000) {
          zip.close();
          return reject(
            new AppError(
              400,
              "This DOCX expands to too much data. Upload a smaller document.",
            ),
          );
        }
        if (entry.fileName === "word/document.xml") hasDocument = true;
        zip.readEntry();
      });
      zip.on("end", () =>
        hasDocument
          ? resolve()
          : reject(
              new AppError(400, "The file does not contain a Word document."),
            ),
      );
      zip.readEntry();
    });
  });
}
export async function extractDocxText(buffer) {
  await checkDocxArchive(buffer);
  // Extract plain text only; no HTML conversion or execution of document content.
  return (await mammoth.extractRawText({ buffer })).value;
}
export function extractTxtText(buffer) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new AppError(
      400,
      "Save your TXT lecture as UTF-8 and upload it again.",
    );
  }
  if (/[\x00-\x08\x0b\x0e-\x1f]/.test(text))
    throw new AppError(
      400,
      "The TXT file contains binary data. Upload a plain UTF-8 text file.",
    );
  return text;
}
