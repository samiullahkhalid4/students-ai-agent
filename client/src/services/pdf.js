const titles = {
  summary: "Short Summary",
  questions: "Important Questions",
  mcqs: "Practice MCQs",
  revision: "Revision Plan",
};
const heading = (text) => ({ text, style: "heading" });
const paragraph = (text) => ({ text, margin: [0, 0, 0, 8] });
const label = (text) => ({ text, bold: true, margin: [0, 6, 0, 4] });

function studyContent(task, output) {
  switch (task) {
    case "summary":
      return [
        heading("Overview"),
        paragraph(output.overview),
        heading("Important Concepts"),
        ...output.importantConcepts.flatMap((item) => [
          label(item.concept), paragraph(item.explanation),
        ]),
        heading("Key Definitions"),
        ...(output.keyDefinitions.length
          ? output.keyDefinitions.flatMap((item) => [
              label(item.term), paragraph(item.definition),
            ])
          : [paragraph("No explicit definitions in this lecture.")]),
        heading("Key Points to Remember"),
        ...(output.keyPointsToRemember?.length
          ? [{ ul: output.keyPointsToRemember.map(paragraph) }]
          : [paragraph("This older summary has no saved key points.")]),
      ];
    case "questions":
      return [
        heading("Short Questions"),
        { ol: output.shortQuestions.map(paragraph) },
        heading("Conceptual Questions"),
        { ol: output.conceptualQuestions.map(paragraph) },
      ];
    case "mcqs":
      return [
        paragraph("Choose one answer for each question. The answer key and explanations follow the questions."),
        ...output.questions.flatMap((question, index) => [
          label(`${index + 1}. ${question.question}`),
          ...Object.entries(question.options).map(([letter, text]) => ({
            text: `${letter}. ${text}`, margin: [12, 0, 0, 4],
          })),
        ]),
        { ...heading("Answer Key and Explanations"), pageBreak: "before" },
        ...output.questions.flatMap((question, index) => [
          label(`${index + 1}. ${question.correctAnswer} — ${question.options[question.correctAnswer]}`),
          paragraph(question.explanation),
        ]),
      ];
    case "revision":
      return [
        paragraph(`Total estimated study time: ${output.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0)} minutes`),
        ...output.topics.flatMap((topic, index) => [
          heading(`${index + 1}. ${topic.topic}`),
          paragraph(`Importance: ${topic.importance || "Not rated in this older plan"} | Estimated time: ${topic.estimatedMinutes} minutes`),
          label("What to Focus On"),
          paragraph(topic.focus),
        ]),
        paragraph("Study times and importance ratings are recommendations. Adjust them to your pace."),
      ];
    default:
      throw new Error("This study aid cannot be exported.");
  }
}

function documentDefinition(result, session) {
  const title = titles[result.task_type];
  return {
    info: { title: `${title} — ${session.subject}`, author: "Smart Study Agent" },
    pageSize: "A4",
    pageMargins: [44, 44, 44, 48],
    defaultStyle: { font: "Roboto", fontSize: 11, lineHeight: 1.3, color: "#25382f" },
    styles: {
      heading: { fontSize: 14, bold: true, color: "#1e614d", margin: [0, 16, 0, 8] },
    },
    footer: (page, pages) => ({
      text: `Smart Study Agent  |  Page ${page} of ${pages}`,
      alignment: "center", fontSize: 9, color: "#66756d", margin: [0, 16, 0, 0],
    }),
    content: [
      { text: "Smart Study Agent", fontSize: 11, color: "#1e614d", margin: [0, 0, 0, 6] },
      { text: title, fontSize: 24, bold: true, margin: [0, 0, 0, 14] },
      paragraph(`Student: ${session.student_name}`),
      paragraph(`Subject: ${session.subject}`),
      paragraph(`Lecture: ${session.filename}`),
      ...studyContent(result.task_type, result.output),
      { text: "AI review helps catch errors, but is not a guarantee. Check important details against your lecture.",
        fontSize: 9, color: "#66756d", margin: [0, 20, 0, 0] },
    ],
  };
}

export async function downloadStudyPdf(result, session) {
  // Load the PDF renderer and bundled fonts only when exporting. No AI call is needed.
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  pdfMake.addVirtualFileSystem(fonts);
  await pdfMake.createPdf(documentDefinition(result, session))
    .download(`study-${result.task_type}.pdf`);
}
