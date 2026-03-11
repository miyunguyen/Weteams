import {
    IAppAccessors,
    IConfigurationExtend,
    IEnvironmentRead,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IPersistenceRead,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { App } from "@rocket.chat/apps-engine/definition/App";
import {
    IAppInfo,
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from "@rocket.chat/apps-engine/definition/metadata";
import {
    IPostRoomCreate,
    IRoom,
} from "@rocket.chat/apps-engine/definition/rooms";
import { UIActionButtonContext } from "@rocket.chat/apps-engine/definition/ui";
import {
    UIKitActionButtonInteractionContext,
    IUIKitResponse,
    UIKitSurfaceType,
    IUIKitInteractionHandler,
    UIKitViewSubmitInteractionContext,
} from "@rocket.chat/apps-engine/definition/uikit";

type JoinCodeRecord = {
    kind: "by_room" | "by_code";
    roomId: string;
    joinCode: string;
    updatedAt: number;
};
export class MyRocketChatApp
    extends App
    implements IPostRoomCreate, IUIKitInteractionHandler
{
    private static readonly JOIN_MODAL_BLOCK = "join_team_code_block";
    private static readonly JOIN_MODAL_INPUT = "join_team_code_input";

    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        _environmentRead: IEnvironmentRead,
    ): Promise<void> {
        configuration.ui.registerButton({
            actionId: "join-team-btn",
            labelI18n: "Join team",
            context: UIActionButtonContext.USER_DROPDOWN_ACTION,
        });

        configuration.ui.registerButton({
            actionId: "debug-persistence-btn",
            labelI18n: "Debug persistence",
            context: UIActionButtonContext.USER_DROPDOWN_ACTION,
        });
    }

    public async executeActionButtonHandler(
        context: UIKitActionButtonInteractionContext,
        read: IRead,
        _http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();

        if (data.actionId === "join-team-btn") {
            await modify.getUiController().openSurfaceView(
                {
                    type: UIKitSurfaceType.MODAL,
                    id: "join-team-modal",
                    title: {
                        text: "Join room by code",
                        type: "plain_text",
                    },
                    submit: {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Submit",
                        },
                        appId: this.getID(),
                        blockId: "join_submit_block",
                        actionId: "join_submit_action",
                    },
                    close: {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Cancel",
                        },
                        appId: this.getID(),
                        blockId: "join_close_block",
                        actionId: "join_close_action",
                    },
                    blocks: [
                        {
                            type: "input",
                            blockId: MyRocketChatApp.JOIN_MODAL_BLOCK,
                            label: {
                                type: "plain_text",
                                text: "Join code",
                            },
                            element: {
                                appId: this.getID(),
                                blockId: MyRocketChatApp.JOIN_MODAL_BLOCK,
                                actionId: MyRocketChatApp.JOIN_MODAL_INPUT,
                                type: "plain_text_input",
                                placeholder: {
                                    type: "plain_text",
                                    text: "Example: A9K2Q7XZ",
                                },
                            },
                        },
                    ],
                },
                { triggerId: data.triggerId },
                data.user,
            );

            return context.getInteractionResponder().successResponse();
        }

        if (data.actionId === "debug-persistence-btn") {
            const all = await RoomPersistence.findAll(
                read.getPersistenceReader(),
            );
            this.getLogger().log("==== Debug Join Code Index ====");
            this.getLogger().log(all);
            return context.getInteractionResponder().successResponse();
        }

        return context.getInteractionResponder().successResponse();
    }

    public async executeViewSubmitHandler(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        _http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();
        const user = data.user;
        const rawCode = this.readInputValue(
            data.view && data.view.state ? data.view.state : undefined,
            MyRocketChatApp.JOIN_MODAL_BLOCK,
            MyRocketChatApp.JOIN_MODAL_INPUT,
        );
        const joinCode = RoomPersistence.normalizeJoinCode(rawCode);

        if (!joinCode) {
            return context.getInteractionResponder().successResponse();
        }

        const result = await RoomPersistence.joinUserByCode(
            read,
            modify,
            user.username,
            joinCode,
        );

        if (!result.ok) {
            this.getLogger().log(
                "Join by code failed for user " +
                    user.username +
                    ", reason=" +
                    result.reason,
            );
            return context.getInteractionResponder().successResponse();
        }

        this.getLogger().log(
            "User " +
                user.username +
                " joined room " +
                result.roomId +
                " by code " +
                joinCode,
        );
        return context.getInteractionResponder().successResponse();
    }

    public async executePostRoomCreate(
        room: IRoom,
        read: IRead,
        _http: IHttp,
        persistence: IPersistence,
        _modify: IModify,
    ): Promise<void> {
        this.getLogger().debug(
            "*************************************************",
        );
        this.getLogger().debug(
            "* POST ROOM CREATION - GENERATE JOIN CODE       *",
        );
        this.getLogger().debug(
            "*************************************************",
        );

        const joinCode = await RoomPersistence.createUniqueForRoom(
            persistence,
            read.getPersistenceReader(),
            room,
            8,
            20,
        );

        this.getLogger().log(
            "Join code " +
                joinCode +
                " saved for room " +
                room.id +
                " - room name: " +
                room.displayName,
        );

        const all = await RoomPersistence.findAll(read.getPersistenceReader());
        this.getLogger().log("==== All join codes ====");
        this.getLogger().log(all);
    }

    private readInputValue(
        state: any,
        blockId: string,
        actionId: string,
    ): string {
        if (!state || !state[blockId] || !state[blockId][actionId]) {
            return "";
        }

        const input = state[blockId][actionId];
        if (typeof input.value === "string") {
            return input.value;
        }

        return "";
    }
}

class RoomPersistence {
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
