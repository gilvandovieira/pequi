export const smallObjectPayload = {
  userId: "user-123",
  route: "/v1/items",
  statusCode: 200,
};

export const nestedPayload = {
  user: {
    id: "user-123",
    email: "user@example.test",
    token: "token-123",
  },
  request: {
    id: "req-123",
    method: "GET",
    path: "/v1/items",
  },
};

export const redactionPayload = {
  userId: "user-123",
  password: "secret",
  token: "token-123",
};

export function createError(): Error {
  return new Error("benchmark error");
}
