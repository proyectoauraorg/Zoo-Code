// Repository factory — selecciona driver según DB_DRIVER (ADR-8, ADR-11).
// DB_DRIVER=sqlite (default) o DB_DRIVER=postgres.

import { makeSqliteRepos } from "./sqlite";
import type { Repos, RepoContext } from "./types";

export type { Repos, RepoContext } from "./types";

export function makeRepos(ctx?: RepoContext): Repos {
  void ctx; // reservado para V2.e/V2.h (trace/correlation IDs)
  const driver = process.env.DB_DRIVER ?? "sqlite";
  if (driver === "postgres") {
    // TODO(V2.d.1): implementar makePostgresRepos()
    // return makePostgresRepos(ctx);
    throw new Error("Postgres driver no implementado aún (V2.d.1)");
  }
  return makeSqliteRepos();
}
