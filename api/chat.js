export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { history = [], message } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "No message provided" });
    }

    // Count assistant turns so we can control how often the tutor asks questions
    const assistantTurnCount =
      history.filter((m) => m.role === "assistant").length + 1;

    // Tutor can ask a question only every 5th assistant turn
    // Change 5 to 6 or 7 for fewer questions
    const allowTutorQuestion = assistantTurnCount % 5 === 0;

    const systemPrompt = `
You are a friendly English conversation partner for a CEFR A2-B1 Japanese university student.

Create a random persona of a foreigner visiting Japan.
Keep the same persona throughout the conversation.

MAIN GOAL:
Help the student practice natural everyday English conversation.

The student should practice taking initiative.
This means the student should sometimes ask you questions first.

IMPORTANT:
The student is allowed to ask questions.
If the student asks you a question, answer it naturally.

The question limit applies only to YOU, the tutor.
It does NOT apply to the student.

TURN RULE:
${
  allowTutorQuestion
    ? "This turn, you may ask ONE short follow-up question if it feels natural."
    : "This turn, you must NOT ask the student a question. Do not ask anything. Answer, react, or share a short personal comment. End with a statement."
}

When you are not allowed to ask a question:
- answer the student's question if they asked one,
- react naturally,
- share a short personal comment,
- add one small detail about your persona,
- leave space for the student to continue.

Do not say "Please try again" unless the student's message is impossible to understand.

If the student's English has a small mistake:
- answer naturally first,
- then give a very short correction only if useful.

Keep your English simple and natural.
Use CEFR A2-B1 English.
Keep replies short: 2-4 sentences.
`;

    // Clean the history so only valid OpenAI message roles are sent
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
        temperature: 0.8,
        max_tokens: 180,
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

    // If this is a no-question turn but the tutor still asks a question,
    // rewrite the reply once.
    if (!allowTutorQuestion && containsQuestion(reply)) {
      try {
        const rewriteResponse = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `
Rewrite the tutor reply so it contains no questions.

Rules:
- Do not ask the student anything.
- Do not use a question mark.
- Keep the same basic meaning.
- Answer the student naturally if they asked a question.
- End with a statement.
- Keep it short and natural.
- Use CEFR A2-B1 English.
`,
                },
                {
                  role: "user",
                  content: reply,
                },
              ],
              temperature: 0.3,
              max_tokens: 120,
            }),
          }
        );

        const rewriteData = await rewriteResponse.json();

        if (rewriteResponse.ok) {
          const rewrittenReply =
            rewriteData.choices?.[0]?.message?.content?.trim();

          if (rewrittenReply) {
            reply = rewrittenReply;
          }
        } else {
          console.error("Rewrite API error:", rewriteData);
        }
      } catch (rewriteError) {
        console.error("Rewrite failed:", rewriteError);
      }
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);

    return res.status(500).json({
      error: "Something went wrong.",
      details: error.message,
    });
  }
}

function containsQuestion(text) {
  if (!text) return false;

  return (
    text.includes("?") ||
    /\b(what|where|when|why|how|who|which)\b/i.test(text) ||
    /\b(do you|did you|are you|can you|could you|would you|will you|have you)\b/i.test(
      text
    )
  );
}
