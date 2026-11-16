import { env } from '@/lib/env';

/**
 * Minimal chat-completion client for the optional AI extraction fallback.
 *
 * Providers are tried in order (Ollama Cloud, then Groq, then OpenAI); the
 * first one that is configured and answers wins. Only the providers whose API
 * key is present are attempted. The destinations are fixed first-party API
 * hosts, so these calls do not go through the scan HTTP client.
 */

export class AiUnavailableError extends Error {}

interface Provider {
  name: string;
  call(prompt: string, system: string): Promise<string>;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${detail.slice(0, 160)}`);
  }
  return response.json();
}

function openAiCompatible(name: string, url: string, apiKey: string, model: string): Provider {
  return {
    name,
    async call(prompt, system) {
      const data = (await postJson(
        url,
        { Authorization: `Bearer ${apiKey}` },
        {
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        },
        45_000,
      )) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty completion');
      return content;
    },
  };
}

function providers(): Provider[] {
  const ai = env.ai;
  const list: Provider[] = [];

  if (ai.ollamaApiKey) {
    list.push({
      name: `ollama:${ai.ollamaModel}`,
      async call(prompt, system) {
        const data = (await postJson(
          `${ai.ollamaBaseUrl}/api/generate`,
          { Authorization: `Bearer ${ai.ollamaApiKey}` },
          { model: ai.ollamaModel, prompt, system, stream: false, format: 'json', options: { temperature: 0 } },
          60_000,
        )) as { response?: string; message?: { content?: string } };
        const content = data.response ?? data.message?.content;
        if (!content) throw new Error('Empty completion');
        return content;
      },
    });
  }
  if (ai.groqApiKey) {
    list.push(openAiCompatible(`groq:${ai.groqModel}`, 'https://api.groq.com/openai/v1/chat/completions', ai.groqApiKey, ai.groqModel));
  }
  if (ai.openaiApiKey) {
    list.push(openAiCompatible(`openai:${ai.openaiModel}`, 'https://api.openai.com/v1/chat/completions', ai.openaiApiKey, ai.openaiModel));
  }
  return list;
}

export function isAiConfigured(): boolean {
  return providers().length > 0;
}

export async function completeJson(prompt: string, system: string): Promise<{ text: string; provider: string }> {
  const available = providers();
  if (available.length === 0) throw new AiUnavailableError('No AI provider is configured.');

  const failures: string[] = [];
  for (const provider of available) {
    try {
      return { text: await provider.call(prompt, system), provider: provider.name };
    } catch (error) {
      failures.push(`${provider.name}: ${(error as Error).message}`);
    }
  }
  throw new AiUnavailableError(`All AI providers failed. ${failures.join(' | ').slice(0, 400)}`);
}
