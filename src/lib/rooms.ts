import { api } from './api';
import { loadDevice, membership, rememberRoom, type Membership } from './device';
import { browserTz, isValidTz } from './time';
import type { RoomMeta } from './types';

/** Create a room and remember it on this device, so it can never be lost. */
export async function createRoom(input: {
  roomName: string;
  tz?: string;
}): Promise<{ room: RoomMeta; membership: Membership }> {
  const device = loadDevice();
  const tz = input.tz && isValidTz(input.tz) ? input.tz : browserTz();
  const bootstrap = await api.createRoom({
    deviceId: device.id,
    deviceName: device.name,
    roomName: input.roomName.trim().slice(0, 60) || 'Study room',
    tz,
  });
  const entry = rememberRoom({
    code: bootstrap.room.code,
    token: bootstrap.token,
    name: bootstrap.room.name,
    deviceName: device.name,
    joinedAt: Date.now(),
  });
  return { room: bootstrap.room, membership: entry };
}

export function existingMembership(code: string): Membership | null {
  return membership(code);
}
