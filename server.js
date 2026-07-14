const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Инициализация клиента DeepSeek (ChatAnywhere)
const deepseek = new OpenAI({
  baseURL: 'https://api.chatanywhere.tech/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// ============================================================
// ЭНДПОИНТЫ
// ============================================================

// 1. Получить все промпты
app.get('/api/prompts', (req, res) => {
  res.json({ message: 'Список промптов' });
});

// 2. Сравнить агентов (Арена)
app.post('/api/arena/compare', async (req, res) => {
  const { task, agent_ids } = req.body;

  if (!task || !agent_ids || agent_ids.length < 2) {
    return res.status(400).json({ error: 'Нужна задача и минимум 2 агента' });
  }

  try {
    const results = [];

    for (const id of agent_ids) {
      const startTime = Date.now();

      const response = await deepseek.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Ты — эксперт, который выполняет задачи по инструкции. Отвечай чётко, структурированно, без воды.' },
          { role: 'user', content: task }
        ],
        temperature: 0.7,
      });

      const endTime = Date.now();
      const speed = (endTime - startTime) / 1000;

      const answer = response.choices[0].message.content;
      const usage = response.usage;

      results.push({
        agent_id: id,
        name: `Агент ${id}`,
        accuracy: 0,
        speed: parseFloat(speed.toFixed(2)),
        price: parseFloat(((usage.total_tokens / 1_000_000) * 0.14).toFixed(6)),
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
        answer: answer,
      });
    }

    results.sort((a, b) => a.total_tokens - b.total_tokens);

    res.json({
      task: task,
      results: results,
      winner_id: results[0]?.agent_id || null,
    });

  } catch (error) {
    console.error('DeepSeek API error:', error);
    res.status(500).json({ error: 'Ошибка при вызове DeepSeek API' });
  }
});

// 3. Оценить промпт (с судьей)
app.post('/api/prompt/evaluate', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Промпт обязателен' });
  }

  try {
    const startTime = Date.now();

    // 1. Выполняем промпт
    const response = await deepseek.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Ты — эксперт, выполняющий задачи по промпту.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
    });

    const endTime = Date.now();
    const speed = (endTime - startTime) / 1000;
    const usage = response.usage;
    const answer = response.choices[0].message.content;

    // 2. Оцениваем промпт (судья)
    const judgePrompt = `
Ты — эксперт по инженерии промптов. Оцени этот промпт по шкале 0-10 по критериям:
- Чёткость инструкции
- Конкретность задачи
- Структурированность
- Полнота требований

Промпт:
${prompt}

Верни ТОЛЬКО JSON: {"score": число, "comment": "краткий комментарий"}
`;

    const judgeResponse = await deepseek.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: judgePrompt }],
      temperature: 0.3,
    });

    const judgeData = JSON.parse(judgeResponse.choices[0].message.content);

    res.json({
      answer: answer,
      speed: parseFloat(speed.toFixed(2)),
      price: parseFloat(((usage.total_tokens / 1_000_000) * 0.14).toFixed(6)),
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      judge_score: judgeData.score,
      judge_comment: judgeData.comment,
    });

  } catch (error) {
    console.error('DeepSeek API error:', error);
    res.status(500).json({ error: 'Ошибка при вызове DeepSeek API' });
  }
});

// ============================================================
// ЗАПУСК СЕРВЕРА
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});