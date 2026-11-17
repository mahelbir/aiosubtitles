import {xor, xorBy} from 'es-toolkit';
import {RoleDirection} from '@repo/shared/constants/role.js';
import * as authorization from '@repo/shared/lib/authorization.js';
import {forbidden} from '../errors.js';
import {rolePosition} from './role-position.js';

export class RolePolicy {
  _actor;
  _roleMap;

  constructor(actor, roleMap) {
    this._actor = actor;
    this._roleMap = roleMap;
  }

  get visibility() {
    return {maxPosition: authorization.getMaxReachablePosition(this._actor)};
  }

  _permissionsOf(roles) {
    return authorization.getPermissionsOfRoles(roles, this._roleMap);
  }

  _canAssignPositionOf(roles) {
    return (
      !roles?.length ||
      authorization.canAssignPosition(
        this._actor,
        authorization.getMaxPosition(roles),
      )
    );
  }

  canGrant(permissions) {
    return authorization.canGrant(this._actor, permissions);
  }

  canChangeGrants(current, next) {
    return this.canGrant(xor(current ?? [], next ?? []));
  }

  canAssignAll(roles) {
    return (
      this.canGrant(this._permissionsOf(roles)) &&
      this._canAssignPositionOf(roles)
    );
  }

  canAssign(role) {
    return this.canAssignAll([role]);
  }

  canChangeAssignments(current, next) {
    return this.canAssignAll(xorBy(current ?? [], next ?? [], role => role.id));
  }

  _actorAt(roster) {
    if (!roster) {
      return this._actor;
    }
    const positions = new Map(roster.map(role => [role.id, role.position]));
    return {
      ...this._actor,
      roles: (this._actor?.roles ?? []).map(role =>
        positions.has(role.id)
          ? {...role, position: positions.get(role.id)}
          : role,
      ),
    };
  }

  canSetPosition(position, roster) {
    return authorization.canManagePosition(this._actorAt(roster), position);
  }

  _isLocked(role) {
    return Boolean(role?.isLocked);
  }

  canManage(role, roster) {
    return (
      !this._isLocked(role) && this.canSetPosition(role?.position ?? -1, roster)
    );
  }

  assertCanGrant(permissions) {
    if (this.canGrant(permissions)) {
      return null;
    }
    return forbidden('Sahip olmadığınız izinleri veremezsiniz.');
  }

  assertCanChangeGrants(current, next) {
    if (this.canChangeGrants(current, next)) {
      return null;
    }
    return forbidden('Sahip olmadığınız izinleri değiştiremezsiniz.');
  }

  assertCanSetPosition(position, roster) {
    if (position === undefined || this.canSetPosition(position, roster)) {
      return null;
    }
    return forbidden('Kendi seviyenizin üzerinde bir sıra belirleyemezsiniz.');
  }

  assertCanManage(role, roster) {
    if (this._isLocked(role)) {
      return forbidden('Kilitli rol değiştirilemez.');
    }
    if (this.canManage(role, roster)) {
      return null;
    }
    return forbidden('Bu rol üzerinde işlem yapamazsınız.');
  }

  assertCanAssignAll(roles) {
    if (!this.canGrant(this._permissionsOf(roles))) {
      return forbidden(
        'Sahip olmadığınız izinleri içeren bir rol atayamazsınız.',
      );
    }
    if (this._canAssignPositionOf(roles)) {
      return null;
    }
    return forbidden('Kendi seviyenizin üzerinde bir rol atayamazsınız.');
  }

  assertCanChangeAssignments(current, next) {
    if (this.canChangeAssignments(current, next)) {
      return null;
    }
    return forbidden('Yetkiniz dışındaki rolleri ekleyip çıkaramazsınız.');
  }

  getAbilities(role, roster = []) {
    const manageable = this.canManage(role);
    const position = role?.position ?? -1;
    const inReach = this.canSetPosition(position);
    const above = rolePosition.neighborOf(roster, role?.id, RoleDirection.UP);
    const below = rolePosition.neighborOf(roster, role?.id, RoleDirection.DOWN);
    return {
      update: manageable,
      delete: manageable,
      moveUp:
        manageable &&
        Boolean(above) &&
        this.canSetPosition(above?.position ?? -1),
      moveDown: manageable && Boolean(below),
      addAbove: inReach,
      addSame: inReach,
      addBelow: authorization.isPositionInReach(
        position,
        authorization.getMaxPosition(this._actor?.roles),
      ),
    };
  }
}
