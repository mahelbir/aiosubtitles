import {lookup as dnsLookup} from 'node:dns';
import {BlockList, isIP} from 'node:net';

const PRIVATE_HOST_ERROR_CODE = 'ERR_PRIVATE_HOST';

const BLOCKED_SUBNETS = [
  ['0.0.0.0', 8, 'ipv4'],
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'],
  ['192.0.2.0', 24, 'ipv4'],
  ['192.88.99.0', 24, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['198.51.100.0', 24, 'ipv4'],
  ['203.0.113.0', 24, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'],
  ['240.0.0.0', 4, 'ipv4'],
  ['::', 96, 'ipv6'],
  ['::ffff:0:0:0', 96, 'ipv6'],
  ['64:ff9b::', 96, 'ipv6'],
  ['64:ff9b:1::', 48, 'ipv6'],
  ['100::', 64, 'ipv6'],
  ['2001::', 32, 'ipv6'],
  ['2001:db8::', 32, 'ipv6'],
  ['2002::', 16, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['fec0::', 10, 'ipv6'],
  ['ff00::', 8, 'ipv6'],
];

const blockedAddresses = new BlockList();
for (const [network, prefix, family] of BLOCKED_SUBNETS) {
  blockedAddresses.addSubnet(network, prefix, family);
}

export function isBlockedAddress(address) {
  const family = isIP(address);
  if (family === 0) {
    return true;
  }
  return blockedAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

export function createPrivateHostError() {
  return Object.assign(new TypeError('Request to a private host.'), {
    code: PRIVATE_HOST_ERROR_CODE,
  });
}

export function createGuardedLookup(resolve = dnsLookup) {
  return (hostname, options, callback) => {
    if (typeof options === 'function') {
      lookupGuarded(resolve, hostname, {}, options);
      return;
    }
    lookupGuarded(
      resolve,
      hostname,
      typeof options === 'number' ? {family: options} : options,
      callback,
    );
  };
}

function lookupGuarded(resolve, hostname, options, callback) {
  resolve(hostname, {...options, all: true}, (error, addresses) => {
    if (error) {
      callback(error);
      return;
    }
    if (
      addresses.length === 0 ||
      addresses.some(({address}) => isBlockedAddress(address))
    ) {
      callback(createPrivateHostError());
      return;
    }
    if (options.all) {
      callback(null, addresses);
      return;
    }
    const [{address, family}] = addresses;
    callback(null, address, family);
  });
}
