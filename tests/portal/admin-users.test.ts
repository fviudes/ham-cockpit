import { describe, expect, it } from "vitest";
import { makePortal } from "./harness";

describe("admin users CRUD", () => {
  it("lista, cria, altera, troca senha e exclui com salvaguardas de owner", async () => {
    const p = await makePortal();
    const s = await p.login();

    const me = await p.admin(s, "GET", "/api/admin/me");
    expect(me.status).toBe(200);
    expect(me.body.id).toMatch(/^adm_/);
    expect(me.body.role).toBe("owner");

    const list0 = await p.admin(s, "GET", "/api/admin/users");
    expect(list0.status).toBe(200);
    expect(list0.body.users).toHaveLength(1);
    expect(list0.body.users[0].username).toBe("admin");

    expect((await p.admin(s, "POST", "/api/admin/users", { username: "ab", password: "curta" })).body.error).toBe("invalid_username");
    expect((await p.admin(s, "POST", "/api/admin/users", { username: "ops1", password: "" })).body.error).toBe("empty_password");
    expect(
      (await p.admin(s, "POST", "/api/admin/users", { username: "ops1", password: "curta", passwordConfirm: "outra" })).body
        .error,
    ).toBe("password_mismatch");

    const created = await p.admin(s, "POST", "/api/admin/users", {
      username: "ops1",
      password: "curta",
      passwordConfirm: "curta",
      role: "admin",
      name: "Operações",
    });
    expect(created.status).toBe(200);
    const uid = created.body.id as string;
    expect(uid).toMatch(/^adm_/);

    expect((await p.admin(s, "POST", "/api/admin/users", { username: "ops1", password: "curta" })).status).toBe(409);

    const patch = await p.admin(s, "PATCH", `/api/admin/users/${uid}`, {
      username: "ops2",
      name: "Ops 2",
      role: "viewer",
      status: "active",
    });
    expect(patch.status).toBe(200);

    const pwd = await p.admin(s, "POST", `/api/admin/users/${uid}/password`, {
      password: "nova",
      passwordConfirm: "nova",
    });
    expect(pwd.status).toBe(200);
    expect((await p.admin(s, "POST", `/api/admin/users/${uid}/password`, { password: "" })).body.error).toBe("empty_password");
    expect(
      (await p.admin(s, "POST", `/api/admin/users/${uid}/password`, { password: "a", passwordConfirm: "b" })).body.error,
    ).toBe("password_mismatch");

    // não exclui o último owner
    expect((await p.admin(s, "DELETE", `/api/admin/users/${me.body.id}`)).body.error).toBe("cannot_delete_self");

    // cria segundo owner e aí pode excluir o viewer
    const owner2 = await p.admin(s, "POST", "/api/admin/users", {
      username: "owner2",
      password: "senha-owner2-xx",
      role: "owner",
    });
    expect(owner2.status).toBe(200);
    expect((await p.admin(s, "DELETE", `/api/admin/users/${uid}`)).status).toBe(200);

    const list = await p.admin(s, "GET", "/api/admin/users");
    expect(list.body.users.map((u: { username: string }) => u.username).sort()).toEqual(["admin", "owner2"]);

    // com dois owners, demover o outro é ok; sem outro owner ativo, demover/excluir a si mesmo falha
    expect((await p.admin(s, "PATCH", `/api/admin/users/${owner2.body.id}`, { role: "admin" })).status).toBe(200);
    expect((await p.admin(s, "PATCH", `/api/admin/users/${owner2.body.id}`, { role: "owner" })).status).toBe(200);
    expect((await p.admin(s, "PATCH", `/api/admin/users/${owner2.body.id}`, { status: "disabled" })).status).toBe(200);
    expect((await p.admin(s, "PATCH", `/api/admin/users/${me.body.id}`, { role: "admin" })).body.error).toBe("last_owner");
    expect((await p.admin(s, "DELETE", `/api/admin/users/${me.body.id}`)).body.error).toBe("cannot_delete_self");
    expect((await p.admin(s, "DELETE", `/api/admin/users/${owner2.body.id}`)).status).toBe(200);
  });
});
