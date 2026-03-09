import {
    IAppAccessors,
    IConfigurationExtend,
    IEnvironmentRead,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { App } from "@rocket.chat/apps-engine/definition/App";
import { IAppInfo } from "@rocket.chat/apps-engine/definition/metadata";
import { RoomPersistence } from "./persistence/RoomPersistence";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { UIActionButtonContext } from "@rocket.chat/apps-engine/definition/ui";
import {
    UIKitActionButtonInteractionContext,
    IUIKitResponse,
    UIKitSurfaceType,
} from "@rocket.chat/apps-engine/definition/uikit";

export class MyRocketChatApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead,
    ): Promise<void> {
        configuration.ui.registerButton({
            actionId: "join-team-btn",
            labelI18n: "Join team",
            context: UIActionButtonContext.USER_DROPDOWN_ACTION,
        });
    }

    public async executeActionButtonHandler(
        context: UIKitActionButtonInteractionContext,
        _read: IRead,
        _http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const { buttonContext, actionId, triggerId, user, room, message } =
            context.getInteractionData();

        if (actionId === "join-team-btn") {
            modify.getUiController().openSurfaceView(
                // the method to define the modal
                {
                    type: UIKitSurfaceType.MODAL,
                    title: {
                        text: "Enter the code to join team", // title of the modal
                        type: "plain_text",
                    },
                    blocks: [
                        {
                            type: "input",
                            blockId: "block_setion_1",
                            label: {
                                type: "plain_text",
                                text: "Team code",
                            },
                            element: {
                                appId: "my-app",
                                blockId: "block_setion_1",
                                actionId: "action_1",
                                type: "plain_text_input",
                            },
                        },
                        {
                            type: "actions",
                            elements: [
                                {
                                    appId: "my-app",
                                    blockId: "block_setion_1",
                                    actionId: "action_1",
                                    type: "button",
                                    text: {
                                        type: "plain_text",
                                        text: "Primary",
                                    },
                                    style: "primary",
                                },
                            ],
                        },
                    ],
                },
                {
                    triggerId: context.getInteractionData().triggerId,
                },
                context.getInteractionData().user,
            );
        }
        return context.getInteractionResponder().successResponse();
    }

    public async executePostRoomCreate(
        room: IRoom,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        this.getLogger().debug(
            " ************************************************* ",
        );
        this.getLogger().debug(
            " * EVENT-INTERFACES-EXAMPLE - POST ROOM CREATION * ",
        );
        this.getLogger().debug(
            " ************************************************* ",
        );

        const joinCode = this.generateJoinCode(6);

        const ok = await RoomPersistence.persist(persistence, room, joinCode);

        if (ok) {
            this.getLogger().log(
                `Join code ${joinCode} saved for room ${room.id}`,
            );
        }

        return Promise.resolve(undefined);
    }

    private generateJoinCode(length: number = 6): string {
        const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let result = "";

        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * CHARSET.length);
            result += CHARSET[randomIndex];
        }

        return result;
    }
}
