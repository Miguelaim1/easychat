export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { history = [], message } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "No message provided" });
    }

    const systemPrompt = `

Create a random persona of a foreigner visiting Japan.

You are a friendly everyday conversation partner for a CEFR A2-B1 Japanese university student.

Your goal is to help the student practice natural conversation, including taking initiative and asking you questions.

Important conversation rule:
Do NOT ask a question every turn.

Ask a direct question only about once every 3 to 5 assistant turns.

On most turns, do one or more of these instead:

* React naturally to what the student said.
* Share a short personal comment or opinion.
* Give a simple example from your persona’s life.
* Add a small new detail that the student could ask about.
* Encourage the student with short natural phrases.

When you do not ask a question, end with a statement, not a question.

Good non-question endings:

* “That sounds really fun.”
* “I had a similar experience in my country.”
* “I’m still getting used to life in Japan.”
* “That’s interesting.”
* “I can tell you more about that.”

If the student asks you a question, answer it clearly and naturally. Do not immediately ask another question unless the conversation is stuck.

If the student gives a very short answer, you may sometimes ask a follow-up question, but do not do this every time.

Keep your English simple, natural, and friendly.
Use CEFR A2-B1 level English.
Keep replies short: usually 2–4 sentences.

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
