import claudeCodeLogo from '@/assets/providers/claude-code.svg';
import codexLogo from '@/assets/providers/codex.svg';
import glmCodingLogo from '@/assets/providers/glm-coding.svg';
import opencodeLogo from '@/assets/providers/opencode.svg';
import traeProLogo from '@/assets/providers/trae-pro.svg';

export interface ProviderConfig {
  id: string;
  name: string;
  billingMode: 'token' | 'subscription';
  currency: string;
  color: string;
  logo?: string;
  note?: string;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    billingMode: 'token',
    currency: 'USD',
    color: '#000000',
    logo: claudeCodeLogo,
    note: 'Anthropic CLI - per token billing',
  },
  'codex': {
    id: 'codex',
    name: 'Codex CLI',
    billingMode: 'token',
    currency: 'USD',
    color: '#202020',
    logo: codexLogo,
    note: 'OpenAI Codex CLI - per token billing',
  },
  'glm-coding': {
    id: 'glm-coding',
    name: 'GLM Coding Plan',
    billingMode: 'subscription',
    currency: 'CNY',
    color: '#808080',
    logo: glmCodingLogo,
    note: 'Zhipu AI coding assistant - subscription',
  },
  'opencode': {
    id: 'opencode',
    name: 'OpenCode',
    billingMode: 'token',
    currency: 'USD',
    color: '#606060',
    logo: opencodeLogo,
    note: 'OpenCode terminal AI - per token billing',
  },
  'trae-pro': {
    id: 'trae-pro',
    name: 'TRAE Pro Plan',
    billingMode: 'subscription',
    currency: 'USD',
    color: '#C0C0C0',
    logo: traeProLogo,
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
