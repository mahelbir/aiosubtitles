import {clamp} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {relayCommandSchema} from '@repo/shared/schemas/socket.js';
import {tooManyRequests} from '../lib/errors.js';
import {RateLimitKey} from '../lib/rate-limit.js';
import {RELAY_EVENT, userRoom} from './events.js';
import {BaseNamespace} from './base-namespace.js';
import {runSocketMiddleware} from './guards.js';
import {toHandshakeError} from './response.js';

const MAX_TIMER_DELAY = 2 ** 31 - 1;

const isKeyedByAddress = ({key = RateLimitKey.IP, identify}) =>
  key === RateLimitKey.IP && !identify;

const isServerFault = denial =>
  (denial.data?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR) >=
  StatusCodes.INTERNAL_SERVER_ERROR;

export class LocalNamespace extends BaseNamespace {
  static rateLimits = [];

  _nsp;

  _chargeHandshake;

  _latestProbes = new WeakMap();

  attach({io, log, handshakeBudget}) {
    this._assertNamespace();
    this._assertRateLimits();
    this.log = log;
    this._setSchema(RELAY_EVENT, relayCommandSchema);
    this._chargeHandshake = handshakeBudget(this.constructor);
    const nsp = io.of(this.constructor.namespace);
    nsp.use((socket, next) =>
      this._admit(socket).then(next, err => next(toHandshakeError(err))),
    );
    nsp.on('connection', socket => this._onConnection(socket));
    this._nsp = nsp;
    return this;
  }

  _assertRateLimits() {
    const {name, rateLimits} = this.constructor;
    if (!rateLimits.every(isKeyedByAddress)) {
      throw new Error(
        `${name} keys a handshake window by something other than the address — a handshake carries no principal yet.`,
      );
    }
  }

  async _admit(socket) {
    const charge = await this._chargeHandshake(socket);
    if (charge.isExceeded) {
      return toHandshakeError(tooManyRequests());
    }
    const denial = await this._runMiddlewares(socket);
    if (!denial || isServerFault(denial)) {
      await charge.refund();
    }
    return denial;
  }

  _onConnection(socket) {
    const auth = socket.data.auth;
    if (auth?.kind === 'user') {
      socket.join(userRoom(auth.id));
      this._disconnectAt(socket, auth.expiresAt);
    }
    if (auth?.kind === 'service') {
      this._bind(socket, RELAY_EVENT, this._relay);
    }
    this._eachHandler((event, handler) => this._bind(socket, event, handler));
  }

  _disconnectAt(socket, expiresAt) {
    if (!Number.isFinite(expiresAt)) {
      return;
    }
    const timer = setTimeout(
      () => socket.disconnect(),
      clamp(expiresAt - Date.now(), 0, MAX_TIMER_DELAY),
    );
    socket.once('disconnect', () => clearTimeout(timer));
  }

  /**
   * @param {string[] | null} [userIds]
   * @returns {Promise<void>}
   */
  async revalidate(userIds = null) {
    if (userIds?.length === 0) {
      return;
    }
    const scope = userIds ? this._nsp.in(userIds.map(userRoom)) : this._nsp;
    const sockets = await scope.local.fetchSockets();
    await Promise.all(
      sockets
        .filter(socket => socket.data.auth?.kind === 'user')
        .map(socket => this._revalidateSocket(socket)),
    );
  }

  async _revalidateSocket(socket) {
    const probe = Object.create(socket, {data: {value: {}, writable: true}});
    this._latestProbes.set(socket, probe);
    const denial = await this._runMiddlewares(probe);
    if (this._latestProbes.get(socket) !== probe) {
      return;
    }
    this._latestProbes.delete(socket);
    if (denial) {
      socket.disconnect();
      return;
    }
    Object.assign(socket.data, probe.data);
  }

  async _runMiddlewares(socket) {
    for (const middleware of this.constructor.middlewares) {
      const denial = await runSocketMiddleware(middleware, socket);
      if (denial) {
        return denial;
      }
    }
    return null;
  }

  _relay(socket, {rooms, event, args}) {
    this._nsp.to(rooms).emit(event, ...args);
  }

  emit(event, ...args) {
    this._nsp.emit(event, ...args);
    return this;
  }

  to(rooms) {
    const nsp = this._nsp;
    return {
      emit(event, ...args) {
        nsp.to(rooms).emit(event, ...args);
      },
    };
  }
}
