export const smallObject = {
  userId: "123",
  route: "/login",
};

export const mediumObject = {
  userId: "123",
  route: "/login",
  method: "POST",
  status: 200,
  durationMs: 12,
  ip: "127.0.0.1",
  requestId: "req-abc-123",
  flags: {
    authenticated: true,
    retry: false,
  },
};

export const serializerUser = {
  id: "123",
  email: "user@example.test",
  password: "secret",
};

export const redactionObject = {
  userId: "123",
  password: "secret",
  token: "abc",
  nested: { password: "secret" },
};

export const formatArgs = {
  hello: ["hello %s", "world"] as const,
  request: ["request %s completed in %dms", "/login", 12] as const,
};

export function createError(): Error {
  return new Error("boom");
}
