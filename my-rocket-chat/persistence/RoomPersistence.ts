import {
    IPersistenceRead,
    IPersistence,
    IRead,
    IModify,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
    RocketChatAssociationRecord,
    RocketChatAssociationModel,
} from "@rocket.chat/apps-engine/definition/metadata";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";

type JoinCodeRecord = {
    kind: "by_room" | "by_code";
    roomId: string;
    joinCode: string;
    updatedAt: number;
};

export class RoomPersistence {
    private static readonly SCOPE = "room_join_code_v1";
    private static readonly CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    public static normalizeJoinCode(input: string): string {
        return (input || "").trim().toUpperCase();
    }

    private static scopeAssoc(): RocketChatAssociationRecord {
        return new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            RoomPersistence.SCOPE,
        );
    }

    private static roomAssoc(roomId: string): RocketChatAssociationRecord {
        return new RocketChatAssociationRecord(
            RocketChatAssociationModel.ROOM,
            roomId,
        );
    }

    private static codeAssoc(joinCode: string): RocketChatAssociationRecord {
        return new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            "code:" + joinCode,
        );
    }

    private static byRoomAssociations(
        roomId: string,
    ): Array<RocketChatAssociationRecord> {
        return [
            RoomPersistence.scopeAssoc(),
            RoomPersistence.roomAssoc(roomId),
        ];
    }

    private static byCodeAssociations(
        joinCode: string,
    ): Array<RocketChatAssociationRecord> {
        return [
            RoomPersistence.scopeAssoc(),
            RoomPersistence.codeAssoc(joinCode),
        ];
    }

    private static randomCode(length: number): string {
        let result = "";
        for (let i = 0; i < length; i++) {
            const idx = Math.floor(
                Math.random() * RoomPersistence.CHARSET.length,
            );
            result += RoomPersistence.CHARSET[idx];
        }
        return result;
    }

    public static async findByRoom(
        persis: IPersistenceRead,
        room: IRoom,
    ): Promise<string | undefined> {
        const records = (await persis.readByAssociations(
            RoomPersistence.byRoomAssociations(room.id),
        )) as Array<JoinCodeRecord>;

        if (!records.length) {
            return undefined;
        }

        return records[0].joinCode;
    }

    public static async findRoomByCode(
        persis: IPersistenceRead,
        joinCode: string,
    ): Promise<string | undefined> {
        const code = RoomPersistence.normalizeJoinCode(joinCode);
        if (!code) {
            return undefined;
        }

        const records = (await persis.readByAssociations(
            RoomPersistence.byCodeAssociations(code),
        )) as Array<JoinCodeRecord>;

        if (!records.length) {
            return undefined;
        }

        return records[0].roomId;
    }

    public static async upsertForRoom(
        writer: IPersistence,
        reader: IPersistenceRead,
        room: IRoom,
        joinCode: string,
    ): Promise<boolean> {
        const code = RoomPersistence.normalizeJoinCode(joinCode);
        if (!code) {
            return false;
        }

        const oldCode = await RoomPersistence.findByRoom(reader, room);
        const now = Date.now();

        const roomRecord: JoinCodeRecord = {
            kind: "by_room",
            roomId: room.id,
            joinCode: code,
            updatedAt: now,
        };

        const codeRecord: JoinCodeRecord = {
            kind: "by_code",
            roomId: room.id,
            joinCode: code,
            updatedAt: now,
        };

        await writer.updateByAssociations(
            RoomPersistence.byRoomAssociations(room.id),
            roomRecord,
            true,
        );

        await writer.updateByAssociations(
            RoomPersistence.byCodeAssociations(code),
            codeRecord,
            true,
        );

        if (oldCode && oldCode !== code) {
            await writer.removeByAssociations(
                RoomPersistence.byCodeAssociations(oldCode),
            );
        }

        return true;
    }

    public static async createUniqueForRoom(
        writer: IPersistence,
        reader: IPersistenceRead,
        room: IRoom,
        codeLength: number,
        maxAttempts: number,
    ): Promise<string> {
        const existing = await RoomPersistence.findByRoom(reader, room);
        if (existing) {
            return existing;
        }

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const candidate = RoomPersistence.randomCode(codeLength);
            const owner = await RoomPersistence.findRoomByCode(
                reader,
                candidate,
            );

            if (owner) {
                continue;
            }

            await RoomPersistence.upsertForRoom(
                writer,
                reader,
                room,
                candidate,
            );

            const confirmed = await RoomPersistence.findRoomByCode(
                reader,
                candidate,
            );
            if (confirmed === room.id) {
                return candidate;
            }

            await RoomPersistence.removeByRoom(writer, reader, room);
        }

        throw new Error("Failed to generate a unique join code");
    }

    public static async joinUserByCode(
        read: IRead,
        modify: IModify,
        username: string,
        joinCode: string,
    ): Promise<{ ok: boolean; roomId?: string; reason?: string }> {
        const roomId = await RoomPersistence.findRoomByCode(
            read.getPersistenceReader(),
            joinCode,
        );

        if (!roomId) {
            return { ok: false, reason: "invalid_code" };
        }

        const room = await read.getRoomReader().getById(roomId);
        if (!room) {
            return { ok: false, reason: "room_not_found" };
        }

        const user = await read.getUserReader().getByUsername(username);
        if (!user) {
            return { ok: false, reason: "user_not_found" };
        }

        const builder = await modify.getUpdater().room(roomId, user);
        builder.addMemberToBeAddedByUsername(username);
        await modify.getUpdater().finish(builder);

        return { ok: true, roomId };
    }

    public static async removeByRoom(
        writer: IPersistence,
        reader: IPersistenceRead,
        room: IRoom,
    ): Promise<boolean> {
        const oldCode = await RoomPersistence.findByRoom(reader, room);

        await writer.removeByAssociations(
            RoomPersistence.byRoomAssociations(room.id),
        );

        if (oldCode) {
            await writer.removeByAssociations(
                RoomPersistence.byCodeAssociations(oldCode),
            );
        }

        return true;
    }

    public static async findAll(
        persis: IPersistenceRead,
    ): Promise<Array<{ roomId: string; joinCode: string }>> {
        const records = (await persis.readByAssociations([
            RoomPersistence.scopeAssoc(),
        ])) as Array<JoinCodeRecord>;

        return records
            .filter((r) => r.kind === "by_room")
            .map((r) => ({ roomId: r.roomId, joinCode: r.joinCode }));
    }

    public static async clear(writer: IPersistence): Promise<boolean> {
        await writer.removeByAssociations([RoomPersistence.scopeAssoc()]);
        return true;
    }
}
