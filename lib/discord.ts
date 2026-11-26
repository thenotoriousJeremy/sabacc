/**
 * Discord Webhook integration for self-hosted Cantina servers.
 * Posts rich embeds when tables open, Sabacc Pots are won, or pilots share Kessel Runs.
 */

const MIN_WEBHOOK_INTERVAL_MS = 3_000;
let lastSentAt = 0;

function isValidDiscordWebhook(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'discord.com' ||
        parsed.hostname === 'discordapp.com' ||
        parsed.hostname.endsWith('.discord.com')) &&
      parsed.pathname.startsWith('/api/webhooks/')
    );
  } catch {
    return false;
  }
}

export async function postDiscordEmbed(
  webhookUrl: string,
  embed: {
    title: string;
    description: string;
    color?: number;
    url?: string;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string };
  }
): Promise<{ ok: boolean; error?: string }> {
  if (!webhookUrl) return { ok: false, error: 'No Discord Webhook URL configured.' };
  if (!isValidDiscordWebhook(webhookUrl)) {
    return { ok: false, error: 'Webhook URL must be an https://discord.com/api/webhooks/... endpoint.' };
  }

  const now = Date.now();
  if (now - lastSentAt < MIN_WEBHOOK_INTERVAL_MS) {
    return { ok: false, error: 'Webhook rate-limited. Wait a few seconds.' };
  }
  lastSentAt = now;

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Cantina Holotable',
        embeds: [
          {
            color: embed.color ?? 0xf59e0b,
            title: embed.title,
            description: embed.description,
            ...(embed.url ? { url: embed.url } : {}),
            ...(embed.fields ? { fields: embed.fields } : {}),
            footer: embed.footer ?? { text: 'Corellian Spike Sabacc' },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    if (!resp.ok) {
      return { ok: false, error: `Discord returned HTTP ${resp.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Webhook request failed' };
  }
}
