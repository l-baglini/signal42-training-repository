import { io } from 'socket.io-client';
import { getToken } from '../api.js';

export function createSocket() {
  return io('/', {
    auth: { token: getToken() },
    transports: ['websocket', 'polling'],
  });
}
