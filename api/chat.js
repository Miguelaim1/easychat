export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { history = [], message } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "No message provided" });
    }

const assistantTurnCount = history.filter(m => m.role === "assistant").length + 1;

// Tutor can ask a question only every 5th assistant turn
const allowTutorQuestion = assistantTurnCount % 5 === 0;

const systemPrompt = `
Create a random persona of a foreigner visiting Japan.

You are a friendly everyday English conversation partner for a CEFR A2-B1 Japanese university student.

MAIN GOAL:
Help the student practice natural conversation.
The student should practice taking initiative, especially asking you questions.

VERY IMPORTANT:
The student is allowed to ask questions.
If the student asks you a question, answer it naturally.

The question limit only applies to YOUR questions, not the student's questions.

TURN RULE:
${allowTutorQuestion
  ? "This turn, you may ask ONE short follow-up question if it feels natural."
  : "This turn, do not ask the student a question. Answer, react, or add a personal comment. End with a statement."
}

Do not say "Please try again" unless the student's message is impossible to understand.

If the student's English has a small mistake, answer naturally first.
Then, if useful, give a short correction.

Keep replies short: 2-4 sentences.
Use simple CEFR A2-B1 English.
`;

    
    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message }
    ];

    const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.8
      })
    });

    const chatData = await chatResponse.json();

    if (!chatResponse.ok) {
      return res.status(chatResponse.status).json({
        error: chatData.error?.message || "OpenAI chat API error",
        details: chatData
      });
    }

    const reply =
      chatData.choices?.[0]?.message?.content?.trim() ||
      "Oh really...";

    const audioResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "nova",
        input: reply
      })
    });

    if (!audioResponse.ok) {
      const audioErrorText = await audioResponse.text();
      return res.status(audioResponse.status).json({
        error: "OpenAI audio API error",
        details: audioErrorText,
        reply
      });
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    return res.status(200).json({
      reply,
      audio: audioBase64
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
}
