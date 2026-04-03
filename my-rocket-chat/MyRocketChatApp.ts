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
import {
    AppMethod,
    IAppInfo,
} from "@rocket.chat/apps-engine/definition/metadata";
import {
    IPostRoomCreate,
    IPostRoomDeleted,
    IPostRoomUserLeave,
    IRoom,
    IRoomUserLeaveContext,
} from "@rocket.chat/apps-engine/definition/rooms";
import {
    ISetting,
    SettingType,
} from "@rocket.chat/apps-engine/definition/settings";
import { UIActionButtonContext } from "@rocket.chat/apps-engine/definition/ui";
import {
    UIKitActionButtonInteractionContext,
    IUIKitResponse,
    UIKitSurfaceType,
    IUIKitInteractionHandler,
    UIKitViewSubmitInteractionContext,
} from "@rocket.chat/apps-engine/definition/uikit";
import {
    IPostUserCreated,
    IPostUserLoggedIn,
    IPostUserLoggedOut,
    IUser,
    IUserContext,
} from "@rocket.chat/apps-engine/definition/users";

const settings: Array<ISetting> = [
    {
        id: "tenantId",
        type: SettingType.STRING,
        packageValue: "",
        value: "",
        required: false,
        public: false,
        i18nLabel: "Tenant Id",
        i18nDescription: "",
    },
    {
        id: "apiUrl",
        type: SettingType.STRING,
        packageValue:
            "https://scalelike-nondevotionally-helaine.ngrok-free.dev",
        required: false,
        public: false,
        i18nLabel: "API URL",
        i18nDescription: "",
    },
];
export class MyRocketChatApp
    extends App
    implements
        IUIKitInteractionHandler,
        IPostRoomCreate,
        IPostRoomUserLeave,
        IPostRoomDeleted,
        IPostUserLoggedIn
{
    private readonly JOIN_MODAL_BLOCK = "join_team_code_block";
    private readonly JOIN_MODAL_INPUT = "join_team_code_input";

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
            category: "ai",
        });

        await Promise.all(
            settings.map((setting) =>
                configuration.settings.provideSetting(setting),
            ),
        );
    }

    public async executePostUserLoggedIn(
        user: IUser,
        read: IRead,
        http: IHttp,
        persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const { tenantId, apiUrl } = await this.getRuntimeSettings();

        if (!tenantId || !apiUrl) {
            this.getLogger().warn(
                "Skip sync user on login: tenantId/apiUrl setting is missing",
            );
            return;
        }

        const email =
            user.emails && user.emails.length > 0
                ? user.emails[0].address
                : undefined;

        try {
            const response = await http.post(`${apiUrl}/v1/users/app-context`, {
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    tenantId,
                    userId: user.id,
                    username: user.username,
                    email,
                    name: user.name,
                },
            });

            this.getLogger().log("Synced user from login", response?.data);
        } catch (error) {
            this.getLogger().warn("Sync user from login failed", error);
        }
    }

    public async executePostRoomCreate(
        room: IRoom,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        this.getLogger().log(room);

        await this.addAdminAsMember(room, read, modify);

        const { tenantId, apiUrl } = await this.getRuntimeSettings();

        const body = {
            tenantId: tenantId,
            roomId: room.id,
            roomName: room.displayName,
        };

        try {
            const response = await http.post(`${apiUrl}/v1/teams/room-syncs`, {
                headers: { "Content-Type": "application/json" },
                data: body,
            });

            const responseBody = response?.data;
            const responseData = responseBody?.data;
            const joinCode =
                responseBody?.success &&
                responseData &&
                !responseData.skipped &&
                typeof responseData.joinCode === "string"
                    ? responseData.joinCode
                    : "";

            this.getLogger().log(response, body, joinCode);
            if (joinCode) {
                await this.sendJoinCodeMessage(
                    room,
                    joinCode,
                    read,
                    http,
                    modify,
                    tenantId,
                    apiUrl,
                );
            }
        } catch (error) {
            this.getLogger().log("failed: ", error);
        }
    }

    public async executePostRoomDeleted(
        room: IRoom,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        const { tenantId, apiUrl } = await this.getRuntimeSettings();

        const body = {
            tenantId: tenantId,
            roomId: room.id,
        };

        try {
            const response = await http.post(`${apiUrl}/v1/teams/room-syncs`, {
                headers: { "Content-Type": "application/json" },
                data: body,
            });

            this.getLogger().log(response, body);
        } catch (error) {
            this.getLogger().log("failed: ", error);
        }
    }

    private async sendJoinCodeMessage(
        room: IRoom,
        joinCode: string,
        read: IRead,
        http: IHttp,
        modify: IModify,
        tenantId: string,
        apiUrl: string,
    ): Promise<void> {
        const appUser = await read.getUserReader().getAppUser(this.getID());

        if (!appUser) {
            this.getLogger().warn(
                "Unable to send join code message: app user not found",
            );
            return;
        }

        const messageBuilder = modify.getCreator().startMessage();
        messageBuilder.setSender(appUser);
        messageBuilder.setRoom(room);
        messageBuilder.setText(`Mã tham gia team: ${joinCode}`);

        const messageId = await modify.getCreator().finish(messageBuilder);

        await this.pinMessage(http, apiUrl, tenantId, messageId);
    }

    private async pinMessage(
        http: IHttp,
        apiUrl: string,
        tenantId: string,
        messageId: string,
    ): Promise<void> {
        try {
            const response = await http.post(
                `${apiUrl}/v1/messages/${messageId}/pin`,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                    data: {
                        tenantId,
                    },
                },
            );

            this.getLogger().log("Pinned by backend", response?.data);
        } catch (error) {
            this.getLogger().warn("Pin by backend failed", error);
        }
    }

    private async addAdminAsMember(
        room: IRoom,
        read: IRead,
        modify: IModify,
    ): Promise<void> {
        try {
            const updater = (await read
                .getUserReader()
                .getAppUser(this.getID())) as IUser;

            const roomUpdater = await modify
                .getUpdater()
                .room(room.id, updater);

            roomUpdater.addMemberToBeAddedByUsername("admin");

            await modify.getUpdater().finish(roomUpdater);
        } catch (error) {
            this.getLogger().warn(
                `Unable to add admin to room ${room.id}: ${String(error)}`,
            );
        }
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
                            blockId: this.JOIN_MODAL_BLOCK,
                            label: {
                                type: "plain_text",
                                text: "Join code",
                            },
                            element: {
                                appId: this.getID(),
                                blockId: this.JOIN_MODAL_BLOCK,
                                actionId: this.JOIN_MODAL_INPUT,
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
        const joinCode = await this.readInputValue(
            data.view && data.view.state ? data.view.state : undefined,
            this.JOIN_MODAL_BLOCK,
            this.JOIN_MODAL_INPUT,
        );

        const { tenantId, apiUrl } = await this.getRuntimeSettings();

        try {
            const res = await _http.post(`${apiUrl}/v1/teams/memberships`, {
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    tenantId,
                    joinCode,
                    rocketUserId: user.id,
                    rocketUsername: user.username,
                },
            });

            this.getLogger().log(res);
            const body = res.data;

            if (!body.success) {
                return context.getInteractionResponder().errorResponse();
            }

            return context.getInteractionResponder().successResponse();
        } catch (e) {
            return context.getInteractionResponder().errorResponse();
        }
    }

    public async executePostRoomUserLeave(
        context: IRoomUserLeaveContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify?: IModify,
    ): Promise<void> {
        const room = context.room;
        const user = context.leavingUser;

        const roomId = room.id;
        const rocketUserId = user.id;

        const { tenantId, apiUrl } = await this.getRuntimeSettings();

        try {
            const res = await http.del(`${apiUrl}/v1/teams/memberships`, {
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    tenantId,
                    roomId,
                    rocketUserId,
                },
            });

            this.getLogger().log(res);
        } catch (e) {
            this.getLogger().error("Leave sync failed", e);
        }
    }

    private async readInputValue(
        state: any,
        blockId: string,
        actionId: string,
    ): Promise<string> {
        if (!state || !state[blockId]) {
            return "";
        }

        const blockState = state[blockId];
        const actionState = blockState[actionId];

        if (typeof actionState === "string") {
            return actionState;
        }

        if (actionState && typeof actionState.value === "string") {
            return actionState.value;
        }

        return "";
    }

    private async getRuntimeSettings(): Promise<{
        tenantId: string;
        apiUrl: string;
    }> {
        const settingsReader =
            this.getAccessors().environmentReader.getSettings();
        const [tenantId, apiUrl] = await Promise.all([
            settingsReader.getValueById("tenantId"),
            settingsReader.getValueById("apiUrl"),
        ]);

        return {
            tenantId: typeof tenantId === "string" ? tenantId : "",
            apiUrl: typeof apiUrl === "string" ? apiUrl : "",
        };
    }
}
