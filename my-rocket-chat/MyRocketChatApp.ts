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
import { RoomPersistence } from "./persistence/RoomPersistence";

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
