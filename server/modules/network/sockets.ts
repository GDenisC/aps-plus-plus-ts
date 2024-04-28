import { isIP, isIPv6 } from 'net';
import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import global, { Logger, getTime, arrayRemoveAt } from '../global';
import config from '../../config';
import permissions, { Permission } from '../../permissions';
import { Entity } from '../live/entity';

const logger = new Logger('sockets.ts');

global.disconnections = [];
global.players = [];
global.clients = [];

export interface DisconnectionInterface {
    body: any; /* Entity */
    ip: string;
    timeout: NodeJS.Timeout;
}

const close = (socket: SocketInterface) => {
    let player = socket.player,
        index = global.players.indexOf(player);

    //if (socket.group) groups.removeMember(socket); /* todo: gamemodes/groups */

    if (index != -1) {
        if (player.body != null) {
            if (player.body.underControl) {
                player.body.giveUp(player);
            }
            if (player.body.invuln) {
                player.body.invuln = false;
                player.body.kill();
            } else {
                let timeout = setTimeout(function () {
                    if (player.body != null) {
                        player.body.kill();
                    }
                    arrayRemoveAt(global.disconnections, global.disconnections.indexOf(disconnection));
                }, 60000);
                const disconnection: DisconnectionInterface = {
                    body: player.body,
                    ip: socket.ip,
                    timeout
                };
                global.disconnections.push(disconnection);
            }
        }
        logger.log("[INFO] " + (player.body ? "User " + player.body.name : "A user without an entity") + " disconnected!");
        arrayRemoveAt(global.players, index);
    } else {
        logger.log("[INFO] A player disconnected before entering the game.");
    }
    arrayRemoveAt(global.views, global.views.indexOf(socket.view));
    arrayRemoveAt(global.clients, global.clients.indexOf(socket));
    logger.log("[INFO] The connection has closed. Views: " + global.views.length + ". Clients: " + global.clients.length + ".");
}

const kick = (socket: SocketInterface, reason = "No reason given.") => {
    logger.warn(reason + " Kicking.");
    socket.lastWords("K");
}

const incoming = (message: ArrayBuffer, socket: SocketInterface) => {
    if (!(message instanceof ArrayBuffer)) {
        socket.kick("Non-binary packet.");
        return 1;
    }

    let m = /* protocol.decode */(message) as any;
    if (m == -1) {
        socket.kick("Malformed packet.");
        return 1;
    }

    socket.status.requests++;
    let player = socket.player;

    if (socket.resolveResponse(m[0], m)) return;
    switch (m[0]) {
        case 'k': // key verification
            if (m.length > 1) {
                socket.kick("Ill-sized key request.");
                return 1;
            }
            if (socket.status.verified) {
                socket.kick("Duplicate verification attempt.");
                return 1;
            }
            socket.talk("w", true);
            if (m.length === 1) {
                let key = m[0].toString().trim();
                socket.permissions = permissions[key];
                if (socket.permissions) {
                    logger.log("[INFO] A socket was verified with the token: " + key);
                } else {
                    logger.log("[WARNING] A socket failed to verify with the token: " + key);
                }
                socket.key = key;
            }
            socket.verified = true;
            logger.log("Clients: " + global.clients.length);
            break;
    }
}

const subscribers: SocketInterface[] = [];
setInterval(() => {
    // TODO: minimap
    const time = getTime();
    for (const socket of global.clients) {
        if (socket.timeout.check(time)) socket.lastWords("K");
        if (time - socket.status.lastHeartbeat > config.maxHeartbeatInterval) socket.kick("Lost heartbeat.");
    }
}, 250);

const broadcast = {
    subscribe: (socket: SocketInterface) => subscribers.push(socket),
    unsubscribe: (socket: SocketInterface) => {
        let i = subscribers.indexOf(socket);
        if (i !== -1) arrayRemoveAt(subscribers, i);
    },
};

const traffic = (socket: SocketInterface) => {
    let strikes = 0;
    return () => {
        if (getTime() - socket.status.lastHeartbeat > config.maxHeartbeatInterval) {
            socket.kick("Heartbeat lost.");
            return 0;
        }
        if (socket.status.requests > 50) {
            strikes++;
        } else {
            strikes = 0;
        }
        if (strikes > 3) {
            socket.kick("Socket traffic volume violation!");
            return 0;
        }
        socket.status.requests = 0;
    };
}

export interface PlayerInterface {
    camera: {};
    body: Entity;
}

const spawn = (socket: SocketInterface, name: string) => {
    const player = {} as PlayerInterface;
    return player;
};

export interface ViewInterface {
    socket: SocketInterface;
    getNearby: () => any[];
    add: (entity: Entity) => void;
    remove: (entity: Entity) => void;
    check: (entity: Entity, _fov: number) => boolean;
    gazeUpon: () => void;
}

/* filter of entities that the player can see */
const eyes = (socket: SocketInterface) => {
    return {} as ViewInterface;
}

export type SocketCamera = {
    x?: number,
    y?: number,
    vx: number,
    vy: number,
    lastUpdate: number,
    lastDowndate?: number,
    fov: number
};

export interface SocketInterface extends WebSocket {
    key: string;
    player: PlayerInterface;
    spectateEntity: null;
    timeout: {
        check: (time: number) => boolean,
        set: (val: number) => void
    };
    awaiting: Record<any, any>;
    awaitResponse: (options: { packet: any, timeout: number }, callback: Function) => void;
    resolveResponse: (id: any, packet: any) => boolean;
    status: {
        verified: boolean,
        receiving: number,
        deceased: boolean,
        requests: number,
        hasSpawned: boolean,
        needsFullMap: boolean,
        needsNewBroadcast: boolean,
        lastHeartbeat: number
    };
    verified?: boolean;
    loops: {
        setUpdate: (timeout: number) => void,
        cancelUpdate: () => void,
        terminate: () => void
    };
    camera: SocketCamera;
    makeView: () => void;
    view: ViewInterface;
    kick: (reason: string) => void;
    talk: (...message: any[]) => void;
    spawn: (name: string) => void;
    lastWords: (...message: string[]) => void;
    ip: string;
    group?: any;
    permissions?: Permission;
}

let lastTime = 0;
export const connectSocket = (socket: SocketInterface, req: IncomingMessage) => {
    let now = Date.now();
    if (now - lastTime < 250) socket.terminate();
    lastTime = now;

    logger.log('A client is trying to connect...');

    socket.binaryType = 'arraybuffer';
    socket.key = '';
    socket.player = { camera: {} } as PlayerInterface;
    socket.spectateEntity = null;
    socket.onerror = () => {};
    let mem = 0, timer = 0;
    socket.timeout = {
        check: (time: number) => Boolean(timer && time - timer > config.maxHeartbeatInterval),
        set: (val: number) => {
            if (mem !== val) {
                mem = val;
                timer = getTime();
            }
        }
    };
    socket.awaitResponse = (options, callback) => {
        socket.awaiting[options.packet] = {
            callback: callback,
            timeout: setTimeout(() => {
                console.log("Socket did not respond to the eval packet, kicking...");
                socket.kick("Did not comply with the server's protocol.");
            }, options.timeout),
        };
    };
    socket.resolveResponse = (id, packet) => {
        if (socket.awaiting[id]) {
            clearTimeout(socket.awaiting[id].timeout);
            socket.awaiting[id].callback(packet);
            return true;
        }
        return false;
    };

    socket.status = {
        verified: false,
        receiving: 0,
        deceased: true,
        requests: 0,
        hasSpawned: false,
        needsFullMap: true,
        needsNewBroadcast: true,
        lastHeartbeat: getTime(),
    };

    let nextUpdateCall: number | null = null;
    let trafficMonitoring = setInterval(() => traffic(socket), 1500);
    broadcast.subscribe(socket);
    socket.loops = {
        setUpdate: timeout => {
            nextUpdateCall = timeout;
        },
        cancelUpdate: () => {
            clearTimeout(nextUpdateCall!);
        },
        terminate: () => {
            clearTimeout(nextUpdateCall!);
            clearTimeout(trafficMonitoring);
            broadcast.unsubscribe(socket);
        },
    };

    socket.camera = {
        x: undefined,
        y: undefined,
        vx: 0,
        vy: 0,
        lastUpdate: getTime(),
        lastDowndate: undefined,
        fov: 2000
    };

    socket.makeView = () => socket.view = eyes(socket);
    socket.makeView();

    socket.kick = (reason: string) => kick(socket, reason);
    socket.talk = (...message: string[]) => {
        if (socket.readyState == socket.OPEN) {
            socket.send(/* protocol.encode */(message), { binary: true });
        }
    };
    socket.lastWords = (...message: string[]) => {
        if (socket.readyState == socket.OPEN) {
            socket.send(/* protocol.encode */(message), { binary: true }, () => setTimeout(() => socket.close(), 1000));
        }
    };
    // Put the player functions in the socket
    socket.spawn = (name: string) => spawn(socket, name);
    socket.on('message', message => incoming(message as ArrayBuffer, socket));
    socket.on('close', () => {
        socket.loops.terminate();
        close(socket);
    });
    socket.on('error', e => {
        logger.log("[ERROR]:");
        console.log(e);
    });

    const store  =  (req.headers['fastly-client-ip'] || req.headers["cf-connecting-ip"] || req.headers['x-forwarded-for'] || req.headers['z-forwarded-for'] ||
                    req.headers['forwarded'] || req.headers['x-real-ip'] || req.connection.remoteAddress) as string,
        ips = store.split(',');

    if (!ips) {
        return socket.kick('Missing IP: ' + store);
    }

    for (let i = 0; i < ips.length; i++) {
        let ip = ips[i];
        if (isIPv6(ip)) {
            ips[i] = ip.trim();
        } else {
            ips[i] = ip.split(':')[0].trim();
        }
        if (!isIP(ips[i])) {
            return socket.kick("Invalid IP(s): " + store);
        }
    }

    socket.ip = ips[0];

    global.clients.push(socket);
    logger.log('[INFO] New socket opened with ip ' + socket.ip)
}