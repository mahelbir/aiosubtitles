import {StatusCodes} from 'http-status-codes';
import {createUserSchema} from '@repo/shared/schemas/user.js';
import {sequelize} from '../../../db/index.js';
import {User} from '../../../db/models/user.js';
import {dbUtils} from '../../../db/utils.js';
import {hashPassword} from '../../../lib/crypto.js';
import {resolveRoles} from './_helper.js';

export default async function (fastify) {
  fastify.post(
    '/',
    {schema: {body: createUserSchema}},
    async (request, reply) => {
      const {roleIds, ...values} = request.body;

      const user = await sequelize.transaction(async transaction => {
        const {roles, error} = await resolveRoles(
          {roleIds, visibility: request.rolePolicy.visibility},
          transaction,
        );
        reply.abort(error);

        reply.abort(request.rolePolicy.assertCanAssignAll(roles));

        const created = await User.create(
          {...values, password: hashPassword(values.password)},
          {transaction},
        );
        if (roles.length > 0) {
          await created.addRoles(dbUtils.getIds(roles), {transaction});
        }
        return created;
      });
      return reply.success(
        {id: user.id},
        'Kullanıcı eklendi.',
        StatusCodes.CREATED,
      );
    },
  );
}
