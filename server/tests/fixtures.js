export const fixtures = {
  summary: {
    keyPointsToRemember: ["Agents perceive through sensors and act through actuators.", "Ground study material in the lecture and limit revision to one attempt."],
    overview:
      "Intelligent agents perceive an environment and act on it. Different agent designs use rules, internal state, goals, utility, or learning to select actions.",
    importantConcepts: [
      {
        concept: "Rational agents",
        explanation:
          "Choose the action expected to maximize a performance measure using available knowledge.",
      },
      {
        concept: "PEAS",
        explanation:
          "Describes performance measures, environments, actuators, and sensors.",
      },
      {
        concept: "Bounded review",
        explanation:
          "The study assistant checks structure and grounding, revises at most once, and reviews again.",
      },
    ],
    keyDefinitions: [
      {
        term: "Grounding",
        definition: "Basing an answer on the provided source material.",
      },
    ],
  },
  questions: {
    shortQuestions: [
      "What is an intelligent agent?",
      "What does PEAS stand for?",
      "What is a sensor?",
      "What is an actuator?",
      "What is grounding?",
    ],
    conceptualQuestions: [
      "How does rationality differ from omniscience?",
      "How do model-based agents use internal state?",
      "How do goals and utilities differ?",
      "Why does a learning agent explore?",
      "Why limit the revision loop?",
    ],
  },
  mcqs: {
    questions: [
      [
        "What perceives the environment?",
        "Sensors",
        "Actuators",
        "Goals",
        "Utilities",
        "Sensors provide percepts from the environment.",
      ],
      [
        "What acts on the environment?",
        "Actuators",
        "Sensors",
        "Percepts",
        "Critics",
        "Actuators carry out actions.",
      ],
      [
        "What does P in PEAS mean?",
        "Performance measure",
        "Planning",
        "Perception",
        "Problem",
        "PEAS begins with Performance measure.",
      ],
      [
        "What agent uses only current percept rules?",
        "Simple reflex agent",
        "Model-based agent",
        "Goal-based agent",
        "Learning agent",
        "A simple reflex agent does not retain percept history.",
      ],
      [
        "What does a model-based agent maintain?",
        "Internal state",
        "Omniscience",
        "Only goals",
        "Only utility",
        "It maintains internal state for aspects that are not directly observed.",
      ],
      [
        "What does a utility function compare?",
        "Desirability of outcomes",
        "Sensor count",
        "File sizes",
        "Number of goals only",
        "Utility evaluates how desirable different outcomes are.",
      ],
      [
        "What provides a learning agent with feedback?",
        "Critic",
        "Actuator",
        "Environment label",
        "Memory file",
        "The critic evaluates performance against a standard.",
      ],
      [
        "What suggests exploratory actions?",
        "Problem generator",
        "Simple reflex rule",
        "Actuator alone",
        "Utility label",
        "The problem generator suggests informative experiences.",
      ],
      [
        "How many revisions can this study assistant make?",
        "One",
        "Zero",
        "Ten",
        "Unlimited",
        "The lecture limits correction to at most one revision.",
      ],
      [
        "What does grounding require?",
        "Using the provided source",
        "Adding outside facts",
        "Skipping review",
        "Ignoring lecture topics",
        "Grounding bases an answer on the provided material.",
      ],
    ].map(([question, A, B, C, D, explanation]) => ({
      question,
      options: { A, B, C, D },
      correctAnswer: "A",
      explanation,
    })),
  },
  revision: {
    topics: [
      {
        topic: "Agent fundamentals and PEAS",
        importance: "High",
        estimatedMinutes: 15,
        focus:
          "Explain rationality and identify sensors, actuators, environments, and performance measures.",
      },
      {
        topic: "Agent types",
        importance: "High",
        estimatedMinutes: 20,
        focus:
          "Compare reflex, model-based, goal-based, utility-based, and learning agents.",
      },
      {
        topic: "Study assistant workflow",
        importance: "Medium",
        estimatedMinutes: 10,
        focus:
          "Trace the controller, planner, executor, observer, critic, memory, and bounded revision loop.",
      },
    ],
  },
};
export const pass = { passed: true, issues: [], revisedOutput: null };
export function queueProvider(responses) {
  let calls = 0;
  return {
    name: "test-fixture",
    model: "deterministic-test-only",
    get calls() {
      return calls;
    },
    async generateText() {
      const response = responses[calls++];
      if (response instanceof Error) throw response;
      if (response === undefined) throw new Error("Unexpected AI call");
      return typeof response === "string" ? response : JSON.stringify(response);
    },
  };
}
