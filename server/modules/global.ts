import { ViewInterface, DisconnectionInterface, SocketInterface, PlayerInterface } from './network/sockets';

export type Global = {
    views: ViewInterface[],
    disconnections: DisconnectionInterface[],
    clients: SocketInterface[],
    players: PlayerInterface[],
    mockupJsonData: string
};

const global = {} as Global;
global.views = [];

export default global;
export * from '../lib/util';