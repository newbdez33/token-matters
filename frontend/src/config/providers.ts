export interface ProviderConfig {
  id: string;
  name: string;
  billingMode: 'token' | 'subscription';
  currency: string;
  color: string;
  note?: string;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    billingMode: 'token',
    currency: 'USD',
    color: '#000000',
    note: 'Anthropic CLI - per token billing',
  },
  'glm-coding': {
    id: 'glm-coding',
    name: 'GLM Coding Plan',
    billingMode: 'subscription',
    currency: 'CNY',
    color: '#808080',
    note: 'Zhipu AI coding assistant - subscription',
  },
  'trae-pro': {
    id: 'trae-pro',
    name: 'TRAE Pro Plan',
    billingMode: 'subscription',
    currency: 'USD',
    color: '#C0C0C0',
    note: 'ByteDance AI coding assistant - subscription',
  },
};

export const CHART_COLORS = ['#000000', '#404040', '#808080', '#A0A0A0', '#D0D0D0'];

export function getProviderConfig(id: string): ProviderConfig {
  return PROVIDERS[id] ?? {
    id,
    name: id,
    billingMode: 'token',
    currency: 'USD',
    color: CHART_COLORS[Object.keys(PROVIDERS).length % CHART_COLORS.length],
  };
}
