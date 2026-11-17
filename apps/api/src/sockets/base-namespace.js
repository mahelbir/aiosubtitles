import {StatusCodes} from 'http-status-codes';
import {userRoom} from './events.js';
import {ackFailure, ackSuccess} from './response.js';

const NAMESPACE_PATTERN = /^\/\S*$/;

export class BaseNamespace {
  static namespace;
  static middlewares = [];

  log = null;

  _handlers = new Map();

  _schemas = new Map();

  on(event, handler, schema = null) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event).add(handler);
    if (schema) {
      this._setSchema(event, schema);
    }
    return this;
  }

  _setSchema(event, schema) {
    const bound = this._schemas.get(event);
    if (bound && bound !== schema) {
      throw new Error(
        `${this.constructor.name} binds a second schema to "${event}" — an event carries one payload.`,
      );
    }
    this._schemas.set(event, schema);
  }

  off(event, handler) {
    const handlers = this._handlers.get(event);
    handlers?.delete(handler);
    if (!handlers?.size) {
      this._schemas.delete(event);
    }
    return this;
  }

  toUser(userId) {
    return this.to(userRoom(userId));
  }

  onError(socket, event, err, failure = null) {
    const context = {err, event, namespace: this.constructor.namespace};
    if (
      failure?.statusCode &&
      failure.statusCode < StatusCodes.INTERNAL_SERVER_ERROR
    ) {
      this.log?.warn(context, 'Socket handler refused');
      return;
    }
    this.log?.error(context, 'Socket handler error');
  }

  _assertNamespace() {
    const {name, namespace} = this.constructor;
    if (typeof namespace !== 'string' || !NAMESPACE_PATTERN.test(namespace)) {
      throw new Error(
        `${name} declares no valid namespace — set a static namespace such as "/chat".`,
      );
    }
  }

  _eachHandler(bind) {
    for (const [event, set] of this._handlers) {
      for (const handler of set) {
        bind(event, handler);
      }
    }
  }

  _bind(socket, event, handler) {
    const schema = this._schemas.get(event);
    socket.on(event, async (...args) => {
      const ack = typeof args.at(-1) === 'function' ? args.pop() : null;
      try {
        if (schema) {
          args[0] = schema.parse(args[0]);
        }
        const data = await handler.apply(this, [socket, ...args]);
        ack?.(ackSuccess(data ?? null));
      } catch (err) {
        const failure = ackFailure(err);
        ack?.(failure);
        // An acknowledged client error already reached the caller; an unacknowledged one has nowhere else to go.
        if (!ack || failure.statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
          this.onError(socket, event, err, failure);
        }
      }
    });
  }

  emit(event, ...args) {
    throw new Error(
      `${this.constructor.name}.emit() needs a transport — attach() not called?`,
    );
  }

  to(rooms) {
    throw new Error(
      `${this.constructor.name}.to() needs a transport — attach() not called?`,
    );
  }
}
