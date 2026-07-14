import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const MEILI_MASTER_KEY = "test-meili-master-key";

export type TestInfra = {
  databaseUrl: string;
  meiliUrl: string;
  meiliMasterKey: string;
  teardown: () => Promise<void>;
};

// Boots a throwaway Postgres + Meilisearch for the integration suite. Called once
// from globalSetup, never from a per-test helper — a contributor with Docker needs
// zero manual setup, and every integration file shares this one pair of containers
// (see fileParallelism: false in vitest.config.ts).
export async function startTestInfra(): Promise<TestInfra> {
  const postgres: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16")
    .withDatabase("mise_test")
    .withUsername("mise_test")
    .withPassword("mise_test")
    .start();

  const meilisearch: StartedTestContainer = await new GenericContainer(
    "getmeili/meilisearch:v1.11",
  )
    .withEnvironment({ MEILI_MASTER_KEY: MEILI_MASTER_KEY, MEILI_NO_ANALYTICS: "true" })
    .withExposedPorts(7700)
    .withWaitStrategy(Wait.forHttp("/health", 7700).forStatusCode(200))
    .withStartupTimeout(60_000)
    .start();

  const meiliUrl = `http://${meilisearch.getHost()}:${meilisearch.getMappedPort(7700)}`;

  return {
    databaseUrl: postgres.getConnectionUri(),
    meiliUrl,
    meiliMasterKey: MEILI_MASTER_KEY,
    teardown: async () => {
      await Promise.all([postgres.stop(), meilisearch.stop()]);
    },
  };
}
