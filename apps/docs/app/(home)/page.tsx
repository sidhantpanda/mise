import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  Container,
  Database,
  GitFork,
  PackageOpen,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Terminal,
  Users,
} from 'lucide-react';

const features = [
  {
    icon: PackageOpen,
    title: 'Portable recipes',
    description:
      'Store every recipe as Schema.org JSON-LD. Your collection stays useful outside Mise.',
  },
  {
    icon: CalendarDays,
    title: 'A plan for the week',
    description:
      'Plan breakfast, lunch, and dinner together, then turn the plan into a shopping list.',
  },
  {
    icon: ShoppingBasket,
    title: 'Pantry-aware shopping',
    description:
      'Keep the pantry, fridge, freezer, and shared shopping list in one calm workspace.',
  },
  {
    icon: Bot,
    title: 'Made for assistants',
    description:
      'Connect Claude or ChatGPT over MCP and let an assistant work with the kitchen you choose.',
  },
];

const deploymentPaths = [
  {
    icon: Container,
    eyebrow: 'Recommended',
    title: 'Docker Compose',
    description: 'Mise, PostgreSQL, and Meilisearch with persistent volumes and sensible defaults.',
    href: '/docs/install/docker-compose',
  },
  {
    icon: Terminal,
    eyebrow: 'Flexible',
    title: 'Docker image',
    description: 'Bring your own database and search service, and run the published GHCR image.',
    href: '/docs/install/docker',
  },
  {
    icon: GitFork,
    eyebrow: 'For contributors',
    title: 'Build from source',
    description: 'Clone the pnpm monorepo, start the development services, and work with hot reload.',
    href: '/docs/install/source',
  },
];

export default function HomePage() {
  return (
    <main className="mise-home">
      <section className="hero-shell">
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="home-container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow-pill">
              <span className="eyebrow-dot" />
              Open source · Self-hosted · AGPL-3.0
            </div>
            <h1>
              Your kitchen,
              <br />
              <span>properly organized.</span>
            </h1>
            <p className="hero-lede">
              Mise brings recipes, meal plans, pantry, and shopping into one beautiful home for
              households and restaurants—without giving up ownership of your data.
            </p>
            <div className="hero-actions">
              <Link className="primary-button" href="/docs/getting-started/quick-start">
                Get Mise running <ArrowRight aria-hidden="true" />
              </Link>
              <a
                className="secondary-button"
                href="https://github.com/sidhantpanda/mise"
                target="_blank"
                rel="noreferrer"
              >
                <GitFork aria-hidden="true" /> View on GitHub
              </a>
            </div>
            <div className="hero-proof" aria-label="Mise highlights">
              <span><Check aria-hidden="true" /> One required setting</span>
              <span><Check aria-hidden="true" /> Open data format</span>
              <span><Check aria-hidden="true" /> REST API + MCP</span>
            </div>
          </div>

          <div className="hero-product">
            <div className="terminal-card" aria-label="Docker Compose quick start">
              <div className="terminal-top">
                <span><i /> <i /> <i /></span>
                <span>Terminal</span>
                <span />
              </div>
              <pre><code><span className="prompt">$</span> mkdir mise && cd mise{`\n`}<span className="prompt">$</span> curl -fsSLO https://raw.githubusercontent.com/{`\n`}  sidhantpanda/mise/main/compose.yml{`\n`}<span className="prompt">$</span> echo &quot;JWT_SECRET=$(openssl rand -hex 32)&quot; &gt; .env{`\n`}<span className="prompt">$</span> docker compose up -d</code></pre>
              <div className="terminal-status"><span /> Mise is ready at localhost:3000</div>
            </div>
            <div className="product-frame">
              <div className="product-frame-bar">
                <span className="mini-brand"><span className="mini-brand-mark">m</span> mise</span>
                <span className="frame-url">localhost:3000</span>
                <span />
              </div>
              <Image
                src="/screenshots/dashboard.webp"
                alt="Mise dashboard showing planned meals, recipes, shopping, and pantry"
                width={2400}
                height={1392}
                priority
                sizes="(max-width: 900px) 92vw, 58vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-container intro-section">
        <div className="section-heading">
          <p className="section-kicker">A kitchen operating system</p>
          <h2>Everything between “what should we eat?” and dinner.</h2>
          <p>
            Mise connects the daily jobs that usually live across bookmarks, notes, calendars,
            and half-finished shopping lists.
          </p>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, description }) => (
            <article className="feature-card" key={title}>
              <div className="feature-icon"><Icon aria-hidden="true" /></div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section product-story">
        <div className="home-container story-grid">
          <div className="story-copy">
            <p className="section-kicker">Designed around real routines</p>
            <h2>From a recipe you love to a list everyone can use.</h2>
            <p>
              Import a recipe, put it on the meal plan, add its ingredients to shopping, and keep
              track of what is already at home. Mise keeps the context connected.
            </p>
            <ul>
              <li><Search aria-hidden="true" /><span><strong>Find anything quickly.</strong> Typo-tolerant search is powered by Meilisearch.</span></li>
              <li><Users aria-hidden="true" /><span><strong>Share one kitchen.</strong> Household and restaurant workspaces keep everyone aligned.</span></li>
              <li><Database aria-hidden="true" /><span><strong>Keep your data.</strong> Exportable recipes use a documented, open web standard.</span></li>
            </ul>
            <Link className="text-link" href="/docs/product/overview">
              See how Mise fits together <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <div className="story-image-wrap">
            <Image
              src="/screenshots/recipes.webp"
              alt="Mise recipe library with filters and recipe cards"
              width={2400}
              height={1392}
              sizes="(max-width: 900px) 92vw, 52vw"
            />
            <div className="story-note"><Sparkles aria-hidden="true" /> Schema.org native</div>
          </div>
        </div>
      </section>

      <section className="home-section home-container deployment-section">
        <div className="section-heading section-heading-split">
          <div>
            <p className="section-kicker">Run it your way</p>
            <h2>From zero to a working kitchen in minutes.</h2>
          </div>
          <p>
            Start with Compose, bring your own infrastructure, or work directly from source. The
            guides cover upgrades, backups, HTTPS, and reverse proxies too.
          </p>
        </div>
        <div className="deployment-grid">
          {deploymentPaths.map(({ icon: Icon, eyebrow, title, description, href }) => (
            <Link className="deployment-card" href={href} key={title}>
              <div className="deployment-card-top">
                <Icon aria-hidden="true" />
                <span>{eyebrow}</span>
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="card-link">Open guide <ArrowRight aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section assistant-section">
        <div className="home-container assistant-card">
          <div className="assistant-visual" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="assistant-mark"><Bot /></div>
            <span className="assistant-chip chip-one">What&apos;s for dinner?</span>
            <span className="assistant-chip chip-two">Add milk to shopping</span>
            <span className="assistant-chip chip-three">Save this recipe</span>
          </div>
          <div className="assistant-copy">
            <p className="section-kicker">MCP built in</p>
            <h2>Your assistant can help in the kitchen.</h2>
            <p>
              Connect Claude or ChatGPT to your own Mise server. OAuth handles sign-in and
              household consent; you decide which kitchen the assistant can read or change.
            </p>
            <div className="security-line"><ShieldCheck aria-hidden="true" /> OAuth 2.1 · scoped access · revocable tokens</div>
            <Link className="light-button" href="/docs/integrations/mcp">
              Connect an assistant <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="home-section final-cta">
        <div className="home-container final-cta-inner">
          <div>
            <p className="section-kicker">Ready when you are</p>
            <h2>Set the table for your own data.</h2>
          </div>
          <div className="final-actions">
            <Link className="primary-button" href="/docs/getting-started/quick-start">
              Read the quick start <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="secondary-button" href="/docs">Browse all docs</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
