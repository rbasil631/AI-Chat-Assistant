import OpenAI from 'openai';

export function createOpenAIProvider({ apiKey, model, client = new OpenAI({ apiKey }) }) {
  return {
    name: 'openai',
    model,
    async *stream({ system, messages, temperature, maxTokens, signal }) {
      const stream = await client.chat.completions.create(
        {
          model,
          messages: [{ role: 'system', content: system }, ...messages],
          temperature,
          max_completion_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal },
      );

      let usage;
      let resolvedModel = model;
      for await (const chunk of stream) {
        if (chunk.model) resolvedModel = chunk.model;
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield { type: 'delta', text };
        if (chunk.usage) {
          usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
        }
      }
      yield { type: 'done', model: resolvedModel, usage };
    },
  };
}
