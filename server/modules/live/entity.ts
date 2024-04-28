import { PlayerInterface, SocketInterface } from "../network/sockets";

export class Entity {
    socket?: SocketInterface;
    invuln = false;
    underControl = false;
    name = '';

    giveUp(player: PlayerInterface) {}
    kill() {}
}