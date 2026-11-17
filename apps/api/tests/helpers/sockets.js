import {io} from 'socket.io-client';
import {getTestApp, getTestAppBasePath} from './app.js';

const CONNECT_TIMEOUT = 5000;
const PACKET_SEPARATOR = '\x1e';
const CONNECT_PACKET = '40';
const CLOSE_PACKET = '1';
const CONNECT_ERROR_PACKET = /^44[^,]*,(.*)$/s;

let origin = null;
const open = new Set();

export async function getSocketOrigin() {
  if (!origin) {
    const app = await getTestApp();
    origin = await app.listen({port: 0, host: '127.0.0.1'});
  }
  return origin;
}

export async function connectSocket(
  namespace,
  auth = {},
  {headers, transport = 'websocket'} = {},
) {
  const base = await getSocketOrigin();
  const socket = io(`${base}${namespace}`, {
    path: `${getTestAppBasePath()}/socket.io`,
    auth,
    extraHeaders: headers,
    transports: [transport],
    reconnection: false,
    timeout: CONNECT_TIMEOUT,
  });
  open.add(socket);

  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', error => {
      socket.close();
      open.delete(socket);
      reject(error);
    });
  });
}

export function waitForEvent(socket, event, timeout = CONNECT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`No "${event}" within ${timeout}ms`)),
      timeout,
    );
    socket.once(event, payload => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export function expectSilence(socket, event, window = 300) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(true), window);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export async function pipelineHandshakes(namespace, auths) {
  const endpoint = `${await getSocketOrigin()}${getTestAppBasePath()}/socket.io/?EIO=4&transport=polling`;
  const opening = await (await fetch(endpoint)).text();
  const session = `${endpoint}&sid=${JSON.parse(opening.slice(1)).sid}`;
  await fetch(session, {
    method: 'POST',
    body: auths
      .map(auth => `${CONNECT_PACKET}${namespace},${JSON.stringify(auth)}`)
      .join(PACKET_SEPARATOR),
  });
  const statuses = [];
  for (
    let round = 0;
    statuses.length < auths.length && round < auths.length;
    round += 1
  ) {
    const payload = await (await fetch(session)).text();
    for (const packet of payload.split(PACKET_SEPARATOR)) {
      const [, refusal] = CONNECT_ERROR_PACKET.exec(packet) ?? [];
      if (refusal) {
        statuses.push(JSON.parse(refusal).data.statusCode);
      }
    }
  }
  await fetch(session, {method: 'POST', body: CLOSE_PACKET});
  return statuses;
}

export function closeSockets() {
  for (const socket of open) {
    socket.close();
  }
  open.clear();
}
