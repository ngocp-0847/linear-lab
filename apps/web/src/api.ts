import type { ApiErr, ApiOk, Bootstrap } from "@lab/shared";

/** Bóc envelope { data } / { error } thành giá trị hoặc throw. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json()) as ApiOk<T> | ApiErr;
  if (!res.ok || "error" in body) {
    const e = "error" in body ? body.error : { code: "internal", message: `HTTP ${res.status}` };
    throw new Error(`${e.code}: ${e.message}`);
  }
  return body.data;
}

export const api = {
  bootstrap: () => call<Bootstrap>("/api/bootstrap"),
};
