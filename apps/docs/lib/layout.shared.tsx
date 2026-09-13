import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { MiseLogo } from '@/components/mise-logo';
import { gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <MiseLogo />,
      transparentMode: 'top',
    },
    links: [
      { text: 'Docs', url: '/docs' },
      { text: 'Install', url: '/docs/getting-started/quick-start' },
      { text: 'MCP', url: '/docs/integrations/mcp' },
      { text: 'API', url: '/docs/reference/api' },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
