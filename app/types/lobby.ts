export interface Lobby {
  id: string;
  lobbyOwner: number | null;
  numOfMaxPlayers: number | null;
  playerIds: Int32Array | null;
  language: string | null;
  numOfRounds: number;
  drawTime: number | null;
  type: string | null;
  status: number;
}
