import {Permission} from '@repo/shared/constants/permission.js';

export default async function (fastify) {
  fastify.guardSubtree([fastify.requirePermission(Permission.ADMIN)]);
}
