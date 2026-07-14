import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../test/msw/handlers";
import { api, ApiError, INTERNAL_API_ORIGIN_HEADER, serverApi } from "./api";

describe("api.get / post / patch / delete", () => {
  it("GET builds the /api-prefixed URL and sends credentials", async () => {
    let seenUrl = "";
    let seenCredentials: RequestCredentials | undefined;
    server.use(
      http.get("/api/recipes", ({ request }) => {
        seenUrl = request.url;
        seenCredentials = request.credentials;
        return HttpResponse.json({ ok: true });
      }),
    );
    const result = await api.get<{ ok: boolean }>("/recipes");
    expect(result).toEqual({ ok: true });
    expect(seenUrl).toContain("/api/recipes");
    expect(seenCredentials).toBe("include");
  });

  it("POST sends a JSON body with a Content-Type header", async () => {
    let seenBody: unknown;
    let seenContentType: string | null = null;
    server.use(
      http.post("/api/recipes", async ({ request }) => {
        seenContentType = request.headers.get("content-type");
        seenBody = await request.json();
        return HttpResponse.json({ identifier: "r1" }, { status: 201 });
      }),
    );
    const result = await api.post<{ identifier: string }>("/recipes", { name: "New" });
    expect(result).toEqual({ identifier: "r1" });
    expect(seenBody).toEqual({ name: "New" });
    expect(seenContentType).toContain("application/json");
  });

  it("POST with no body omits the Content-Type header and sends no body", async () => {
    let seenContentType: string | null = "unset";
    let seenBody: string | null = "unset";
    server.use(
      http.post("/api/meals/m1/cook", async ({ request }) => {
        seenContentType = request.headers.get("content-type");
        seenBody = await request.text();
        return HttpResponse.json({ ok: true });
      }),
    );
    await api.post("/meals/m1/cook");
    expect(seenContentType).toBeNull();
    expect(seenBody).toBe("");
  });

  it("PATCH sends the method and body correctly", async () => {
    let seenMethod = "";
    let seenBody: unknown;
    server.use(
      http.patch("/api/recipes/r1", async ({ request }) => {
        seenMethod = request.method;
        seenBody = await request.json();
        return HttpResponse.json({ identifier: "r1", name: "Renamed" });
      }),
    );
    const result = await api.patch<{ name: string }>("/recipes/r1", { name: "Renamed" });
    expect(seenMethod).toBe("PATCH");
    expect(seenBody).toEqual({ name: "Renamed" });
    expect(result.name).toBe("Renamed");
  });

  it("DELETE sends the method with no body", async () => {
    let seenMethod = "";
    server.use(
      http.delete("/api/recipes/r1", ({ request }) => {
        seenMethod = request.method;
        return HttpResponse.json({ ok: true });
      }),
    );
    const result = await api.delete<{ ok: boolean }>("/recipes/r1");
    expect(seenMethod).toBe("DELETE");
    expect(result).toEqual({ ok: true });
  });

  it("returns undefined for a 204 No Content response", async () => {
    server.use(http.delete("/api/access-tokens/t1", () => new HttpResponse(null, { status: 204 })));
    const result = await api.delete("/access-tokens/t1");
    expect(result).toBeUndefined();
  });

  it("surfaces the server's { error } message on a non-2xx response", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ error: "Invalid credentials" }, { status: 401 }),
      ),
    );
    const err = await api.post("/auth/login", { email: "a@b.com" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).message).toBe("Invalid credentials");
  });

  it("falls back to statusText when the error body isn't JSON", async () => {
    server.use(
      http.get(
        "/api/recipes",
        () =>
          new HttpResponse("<html>gateway timeout</html>", {
            status: 504,
            statusText: "Gateway Timeout",
            headers: { "content-type": "text/html" },
          }),
      ),
    );
    const err = await api.get("/recipes").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(504);
    expect((err as ApiError).message).toBe("Gateway Timeout");
  });

  it("rejects with the underlying error on a network failure", async () => {
    server.use(http.get("/api/recipes", () => HttpResponse.error()));
    await expect(api.get("/recipes")).rejects.toBeInstanceOf(Error);
  });
});

describe("api.postForm", () => {
  it("sends a FormData body without a JSON Content-Type header", async () => {
    let seenContentType: string | null = "unset";
    let seenField: string | null = null;
    server.use(
      http.post("/api/recipes/upload", async ({ request }) => {
        seenContentType = request.headers.get("content-type");
        const form = await request.formData();
        seenField = form.get("file")?.toString() ?? null;
        return HttpResponse.json({ recipeCount: 1 });
      }),
    );
    const form = new FormData();
    form.append("file", "contents");
    const result = await api.postForm<{ recipeCount: number }>("/recipes/upload", form);
    expect(result).toEqual({ recipeCount: 1 });
    // multipart/form-data with its boundary, never application/json.
    expect(seenContentType).not.toContain("application/json");
    expect(seenField).toBe("contents");
  });

  it("surfaces the server's error message on failure", async () => {
    server.use(
      http.post("/api/recipes/upload", () =>
        HttpResponse.json({ error: "Unsupported file type" }, { status: 400 }),
      ),
    );
    const err = await api.postForm("/recipes/upload", new FormData()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("Unsupported file type");
  });
});

describe("api.download", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:mock-url");
    revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clickSpy.mockRestore();
  });

  it("downloads a binary response by clicking a generated anchor", async () => {
    server.use(
      http.get("/api/recipes/export", () =>
        HttpResponse.arrayBuffer(new TextEncoder().encode("zip-bytes").buffer, {
          headers: { "content-type": "application/zip" },
        }),
      ),
    );
    await api.download("/recipes/export", "recipes.zip");
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("fails loudly instead of saving an HTML response as the file", async () => {
    server.use(
      http.get("/api/recipes/export", () => HttpResponse.html("<html>not the api</html>")),
    );
    await expect(api.download("/recipes/export", "recipes.zip")).rejects.toThrow(
      /didn't reach the server/,
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("surfaces the server's error message on a non-2xx response", async () => {
    server.use(
      http.get("/api/recipes/export", () =>
        HttpResponse.json({ error: "Export failed" }, { status: 500 }),
      ),
    );
    await expect(api.download("/recipes/export", "recipes.zip")).rejects.toThrow("Export failed");
  });
});

describe("serverApi", () => {
  it("forwards the incoming request's cookie header", async () => {
    let seenCookie: string | null = null;
    server.use(
      http.get("http://internal-api.local/api/auth/me", ({ request }) => {
        seenCookie = request.headers.get("cookie");
        return HttpResponse.json({ id: "u1" });
      }),
    );
    const req = new Request("https://public.example/anything", {
      headers: {
        [INTERNAL_API_ORIGIN_HEADER]: "http://internal-api.local",
        cookie: "session=abc123",
      },
    });
    const client = serverApi(req);
    const me = await client.get<{ id: string }>("/auth/me");
    expect(me).toEqual({ id: "u1" });
    expect(seenCookie).toBe("session=abc123");
  });

  it("falls back to http://localhost:3000 when the internal-origin header is missing", async () => {
    let called = false;
    server.use(
      http.get("http://localhost:3000/api/auth/me", () => {
        called = true;
        return HttpResponse.json({ id: "u1" });
      }),
    );
    const req = new Request("https://public.example/anything");
    await serverApi(req).get("/auth/me");
    expect(called).toBe(true);
  });
});
