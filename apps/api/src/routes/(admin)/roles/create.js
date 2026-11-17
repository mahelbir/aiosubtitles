import {StatusCodes} from 'http-status-codes';
import {createRoleSchema} from '@repo/shared/schemas/role.js';
import {sequelize} from '../../../db/index.js';
import {Role} from '../../../db/models/role.js';
import {allocateByPlacement, setPermissions} from './_helper.js';

export default async function (fastify) {
  fastify.post(
    '/',
    {schema: {body: createRoleSchema}},
    async (request, reply) => {
      const {permissions, anchorRoleId, placement, ...values} = request.body;

      reply.abort(request.rolePolicy.assertCanGrant(permissions));

      const role = await sequelize.transaction(async transaction => {
        const {position, error, roster} = await allocateByPlacement(
          {
            anchorRoleId,
            placement,
            maxPosition: request.rolePolicy.visibility.maxPosition,
            message: 'Konum rolü bulunamadı.',
          },
          transaction,
        );
        reply.abort(
          error ?? request.rolePolicy.assertCanSetPosition(position, roster),
        );

        const created = await Role.create({...values, position}, {transaction});
        await setPermissions(
          {roleId: created.id, next: permissions},
          transaction,
        );
        return created;
      });
      return reply.success({id: role.id}, 'Rol eklendi.', StatusCodes.CREATED);
    },
  );
}
