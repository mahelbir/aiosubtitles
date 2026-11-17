import {isEqual, range} from 'es-toolkit';
import getPort from 'get-port';
import {portField} from '@repo/shared/schemas/common.js';

const CLIENT_PORT_KEY = 'E2E_CLIENT_PORT';
const API_PORT_KEY = 'E2E_API_PORT';
const FIRST_SLOT_PORT = 3100;
const SLOT_SIZE = 2;
const SLOT_COUNT = 10;

export async function resolveE2ePorts() {
  if (process.env[CLIENT_PORT_KEY] !== undefined) {
    return;
  }
  const [clientPort, apiPort] = await findFreeSlot();
  process.env[CLIENT_PORT_KEY] = String(clientPort);
  process.env[API_PORT_KEY] = String(apiPort);
}

export function getE2eClientPort() {
  return readPort(CLIENT_PORT_KEY);
}

export function getE2eApiPort() {
  return readPort(API_PORT_KEY);
}

export function getE2eClientOrigin() {
  return `http://localhost:${getE2eClientPort()}`;
}

async function findFreeSlot() {
  const slots = range(SLOT_COUNT).map(getSlotPorts);
  const isSlotFree = await Promise.all(slots.map(isEveryPortFree));
  const freeSlot = slots.find((_, index) => isSlotFree[index]);
  if (!freeSlot) {
    throw new Error('Every e2e port slot is taken.');
  }
  return freeSlot;
}

function getSlotPorts(slot) {
  const firstPort = FIRST_SLOT_PORT + slot * SLOT_SIZE;
  return range(firstPort, firstPort + SLOT_SIZE);
}

async function isEveryPortFree(ports) {
  const freePorts = await Promise.all(ports.map(port => getPort({port})));
  return isEqual(freePorts, ports);
}

function readPort(key) {
  return portField.parse(process.env[key]);
}
