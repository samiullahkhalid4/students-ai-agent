async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    throw new Error(
      "Cannot reach the backend. Make sure the server is running and try again.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    if (response.status === 413)
      throw new Error("This file exceeds the hosting upload limit. Try a file under 4 MB.");
    if (response.status === 504)
      throw new Error("The hosting server timed out. Please try generating again.");
    throw new Error(
      `The API returned a non-JSON response (HTTP ${response.status}). Check that the deployment includes the backend and routes /api requests to it.`,
    );
  }
  if (!response.ok)
    throw new Error(data.error || "The request failed. Please try again.");
  return data;
}
const post = (path, body) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const api = {
  health: () => request("/health"),
  upload: (data) => request("/study/upload", { method: "POST", body: data }),
  generate: (sessionId, task) => post("/study/generate", { sessionId, task }),
  session: (id) => request(`/study/session/${id}`),
  sessions: () => request("/study/sessions"),
  status: (id) => request(`/study/session/${id}/status`),
  quizScore: (sessionId, outputId, answers) =>
    post("/study/quiz-score", { sessionId, outputId, answers }),
};
