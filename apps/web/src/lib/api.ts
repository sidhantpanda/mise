// The API is always same-origin with the frontend: in prod it's mounted into the
// web server, and in dev the API is the front door that proxies the SSR app. So
// requests go to a relative `/api/...`. `VITE_API_URL` stays as an optional
// escape hatch for pointing at a different origin.
const API_URL = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function formRequest<T>(method: string, path: string, body: FormData): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    credentials: "include",
    body,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Fetch a binary response (e.g. a zip export) and trigger a browser download.
// Falls back to a JSON error body — matching `request` — so callers get the same
// ApiError shape on failure.
async function download(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: "GET",
    credentials: "include",
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new ApiError(res.status, message);
  }

  // A 200 that isn't the binary we asked for means the request was served the
  // SPA shell or an auth redirect instead of reaching the API (e.g. the app is
  // being viewed without the API front door). Saving that as a file yields a
  // corrupt download, so fail loudly instead.
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new ApiError(res.status, "The download didn't reach the server. Please try again.");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  download,
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  postForm: <T>(path: string, body: FormData) => formRequest<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
