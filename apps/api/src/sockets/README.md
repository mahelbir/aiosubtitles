# Sockets

Class-per-namespace, reached by import (`socket`, a flat registry). Each namespace is a **class** extending
`LocalNamespace` (a namespace this app hosts) or `RemoteNamespace` (an outbound client to another server).
`plugins/sockets.js` creates the `io` server, `attach`es every namespace in the registry, and closes them on Fastify
`preClose` / `onClose` — no per-namespace lifecycle hooks. Guards are just specialized middlewares.

## Add a namespace

Like a Sequelize model + its registry line:

```js
// namespaces/chat.js
import {LocalNamespace} from '../local-namespace.js';
import {socketGuard} from '../guards.js';

export class Chat extends LocalNamespace {
  static namespace = '/chat';
  static middlewares = [socketGuard.authenticate];

  constructor() {
    super();
    this.on('send', this.send); // register events → delegate to methods
  }

  async send(socket, {to, text}) {
    // socket = sender; `this` = the namespace
    this.toUser(to).emit('dm', {from: socket.data.auth.id, text});
  }

  announce(text) {
    // custom method → socket.chat.announce(...)
    this.emit('announce', text);
  }
}

// index.js
export const socket = {
  chat: new Chat(),
};
```

A class without a valid `namespace` fails the boot when the plugin attaches it.

## Revocation

A user connection outlives its handshake, so `revalidate` re-runs the namespace's own middlewares on a copy of each live
user socket: one that now fails is disconnected, one that passes gets the fresh `socket.data.auth`. Token expiry
disconnects on its own; service connections are never re-checked.

**A route that changes something a socket guard reads calls `fastify.revalidateUserSockets(userIds)` once its
transaction has committed** — the users it changed, or no argument when the change can reach anyone — and awaits it
before replying, so a revoked connection is gone by the time the response arrives. A failure is logged, never thrown. A
periodic sweep re-checks every user socket as the safety net for a write no route made.

## Handshake limits

A handshake never passes through Fastify's hooks, so no HTTP budget covers it. While the rate-limit plugin is on, a
global layer always runs: one budget per caller shared by every local namespace, set in `plugins/sockets.js`. A
namespace needing a tighter one declares windows of its own on top in a `rateLimits` static, shaped like a route's
rate-limit config but keyed by address only — a handshake carries no principal yet, so any other key fails the boot.
Every layer is ANDed. They are built through the `rateLimiter` decorator, so they share the HTTP store, bucket shape,
allow-list and penalties. The caller comes from the resolver the client-IP plugin decorates, so a handshake names the
same caller a request from that client would.

**Only refusals spend.** A gate in front of the middlewares charges every window first, so handshakes arriving together
— in parallel or packed into one polling request — can never outrun the budget; a spent window answers with the shared
too-many-requests refusal before any guard reads the credentials. An admitted handshake, or one refused by a server
fault, is refunded before the client hears back; every other refusal stays charged, the gate's own included, so a
penalty escalates exactly as on HTTP. Revalidation runs the middlewares without the gate, so re-checking a live socket
costs nothing.

## Responses and errors

The same envelope as HTTP, over the two channels Socket.IO gives you. A socket carries no status line, so the envelope
carries `statusCode` itself; everything else is the shape `reply.success` / `reply.error` build, from the same
`lib/response.js` builders. Refusals come from `lib/errors.js`, the module policies and guards already speak.

- **Handshake** — a guard refusal reaches the client's `connect_error` as `err.message` plus `err.data`, the full
  envelope. Guards throw a `DenialError`; `toMiddleware` is the only place that renders one.
- **Event** — when the client asks for an acknowledgement, `_bind` answers with it: whatever the handler returned is
  wrapped as a success, and a throw becomes a failure. An emit without an acknowledgement is untouched, so
  fire-and-forget stays fire-and-forget.
- **Validation** — Socket.IO validates nothing on its own, so `on` takes an optional schema as its last argument and
  `_bind` parses the first event argument through it before the handler runs. A rejection renders exactly as HTTP's
  does, field list included — the whole envelope reads one Zod failure the same way whatever carried it. **The schema
  belongs to the event, not to the handler** — every handler bound to one event validates through it, and a second,
  different schema for that event throws at registration rather than quietly replacing the first.

```js
async rename(socket, {id, label}) {
  const policy = new RolePolicy(socket.data.auth, await roleCache.get());
  throwIfDenied(policy.assertCanManage(role)); // reply.abort's twin
  return {id};                                 // the ack receives a success envelope
}
```

```js
// client
const ack = await socket.timeout(5000).emitWithAck('rename', {id, label});
if (!ack.success) {
  toast.error(ack.message);
}
```

`toFailure` is shared with the HTTP error handler, so a denial keeps its wording and status and anything else reads as
one internal error on both transports. An internal failure is always
logged; a client error is logged only when no acknowledgement was asked for, because then the log is the one place it
can still be seen.

## Remote namespaces & relay

```js
// namespaces/payments-orders.js
export class PaymentsOrders extends RemoteNamespace {
  static url = 'http://payments:7000';
  static namespace = '/orders';
  static auth = {securityKey: '...connect as a service...'};
}
```

`emit` / `on` go over the outbound client. `to` / `toUser` **relay**: they send a `$relay` command and the **remote
server** performs the real room emit — so `socket.paymentsOrders.toUser(42).emit("dm", d)` reaches user 42 on the
payments' server. Requirements: the remote runs this framework, its target namespace accepts services
(`socketGuard.requireSecurityKey`, alone or inside `requireAnySocketGuard`), and relay is honored only from
service connections. A remote mounted under a base path also declares `path`, its Socket.IO transport path, while
`url` stays the bare origin: the client reads any path in the URL as the namespace.

A relay command declares its shared schema like any other event and travels the same `_bind` path, so a malformed one
answers on the acknowledgement instead of throwing out of the listener, and reaches the log when the sender asked for
no acknowledgement. Socket.IO refuses to emit its own reserved event names — the schema rejects them first.

The sources route takes a remote's registry key as its `source` and hands the browser that remote's `url`,
`namespace`, `path` and `auth`, so that credential is **client-visible by design** — a service key carries relay
rights, so scope and rotate it accordingly. Keeping it server-side is the BFF alternative: drop the route, subscribe
here, and re-emit into a local namespace.
