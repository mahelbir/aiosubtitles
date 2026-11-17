import {isIP} from 'node:net';
import {stubFalse, stubTrue} from 'es-toolkit/compat';
import {splitTrim} from 'melperjs';
import proxyAddr from 'proxy-addr';

const ADDRESS_WITH_PORT = /^(?:\[([^\]]+)\]|([\d.]+)):\d+$/;

export function createClientIpResolver({header, trustProxy}) {
  const isListedProxy = Array.isArray(trustProxy)
    ? proxyAddr.compile(trustProxy)
    : null;
  const isTrustedPeer = isListedProxy ?? stubTrue;
  const isTrustedHop =
    isListedProxy ?? (trustProxy === true ? stubTrue : stubFalse);
  return function resolveClientIp({remoteAddress, headers}) {
    const forwarded =
      header && isTrustedPeer(remoteAddress, 0) ? headers[header] : null;
    const chain = forwarded ? splitTrim(String(forwarded), ',') : [];
    return (
      toIpAddress(chain.at(-1)) ||
      toIpAddress(proxyAddr({headers, socket: {remoteAddress}}, isTrustedHop))
    );
  };
}

function toIpAddress(value) {
  const [, bracketed, dotted] = ADDRESS_WITH_PORT.exec(value) ?? [];
  const address = bracketed ?? dotted ?? value;
  return isIP(address) ? address : '';
}
