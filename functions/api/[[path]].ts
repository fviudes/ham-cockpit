import type { Env } from "../_lib/env";
import { handle } from "../_lib/router";

/** Todas as rotas `/api/*` do portal (licenças, checkout, webhooks, admin). Ver docs/licenciamento.md. */
export const onRequest = (context: { request: Request; env: Env }): Promise<Response> => handle(context.request, context.env);
