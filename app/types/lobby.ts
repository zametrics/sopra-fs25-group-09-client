export interface Lobby {
    id: string | null;
    lobbyOwner: number | null;
    numOfMaxPlayers: number | null;
    playerIds: Int32Array | null;
    language: string | null;
    numOfRounds: number;
    drawTime: number | null;
    type: string | null;
  }
  