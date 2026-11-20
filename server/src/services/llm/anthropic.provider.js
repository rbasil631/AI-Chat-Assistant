import Anthropic from '@anthropic-ai/sdk';

/**
 * Provider contract (shared by every provider):
 *   stream({ system, messages, temperature, maxTokens, signal }) -> AsyncIterable of
 *     { type: 'delta', text } ... then exactly one { type: 'done', model, usage }
 */
export function createAnthropicProvider({ apiKey, model, client = new Anthropic({ apiKey }) }) {
  return {
    name: 'anthropic',
    model,
    async *stream({ system, messages, temperature, maxTokens, signal }) {
      const stream = client.messages.stream(
        { model, system, messages, temperature, max_tokens: maxTokens },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          yield { type: 'delta', text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      yield {
        type: 'done',
        model: final.model,
        usage: { inputTokens: final.usage?.input_tokens, outputTokens: final.usage?.output_tokens },
      };
    },
  };
}
