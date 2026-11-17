import {MonitorLevel} from '@repo/shared/constants/monitor.js';
import {Permission} from '@repo/shared/constants/permission.js';
import {LocalNamespace} from '../local-namespace.js';
import {requireAnySocketGuard, socketGuard} from '../guards.js';

const toId = value => Buffer.from(String(value)).toString('base64url');

export class Monitor extends LocalNamespace {
  static namespace = '/monitor';
  static middlewares = [
    requireAnySocketGuard([
      socketGuard.requireSecurityKey,
      socketGuard.requirePermission(Permission.ADMIN),
    ]),
  ];

  /**
   * @param {string} scope
   * @param {object} payload
   * @param {string|number} payload.id
   * @param {string} payload.title
   * @param {string} payload.message
   * @param {string} [payload.level]
   * @param {*} [payload.data]
   * @returns {void}
   */
  line(scope, {id, title, message, level, data = null}) {
    this.emit(scope, {
      id: toId(id),
      title,
      message,
      level: level || MonitorLevel.DEBUG,
      data,
    });
  }
}
