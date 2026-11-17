import {io as ioClient} from 'socket.io-client';
import {RELAY_EVENT} from './events.js';
import {BaseNamespace} from './base-namespace.js';

export class RemoteNamespace extends BaseNamespace {
  static url;
  static path;
  static auth;

  _socket;

  attach({log} = {}) {
    this._assertNamespace();
    this.log = log;
    const {url, namespace, path} = this.constructor;
    const target = {url, path, namespace};
    const socket = ioClient(url + namespace, {
      path,
      auth: cb => cb(this.constructor.auth),
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000,
    });
    socket.on('connect', () => log?.info(target, 'Remote socket connected'));
    socket.on('connect_error', err =>
      log?.warn({...target, err}, 'Remote socket connect error'),
    );
    socket.on('disconnect', reason => {
      log?.warn({...target, reason}, 'Remote socket disconnected');
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });
    socket.io.on('reconnect', attempt =>
      log?.info({...target, attempt}, 'Remote socket reconnected'),
    );
    this._eachHandler((event, handler) => this._bind(socket, event, handler));
    this._socket = socket;
    return this;
  }

  emit(event, ...args) {
    this._socket.emit(event, ...args);
    return this;
  }

  to(rooms) {
    const socket = this._socket;
    return {
      emit(event, ...args) {
        socket.emit(RELAY_EVENT, {rooms, event, args});
      },
    };
  }

  disconnect() {
    this._socket?.disconnect();
  }
}
