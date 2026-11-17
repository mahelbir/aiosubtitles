import * as authorization from '@repo/shared/lib/authorization.js';
import {forbidden} from '../errors.js';
import {toIdentitySubject} from './identity.js';

export class UserPolicy {
  _actor;
  _roleMap;

  constructor(actor, roleMap) {
    this._actor = actor;
    this._roleMap = roleMap;
  }

  get visibility() {
    return {
      maxPosition: authorization.getMaxReachablePosition(this._actor),
      selfId: this._actor?.id ?? null,
    };
  }

  _target(user) {
    if (!user?.id) {
      throw new Error('Authorization target is missing its id');
    }
    return toIdentitySubject(user, this._roleMap);
  }

  canManage(user, options) {
    return authorization.canManageUser(
      this._actor,
      this._target(user),
      options,
    );
  }

  assertCanManage(user, options) {
    if (this.canManage(user, options)) {
      return null;
    }
    return forbidden('Bu kullanıcı üzerinde işlem yapamazsınız.');
  }

  getAbilities(user) {
    return {
      update: this.canManage(user, {self: true}),
      delete: this.canManage(user),
    };
  }
}
