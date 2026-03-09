import {
    IPersistence,
    IPersistenceRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from "@rocket.chat/apps-engine/definition/metadata";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";

export class RoomPersistence {
    // store join code for a room
    public static async persist(
        persis: IPersistence,
        room: IRoom,
        joinCode: string,
    ): Promise<boolean> {
        const associations = [
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                "room_join_code",
            ),
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.ROOM,
                room.id,
            ),
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                joinCode,
            ),
        ];

        try {
            await persis.updateByAssociations(
                associations,
                { roomId: room.id, joinCode },
                true,
            );
        } catch (err) {
            console.warn(err);
            return false;
        }

        return true;
    }

    // find join code by room
    public static async findByRoom(
        persis: IPersistenceRead,
        room: IRoom,
    ): Promise<string | undefined> {
        const associations = [
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                "room_join_code",
            ),
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.ROOM,
                room.id,
            ),
        ];

        try {
            const records = (await persis.readByAssociations(
                associations,
            )) as Array<{ joinCode: string }>;

            if (records.length) {
                return records[0].joinCode;
            }
        } catch (err) {
            console.warn(err);
        }

        return undefined;
    }

    // find room by join code
    public static async findRoomByCode(
        persis: IPersistenceRead,
        joinCode: string,
    ): Promise<string | undefined> {
        const associations = [
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                "room_join_code",
            ),
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                joinCode,
            ),
        ];

        try {
            const records = (await persis.readByAssociations(
                associations,
            )) as Array<{ roomId: string }>;

            if (records.length) {
                return records[0].roomId;
            }
        } catch (err) {
            console.warn(err);
        }

        return undefined;
    }

    // remove join code by room
    public static async removeByRoom(
        persis: IPersistence,
        room: IRoom,
    ): Promise<boolean> {
        const associations = [
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                "room_join_code",
            ),
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.ROOM,
                room.id,
            ),
        ];

        try {
            await persis.removeByAssociations(associations);
        } catch (err) {
            console.warn(err);
            return false;
        }

        return true;
    }

    // list all join codes
    public static async findAll(
        persis: IPersistenceRead,
    ): Promise<Array<{ roomId: string; joinCode: string }>> {
        const associations = [
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                "room_join_code",
            ),
        ];

        try {
            const records = (await persis.readByAssociations(
                associations,
            )) as Array<{ roomId: string; joinCode: string }>;
            return records ?? [];
        } catch (err) {
            console.warn(err);
            return [];
        }
    }
}
