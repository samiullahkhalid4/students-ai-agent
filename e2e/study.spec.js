import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

async function readDownloadedPdf(page, task) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download result as PDF" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(`study-${task}.pdf`);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    return await parser.getText();
  } finally {
    await parser.destroy();
  }
}

async function uploadLecture(page) {
  await page.goto("/");
  await page.getByLabel("Student name").fill("Ayesha Khan");
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Artificial Intelligence");
  await page
    .getByLabel("Upload lecture", { exact: true })
    .setInputFiles(path.resolve("samples/lecture.pdf"));
  await page.getByRole("button", { name: "Prepare my lecture" }).click();
  await expect(page.getByText("Lecture ready for your agent")).toBeVisible();
}
test("complete lecture workflow, four aids, quiz scoring and reload", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await uploadLecture(page);
  await page
    .getByRole("button", { name: "Short Summary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Key Points to Remember" })).toBeVisible();
  await page.getByText("View agent workflow steps").click();
  await expect(
    page.getByText("Your study aid is ready and saved."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Important Questions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Conceptual questions" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revision Plan", exact: true })
    .click();
  await expect(
    page.getByText("A focused plan · 45 minutes in total"),
  ).toBeVisible();
  await expect(page.getByText("Importance: High")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Generate MCQs", exact: true })
    .click();
  await expect(page.getByText("0 / 10 answered")).toBeVisible();
  for (const question of await page.locator(".quiz-question").all())
    await question.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Check my answers" }).click();
  await expect(page.getByText("Score saved: 10/10")).toBeVisible();
  await expect(page.locator(".explanation")).toHaveCount(10);
  await page.reload();
  await expect(page.getByText("Last saved attempt: 10/10")).toBeVisible();
  await page.getByRole("tab", { name: "Short Summary", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-result.png",
    fullPage: true,
  });
  for (const [task, tab, expectedText] of [
    ["summary", "Short Summary", ["Overview", "Key Points to Remember", "Ground study material"]],
    ["questions", "Important Questions", ["Short Questions", "Conceptual Questions", "Why limit the revision loop?"]],
    ["mcqs", "Practice MCQs", ["What perceives the environment?", "Answer Key and Explanations", "Sensors provide percepts"]],
    ["revision", "Revision Plan", ["Importance: High", "45 minutes", "What to Focus On"]],
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    const pdf = await readDownloadedPdf(page, task);
    for (const text of ["Ayesha Khan", "Artificial Intelligence", "lecture.pdf", ...expectedText]) {
      expect(pdf.text).toContain(text);
    }
    if (task === "mcqs") expect(pdf.total).toBeGreaterThanOrEqual(2);
  }
  expect(errors).toEqual([]);
});
test("mobile layout and upload validation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Short Summary", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Upload lecture", { exact: true })
    .setInputFiles({
      name: "notes.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("no"),
    });
  await expect(
    page.getByText("Choose a PDF, TXT, or DOCX file."),
  ).toBeVisible();
  await uploadLecture(page);
  await page
    .getByRole("button", { name: "Short Summary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Start a new session" }).click();
  await expect(page.getByLabel("Student name")).toBeVisible();
});
test("shows provider errors and lets the student retry", async ({ page }) => {
  await uploadLecture(page);
  await page.route("**/api/study/generate", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Gemini is not configured. Add GEMINI_API_KEY to server/.env.",
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Short Summary", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Gemini is not configured",
  );
  await expect(
    page.getByRole("button", { name: "Short Summary", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/api/study/generate");
  await page
    .getByRole("button", { name: "Short Summary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
});

test("reopens an older lecture from saved sessions", async ({ page }) => {
  await uploadLecture(page);
  const previousId = await page.getByLabel("Saved lectures").inputValue();
  await page.getByRole("button", { name: "Short Summary", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start a new session" }).click();
  await page.getByLabel("Student name").fill("Bilal");
  await page.getByLabel("Subject", { exact: true }).fill("Second lecture");
  await page.getByLabel("Upload lecture", { exact: true }).setInputFiles(path.resolve("samples/lecture.txt"));
  await page.getByRole("button", { name: "Prepare my lecture" }).click();
  await expect(page.getByText("Lecture ready for your agent")).toBeVisible();
  await page.getByLabel("Saved lectures").selectOption(previousId);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByText("Ayesha Khan", { exact: true })).toBeVisible();
});

test("rejecting a replacement file clears the previous selection", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Student name").fill("Ayesha");
  await page.getByLabel("Subject", { exact: true }).fill("AI");
  await page.getByLabel("Upload lecture", { exact: true }).setInputFiles(path.resolve("samples/lecture.txt"));
  await expect(page.getByRole("button", { name: "Prepare my lecture" })).toBeEnabled();
  await page.getByLabel("Upload lecture", { exact: true }).setInputFiles({ name: "bad.exe", mimeType: "application/octet-stream", buffer: Buffer.from("bad") });
  await expect(page.getByRole("button", { name: "Prepare my lecture" })).toBeDisabled();
});
