// Phase 1 placeholder; replaced by the full room system in phase 3.
export class RoomManager {
  onConnection(ws) { ws.close(1000, 'multiplayer not ready'); }
  stats() { return { rooms: 0 }; }
  shutdown() {}
}
