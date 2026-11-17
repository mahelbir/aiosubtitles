import {
  getCachedRoster,
  toVisibleRoster,
} from '../../../lib/auth/role-roster.js';

export default async function (fastify) {
  fastify.get('/options', async (request, reply) => {
    const roster = toVisibleRoster(
      await getCachedRoster(),
      request.rolePolicy.visibility,
    );

    const items = roster
      .filter(role => request.rolePolicy.canAssign(role))
      .map(role => ({
        id: role.id,
        label: role.label,
        position: role.position,
      }));

    return reply.success(items);
  });
}
