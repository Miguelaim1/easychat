export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

const { history = [], message, persona = {} } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "No message provided" });
    }

    const cleanHistory = history
      .filter(
        (m) =>
          m &&
          typeof m.content === "string" &&
          ["user", "assistant"].includes(m.role)
      )
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const assistantTurnCount =
      cleanHistory.filter((m) => m.role === "assistant").length + 1;

    // Tutor asks a question only every 5th tutor turn.
    // Change 5 to 6 or 7 for even fewer questions.
    const allowTutorQuestion = assistantTurnCount % 4 === 0;

const selectedPersona = {
  name: persona.name || "Sofia",
  country: persona.country || "Spain",
  reason: persona.reason || "traveling in Japan",
  personality: persona.personality || "friendly and curious",
  likes: persona.likes || "food, travel, and meeting people",
  dislikes: persona.dislikes || "crowded places",
};
    
    const systemPrompt = `
You are the TUTOR.

The user is the STUDENT.

You are a friendly English conversation partner for a CEFR A2-B1 Japanese university student.

Your persona:
- Name: ${selectedPersona.name}
- Country: ${selectedPersona.country}
- Reason for visiting Japan: ${selectedPersona.reason}
- Personality: ${selectedPersona.personality}
- Likes: ${selectedPersona.likes}
- Dislikes: ${selectedPersona.dislikes}

Very important role rules:
- Do not speak as the student.
- Do not guess the student's name.
- Do not say the student is visiting Japan.
- You are the foreigner visiting Japan.
- The student is a Japanese university student practicing English.

Conversation goal:
The student should practice taking initiative.
This means the student should sometimes ask you questions first.

The student is allowed to ask questions.
If the student asks you a question, answer it naturally.

Question rule:
${
  allowTutorQuestion
    ? "This turn, you may ask ONE short question if it feels natural."
    : "This turn, you must NOT ask the student a question. Answer, react, or share a short personal comment. End with a statement."
}

Do not say "Please try again" unless the student's message is impossible to understand.

Keep replies short.
Use simple CEFR A2-B1 English.
Use 1 to 3 short sentences.
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...cleanHistory,
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 120,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", data);
      return res.status(500).json({
        error: "OpenAI API error",
        details: data,
      });
    }

    let reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(500).json({
        error: "No reply generated",
      });
    }

    // Simple hard guard:
    // On no-question turns, remove any sentence that contains a question mark.
    // This avoids the weird second AI rewrite problem.
    if (!allowTutorQuestion) {
      reply = removeQuestionSentences(reply);
    }

    // Backup in case removing question sentences deleted everything.
    if (!reply || reply.trim().length < 2) {
      reply = "That sounds interesting. I have had a similar experience in Japan.";
    }

    // Return several names so your front end / text-to-voice code can find it.
    return res.status(200).json({
      reply,
      response: reply,
      message: reply,
      text: reply,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return res.status(500).json({
      error: "Something went wrong.",
      details: error.message,
    });
  }
}

function removeQuestionSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !sentence.includes("?"))
    .join(" ")
    .trim();
}
