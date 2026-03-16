import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true, namespace: '/ws' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    client.emit('connected', { ok: true });
  }

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage('room:subscribe')
  handleRoomSubscribe(client: Socket, @MessageBody() payload: { roomId: string }) {
    client.join(`room:${payload.roomId}`);
    client.emit('subscribed', { roomId: payload.roomId });
  }

  @SubscribeMessage('slot:subscribe')
  handleSlotSubscribe(client: Socket, @MessageBody() payload: { slotId: string }) {
    client.join(`slot:${payload.slotId}`);
    client.emit('subscribed', { slotId: payload.slotId });
  }

  emitToRoom(roomId: string, event: string, payload: unknown) {
    this.server.to(`room:${roomId}`).emit(event, payload);
  }

  emitToSlot(slotId: string, event: string, payload: unknown) {
    this.server.to(`slot:${slotId}`).emit(event, payload);
  }
}
