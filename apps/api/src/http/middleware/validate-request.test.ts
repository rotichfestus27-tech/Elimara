import express from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { z } from "zod";
import { errorHandler } from "../errors/error-handler.js";
import { requestIdMiddleware } from "./request-id.js";
import { validateRequest } from "./validate-request.js";

describe("validateRequest", () => {
  it("validates route params, query and body before the handler", async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json());
    app.post(
      "/items/:id",
      validateRequest({
        params: z.object({ id: z.string().uuid() }),
        query: z.object({ limit: z.coerce.number().int().positive() }),
        body: z.object({ name: z.string().min(1) }),
      }),
      (_request, response) => response.json(response.locals.validatedRequest),
    );
    app.use(errorHandler);

    const response = await request(app)
      .post("/items/4a14d01c-dfe5-4ad3-8fa7-c3b08eaaf324?limit=5")
      .send({ name: "Sample" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      params: { id: "4a14d01c-dfe5-4ad3-8fa7-c3b08eaaf324" },
      query: { limit: 5 },
      body: { name: "Sample" },
    });
  });

  it("returns structured validation issues for invalid input", async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json());
    app.post("/items/:id", validateRequest({ params: z.object({ id: z.string().uuid() }) }));
    app.use(errorHandler);

    const response = await request(app).post("/items/not-a-uuid");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.issues[0].path).toBe("id");
  });
});
