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
    .getByLabel("Upload notes", { exact: true })
    .setInputFiles(path.resolve("samples/lecture.pdf"));
  await page.getByRole("button", { name: "Upload my notes" }).click();
  await expect(page.getByText("Your notes are ready. Choose what to do next.")).toBeVisible();
}
test("complete lecture workflow, four aids, quiz scoring and reload", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await uploadLecture(page);
  await page
    .getByRole("button", { name: "Short summary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Key Points to Remember" })).toBeVisible();
  await page.getByText("Technical details").click();
  await expect(
    page.getByText("Your study aid is ready and saved.").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Practice questions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Conceptual questions" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revision plan", exact: true })
    .click();
  await expect(
    page.getByText("A focused plan · 45 minutes in total"),
  ).toBeVisible();
  await expect(page.getByText("Importance: High")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Take a practice quiz", exact: true })
    .click();
  await expect(page.getByText("0 / 10 answered")).toBeVisible();
  for (let index = 0; index < 10; index++) {
    await expect(page.locator(".quiz-question")).toHaveCount(1);
    await page.locator(".quiz-question").getByRole("radio").first().check();
    if (index < 9) await page.getByRole("button", { name: "Next question" }).click();
  }
  await page.getByRole("button", { name: "Check my answers" }).click();
  await expect(page.getByText("Score saved: 10/10")).toBeVisible();
  await expect(page.locator(".explanation")).toHaveCount(10);
  await page.reload();
  await expect(page.getByText("Last saved attempt: 10/10")).toBeVisible();
  await page.getByRole("tab", { name: "Short summary", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-result.png",
    fullPage: true,
  });
  for (const [task, tab, expectedText] of [
    ["summary", "Short summary", ["Overview", "Key Points to Remember", "Ground study material"]],
    ["questions", "Practice questions", ["Short Questions", "Conceptual Questions", "Why limit the revision loop?"]],
    ["mcqs", "Practice quiz", ["What perceives the environment?", "Answer Key and Explanations", "Sensors provide percepts"]],
    ["revision", "Revision plan", ["Importance: High", "45 minutes", "What to Focus On"]],
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
    page.getByRole("button", { name: "Short summary", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Upload notes", { exact: true })
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
    .getByRole("button", { name: "Short summary", exact: true })
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
  await page.getByRole("button", { name: "Create another subject" }).click();
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
    .getByRole("button", { name: "Short summary", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Gemini is not configured",
  );
  await expect(
    page.getByRole("button", { name: "Short summary", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/api/study/generate");
  await page
    .getByRole("button", { name: "Short summary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
});

test("reopens an older lecture from saved sessions", async ({ page }) => {
  await uploadLecture(page);
  const previousId = await page.getByLabel("Saved subjects").inputValue();
  await page.getByRole("button", { name: "Short summary", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create another subject" }).click();
  await page.getByLabel("Student name").fill("Bilal");
  await page.getByLabel("Subject", { exact: true }).fill("Second lecture");
  await page.getByLabel("Upload notes", { exact: true }).setInputFiles(path.resolve("samples/lecture.txt"));
  await page.getByRole("button", { name: "Upload my notes" }).click();
  await expect(page.getByText("Your notes are ready. Choose what to do next.")).toBeVisible();
  await page.getByLabel("Saved subjects").selectOption(previousId);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByText("Ayesha Khan", { exact: true })).toBeVisible();
});

test("rejecting a replacement file clears the previous selection", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Student name").fill("Ayesha");
  await page.getByLabel("Subject", { exact: true }).fill("AI");
  await page.getByLabel("Upload notes", { exact: true }).setInputFiles(path.resolve("samples/lecture.txt"));
  await expect(page.getByRole("button", { name: "Upload my notes" })).toBeEnabled();
  await page.getByLabel("Upload notes", { exact: true }).setInputFiles({ name: "bad.exe", mimeType: "application/octet-stream", buffer: Buffer.from("bad") });
  await expect(page.getByRole("button", { name: "Upload my notes" })).toBeDisabled();
});

test("multiple notes stay in one subject, selected sources and older versions survive reload", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Student name").fill("Ayesha");
  await page.getByLabel("Subject", { exact: true }).fill("AI course");
  await page.getByLabel("Upload notes", { exact: true }).setInputFiles([
    path.resolve("samples/lecture.txt"), path.resolve("samples/lecture.pdf"),
  ]);
  await page.getByRole("button", { name: "Upload my notes" }).click();
  await expect(page.locator(".saved-files li")).toHaveCount(2);
  const subjectId = await page.getByLabel("Saved subjects").inputValue();
  await page.getByRole("button", { name: "Short summary", exact: true }).click();
  await expect(page.locator(".source-summary")).toContainText("lecture.txt, lecture.pdf");
  await page.getByLabel("Add more notes", { exact: true }).setInputFiles(path.resolve("samples/lecture.docx"));
  await page.getByRole("button", { name: "Add selected notes" }).click();
  await expect(page.locator(".saved-files li")).toHaveCount(3);
  await expect(page.getByLabel("Saved subjects")).toHaveValue(subjectId);
  await expect(page.locator(".updated-notes")).toContainText("1 new file was added");
  await page.getByLabel("Study all notes").uncheck();
  await expect(page.getByRole("button", { name: "Short summary", exact: true })).toBeDisabled();
  await page.getByText("Select specific files").click();
  await page.locator(".source-options").getByLabel("lecture.docx", { exact: true }).check();
  await page.getByRole("button", { name: "Short summary", exact: true }).click();
  await expect(page.locator(".source-summary")).toContainText("Notes used: lecture.docx");
  await expect(page.locator(".updated-notes")).toHaveCount(0);
  const pdf = await readDownloadedPdf(page, "summary");
  expect(pdf.text).toContain("lecture.docx");
  expect(pdf.text).not.toContain("lecture.pdf");
  await page.getByLabel("Saved versions").selectOption({ index: 1 });
  await expect(page.locator(".source-summary")).toContainText("Notes used: lecture.txt, lecture.pdf");
  await expect(page.locator(".updated-notes")).toBeVisible();
  await page.reload();
  await expect(page.locator(".saved-files li")).toHaveCount(3);
  await expect(page.getByLabel("Saved subjects")).toHaveValue(subjectId);
  await expect(page.getByLabel("Saved versions").locator("option")).toHaveCount(2);
  await expect(page.locator(".source-summary")).toContainText("Notes used: lecture.docx");
});

test("partial upload failure keeps saved notes and retries only the remaining files", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Student name").fill("Bilal");
  await page.getByLabel("Subject", { exact: true }).fill("Networks");
  await page.getByLabel("Upload notes", { exact: true }).setInputFiles([
    path.resolve("samples/lecture.txt"), path.resolve("samples/lecture.docx"),
  ]);
  await page.route("**/api/study/session/*/files", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary upload issue. Try again." }),
  }));
  await page.getByRole("button", { name: "Upload my notes" }).click();
  await expect(page.getByRole("alert")).toContainText("1 of 2 files saved");
  await expect(page.locator(".saved-files li")).toHaveCount(1);
  await expect(page.locator(".upload-queue li")).toHaveCount(1);
  const id = await page.getByLabel("Saved subjects").inputValue();
  await page.unroute("**/api/study/session/*/files");
  await page.getByRole("button", { name: "Add selected notes" }).click();
  await expect(page.locator(".saved-files li")).toHaveCount(2);
  await expect(page.locator(".upload-queue li")).toHaveCount(0);
  await expect(page.getByLabel("Saved subjects")).toHaveValue(id);
  await page.getByLabel("Add more notes", { exact: true }).setInputFiles(path.resolve("samples/lecture.docx"));
  await page.getByRole("button", { name: "Add selected notes" }).click();
  await expect(page.locator(".upload-queue li")).toHaveCount(0);
  await expect(page.locator(".saved-files li")).toHaveCount(2);
  await page.getByLabel("Add more notes", { exact: true }).setInputFiles({
    name: "bad.exe", mimeType: "application/octet-stream", buffer: Buffer.from("bad"),
  });
  await expect(page.getByText("Choose a PDF, TXT, or DOCX file.")).toBeVisible();
});

test("quiz navigation preserves answers and filters mistakes after submission", async ({ page }) => {
  await uploadLecture(page);
  await page.getByRole("button", { name: "Take a practice quiz", exact: true }).click();
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  for (let index = 1; index < 10; index++) {
    await page.getByRole("button", { name: "Next question" }).click();
    await page.getByRole("radio").first().check();
  }
  await page.getByRole("button", { name: "Check my answers" }).click();
  await expect(page.getByText("Score saved: 9/10")).toBeVisible();
  await page.getByLabel("Show incorrect answers only").check();
  await expect(page.locator(".quiz-question")).toHaveCount(1);
  await expect(page.locator(".explanation")).toContainText("Your answer: B. Answer A.");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("0 / 10 answered")).toBeVisible();
  await expect(page.getByText("Question 1 of 10", { exact: true })).toBeVisible();
});

test("large subjects can be stored and students choose fewer notes for an activity", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Student name").fill("Ayesha");
  await page.getByLabel("Subject", { exact: true }).fill("Large subject");
  await page.getByLabel("Upload notes", { exact: true }).setInputFiles([
    { name: "part-one.txt", mimeType: "text/plain", buffer: Buffer.from("a".repeat(35000)) },
    { name: "part-two.txt", mimeType: "text/plain", buffer: Buffer.from("b".repeat(35000)) },
  ]);
  await page.getByRole("button", { name: "Upload my notes" }).click();
  await expect(page.locator(".saved-files li")).toHaveCount(2);
  await expect(page.getByText("These notes are too long to study together", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Short summary", exact: true })).toBeDisabled();
  await page.getByText("Select specific files").click();
  await page.getByLabel("part-two.txt", { exact: true }).uncheck();
  await expect(page.getByRole("button", { name: "Short summary", exact: true })).toBeEnabled();
});
