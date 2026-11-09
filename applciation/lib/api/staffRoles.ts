import { z } from "zod";
import { Role } from "@/generated/prisma/client";

/** One or more roles. The first is the main one. A department is needed exactly when the coordinator role is among them. */
export const rolesSchema = z.array(z.enum(Role)).min(1, "Choose at least one role").max(3).transform((r) => [...new Set(r)]);
export const splitRoles = (roles: Role[]) => ({ role: roles[0], extraRoles: roles.slice(1) });
export const withRoles = <T extends { role: Role; extraRoles: Role[] }>(u: T) => ({ ...u, roles: [u.role, ...u.extraRoles.filter((r) => r !== u.role)] });
