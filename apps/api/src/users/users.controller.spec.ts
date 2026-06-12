import 'reflect-metadata';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  it('declara OWNER, ADMIN e GESTOR na listagem de usuarios', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.findAll);

    expect(roles).toEqual([Role.OWNER, Role.ADMIN, Role.GESTOR]);
  });
});
