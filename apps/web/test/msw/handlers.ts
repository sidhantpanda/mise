import { setupServer } from "msw/node";

// No default request handlers: each test declares exactly the endpoints it
// exercises via `server.use(...)`, so a hook/component test's mocked API surface
// stays visible in the test file itself rather than in a shared fixture.
export const server = setupServer();
